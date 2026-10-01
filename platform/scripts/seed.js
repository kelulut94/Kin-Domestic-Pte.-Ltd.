// Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
// `npm run seed -- --demo` also adds fictional helpers and a demo agency for local testing.
const { loadConfig } = require("../src/config");
const { openDb } = require("../src/db");
const { hashPassword } = require("../src/auth");

const cfg = loadConfig();
const db = openDb(cfg.dbFile);
const now = Date.now();

function createUser(email, password, role, name) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return { id: existing.id, created: false };
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(email, hashPassword(password), role, name, now);
  return { id: Number(lastInsertRowid), created: true };
}

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword || adminPassword.length < 8) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) in .env first.");
  process.exit(1);
}
const admin = createUser(adminEmail.toLowerCase(), adminPassword, "admin", "Admin");
console.log(admin.created ? `Admin created: ${adminEmail}` : `Admin already exists: ${adminEmail}`);

if (process.argv.includes("--demo")) {
  const agency = createUser("agency@example.com", "demo-password", "agency", "Demo Agency Staff");
  if (agency.created) {
    db.prepare(`INSERT INTO agencies (user_id, company_name, licence_no, uen, phone, verified, plan, sub_status, period_end)
      VALUES (?, 'Demo Employment Agency', 'DEMO-0000', 'DEMO000000X', '+65 0000 0000', 1, 'manual', 'manual', ?)`)
      .run(agency.id, now + 365 * 86400000);
  }
  const demo = [
    ["Aye", 29, "Myanmar", "experienced", ["childcare", "cooking", "housekeeping"], 5, 650],
    ["Maria", 34, "Philippines", "transfer", ["eldercare", "cooking"], 9, 750],
    ["Sari", 26, "Indonesia", "fresh", ["infant", "childcare", "housekeeping"], 0, 600],
    ["Thida", 31, "Myanmar", "experienced", ["eldercare", "pets", "housekeeping"], 6, 680],
    ["Joy", 40, "Philippines", "experienced", ["cooking", "disability", "eldercare"], 14, 800],
    ["Nwe", 24, "Myanmar", "fresh", ["housekeeping", "cooking"], 0, 580]
  ];
  demo.forEach(([name, age, nat, type, skills, years, salary], i) => {
    const u = createUser(`helper${i + 1}@example.com`, "demo-password", "helper", name);
    if (!u.created) return;
    db.prepare(`INSERT INTO helper_profiles (user_id, status, first_name, age, nationality, helper_type, location, skills,
      languages, years_experience, experience, expected_salary, available_from, rest_days, about, updated_at, approved_at)
      VALUES (?, 'approved', ?, ?, ?, ?, ?, ?, 'English (basic)', ?, ?, ?, ?, '4 per month', ?, ?, ?)`)
      .run(u.id, name, age, nat, type, type === "transfer" ? "Singapore" : nat, JSON.stringify(skills), years,
        years ? `${years} years as a domestic helper (demo data).` : "", salary,
        new Date(now + 30 * 86400000).toISOString().slice(0, 10),
        `Demo profile for ${name}. Fictional person for testing only.`, now - i * 3600000, now);
  });
  console.log("Demo data added. Agency login: agency@example.com / demo-password; helpers: helper1@example.com … / demo-password");
}
