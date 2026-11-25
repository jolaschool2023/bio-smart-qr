'use strict';
/* API — colección personal (por nombre visible + clave de cliente) y clasificación.
   Sin cuentas ni contraseñas: el navegador guarda una clave (client_key) y un
   nombre visible. La colección sigue siendo "de quien la registra". */
const { get, all, run } = require('./db');

const MAX_LEN = 120;
const KEY_MIN = 8, KEY_MAX = 80;
const NAME_MIN = 2;

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function fail(res, status, error, message) { return json(res, status, { error, message }); }

const cleanKey = (v) => String(v || '').trim().slice(0, KEY_MAX);
const isKey = (k) => k.length >= KEY_MIN;
const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LEN);

function findUserByKey(key) {
  return get('SELECT id, name FROM users WHERE client_key = ?', key) || null;
}
function findOrCreateUser(key, name) {
  const existing = findUserByKey(key);
  const display = name || (existing && existing.name) || 'Anónimo';
  if (existing) {
    if (name && name !== existing.name) {
      run('UPDATE users SET name = ? WHERE id = ?', name, existing.id);
      return { id: existing.id, name };
    }
    return existing;
  }
  const info = run('INSERT INTO users (name, client_key) VALUES (?,?)', display, key);
  return { id: Number(info.lastInsertRowid), name: display };
}
const recordOut = (r) => ({
  id: Number(r.id), animalName: r.animal_name, species: r.species, createdAt: r.created_at,
});

/* ---------- enrutador ---------- */
async function handleApi(req, res, url, body) {
  const method = req.method;

  // Perfil (nombre visible): crear o actualizar; sin contraseña
  if (method === 'POST' && url.pathname === '/api/profile') {
    const key = cleanKey(body.key);
    const name = cleanName(body.name);
    if (!isKey(key)) return fail(res, 400, 'key', 'Falta la clave del navegador.');
    if (name.length < NAME_MIN) return fail(res, 400, 'name', 'Escribe tu nombre (mínimo 2 caracteres).');
    const user = findOrCreateUser(key, name);
    return json(res, 200, { user: { name: user.name } });
  }

  // Colección personal (del titular de la clave)
  if (method === 'GET' && url.pathname === '/api/collection') {
    const key = cleanKey(url.searchParams.get('key'));
    if (!isKey(key)) return fail(res, 400, 'key', 'Falta la clave del navegador.');
    const user = findUserByKey(key);
    if (!user) return json(res, 200, { name: null, count: 0, records: [] });
    const rows = all(
      'SELECT id, animal_name, species, created_at FROM animals WHERE user_id = ? ORDER BY id DESC',
      user.id
    );
    return json(res, 200, { name: user.name, count: rows.length, records: rows.map(recordOut) });
  }

  if (method === 'POST' && url.pathname === '/api/collection') {
    const key = cleanKey(body.key);
    const name = cleanName(body.name);
    const animalName = cleanName(body.animalName);
    const species = cleanName(body.species);
    if (!isKey(key)) return fail(res, 400, 'key', 'Falta la clave del navegador.');
    if (name && name.length < NAME_MIN) return fail(res, 400, 'name', 'El nombre es demasiado corto.');
    if (body.observed !== true) {
      return fail(res, 400, 'observed', 'Confirma que observaste personalmente este animal.');
    }
    if (!animalName) return fail(res, 400, 'animalName', 'Escribe el nombre del animal (máximo 120 caracteres).');
    if (!species) return fail(res, 400, 'species', 'Escribe la especie (máximo 120 caracteres).');
    const user = findOrCreateUser(key, name || null);
    const info = run('INSERT INTO animals (user_id, animal_name, species) VALUES (?,?,?)', user.id, animalName, species);
    const row = get('SELECT id, animal_name, species, created_at FROM animals WHERE id = ?', Number(info.lastInsertRowid));
    return json(res, 201, { user: { name: user.name }, record: recordOut(row) });
  }

  // Clasificación general: de mayor a menor cantidad de registros
  if (method === 'GET' && url.pathname === '/api/leaderboard') {
    const key = cleanKey(url.searchParams.get('key'));
    const meId = isKey(key) ? (findUserByKey(key) || {}).id : null;
    const rows = all(
      `SELECT u.id AS id, u.name AS name, COUNT(a.id) AS cnt
         FROM users u LEFT JOIN animals a ON a.user_id = u.id
        GROUP BY u.id
        ORDER BY cnt DESC, u.name ASC`
    );
    const ranking = rows.map((r, i) => ({
      position: i + 1, name: r.name, count: Number(r.cnt), isMe: meId != null && Number(r.id) === meId,
    }));
    return json(res, 200, {
      ranking,
      totalUsers: ranking.length,
      totalRecords: ranking.reduce((a, r) => a + r.count, 0),
    });
  }

  return fail(res, 404, 'not_found', 'Ruta no encontrada.');
}

module.exports = { handleApi };
