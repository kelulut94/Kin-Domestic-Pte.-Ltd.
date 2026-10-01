const crypto = require("node:crypto");
const express = require("express");
const { html, csrfField, fmtDate } = require("../views");
const { requireRole } = require("../auth");
const { getAgency, subscriptionActive } = require("../models");

async function stripeRequest(cfg, method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params ? new URLSearchParams(params) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Stripe error ${res.status}`);
  return json;
}

// Verifies the Stripe-Signature header (https://docs.stripe.com/webhooks#verify-manually).
function verifyStripeSignature(payload, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.groupBy(String(header).split(",").map((p) => p.split("=")), ([k]) => k);
  const t = parts.t?.[0]?.[1];
  const sigs = (parts.v1 || []).map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return sigs.some((s) => s.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

function syncSubscription(db, cfg, sub) {
  const agency =
    db.prepare("SELECT user_id FROM agencies WHERE stripe_subscription_id = ?").get(sub.id) ||
    db.prepare("SELECT user_id FROM agencies WHERE user_id = ?").get(Number(sub.metadata?.user_id)) ||
    db.prepare("SELECT user_id FROM agencies WHERE stripe_customer_id = ?").get(sub.customer);
  if (!agency) return;
  const item = sub.items?.data?.[0];
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  const plan = cfg.plans.find((p) => p.stripePriceId && p.stripePriceId === item?.price?.id);
  db.prepare(`UPDATE agencies SET sub_status = ?, period_end = ?, plan = COALESCE(?, plan),
    stripe_subscription_id = ?, stripe_customer_id = ? WHERE user_id = ?`)
    .run(sub.status, periodEnd ? periodEnd * 1000 : null, plan?.id ?? null, sub.id, sub.customer, agency.user_id);
}

function webhook(app, { db, cfg }) {
  app.post("/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyStripeSignature(payload, req.get("stripe-signature"), cfg.stripe.webhookSecret)) {
      return res.status(400).send("Bad signature");
    }
    const event = JSON.parse(payload);
    const fresh = db.prepare("INSERT INTO stripe_events (id, received_at) VALUES (?, ?) ON CONFLICT DO NOTHING")
      .run(event.id, Date.now()).changes;
    if (!fresh) return res.json({ received: true, duplicate: true });
    try {
      const obj = event.data.object;
      if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
        const userId = Number(obj.client_reference_id);
        db.prepare("UPDATE agencies SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE user_id = ?")
          .run(obj.customer, obj.subscription, userId);
        if (cfg.stripe.secretKey && obj.subscription) {
          syncSubscription(db, cfg, await stripeRequest(cfg, "GET", `/subscriptions/${obj.subscription}`));
        }
      } else if (event.type.startsWith("customer.subscription.")) {
        syncSubscription(db, cfg, obj);
      }
      res.json({ received: true });
    } catch (err) {
      // Let Stripe retry.
      db.prepare("DELETE FROM stripe_events WHERE id = ?").run(event.id);
      console.error("Stripe webhook failed", err);
      res.status(500).send("Webhook error");
    }
  });
}

function pages(app, { db, cfg }) {
  const guard = requireRole("agency");
  const stripeReady = () => Boolean(cfg.stripe.secretKey && cfg.plans.some((p) => p.stripePriceId));

  app.get("/billing", guard, (req, res) => {
    const a = getAgency(db, req.user.id);
    const active = subscriptionActive(a);
    const plan = cfg.plans.find((p) => p.id === a.plan);
    let body;
    if (active) {
      body = html`
        <p>Your <b>${plan ? plan.name : "subscription"}</b> plan is active until <b>${fmtDate(a.period_end)}</b>.</p>
        ${a.stripe_customer_id && cfg.stripe.secretKey ? html`
          <form method="post" action="/billing/portal">${csrfField(req)}
            <button class="btn btn-ghost">Manage billing, invoices or cancel</button></form>` : ""}`;
    } else if (stripeReady()) {
      body = html`
        <p>Choose a plan to unlock full profiles and messaging.</p>
        <div class="plans">${cfg.plans.filter((p) => p.stripePriceId).map((p) => html`
          <form method="post" action="/billing/checkout" class="card plan">
            ${csrfField(req)}
            <input type="hidden" name="plan" value="${p.id}">
            <h2>${p.name}</h2><p class="price">${p.priceLabel}</p>
            <button class="btn">Subscribe</button>
          </form>`)}</div>`;
    } else {
      body = html`<p>Online payment is not set up yet. Please contact us to activate your subscription.</p>`;
    }
    res.page("Subscription", html`
      <h1>Subscription</h1>
      <div class="card">
        <p>Agency: <b>${a.company_name}</b> &middot; Licence ${a.licence_no}
          ${a.verified ? html`<span class="badge badge-approved">Verified</span>` : html`<span class="badge badge-pending">Verification pending</span>`}</p>
        ${body}
      </div>`);
  });

  app.post("/billing/checkout", guard, async (req, res, next) => {
    const plan = cfg.plans.find((p) => p.id === req.body.plan && p.stripePriceId);
    if (!plan || !cfg.stripe.secretKey) return res.redirect("/billing");
    const a = getAgency(db, req.user.id);
    if (subscriptionActive(a)) return res.redirect("/billing");
    try {
      const params = {
        mode: "subscription",
        "line_items[0][price]": plan.stripePriceId,
        "line_items[0][quantity]": "1",
        client_reference_id: String(req.user.id),
        "subscription_data[metadata][user_id]": String(req.user.id),
        success_url: `${cfg.baseUrl}/billing?paid=1`,
        cancel_url: `${cfg.baseUrl}/billing`
      };
      if (a.stripe_customer_id) params.customer = a.stripe_customer_id;
      else params.customer_email = req.user.email;
      const session = await stripeRequest(cfg, "POST", "/checkout/sessions", params);
      res.redirect(303, session.url);
    } catch (err) {
      next(err);
    }
  });

  app.post("/billing/portal", guard, async (req, res, next) => {
    const a = getAgency(db, req.user.id);
    if (!a.stripe_customer_id || !cfg.stripe.secretKey) return res.redirect("/billing");
    try {
      const session = await stripeRequest(cfg, "POST", "/billing_portal/sessions", {
        customer: a.stripe_customer_id,
        return_url: `${cfg.baseUrl}/billing`
      });
      res.redirect(303, session.url);
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { webhook, pages, verifyStripeSignature };
