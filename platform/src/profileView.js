const { html, fmtDate, photoUrl, skillChips } = require("./views");
const { HELPER_TYPES, TYPE_SHORT } = require("./constants");

function row(label, value) {
  return value === null || value === undefined || value === "" ? "" : html`<tr><th>${label}</th><td>${value}</td></tr>`;
}

// Card used in search results and shortlists.
function helperCard(p, { shortlisted = false } = {}) {
  return html`
    <a class="helper-card" href="/helpers/${p.user_id}">
      <img src="${photoUrl(p)}" alt="" loading="lazy" width="320" height="320">
      <div class="body">
        <h3>${p.first_name}${shortlisted ? html` <span title="Shortlisted">★</span>` : ""}</h3>
        <p class="meta">${p.age} yrs &middot; ${p.nationality} &middot; ${TYPE_SHORT[p.helper_type] || ""}</p>
        ${skillChips(p)}
        <p class="meta">${p.years_experience != null ? `${p.years_experience} yrs experience` : ""}
          ${p.expected_salary ? html` &middot; S$${p.expected_salary}` : ""}</p>
      </div>
    </a>`;
}

// Full = subscribed agency or admin. Limited preview otherwise.
function profileDetail(p, { full, showPhone }) {
  const header = html`
    <div class="profile-head">
      <img src="${photoUrl(p)}" alt="Photo of ${p.first_name}" width="240" height="240">
      <div>
        <h1>${p.first_name}</h1>
        <p class="meta">${p.age} yrs &middot; ${p.nationality} &middot; ${HELPER_TYPES[p.helper_type] || ""}</p>
        ${skillChips(p)}
        ${p.available_from ? html`<p>Available from <b>${fmtDate(Date.parse(p.available_from))}</b></p>` : ""}
      </div>
    </div>`;
  if (!full) return header;
  return html`
    ${header}
    ${p.about ? html`<h2>About</h2><p class="pre">${p.about}</p>` : ""}
    <h2>Details</h2>
    <table class="details">
      ${row("Currently in", p.location)}
      ${row("Years of experience", p.years_experience)}
      ${row("Expected salary", p.expected_salary ? `S$${p.expected_salary} / month` : "")}
      ${row("Rest days", p.rest_days)}
      ${row("Languages", p.languages)}
      ${row("Education", p.education)}
      ${row("Religion", p.religion)}
      ${row("Marital status", p.marital_status)}
      ${row("Children", p.children)}
      ${row("Height", p.height_cm ? `${p.height_cm} cm` : "")}
      ${row("Weight", p.weight_kg ? `${p.weight_kg} kg` : "")}
      ${showPhone && p.share_phone && p.phone ? row("Phone", p.phone) : ""}
    </table>
    ${p.experience ? html`<h2>Work experience</h2><p class="pre">${p.experience}</p>` : ""}`;
}

module.exports = { helperCard, profileDetail };
