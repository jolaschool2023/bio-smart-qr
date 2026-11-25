/* Elimina SOLO los datos de prueba generados por la suite de tests:
   - usuarios de prueba (correo terminado en @test.bo, salvo admin@test.bo)
   - sus avistamientos, sesiones y entradas de auditoría
   - traducciones de prueba (clave test.key)
   Conserva: admin@test.bo, especies sembradas, zonas y avistamientos reales.
   Ejecutar con el servidor DETENIDO:  node scripts/clean-test-data.mjs */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const dbFile = process.env.BIOSMART_DB || path.join(root, 'storage', 'biosmart.db');

if (!fs.existsSync(dbFile)) { console.log('No existe la base:', dbFile); process.exit(0); }

const db = new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys = ON');

const before = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  sightings: db.prepare('SELECT COUNT(*) c FROM sightings').get().c,
  translations: db.prepare('SELECT COUNT(*) c FROM translations').get().c,
};

const tx = db.exec.bind(db);
tx('BEGIN');
try {
  // usuarios de prueba (no admin@test.bo)
  const testUsers = db.prepare(
    "SELECT id FROM users WHERE lower(email) LIKE '%@test.bo' AND lower(email) <> 'admin@test.bo'"
  ).all();

  for (const u of testUsers) {
    db.prepare('DELETE FROM sightings WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM photos WHERE uploaded_by = ?').run(u.id);
    db.prepare("DELETE FROM species WHERE created_by = ? AND slug LIKE '%prueba%'").run(u.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  }

  // avistamientos de prueba huérfanos o marcados como tales
  db.prepare("DELETE FROM sightings WHERE observer_name = 'Prueba Autónoma'").run();
  db.prepare("DELETE FROM sightings WHERE user_id IS NULL AND notes LIKE '%prueba automatizado%'").run();
  // las pruebas usan claves de cliente con el prefijo "client-<run>"
  db.prepare("DELETE FROM sightings WHERE client_key LIKE 'client-%'").run();

  // traducciones de prueba
  db.prepare("DELETE FROM translations WHERE key LIKE 'test.%'").run();

  // fotos subidas por las pruebas (huérfanas) + sus archivos en disco
  db.prepare('DELETE FROM photos WHERE id NOT IN (SELECT photo_id FROM sightings WHERE photo_id IS NOT NULL)').run();
  const upDir = path.join(root, 'storage', 'uploads');
  if (fs.existsSync(upDir)) {
    const keep = new Set(db.prepare('SELECT filename FROM photos').all().map((r) => r.filename));
    for (const f of fs.readdirSync(upDir)) {
      if (!keep.has(f)) fs.unlinkSync(path.join(upDir, f));
    }
  }

  // especies de prueba creadas por la suite
  db.prepare("DELETE FROM species WHERE slug LIKE '%prueba%' OR scientific_name LIKE 'Testus%'").run();

  // auditoría de las acciones de prueba (referencias ya inexistentes)
  db.prepare("DELETE FROM audit_log WHERE entity = 'sighting' AND entity_id NOT IN (SELECT public_id FROM sightings)").run();
  db.prepare("DELETE FROM audit_log WHERE entity = 'user' AND entity_id NOT IN (SELECT id FROM users)").run();
  db.prepare("DELETE FROM audit_log WHERE entity = 'species' AND entity_id NOT IN (SELECT id FROM species)").run();
  db.prepare("DELETE FROM audit_log WHERE entity = 'translation' AND detail LIKE '%test.%'").run();
  db.prepare("DELETE FROM audit_log WHERE detail LIKE '%prueba%'").run();

  // sesiones abiertas por las pruebas
  db.prepare('DELETE FROM sessions').run();

  tx('COMMIT');
} catch (e) {
  tx('ROLLBACK');
  console.error('Error, se revierte:', e.message);
  process.exit(1);
}

const after = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  sightings: db.prepare('SELECT COUNT(*) c FROM sightings').get().c,
  translations: db.prepare('SELECT COUNT(*) c FROM translations').get().c,
};

console.log('Usuarios:  ', before.users, '→', after.users);
console.log('Avistamientos:', before.sightings, '→', after.sightings);
console.log('Traducciones:', before.translations, '→', after.translations);
console.log('Usuarios restantes:');
for (const r of db.prepare('SELECT id, email, role FROM users').all()) {
  console.log(`  ${r.id} ${r.email} (${r.role})`);
}
console.log('Avistamientos restantes:');
for (const r of db.prepare('SELECT public_id, status, observer_name FROM sightings').all()) {
  console.log(`  ${r.public_id} ${r.status} ${r.observer_name || ''}`);
}
db.close();
console.log('Limpieza completada.');
