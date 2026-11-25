'use strict';
/* Base de datos — Biodiversidad (colección personal y clasificación).
   SQLite integrado en Node (node:sqlite). Sin dependencias externas.

   Sin cuentas ni contraseñas: cada navegador genera una clave de cliente
   (client_key) y un nombre visible; la colección y la clasificación se
   identifican por ese nombre. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'storage');
const DB_FILE = process.env.BIOCOL_DB || path.join(DATA_DIR, 'biocol.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

function openFresh() {
  return new DatabaseSync(DB_FILE);
}

let db = openFresh();

// Migración desde el esquema con cuentas (users sin client_key): se hace
// respaldo del archivo y se empieza una base nueva. Los registros de
// animales previos se conservan reasignándolos a una clave legada.
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (userCols.length && !userCols.includes('client_key')) {
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* seguir igualmente */ }
  const bak = `${DB_FILE}.bak-${Date.now()}`;
  db.close();
  fs.copyFileSync(DB_FILE, bak);
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(DB_FILE + suffix); } catch { /* puede no existir */ }
  }
  db = openFresh();
  const legacy = new DatabaseSync(bak, { readOnly: true });
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  const oldUsers = legacy.prepare('SELECT id, name FROM users').all();
  const insUser = db.prepare('INSERT INTO users (id, name, client_key) VALUES (?,?,?)');
  for (const u of oldUsers) insUser.run(u.id, u.name, `legacy-${u.id}`);
  const animalsExist = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='animals'").get();
  if (animalsExist) {
    db.exec(`
      CREATE TABLE animals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        animal_name TEXT NOT NULL,
        species TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX idx_animals_user ON animals(user_id);
    `);
    // Se copia fila a fila (node:sqlite sin INSERT ... SELECT)
    const rows = legacy.prepare('SELECT id, user_id, animal_name, species, created_at FROM animals').all();
    const insA = db.prepare('INSERT INTO animals (id, user_id, animal_name, species, created_at) VALUES (?,?,?,?,?)');
    for (const r of rows) insA.run(r.id, r.user_id, r.animal_name, r.species, r.created_at);
  }
  legacy.close();
  console.log(`[db] Base anterior respaldada en ${path.basename(bak)} y migrada al esquema sin cuentas.`);
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS animals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    animal_name TEXT NOT NULL,
    species TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_animals_user ON animals(user_id);
`);

// La tabla sessions ya no se usa (sin cuentas ni contraseñas)
try { db.exec('DROP TABLE IF EXISTS sessions'); } catch { /* tabla inexistente */ }

const get = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

module.exports = { db, DB_FILE, get, all, run };
