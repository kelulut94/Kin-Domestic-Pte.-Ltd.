const { html, csrfField, fmtDate, statusBadge, options } = require("../views");
const { requireRole } = require("../auth");
const { PROFILE_STATUS } = require("../constants");
const { getProfile, subscriptionActive, int, str } = require("../models");
const { profileDetail } = require("../profileView");

module.exports = function adminRoutes(app, { db }) {
  const guard = requireRole("admin");

  app.get("/admin", guard, (req, res) => {
    const count = (sql, ...p) => db.prepare(sql).get(...p).n;
    const stats = {
      pending: count("SELECT COUNT(*) AS n FROM helper_profiles WHERE status = 'pending'"),
      live: count("SELECT COUNT(*) AS n FROM helper_profiles WHERE status = 'approved'"),
      helpers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'helper'"),
      agencies: count("SELECT COUNT(*) AS n FROM agencies"),
      unverified: count("SELECT COUNT(*) AS n FROM agencies WHERE verified = 0"),
      subscribed: count(`SELECT COUNT(*) AS n FROM agencies WHERE sub_status IN ('active','trialing','manual') AND period_end > ?`, Date.now()),
      messages: count("SELECT COUNT(*) AS n FROM messages WHERE created_at > ?", Date.now() - 7 * 86400000)
    };
    res.page("Admin", html`
      <h1>Admin</h1>
      <div class="stat-grid">
        <a class="card stat" href="/admin/helpers?status=pending"><b>${stats.pending}</b><span>Profiles to review</span></a>
        <a class="card stat" href="/admin/agencies?filter=unverified"><b>${stats.unverified}</b><span>Agencies to verify</span></a>
        <a class="card stat" href="/admin/helpers?status=approved"><b>${stats.live}</b><span>Live profiles (${stats.helpers} helper accounts)</span></a>
        <a class="card stat" href="/admin/agencies"><b>${stats.subscribed}</b><span>Paying agencies (${stats.agencies} total)</span></a>
        <div class="card stat"><b>${stats.messages}</b><span>Messages sent in the last 7 days</span></div>
      </div>`);
  });

  app.get("/admin/helpers", guard, (req, res) => {
    const status = PROFILE_STATUS[req.query.status] ? req.query.status : "pending";
    const rows = db.prepare(`SELECT p.user_id, p.first_name, p.nationality, p.age, p.status, p.updated_at, u.email, u.suspended
      FROM helper_profiles p JOIN users u ON u.id = p.user_id WHERE p.status = ? ORDER BY p.updated_at DESC LIMIT 500`).all(status);
    res.page("Helpers", html`
      <h1>Helper profiles</h1>
      <nav class="tabs">${Object.entries(PROFILE_STATUS).map(([k, label]) =>
        html`<a href="/admin/helpers?status=${k}" class="${k === status ? "active" : ""}">${label}</a>`)}</nav>
      <table class="list">
        <thead><tr><th>Name</th><th>Email</th><th>Nationality</th><th>Age</th><th>Updated</th><th></th></tr></thead>
        <tbody>${rows.map((r) => html`<tr>
          <td>${r.first_name}${r.suspended ? html` <span class="badge badge-rejected">Suspended</span>` : ""}</td>
          <td>${r.email}</td><td>${r.nationality}</td><td>${r.age}</td><td>${fmtDate(r.updated_at)}</td>
          <td><a href="/admin/helpers/${r.user_id}">Open</a></td></tr>`)}</tbody>
      </table>
      ${rows.length ? "" : html`<p class="muted">Nothing here.</p>`}`);
  });

  app.get("/admin/helpers/:id", guard, (req, res) => {
    const p = getProfile(db, Number(req.params.id));
    if (!p) return res.status(404).page("Not found", "<h1>Not found</h1>");
    res.page(`Review ${p.first_name}`, html`
      <p><a href="/admin/helpers?status=${p.status}">&larr; Back</a></p>
      <div class="profile-layout">
        <div class="card">${profileDetail(p, { full: true, showPhone: true })}</div>
        <aside class="card">
          <p>Status: ${statusBadge(p.status)}</p>
          <p class="small">Account: ${p.account_name} &lt;${p.email}&gt;</p>
          <form method="post" action="/admin/helpers/${p.user_id}/review" class="form">
            ${csrfField(req)}
            <label>Note to helper (shown if rejected)<textarea name="note" rows="3" maxlength="500">${p.review_note}</textarea></label>
            <button class="btn" name="action" value="approve">Approve</button>
            <button class="btn btn-ghost" name="action" value="reject">Send back for changes</button>
            <button class="btn btn-ghost" name="action" value="hide">Hide</button>
          </form>
          <form method="post" action="/admin/users/${p.user_id}/suspend" class="form">
            ${csrfField(req)}
            <button class="btn btn-danger btn-sm" data-confirm="Change this account's suspension?">${p.suspended ? "Unsuspend account" : "Suspend account"}</button>
          </form>
        </aside>
      </div>`);
  });

  app.post("/admin/helpers/:id/review", guard, (req, res) => {
    const id = Number(req.params.id);
    const status = { approve: "approved", reject: "rejected", hide: "hidden" }[req.body.action];
    if (!status) return res.redirect(`/admin/helpers/${id}`);
    db.prepare(`UPDATE helper_profiles SET status = ?, review_note = ?,
      approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END WHERE user_id = ?`)
      .run(status, str(req.body.note, 500) || null, status, Date.now(), id);
    res.flash(`Profile marked as ${PROFILE_STATUS[status].toLowerCase()}.`, "success");
    res.redirect("/admin/helpers?status=pending");
  });

  app.get("/admin/agencies", guard, (req, res) => {
    const unverifiedOnly = req.query.filter === "unverified";
    const rows = db.prepare(`SELECT a.*, u.email, u.name, u.suspended, u.created_at FROM agencies a JOIN users u ON u.id = a.user_id
      ${unverifiedOnly ? "WHERE a.verified = 0" : ""} ORDER BY u.created_at DESC LIMIT 500`).all();
    res.page("Agencies", html`
      <h1>Agencies</h1>
      <nav class="tabs">
        <a href="/admin/agencies" class="${unverifiedOnly ? "" : "active"}">All</a>
        <a href="/admin/agencies?filter=unverified" class="${unverifiedOnly ? "active" : ""}">To verify</a>
      </nav>
      <p class="muted small">Check each licence number against MOM's EA Directory before verifying.</p>
      ${rows.map((a) => html`
        <div class="card agency-row">
          <div>
            <h3>${a.company_name}
              ${a.verified ? html`<span class="badge badge-approved">Verified</span>` : html`<span class="badge badge-pending">Unverified</span>`}
              ${a.suspended ? html`<span class="badge badge-rejected">Suspended</span>` : ""}</h3>
            <p class="small">Licence ${a.licence_no} &middot; UEN ${a.uen} &middot; ${a.phone} &middot; ${a.name} &lt;${a.email}&gt;
              ${a.website ? html` &middot; ${a.website}` : ""}</p>
            <p class="small">Subscription: ${subscriptionActive(a)
              ? html`<b>active</b> (${a.sub_status}) until ${fmtDate(a.period_end)}`
              : html`${a.sub_status === "none" ? "none" : `${a.sub_status}, ended ${fmtDate(a.period_end)}`}`}
              &middot; Joined ${fmtDate(a.created_at)}</p>
          </div>
          <div class="actions">
            <form method="post" action="/admin/agencies/${a.user_id}/verify">${csrfField(req)}
              <input type="hidden" name="verified" value="${a.verified ? "0" : "1"}">
              <button class="btn btn-sm ${a.verified ? "btn-ghost" : ""}">${a.verified ? "Remove verification" : "Verify"}</button></form>
            <form method="post" action="/admin/agencies/${a.user_id}/grant" class="inline">${csrfField(req)}
              <select name="months" aria-label="Months">${options([[1, "1 month"], [3, "3 months"], [12, "12 months"], [0, "End now"]], 1)}</select>
              <button class="btn btn-sm btn-ghost">Set manual subscription</button></form>
            <form method="post" action="/admin/users/${a.user_id}/suspend">${csrfField(req)}
              <button class="btn btn-sm btn-danger" data-confirm="Change this account's suspension?">${a.suspended ? "Unsuspend" : "Suspend"}</button></form>
          </div>
        </div>`)}
      ${rows.length ? "" : html`<p class="muted">Nothing here.</p>`}`);
  });

  app.post("/admin/agencies/:id/verify", guard, (req, res) => {
    db.prepare("UPDATE agencies SET verified = ? WHERE user_id = ?").run(req.body.verified === "1" ? 1 : 0, Number(req.params.id));
    res.redirect("/admin/agencies");
  });

  // For agencies paying by bank transfer / invoice, or when Stripe is not configured.
  app.post("/admin/agencies/:id/grant", guard, (req, res) => {
    const months = int(req.body.months, 0, 24) ?? 0;
    const id = Number(req.params.id);
    if (months === 0) {
      db.prepare("UPDATE agencies SET sub_status = 'canceled', period_end = ? WHERE user_id = ?").run(Date.now(), id);
    } else {
      const a = db.prepare("SELECT period_end, sub_status FROM agencies WHERE user_id = ?").get(id);
      const start = a && subscriptionActive(a) ? a.period_end : Date.now();
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      db.prepare("UPDATE agencies SET sub_status = 'manual', plan = 'manual', period_end = ? WHERE user_id = ?").run(end.getTime(), id);
    }
    res.flash("Subscription updated.", "success");
    res.redirect("/admin/agencies");
  });

  app.post("/admin/users/:id/suspend", guard, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.redirect("/admin");
    db.prepare("UPDATE users SET suspended = 1 - suspended WHERE id = ? AND role != 'admin'").run(id);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND (SELECT suspended FROM users WHERE id = ?) = 1").run(id, id);
    const target = db.prepare("SELECT role FROM users WHERE id = ?").get(id);
    res.redirect(target?.role === "helper" ? `/admin/helpers/${id}` : "/admin/agencies");
  });
};
