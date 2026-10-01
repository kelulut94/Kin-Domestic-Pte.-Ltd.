const crypto = require("node:crypto");

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Ignore malformed cookies.
    }
  }
  return out;
}

function cookieOptions(cfg, maxAge) {
  return { httpOnly: true, sameSite: "lax", secure: cfg.secureCookies, path: "/", maxAge };
}

function createSession(db, cfg, res, userId) {
  const id = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(id, userId, Date.now() + SESSION_MS);
  res.cookie("sid", id, cookieOptions(cfg, SESSION_MS));
}

function destroySession(db, req, res) {
  if (req.cookies.sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(req.cookies.sid);
  res.clearCookie("sid", { path: "/" });
}

// Loads req.user from the session cookie and gives every visitor a CSRF token.
function sessionMiddleware(db, cfg) {
  const findUser = db.prepare(`
    SELECT u.id, u.email, u.role, u.name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? AND u.suspended = 0`);
  return (req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    req.user = req.cookies.sid ? findUser.get(req.cookies.sid, Date.now()) || null : null;
    let token = req.cookies.csrf;
    if (!token || token.length < 32) {
      token = crypto.randomBytes(24).toString("base64url");
      res.cookie("csrf", token, cookieOptions(cfg, SESSION_MS));
    }
    req.csrfToken = token;
    next();
  };
}

function checkCsrf(req, res, next) {
  if (safeEqual(req.body && req.body._csrf, req.csrfToken)) return next();
  res.status(403).send("Your form expired. Go back, refresh the page and try again.");
}

// Applies to every POST except routes that verify themselves (Stripe webhook)
// or parse multipart bodies (they call checkCsrf after the upload is parsed).
function csrfMiddleware(req, res, next) {
  if (req.method !== "POST") return next();
  if (req.path === "/billing/webhook") return next();
  if (req.is("multipart/form-data")) return next();
  checkCsrf(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
    if (!roles.includes(req.user.role)) {
      return res.status(403).page("Not allowed", "<p>Your account does not have access to this page.</p>");
    }
    next();
  };
}

// Simple in-memory limiter for login attempts: 10 per 15 minutes per IP + email.
function createLimiter(max = 10, windowMs = 15 * 60 * 1000) {
  const hits = new Map();
  return {
    tooMany(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) return false;
      return entry.count >= max;
    },
    hit(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
      else entry.count++;
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      }
    },
    clear(key) {
      hits.delete(key);
    }
  };
}

module.exports = {
  hashPassword, verifyPassword, safeEqual, parseCookies, createSession, destroySession,
  sessionMiddleware, csrfMiddleware, checkCsrf, requireRole, createLimiter
};
