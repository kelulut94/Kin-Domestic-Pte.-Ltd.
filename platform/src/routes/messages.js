const { html, csrfField, fmtDateTime } = require("../views");
const { requireRole } = require("../auth");
const { getAgency, canContact, str } = require("../models");

module.exports = function messageRoutes(app, { db }) {
  const guard = requireRole("helper", "agency");

  // Returns the conversation if the current user is part of it.
  function findConversation(req) {
    const c = db.prepare(`
      SELECT c.*, a.company_name, p.first_name AS helper_name
      FROM conversations c
      JOIN agencies a ON a.user_id = c.agency_id
      JOIN helper_profiles p ON p.user_id = c.helper_id
      WHERE c.id = ?`).get(Number(req.params.id));
    if (!c || (c.agency_id !== req.user.id && c.helper_id !== req.user.id)) return null;
    return c;
  }

  function canSend(req, c) {
    if (req.user.role === "helper") return true;
    return canContact(getAgency(db, req.user.id));
  }

  app.get("/messages", guard, (req, res) => {
    const col = req.user.role === "agency" ? "agency_id" : "helper_id";
    const rows = db.prepare(`
      SELECT c.id, c.last_message_at, a.company_name, p.first_name AS helper_name,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN agencies a ON a.user_id = c.agency_id
      JOIN helper_profiles p ON p.user_id = c.helper_id
      WHERE c.${col} = ? ORDER BY c.last_message_at DESC`).all(req.user.id, req.user.id);
    const isAgency = req.user.role === "agency";
    res.page("Messages", html`
      <h1>Messages</h1>
      ${rows.length ? html`<ul class="convo-list">${rows.map((r) => html`
        <li class="${r.unread ? "unread" : ""}"><a href="/messages/${r.id}">
          <b>${isAgency ? r.helper_name : r.company_name}</b>
          ${r.unread ? html`<span class="count">${r.unread}</span>` : ""}
          <span class="muted">${fmtDateTime(r.last_message_at)}</span>
          <span class="preview">${(r.last_body || "").slice(0, 120)}</span>
        </a></li>`)}</ul>`
        : html`<p class="card">${isAgency
          ? html`No conversations yet. <a href="/helpers">Find helpers</a> to message.`
          : "No messages yet. When an agency contacts you, it will appear here."}</p>`}`);
  });

  app.get("/messages/:id", guard, (req, res) => {
    const c = findConversation(req);
    if (!c) return res.status(404).page("Not found", "<h1>Conversation not found</h1>");
    db.prepare("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL")
      .run(Date.now(), c.id, req.user.id);
    const msgs = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id").all(c.id);
    const other = req.user.role === "agency" ? c.helper_name : c.company_name;
    const sendable = canSend(req, c);
    res.page(`Chat with ${other}`, html`
      <p><a href="/messages">&larr; All messages</a>
        ${req.user.role === "agency" ? html` &middot; <a href="/helpers/${c.helper_id}">View ${c.helper_name}'s profile</a>` : ""}</p>
      <h1>${other}</h1>
      <div class="thread">
        ${msgs.map((m) => html`
          <div class="msg ${m.sender_id === req.user.id ? "mine" : ""}">
            <p class="pre">${m.body}</p>
            <span class="muted">${fmtDateTime(m.created_at)}</span>
          </div>`)}
      </div>
      ${sendable
        ? html`<form method="post" action="/messages/${c.id}" class="form reply">
            ${csrfField(req)}
            <label class="sr-only" for="body">Your message</label>
            <textarea id="body" name="body" rows="3" maxlength="2000" required></textarea>
            <button class="btn">Send</button>
          </form>`
        : html`<div class="notice">Your subscription has ended. <a href="/billing">Renew</a> to reply.</div>`}
      ${req.user.role === "helper"
        ? html`<p class="muted small">Never pay anyone to get a job, and never send your passport or work permit by message.</p>`
        : ""}`);
  });

  app.post("/messages/:id", guard, (req, res) => {
    const c = findConversation(req);
    if (!c) return res.status(404).page("Not found", "<h1>Conversation not found</h1>");
    const body = str(req.body.body, 2000);
    if (!canSend(req, c)) {
      res.flash("Your subscription has ended. Renew to reply.", "error");
    } else if (body) {
      const now = Date.now();
      db.prepare("INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)").run(c.id, req.user.id, body, now);
      db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(now, c.id);
    }
    res.redirect(`/messages/${c.id}`);
  });
};
