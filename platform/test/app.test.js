const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadConfig } = require("../src/config");
const { openDb } = require("../src/db");
const { createApp } = require("../src/server");
const { hashPassword } = require("../src/auth");
const { verifyStripeSignature } = require("../src/routes/billing");

const WEBHOOK_SECRET = "whsec_test";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let server, base, db, tmp;

// Minimal cookie-keeping client.
function client() {
  const jar = {};
  async function request(method, url, { form, multipart, headers = {} } = {}) {
    const h = { ...headers, cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") };
    let body;
    if (form) {
      body = new URLSearchParams(form);
      h["content-type"] = "application/x-www-form-urlencoded";
    } else if (multipart) {
      body = multipart;
    }
    const res = await fetch(base + url, { method, headers: h, body, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const value = pair.slice(i + 1);
      if (value === "" || /Expires=Thu, 01 Jan 1970/.test(c)) delete jar[pair.slice(0, i)];
      else jar[pair.slice(0, i)] = value;
    }
    return { status: res.status, location: res.headers.get("location"), text: await res.text() };
  }
  return {
    jar,
    get: (url) => request("GET", url),
    async post(url, form = {}) {
      if (!jar.csrf) await request("GET", "/");
      return request("POST", url, { form: { _csrf: decodeURIComponent(jar.csrf), ...form } });
    },
    async upload(url, field, buffer, filename) {
      if (!jar.csrf) await request("GET", "/");
      const fd = new FormData();
      fd.append("_csrf", decodeURIComponent(jar.csrf));
      fd.append(field, new Blob([buffer]), filename);
      return request("POST", url, { multipart: fd });
    },
    raw: request
  };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hm-test-"));
  const cfg = loadConfig({ DB_FILE: path.join(tmp, "test.db"), UPLOAD_DIR: path.join(tmp, "uploads"), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET });
  db = openDb(cfg.dbFile);
  db.prepare("INSERT INTO users (email, password_hash, role, name, created_at) VALUES (?, ?, 'admin', 'Admin', ?)")
    .run("admin@test.local", hashPassword("admin-password"), Date.now());
  const { app } = createApp(cfg, db);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const helper = client();
const agency = client();
const admin = client();
let helperId, agencyId, conversationUrl;

test("rejects POST without a valid CSRF token", async () => {
  const c = client();
  await c.get("/");
  const res = await c.raw("POST", "/login", { form: { email: "x@y.z", password: "nope", _csrf: "wrong" } });
  assert.equal(res.status, 403);
});

test("helper signs up, fills profile, uploads photo and submits", async () => {
  let res = await helper.post("/signup/helper", { name: "Aye Aye", email: "aye@test.local", password: "helper-pass", agree: "1" });
  assert.equal(res.status, 302);
  assert.equal(res.location, "/me/profile");
  helperId = db.prepare("SELECT id FROM users WHERE email = 'aye@test.local'").get().id;

  res = await helper.post("/me/profile/submit");
  assert.match(res.location, /\/me\/profile/, "cannot submit an incomplete profile");
  assert.equal(db.prepare("SELECT status FROM helper_profiles WHERE user_id = ?").get(helperId).status, "draft");

  res = await helper.post("/me/profile", {
    first_name: "Aye", age: "29", nationality: "Myanmar", helper_type: "experienced", skills: "childcare",
    languages: "English", about: "I love children. <script>alert(1)</script>", years_experience: "5", phone: "+95 123", share_phone: "1"
  });
  assert.equal(res.status, 302);

  res = await helper.upload("/me/profile/photo", "photo", Buffer.from("not an image"), "x.png");
  assert.equal(db.prepare("SELECT photo FROM helper_profiles WHERE user_id = ?").get(helperId).photo, null, "non-image rejected");
  res = await helper.upload("/me/profile/photo", "photo", PNG, "me.png");
  assert.match(db.prepare("SELECT photo FROM helper_profiles WHERE user_id = ?").get(helperId).photo, /\.png$/);

  res = await helper.post("/me/profile/submit");
  assert.equal(db.prepare("SELECT status FROM helper_profiles WHERE user_id = ?").get(helperId).status, "pending");

  const page = await helper.get("/me");
  assert.ok(!page.text.includes("<script>alert(1)</script>"), "user input is escaped");
  assert.ok(page.text.includes("&lt;script&gt;"));
});

test("agency signs up; pending profiles are not searchable", async () => {
  const res = await agency.post("/signup/agency", {
    company_name: "Acme Agency", licence_no: "12C3456", uen: "201912345A", phone: "61234567",
    name: "Bob", email: "bob@acme.test", password: "agency-pass", agree: "1"
  });
  assert.equal(res.location, "/billing");
  agencyId = db.prepare("SELECT id FROM users WHERE email = 'bob@acme.test'").get().id;
  const search = await agency.get("/helpers");
  assert.ok(search.text.includes("0 helpers found"));
  assert.equal((await agency.get(`/helpers/${helperId}`)).status, 404);
  assert.equal((await agency.get(`/photos/${helperId}`)).status, 404);
});

test("role guards: helper cannot reach agency or admin pages", async () => {
  assert.equal((await helper.get("/helpers")).status, 403);
  assert.equal((await helper.get("/admin")).status, 403);
  assert.equal((await agency.get("/admin")).status, 403);
  assert.equal((await client().get("/helpers")).status, 302);
});

test("admin logs in and approves the helper", async () => {
  let res = await admin.post("/login", { email: "admin@test.local", password: "wrong-password" });
  assert.equal(res.status, 401);
  res = await admin.post("/login", { email: "admin@test.local", password: "admin-password" });
  assert.equal(res.location, "/admin");
  res = await admin.post(`/admin/helpers/${helperId}/review`, { action: "approve" });
  assert.equal(db.prepare("SELECT status FROM helper_profiles WHERE user_id = ?").get(helperId).status, "approved");
});

test("unsubscribed agency sees a preview only and cannot message", async () => {
  const search = await agency.get("/helpers?nationality=Myanmar&skills=childcare");
  assert.ok(search.text.includes("1 helper found"));
  assert.ok((await agency.get("/helpers?skills=eldercare")).text.includes("0 helpers found"));
  const profile = await agency.get(`/helpers/${helperId}`);
  assert.ok(profile.text.includes("Subscribe"));
  assert.ok(!profile.text.includes("I love children"), "full biodata hidden");
  assert.ok(!profile.text.includes("+95 123"), "phone hidden");
  await agency.post(`/helpers/${helperId}/contact`, { body: "Hi" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 0);
  assert.equal((await agency.get(`/photos/${helperId}`)).status, 200);
});

test("subscribed but unverified agency sees full profile but cannot message", async () => {
  await admin.post(`/admin/agencies/${agencyId}/grant`, { months: "1" });
  const profile = await agency.get(`/helpers/${helperId}`);
  assert.ok(profile.text.includes("I love children"));
  assert.ok(!profile.text.includes("+95 123"));
  await agency.post(`/helpers/${helperId}/contact`, { body: "Hi" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 0);
});

test("verified + subscribed agency messages helper; helper replies", async () => {
  await admin.post(`/admin/agencies/${agencyId}/verify`, { verified: "1" });
  const profile = await agency.get(`/helpers/${helperId}`);
  assert.ok(profile.text.includes("+95 123"), "phone shown when helper opted in");
  const res = await agency.post(`/helpers/${helperId}/contact`, { body: "Hello Aye, are you free to talk?" });
  assert.match(res.location, /^\/messages\/\d+$/);
  conversationUrl = res.location;

  const inbox = await helper.get("/messages");
  assert.ok(inbox.text.includes("Acme Agency"));
  assert.ok(inbox.text.includes('class="count">1<'));
  await helper.post(conversationUrl, { body: "Yes, thank you!" });
  const thread = await agency.get(conversationUrl);
  assert.ok(thread.text.includes("Yes, thank you!"));

  const outsider = client();
  await outsider.post("/signup/agency", {
    company_name: "Other", licence_no: "1", uen: "1", phone: "1", name: "Eve", email: "eve@x.test", password: "eve-password", agree: "1"
  });
  assert.equal((await outsider.get(conversationUrl)).status, 404, "non-participants cannot read");
});

test("shortlist toggles", async () => {
  await agency.post(`/helpers/${helperId}/shortlist`);
  assert.ok((await agency.get("/shortlist")).text.includes("Aye"));
  await agency.post(`/helpers/${helperId}/shortlist`);
  assert.ok((await agency.get("/shortlist")).text.includes("No helpers shortlisted"));
});

test("lapsed subscription blocks new agency messages", async () => {
  await admin.post(`/admin/agencies/${agencyId}/grant`, { months: "0" });
  await agency.post(conversationUrl, { body: "Still there?" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE body = 'Still there?'").get().n, 0);
});

test("hidden profiles disappear from search", async () => {
  await admin.post(`/admin/agencies/${agencyId}/grant`, { months: "1" });
  await helper.post("/me/profile/visibility", { visible: "0" });
  assert.equal((await agency.get(`/helpers/${helperId}`)).status, 404);
  await helper.post("/me/profile/visibility", { visible: "1" });
  assert.equal((await agency.get(`/helpers/${helperId}`)).status, 200);
});

test("suspended users are logged out and cannot log in", async () => {
  const c = client();
  await c.post("/signup/agency", {
    company_name: "Bad", licence_no: "1", uen: "1", phone: "1", name: "Mal", email: "mal@x.test", password: "mal-password", agree: "1"
  });
  const id = db.prepare("SELECT id FROM users WHERE email = 'mal@x.test'").get().id;
  await admin.post(`/admin/users/${id}/suspend`);
  assert.equal((await c.get("/helpers")).status, 302);
  const res = await c.post("/login", { email: "mal@x.test", password: "mal-password" });
  assert.equal(res.status, 403);
});

function signedWebhook(event) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  return fetch(`${base}/billing/webhook`, {
    method: "POST", body: payload, headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }
  });
}

test("Stripe webhook: rejects bad signatures and syncs subscriptions", async () => {
  const bad = await fetch(`${base}/billing/webhook`, {
    method: "POST", body: "{}", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" }
  });
  assert.equal(bad.status, 400);

  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const event = {
    id: "evt_1", type: "customer.subscription.updated",
    data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { user_id: String(agencyId) },
      items: { data: [{ current_period_end: periodEnd, price: { id: "price_x" } }] } } }
  };
  assert.equal((await signedWebhook(event)).status, 200);
  let a = db.prepare("SELECT * FROM agencies WHERE user_id = ?").get(agencyId);
  assert.equal(a.sub_status, "active");
  assert.equal(a.period_end, periodEnd * 1000);
  assert.equal(a.stripe_subscription_id, "sub_1");

  const dup = await (await signedWebhook(event)).json();
  assert.equal(dup.duplicate, true);

  event.id = "evt_2";
  event.type = "customer.subscription.deleted";
  event.data.object.status = "canceled";
  await signedWebhook(event);
  a = db.prepare("SELECT * FROM agencies WHERE user_id = ?").get(agencyId);
  assert.equal(a.sub_status, "canceled");
});

test("verifyStripeSignature rejects stale timestamps", () => {
  const t = Math.floor(Date.now() / 1000) - 3600;
  const sig = crypto.createHmac("sha256", "s").update(`${t}.x`).digest("hex");
  assert.equal(verifyStripeSignature("x", `t=${t},v1=${sig}`, "s"), false);
  assert.equal(verifyStripeSignature("x", `t=${t},v1=${sig}`, "s", 300, t * 1000), true);
});

test("login redirect ignores off-site next URLs", async () => {
  const c = client();
  await c.post("/signup/helper", { name: "Z", email: "z@test.local", password: "zzzz-pass", agree: "1" });
  await c.post("/logout");
  const res = await c.post("/login", { email: "z@test.local", password: "zzzz-pass", next: "//evil.example" });
  assert.equal(res.location, "/me");
});
