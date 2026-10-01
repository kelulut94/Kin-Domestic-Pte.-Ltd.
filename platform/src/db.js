const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('helper', 'agency', 'admin')),
  name TEXT NOT NULL,
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helper_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'hidden')),
  review_note TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  nationality TEXT,
  helper_type TEXT,
  location TEXT,
  photo TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  languages TEXT,
  education TEXT,
  religion TEXT,
  marital_status TEXT,
  children INTEGER,
  height_cm INTEGER,
  weight_kg INTEGER,
  years_experience INTEGER,
  experience TEXT,
  expected_salary INTEGER,
  available_from TEXT,
  rest_days TEXT,
  about TEXT,
  phone TEXT,
  share_phone INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  approved_at INTEGER
);

CREATE TABLE IF NOT EXISTS agencies (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  licence_no TEXT,
  uen TEXT,
  phone TEXT,
  website TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  plan TEXT,
  sub_status TEXT NOT NULL DEFAULT 'none',
  period_end INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS shortlists (
  agency_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (agency_id, helper_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  UNIQUE (agency_id, helper_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE TABLE IF NOT EXISTS profile_views (
  agency_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helper_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (agency_id, helper_id)
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_helper_status ON helper_profiles(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agency_stripe ON agencies(stripe_subscription_id);
`;

function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { openDb, transaction };
