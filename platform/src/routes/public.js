const { html } = require("../views");

module.exports = function publicRoutes(app, { db, cfg }) {
  app.get("/", (req, res) => {
    const helpers = db.prepare("SELECT COUNT(*) AS n FROM helper_profiles WHERE status = 'approved'").get().n;
    const agencies = db.prepare("SELECT COUNT(*) AS n FROM agencies WHERE verified = 1").get().n;
    const dashboard = req.user
      ? { helper: "/me", agency: "/helpers", admin: "/admin" }[req.user.role]
      : null;
    res.page("", html`
      <section class="hero">
        <h1>Find domestic helpers, directly.</h1>
        <p class="lead">${cfg.appName} connects licensed employment agencies with helpers who are
          looking for their next job. Helpers list for free. Agencies subscribe to search, shortlist and message.</p>
        <div class="btns">
          ${dashboard
            ? html`<a class="btn" href="${dashboard}">Go to my dashboard</a>`
            : html`<a class="btn" href="/signup/agency">I'm an agency</a>
                   <a class="btn btn-ghost" href="/signup/helper">I'm a helper</a>`}
        </div>
        <p class="stats"><b>${helpers}</b> helper profile${helpers === 1 ? "" : "s"} live &middot; <b>${agencies}</b> verified agenc${agencies === 1 ? "y" : "ies"}</p>
      </section>
      <section class="two-col">
        <div class="card">
          <h2>For agencies</h2>
          <ul class="ticks">
            <li>Search helper profiles by nationality, skills, experience and availability</li>
            <li>See full biodata, photos and contact details</li>
            <li>Shortlist candidates and message them in one place</li>
            <li>One flat subscription with no placement commission</li>
          </ul>
          <a class="btn btn-sm" href="/pricing">See pricing</a>
        </div>
        <div class="card">
          <h2>For helpers</h2>
          <ul class="ticks">
            <li>Free, always</li>
            <li>Create your profile once and agencies contact you</li>
            <li>Only verified, subscribed agencies can message you</li>
            <li>Hide your profile any time</li>
          </ul>
          <a class="btn btn-sm" href="/signup/helper">Create my free profile</a>
        </div>
      </section>`);
  });

  app.get("/pricing", (req, res) => {
    res.page("Pricing", html`
      <h1>Agency pricing</h1>
      <p class="lead">One subscription gives your agency full access to every live helper profile.</p>
      <div class="plans">
        ${cfg.plans.map((p) => html`
          <div class="card plan">
            <h2>${p.name}</h2>
            <p class="price">${p.priceLabel}</p>
            <ul class="ticks">
              <li>Unlimited profile views</li>
              <li>Unlimited messages to helpers</li>
              <li>Shortlists</li>
              <li>Cancel any time</li>
            </ul>
          </div>`)}
      </div>
      <p>New agency accounts are checked by our team (licence number and UEN) before they can contact helpers.</p>
      <p><a class="btn" href="${req.user ? "/billing" : "/signup/agency"}">Get started</a></p>`);
  });

  // Placeholder legal pages: replace with text from your lawyer before launch.
  app.get("/terms", (req, res) => {
    res.page("Terms", html`
      <h1>Terms of use</h1>
      <p class="notice">Placeholder. Replace this page with your own terms before launch.</p>
      <p>${cfg.appName} is a listing platform. Agencies are responsible for complying with all
        laws that apply to recruiting and placing domestic workers.</p>`);
  });

  app.get("/privacy", (req, res) => {
    res.page("Privacy", html`
      <h1>Privacy policy</h1>
      <p class="notice">Placeholder. Replace this page with your own PDPA-compliant policy before launch.</p>
      <p>Helper profiles are shown only to logged-in agencies. Phone numbers are shown only to verified,
        subscribed agencies, and only when the helper chooses to share it.
        Helpers can hide their profile at any time.</p>`);
  });
};
