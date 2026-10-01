const path = require("node:path");

const root = path.resolve(__dirname, "..");

function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  return {
    appName: env.APP_NAME || "Helper Marketplace",
    port,
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    dbFile: env.DB_FILE || path.join(root, "data", "app.db"),
    uploadDir: env.UPLOAD_DIR || path.join(root, "data", "uploads"),
    secureCookies: env.NODE_ENV === "production",
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || "",
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || ""
    },
    plans: [
      {
        id: "monthly",
        name: "Monthly",
        priceLabel: env.PLAN_MONTHLY_LABEL || "S$99 / month",
        stripePriceId: env.STRIPE_PRICE_MONTHLY || ""
      },
      {
        id: "yearly",
        name: "Yearly",
        priceLabel: env.PLAN_YEARLY_LABEL || "S$990 / year",
        stripePriceId: env.STRIPE_PRICE_YEARLY || ""
      }
    ]
  };
}

module.exports = { loadConfig };
