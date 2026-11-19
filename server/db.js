'use strict';
/* SQLite storage via Node's built-in node:sqlite (Node >= 22.13). */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

fs.mkdirSync(path.dirname(cfg.DB_FILE), { recursive: true });
fs.mkdirSync(cfg.UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(cfg.DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'fan' CHECK (role IN ('fan','creator','agent','admin')),
  banned      INTEGER NOT NULL DEFAULT 0,
  econ        TEXT NOT NULL,
  avatar_upload_id INTEGER,
  family_id   INTEGER,
  agent_id    INTEGER,                      -- for creators: the agent who recruited them
  ref_code    TEXT UNIQUE,
  referred_by INTEGER,
  demo        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creators (
  id          TEXT PRIMARY KEY,             -- slug
  user_id     INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  ticker      TEXT NOT NULL UNIQUE,
  niche       TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  bio         TEXT NOT NULL DEFAULT '',
  sites       TEXT NOT NULL DEFAULT '["X3"]',
  hues        TEXT NOT NULL DEFAULT '["#ff2d87","#7a2cff"]',
  vhue        INTEGER NOT NULL DEFAULT 0,
  price       REAL NOT NULL DEFAULT 0.02,
  status      TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','suspended')),
  kyc         TEXT NOT NULL DEFAULT 'pending' CHECK (kyc IN ('pending','verified','rejected')),
  live        INTEGER NOT NULL DEFAULT 0,
  featured    INTEGER NOT NULL DEFAULT 0,
  base_viewers INTEGER NOT NULL DEFAULT 300,
  beans       INTEGER NOT NULL DEFAULT 0,
  beans_total INTEGER NOT NULL DEFAULT 0,
  avatar_upload_id INTEGER,
  cover_upload_id  INTEGER,
  tip_menu    TEXT NOT NULL DEFAULT '[]',
  goal        TEXT NOT NULL DEFAULT '{}',
  schedule    TEXT NOT NULL DEFAULT '[]',
  pinned_product_id INTEGER,
  back_at     TEXT NOT NULL DEFAULT '',
  handles     TEXT NOT NULL DEFAULT '{}',
  demo        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id  TEXT REFERENCES creators(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('avatar','cover','gallery','product','fan_avatar','story')),
  mime        TEXT NOT NULL,
  file        TEXT NOT NULL UNIQUE,
  size        INTEGER NOT NULL,
  caption     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by INTEGER,
  reject_reason TEXT,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id  TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('Toy','Lingerie','Merch','Custom')),
  price       REAL NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  partner     TEXT NOT NULL DEFAULT '',
  upload_id   INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user   INTEGER NOT NULL REFERENCES users(id),
  creator_id  TEXT NOT NULL REFERENCES creators(id),
  gift_id     TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  diamonds    INTEGER NOT NULL,
  beans       INTEGER NOT NULL,
  bonus_beans INTEGER NOT NULL DEFAULT 0,
  family_id   INTEGER,
  family_points INTEGER NOT NULL DEFAULT 0,
  pk_id       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gifts_creator_ts ON gifts(creator_id, created_at);
CREATE INDEX IF NOT EXISTS gifts_user_ts ON gifts(from_user, created_at);
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  pack_id     TEXT NOT NULL,
  usd         REAL NOT NULL,
  diamonds    INTEGER NOT NULL DEFAULT 0,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  ext_ref     TEXT,
  test        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  paid_at     INTEGER
);
CREATE TABLE IF NOT EXISTS econ_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  diamonds    INTEGER NOT NULL DEFAULT 0,       -- signed delta
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS econ_log_user ON econ_log(user_id, created_at);
CREATE TABLE IF NOT EXISTS payouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id  TEXT REFERENCES creators(id),
  agent_id    INTEGER REFERENCES users(id),
  beans       INTEGER NOT NULL,
  usd         REAL NOT NULL,
  method      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  INTEGER
);
CREATE TABLE IF NOT EXISTS agent_earnings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER NOT NULL REFERENCES users(id),
  creator_id  TEXT NOT NULL,
  beans       INTEGER NOT NULL,
  gift_row    INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS families (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tag         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  motto       TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  xp          INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL DEFAULT 'creator' CHECK (kind IN ('creator','agent')),
  email       TEXT NOT NULL,
  data        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  user_id     INTEGER,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  INTEGER
);
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('creator','user','upload','message')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  INTEGER NOT NULL,
  decided_by  INTEGER
);
CREATE TABLE IF NOT EXISTS audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site        TEXT NOT NULL,
  creator_id  TEXT NOT NULL,
  placement   TEXT NOT NULL DEFAULT '',
  campaign    TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',
  user_id     INTEGER,
  ip_hash     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS clicks_ts ON clicks(created_at);
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
`);

/* lightweight migrations for databases created by earlier versions */
for (const [t, c, d] of [['creators', 'handles', "TEXT NOT NULL DEFAULT '{}'"], ['clicks', 'placement', "TEXT NOT NULL DEFAULT ''"]]) { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); } catch {} }

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

let depth = 0;
/** Run fn inside a transaction (nested calls join the outer one). */
function tx(fn) {
  if (depth > 0) return fn();
  depth++; db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  finally { depth--; }
}

const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

function audit(actorId, action, target, data) {
  run('INSERT INTO audit (actor_id, action, target, data, created_at) VALUES (?,?,?,?,?)', actorId ?? null, action, String(target ?? ''), JSON.stringify(data || {}), Date.now());
}

module.exports = { db, all, get, run, tx, J, audit };
