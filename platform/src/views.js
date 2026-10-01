const { SKILLS, TYPE_SHORT, PROFILE_STATUS } = require("./constants");

class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const raw = (value) => new Raw(String(value));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function render(value) {
  if (value == null || value === false) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(value);
}

// Tagged template: interpolated values are escaped unless wrapped in raw() or html``.
function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

function csrfField(req) {
  return html`<input type="hidden" name="_csrf" value="${req.csrfToken}">`;
}

function options(list, selected) {
  return list.map(([value, label]) =>
    html`<option value="${value}"${String(value) === String(selected ?? "") ? raw(" selected") : ""}>${label}</option>`);
}

function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(ms) {
  return new Date(ms).toLocaleString("en-SG", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
  });
}

function parseSkills(json) {
  try {
    const list = JSON.parse(json || "[]");
    return Array.isArray(list) ? list.filter((s) => SKILLS[s]) : [];
  } catch {
    return [];
  }
}

function photoUrl(profile) {
  return profile.photo ? `/photos/${profile.user_id}?v=${encodeURIComponent(profile.photo)}` : "/placeholder.svg";
}

function skillChips(profile) {
  return html`<ul class="chips">${parseSkills(profile.skills).map((s) => html`<li>${SKILLS[s]}</li>`)}</ul>`;
}

function statusBadge(status) {
  return html`<span class="badge badge-${status}">${PROFILE_STATUS[status] || status}</span>`;
}

function navFor(req, unread) {
  const u = req.user;
  const unreadBadge = unread ? html` <span class="count">${unread}</span>` : "";
  let links;
  if (!u) {
    links = html`
      <a href="/pricing">For agencies</a>
      <a href="/signup/helper">For helpers</a>
      <a href="/login">Log in</a>
      <a class="btn btn-sm" href="/signup">Sign up</a>`;
  } else if (u.role === "helper") {
    links = html`
      <a href="/me">My profile</a>
      <a href="/messages">Messages${unreadBadge}</a>
      <a href="/account">Account</a>`;
  } else if (u.role === "agency") {
    links = html`
      <a href="/helpers">Find helpers</a>
      <a href="/shortlist">Shortlist</a>
      <a href="/messages">Messages${unreadBadge}</a>
      <a href="/billing">Subscription</a>
      <a href="/account">Account</a>`;
  } else {
    links = html`
      <a href="/admin">Admin</a>
      <a href="/admin/helpers">Helpers</a>
      <a href="/admin/agencies">Agencies</a>
      <a href="/account">Account</a>`;
  }
  const logout = u
    ? html`<form method="post" action="/logout" class="inline">${csrfField(req)}<button class="link">Log out</button></form>`
    : "";
  return html`${links}${logout}`;
}

function layout(req, { title, body, appName, flash, unread }) {
  const flashHtml = flash
    ? html`<div class="flash flash-${flash.type || "info"}" role="status">${flash.message}</div>`
    : "";
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} | ${appName}` : appName}</title>
  <link rel="stylesheet" href="/styles.css?v=1">
  <script src="/app.js?v=1" defer></script>
</head>
<body>
  <header class="site-header"><div class="wrap">
    <a class="brand" href="/">${appName}</a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="Menu">
    <label for="nav-toggle" class="nav-toggle-label">Menu</label>
    <nav class="site-nav" aria-label="Main">${navFor(req, unread)}</nav>
  </div></header>
  <main class="wrap">
    ${flashHtml}
    ${body}
  </main>
  <footer class="site-footer"><div class="wrap">
    <span>&copy; ${new Date().getFullYear()} ${appName}</span>
    <a href="/pricing">Pricing</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </div></footer>
</body>
</html>`.value;
}

module.exports = {
  html, raw, escapeHtml, csrfField, options, fmtDate, fmtDateTime, parseSkills, photoUrl,
  skillChips, statusBadge, layout, TYPE_SHORT
};
