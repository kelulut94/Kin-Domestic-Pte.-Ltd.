const { SKILLS, NATIONALITIES, HELPER_TYPES, MARITAL_STATUSES } = require("./constants");

const ACTIVE_STATUSES = ["active", "trialing", "manual"];

function subscriptionActive(agency, now = Date.now()) {
  return Boolean(agency && ACTIVE_STATUSES.includes(agency.sub_status) && agency.period_end > now);
}

// Agencies must be verified by an admin AND subscribed before they can see contact
// details or message helpers.
function canContact(agency) {
  return Boolean(agency && agency.verified && subscriptionActive(agency));
}

function getAgency(db, userId) {
  return db.prepare("SELECT * FROM agencies WHERE user_id = ?").get(userId) || null;
}

function getProfile(db, userId) {
  return db.prepare(`
    SELECT p.*, u.email, u.name AS account_name, u.suspended
    FROM helper_profiles p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?`).get(userId) || null;
}

function unreadCount(db, userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.helper_id = ? OR c.agency_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`)
    .get(userId, userId, userId).n;
}

// ---- input cleaning ----

function str(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function int(value, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function list(value) {
  return [].concat(value ?? []).map(String);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanProfileInput(body) {
  const skills = list(body.skills).filter((s) => SKILLS[s]);
  const date = str(body.available_from, 10);
  return {
    first_name: str(body.first_name, 60),
    age: int(body.age, 18, 65),
    nationality: NATIONALITIES.includes(body.nationality) ? body.nationality : null,
    helper_type: HELPER_TYPES[body.helper_type] ? body.helper_type : null,
    location: str(body.location, 80),
    skills: JSON.stringify([...new Set(skills)]),
    languages: str(body.languages, 200),
    education: str(body.education, 100),
    religion: str(body.religion, 60),
    marital_status: MARITAL_STATUSES.includes(body.marital_status) ? body.marital_status : null,
    children: int(body.children, 0, 20),
    height_cm: int(body.height_cm, 100, 220),
    weight_kg: int(body.weight_kg, 30, 200),
    years_experience: int(body.years_experience, 0, 50),
    experience: str(body.experience, 3000),
    expected_salary: int(body.expected_salary, 0, 100000),
    available_from: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    rest_days: str(body.rest_days, 60),
    about: str(body.about, 2000),
    phone: str(body.phone, 30),
    share_phone: body.share_phone ? 1 : 0
  };
}

// Returns the list of things still missing before a profile can be submitted.
function missingForSubmit(profile) {
  const missing = [];
  if (!profile.first_name) missing.push("first name");
  if (!profile.age) missing.push("age");
  if (!profile.nationality) missing.push("nationality");
  if (!profile.helper_type) missing.push("helper type");
  if (!profile.photo) missing.push("photo");
  if (parseSkillsSafe(profile.skills).length === 0) missing.push("at least one skill");
  if (!profile.languages) missing.push("languages");
  if (!profile.about) missing.push("a short introduction");
  return missing;
}

module.exports = {
  subscriptionActive, canContact, getAgency, getProfile, unreadCount,
  str, int, list, EMAIL_RE, cleanProfileInput, missingForSubmit
};

function parseSkillsSafe(json) {
  try {
    const value = JSON.parse(json || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

module.exports.parseSkillsSafe = parseSkillsSafe;
