/* Capa de base de datos — BIOSMART QR (SQLite nativo de Node, sin dependencias) */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'storage');
const DB_FILE = process.env.BIOSMART_DB || path.join(DATA_DIR, 'biosmart.db');
const UPLOAD_DIR = process.env.BIOSMART_UPLOADS || path.join(DATA_DIR, 'uploads');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  display_name TEXT,
  lang TEXT NOT NULL DEFAULT 'es' CHECK (lang IN ('es','en','qu','ay')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('flora','fauna')),
  slug TEXT NOT NULL UNIQUE,
  name_es TEXT NOT NULL,
  name_en TEXT, name_qu TEXT, name_ay TEXT,
  alias_es TEXT,
  scientific_name TEXT NOT NULL,
  family TEXT,
  category TEXT,
  pollinator INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'potencial' CHECK (status IN ('referida','potencial','pendiente')),
  fields_json TEXT NOT NULL DEFAULT '[]',
  edu_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL DEFAULT '{}',
  note_json TEXT NOT NULL DEFAULT '{}',
  images_json TEXT NOT NULL DEFAULT '[]',
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_es TEXT NOT NULL, name_en TEXT, name_qu TEXT, name_ay TEXT,
  description_es TEXT,
  map_x REAL NOT NULL DEFAULT 50,
  map_y REAL NOT NULL DEFAULT 50,
  color TEXT NOT NULL DEFAULT '#2d6a4f',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS verification_states (
  code TEXT PRIMARY KEY,
  name_es TEXT NOT NULL, name_en TEXT NOT NULL, name_qu TEXT, name_ay TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  animal_type TEXT NOT NULL CHECK (animal_type IN ('ave','insecto','mamifero','reptil_anfibio','otro','no_identificado')),
  species_id INTEGER REFERENCES species(id) ON DELETE SET NULL,
  species_name TEXT,
  individuals INTEGER NOT NULL CHECK (individuals > 0),
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  zone_other TEXT,
  behavior TEXT NOT NULL CHECK (behavior IN ('alimentandose','volando','descansando','anidando','interactuando','otro','no_identificado')),
  photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  observed_date TEXT NOT NULL,
  observed_time TEXT NOT NULL,
  observer_name TEXT,
  notes TEXT,
  no_harm INTEGER NOT NULL DEFAULT 0,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' REFERENCES verification_states(code),
  client_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sightings_client_key ON sightings(client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sightings_status ON sightings(status);
CREATE INDEX IF NOT EXISTS idx_sightings_date ON sightings(observed_date);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS translations (
  key TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('es','en','qu','ay')),
  value TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key, lang)
);
CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_es TEXT NOT NULL,
  name_en TEXT,
  name_qu TEXT,
  name_ay TEXT,
  description_es TEXT,
  cost INTEGER NOT NULL CHECK (cost > 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id);
`;

db.exec(SCHEMA);

// Helpers ------------------------------------------------------------------
const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

const nowPlus = (days) => {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

function audit(userId, action, entity, entityId, detail) {
  run(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)',
    userId ?? null, action, entity ?? null, entityId != null ? String(entityId) : null,
    detail ? JSON.stringify(detail) : null
  );
}

const newToken = () => crypto.randomBytes(32).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { db, get, all, run, audit, nowPlus, newToken, sha256, DB_FILE, UPLOAD_DIR, DATA_DIR };
