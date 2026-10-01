const { html, csrfField } = require("../views");
const { hashPassword, verifyPassword, createSession, destroySession, requireRole, createLimiter } = require("../auth");
const { transaction } = require("../db");
const { str, EMAIL_RE } = require("../models");

function safeNext(value, fallback) {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

const HOME = { helper: "/me", agency: "/helpers", admin: "/admin" };

module.exports = function authRoutes(app, { db, cfg }) {
  const limiter = createLimiter();

  function emailTaken(email) {
    return Boolean(db.prepare("SELECT 1 FROM users WHERE email = ?").get(email));
  }

  function validateAccount(body) {
    const errors = [];
    const email = str(body.email, 200).toLowerCase();
    const password = String(body.password || "");
    const name = str(body.name, 100);
    if (!name) errors.push("Enter your name.");
    if (!EMAIL_RE.test(email)) errors.push("Enter a valid email address.");
    else if (emailTaken(email)) errors.push("An account with this email already exists. Try logging in.");
    if (password.length < 8 || password.length > 200) errors.push("Password must be at least 8 characters.");
    if (!body.agree) errors.push("You must agree to the terms and privacy policy.");
    return { errors, email, password, name };
  }

  function errorList(errors) {
    return errors.length ? html`<div class="flash flash-error"><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : "";
  }

  app.get("/signup", (req, res) => {
    res.page("Sign up", html`
      <h1>Create an account</h1>
      <div class="two-col">
        <a class="card card-link" href="/signup/agency"><h2>I'm an agency</h2><p>Search and contact helpers. Paid subscription.</p></a>
        <a class="card card-link" href="/signup/helper"><h2>I'm a helper</h2><p>Create a free profile so agencies can find you.</p></a>
      </div>`);
  });

  function helperForm(req, values = {}, errors = []) {
    return html`
      <h1>Create your free helper profile</h1>
      ${errorList(errors)}
      <form method="post" action="/signup/helper" class="form narrow">
        ${csrfField(req)}
        <label>Your name<input name="name" required maxlength="100" value="${values.name}" autocomplete="name"></label>
        <label>Email<input type="email" name="email" required value="${values.email}" autocomplete="email"></label>
        <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="agree" value="1" required>
          I agree to the <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy policy</a>,
          and I consent to my profile being shown to agencies on this site.</label>
        <button class="btn">Create account</button>
        <p class="muted">Already have an account? <a href="/login">Log in</a></p>
      </form>`;
  }

  app.get("/signup/helper", (req, res) => res.page("Helper sign up", helperForm(req)));

  app.post("/signup/helper", (req, res) => {
    const { errors, email, password, name } = validateAccount(req.body);
    if (errors.length) return res.status(400).page("Helper sign up", helperForm(req, req.body, errors));
    const userId = transaction(db, () => {
      const { lastInsertRowid } = db.prepare(
        "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'helper', ?, ?)")
        .run(email, hashPassword(password), name, Date.now());
      db.prepare("INSERT INTO helper_profiles (user_id, first_name, updated_at) VALUES (?, ?, ?)")
        .run(lastInsertRowid, name.split(/\s+/)[0], Date.now());
      return Number(lastInsertRowid);
    });
    createSession(db, cfg, res, userId);
    res.flash("Welcome! Fill in your profile, add a photo, then submit it for review.", "success");
    res.redirect("/me/profile");
  });

  function agencyForm(req, values = {}, errors = []) {
    return html`
      <h1>Register your agency</h1>
      ${errorList(errors)}
      <form method="post" action="/signup/agency" class="form narrow">
        ${csrfField(req)}
        <label>Company name<input name="company_name" required maxlength="150" value="${values.company_name}"></label>
        <label>EA licence number<input name="licence_no" required maxlength="40" value="${values.licence_no}"></label>
        <label>UEN<input name="uen" required maxlength="20" value="${values.uen}"></label>
        <label>Office phone<input name="phone" required maxlength="30" value="${values.phone}"></label>
        <label>Website <span class="muted">(optional)</span><input name="website" maxlength="200" value="${values.website}"></label>
        <label>Your name<input name="name" required maxlength="100" value="${values.name}" autocomplete="name"></label>
        <label>Email<input type="email" name="email" required value="${values.email}" autocomplete="email"></label>
        <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="agree" value="1" required>
          I agree to the <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy policy</a>.</label>
        <button class="btn">Create agency account</button>
      </form>`;
  }

  app.get("/signup/agency", (req, res) => res.page("Agency sign up", agencyForm(req)));

  app.post("/signup/agency", (req, res) => {
    const { errors, email, password, name } = validateAccount(req.body);
    const company = {
      company_name: str(req.body.company_name, 150),
      licence_no: str(req.body.licence_no, 40),
      uen: str(req.body.uen, 20),
      phone: str(req.body.phone, 30),
      website: str(req.body.website, 200)
    };
    if (!company.company_name) errors.push("Enter your company name.");
    if (!company.licence_no) errors.push("Enter your EA licence number.");
    if (!company.uen) errors.push("Enter your UEN.");
    if (!company.phone) errors.push("Enter an office phone number.");
    if (errors.length) return res.status(400).page("Agency sign up", agencyForm(req, req.body, errors));
    const userId = transaction(db, () => {
      const { lastInsertRowid } = db.prepare(
        "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'agency', ?, ?)")
        .run(email, hashPassword(password), name, Date.now());
      db.prepare(`INSERT INTO agencies (user_id, company_name, licence_no, uen, phone, website)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(lastInsertRowid, company.company_name, company.licence_no, company.uen, company.phone, company.website);
      return Number(lastInsertRowid);
    });
    createSession(db, cfg, res, userId);
    res.flash("Account created. We'll verify your licence shortly. Meanwhile you can browse helpers and subscribe.", "success");
    res.redirect("/billing");
  });

  function loginForm(req, error, email = "") {
    return html`
      <h1>Log in</h1>
      ${error ? html`<div class="flash flash-error">${error}</div>` : ""}
      <form method="post" action="/login" class="form narrow">
        ${csrfField(req)}
        <input type="hidden" name="next" value="${req.query.next || req.body?.next || ""}">
        <label>Email<input type="email" name="email" required value="${email}" autocomplete="email"></label>
        <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn">Log in</button>
        <p class="muted">No account yet? <a href="/signup">Sign up</a></p>
      </form>`;
  }

  app.get("/login", (req, res) => {
    if (req.user) return res.redirect(HOME[req.user.role]);
    res.page("Log in", loginForm(req));
  });

  app.post("/login", (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const key = `${req.ip}|${email}`;
    if (limiter.tooMany(key)) {
      return res.status(429).page("Log in", loginForm(req, "Too many attempts. Please wait 15 minutes and try again.", email));
    }
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(String(req.body.password || ""), user.password_hash)) {
      limiter.hit(key);
      return res.status(401).page("Log in", loginForm(req, "Wrong email or password.", email));
    }
    if (user.suspended) {
      return res.status(403).page("Log in", loginForm(req, "This account has been suspended. Please contact us.", email));
    }
    limiter.clear(key);
    if (req.cookies.sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(req.cookies.sid);
    createSession(db, cfg, res, user.id);
    res.redirect(safeNext(req.body.next, HOME[user.role]));
  });

  app.post("/logout", (req, res) => {
    destroySession(db, req, res);
    res.redirect("/");
  });

  app.get("/account", requireRole("helper", "agency", "admin"), (req, res) => {
    res.page("Account", html`
      <h1>Account</h1>
      <p>Signed in as <b>${req.user.email}</b>.</p>
      <h2>Change password</h2>
      <form method="post" action="/account/password" class="form narrow">
        ${csrfField(req)}
        <label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
        <label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn">Update password</button>
      </form>`);
  });

  app.post("/account/password", requireRole("helper", "agency", "admin"), (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const next = String(req.body.password || "");
    if (!verifyPassword(String(req.body.current || ""), user.password_hash)) {
      res.flash("Your current password is wrong.", "error");
    } else if (next.length < 8 || next.length > 200) {
      res.flash("New password must be at least 8 characters.", "error");
    } else {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, req.cookies.sid);
      res.flash("Password updated.", "success");
    }
    res.redirect("/account");
  });
};
