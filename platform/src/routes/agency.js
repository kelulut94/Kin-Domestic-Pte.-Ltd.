const { html, raw, csrfField, options } = require("../views");
const { requireRole } = require("../auth");
const { SKILLS, NATIONALITIES, TYPE_SHORT } = require("../constants");
const { getAgency, getProfile, canContact, subscriptionActive, list, int, str } = require("../models");
const { helperCard, profileDetail } = require("../profileView");

const PAGE_SIZE = 24;

function accessNotice(agency) {
  if (!subscriptionActive(agency)) {
    return html`<div class="notice">You're seeing a preview. <a href="/billing">Subscribe</a> to see full biodata and contact helpers.</div>`;
  }
  if (!agency.verified) {
    return html`<div class="notice">Your subscription is active. Messaging unlocks once our team has verified your agency licence.</div>`;
  }
  return "";
}

module.exports = function agencyRoutes(app, { db }) {
  const guard = requireRole("agency");

  app.get("/helpers", guard, (req, res) => {
    const agency = getAgency(db, req.user.id);
    const f = {
      nationality: NATIONALITIES.includes(req.query.nationality) ? req.query.nationality : "",
      type: TYPE_SHORT[req.query.type] ? req.query.type : "",
      skills: list(req.query.skills).filter((s) => SKILLS[s]),
      minAge: int(req.query.min_age, 18, 65),
      maxAge: int(req.query.max_age, 18, 65),
      minExp: int(req.query.min_exp, 0, 50),
      maxSalary: int(req.query.max_salary, 0, 100000),
      q: str(req.query.q, 60),
      page: int(req.query.page, 1, 10000) || 1
    };
    const where = ["p.status = 'approved'", "u.suspended = 0"];
    const params = [];
    if (f.nationality) { where.push("p.nationality = ?"); params.push(f.nationality); }
    if (f.type) { where.push("p.helper_type = ?"); params.push(f.type); }
    for (const s of f.skills) { where.push("EXISTS (SELECT 1 FROM json_each(p.skills) WHERE value = ?)"); params.push(s); }
    if (f.minAge) { where.push("p.age >= ?"); params.push(f.minAge); }
    if (f.maxAge) { where.push("p.age <= ?"); params.push(f.maxAge); }
    if (f.minExp != null) { where.push("p.years_experience >= ?"); params.push(f.minExp); }
    if (f.maxSalary) { where.push("(p.expected_salary IS NULL OR p.expected_salary <= ?)"); params.push(f.maxSalary); }
    if (f.q) {
      const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
      where.push("(p.first_name LIKE ? ESCAPE '\\' OR p.about LIKE ? ESCAPE '\\' OR p.experience LIKE ? ESCAPE '\\' OR p.languages LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    const from = `FROM helper_profiles p JOIN users u ON u.id = p.user_id WHERE ${where.join(" AND ")}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
    const rows = db.prepare(`SELECT p.*, EXISTS (SELECT 1 FROM shortlists s WHERE s.agency_id = ? AND s.helper_id = p.user_id) AS shortlisted
      ${from} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`)
      .all(req.user.id, ...params, PAGE_SIZE, (f.page - 1) * PAGE_SIZE);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageLink = (n) => {
      const qs = new URLSearchParams(req.query);
      qs.set("page", n);
      return `/helpers?${qs}`;
    };

    res.page("Find helpers", html`
      <h1>Find helpers</h1>
      ${accessNotice(agency)}
      <div class="search-layout">
        <form method="get" action="/helpers" class="filters form">
          <label>Keyword<input name="q" value="${f.q}" maxlength="60"></label>
          <label>Nationality<select name="nationality"><option value="">Any</option>
            ${options(NATIONALITIES.map((n) => [n, n]), f.nationality)}</select></label>
          <label>Type<select name="type"><option value="">Any</option>
            ${options(Object.entries(TYPE_SHORT), f.type)}</select></label>
          <fieldset><legend>Skills (all of)</legend>
            ${Object.entries(SKILLS).map(([k, label]) => html`
              <label class="check"><input type="checkbox" name="skills" value="${k}"${f.skills.includes(k) ? raw(" checked") : ""}> ${label}</label>`)}
          </fieldset>
          <div class="pair">
            <label>Min age<input type="number" name="min_age" min="18" max="65" value="${f.minAge}"></label>
            <label>Max age<input type="number" name="max_age" min="18" max="65" value="${f.maxAge}"></label>
          </div>
          <label>Min years experience<input type="number" name="min_exp" min="0" max="50" value="${f.minExp}"></label>
          <label>Max salary (S$)<input type="number" name="max_salary" min="0" value="${f.maxSalary}"></label>
          <button class="btn btn-sm">Search</button>
          <a href="/helpers" class="muted">Clear filters</a>
        </form>
        <div>
          <p class="muted">${total} helper${total === 1 ? "" : "s"} found</p>
          ${rows.length
            ? html`<div class="helper-grid">${rows.map((p) => helperCard(p, { shortlisted: p.shortlisted }))}</div>`
            : html`<p class="card">No helpers match these filters. Try removing some.</p>`}
          ${pages > 1 ? html`<nav class="pager">
            ${f.page > 1 ? html`<a href="${pageLink(f.page - 1)}">&larr; Previous</a>` : ""}
            <span>Page ${f.page} of ${pages}</span>
            ${f.page < pages ? html`<a href="${pageLink(f.page + 1)}">Next &rarr;</a>` : ""}
          </nav>` : ""}
        </div>
      </div>`);
  });

  app.get("/helpers/:id", guard, (req, res) => {
    const id = Number(req.params.id);
    const p = getProfile(db, id);
    if (!p || p.status !== "approved" || p.suspended) {
      return res.status(404).page("Not found", "<h1>This profile is not available</h1><p><a href=\"/helpers\">Back to search</a></p>");
    }
    const agency = getAgency(db, req.user.id);
    const full = subscriptionActive(agency);
    const contact = canContact(agency);
    if (full) {
      db.prepare(`INSERT INTO profile_views (agency_id, helper_id, viewed_at) VALUES (?, ?, ?)
        ON CONFLICT (agency_id, helper_id) DO UPDATE SET viewed_at = excluded.viewed_at`).run(req.user.id, id, Date.now());
    }
    const shortlisted = db.prepare("SELECT 1 FROM shortlists WHERE agency_id = ? AND helper_id = ?").get(req.user.id, id);
    const convo = db.prepare("SELECT id FROM conversations WHERE agency_id = ? AND helper_id = ?").get(req.user.id, id);

    let contactBox;
    if (convo) {
      contactBox = html`<a class="btn" href="/messages/${convo.id}">Open conversation</a>`;
    } else if (contact) {
      contactBox = html`
        <form method="post" action="/helpers/${id}/contact" class="form">
          ${csrfField(req)}
          <label>Message ${p.first_name}
            <textarea name="body" rows="4" maxlength="2000" required>Hello ${p.first_name}, we saw your profile and would like to talk about a job.</textarea></label>
          <button class="btn">Send message</button>
        </form>`;
    } else {
      contactBox = accessNotice(agency);
    }

    res.page(p.first_name, html`
      <p><a href="/helpers">&larr; Back to search</a></p>
      <div class="profile-layout">
        <div class="card">${profileDetail(p, { full, showPhone: contact })}</div>
        <aside class="card">
          <form method="post" action="/helpers/${id}/shortlist">
            ${csrfField(req)}
            <button class="btn btn-ghost btn-sm">${shortlisted ? "★ Remove from shortlist" : "☆ Add to shortlist"}</button>
          </form>
          ${contactBox}
        </aside>
      </div>`);
  });

  app.post("/helpers/:id/shortlist", guard, (req, res) => {
    const id = Number(req.params.id);
    const exists = db.prepare("SELECT 1 FROM shortlists WHERE agency_id = ? AND helper_id = ?").get(req.user.id, id);
    if (exists) {
      db.prepare("DELETE FROM shortlists WHERE agency_id = ? AND helper_id = ?").run(req.user.id, id);
    } else if (db.prepare("SELECT 1 FROM helper_profiles WHERE user_id = ? AND status = 'approved'").get(id)) {
      db.prepare("INSERT INTO shortlists (agency_id, helper_id, created_at) VALUES (?, ?, ?)").run(req.user.id, id, Date.now());
    }
    res.redirect(`/helpers/${id}`);
  });

  app.post("/helpers/:id/contact", guard, (req, res) => {
    const id = Number(req.params.id);
    const agency = getAgency(db, req.user.id);
    const p = getProfile(db, id);
    const body = str(req.body.body, 2000);
    if (!p || p.status !== "approved" || p.suspended) return res.status(404).page("Not found", "<h1>Profile not available</h1>");
    if (!canContact(agency)) {
      res.flash("You need an active subscription and a verified agency account to message helpers.", "error");
      return res.redirect(`/helpers/${id}`);
    }
    if (!body) {
      res.flash("Write a message first.", "error");
      return res.redirect(`/helpers/${id}`);
    }
    const now = Date.now();
    db.prepare(`INSERT INTO conversations (agency_id, helper_id, created_at, last_message_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (agency_id, helper_id) DO NOTHING`).run(req.user.id, id, now, now);
    const convo = db.prepare("SELECT id FROM conversations WHERE agency_id = ? AND helper_id = ?").get(req.user.id, id);
    db.prepare("INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)").run(convo.id, req.user.id, body, now);
    db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(now, convo.id);
    res.redirect(`/messages/${convo.id}`);
  });

  app.get("/shortlist", guard, (req, res) => {
    const rows = db.prepare(`SELECT p.*, 1 AS shortlisted FROM shortlists s
      JOIN helper_profiles p ON p.user_id = s.helper_id JOIN users u ON u.id = p.user_id
      WHERE s.agency_id = ? AND p.status = 'approved' AND u.suspended = 0 ORDER BY s.created_at DESC`).all(req.user.id);
    res.page("Shortlist", html`
      <h1>My shortlist</h1>
      ${rows.length
        ? html`<div class="helper-grid">${rows.map((p) => helperCard(p, { shortlisted: true }))}</div>`
        : html`<p class="card">No helpers shortlisted yet. <a href="/helpers">Find helpers</a></p>`}`);
  });
};
