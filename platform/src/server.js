const path = require("node:path");
const express = require("express");
const { loadConfig } = require("./config");
const { openDb } = require("./db");
const { sessionMiddleware, csrfMiddleware } = require("./auth");
const { layout, raw } = require("./views");
const { unreadCount } = require("./models");

function createApp(cfg = loadConfig(), db = openDb(cfg.dbFile)) {
  const app = express();
  app.disable("x-powered-by");
  if (cfg.secureCookies) app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
        "frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
    });
    next();
  });

  app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: "1h" }));

  // The Stripe webhook needs the raw body, so it is registered before the form parser.
  const ctx = { db, cfg };
  require("./routes/billing").webhook(app, ctx);

  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(sessionMiddleware(db, cfg));
  app.use(csrfMiddleware);

  app.use((req, res, next) => {
    res.flash = (message, type = "info") => {
      res.cookie("flash", JSON.stringify({ message, type }), { httpOnly: true, sameSite: "lax", path: "/" });
    };
    res.page = (title, body) => {
      let flash = null;
      if (req.cookies.flash) {
        try { flash = JSON.parse(req.cookies.flash); } catch { /* ignore */ }
        res.clearCookie("flash", { path: "/" });
      }
      const unread = req.user && req.user.role !== "admin" ? unreadCount(db, req.user.id) : 0;
      const content = typeof body === "string" ? raw(body) : body;
      return res.send(layout(req, { title, body: content, appName: cfg.appName, flash, unread }));
    };
    next();
  });

  require("./routes/public")(app, ctx);
  require("./routes/auth")(app, ctx);
  require("./routes/helper")(app, ctx);
  require("./routes/agency")(app, ctx);
  require("./routes/messages")(app, ctx);
  require("./routes/billing").pages(app, ctx);
  require("./routes/admin")(app, ctx);

  app.use((req, res) => {
    res.status(404).page("Not found", "<h1>Page not found</h1><p><a href=\"/\">Go to the home page</a></p>");
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return;
    if (typeof res.page === "function") {
      res.status(500).page("Error", "<h1>Something went wrong</h1><p>Please try again.</p>");
    } else {
      res.status(500).send("Something went wrong");
    }
  });

  return { app, db };
}

if (require.main === module) {
  const cfg = loadConfig();
  const { app } = createApp(cfg);
  app.listen(cfg.port, () => console.log(`${cfg.appName} running at ${cfg.baseUrl}`));
}

module.exports = { createApp };
