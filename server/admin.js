/* Acceso de administración por contraseña — BIOSMART QR.
   La contraseña NO se guarda en el código: se guarda su hash scrypt en
   storage/admin.json (ruta configurable con BIOSMART_ADMIN_JSON).
   Si el archivo no existe, se crea con BIOSMART_ADMIN_PASSWORD. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword: checkPassword } = require('./auth');
const { get, run } = require('./db');

const ADMIN_EMAIL = 'admin@biosmart.local';
const SECRET_FILE = process.env.BIOSMART_ADMIN_JSON
  || path.join(__dirname, '..', 'storage', 'admin.json');

function loadSecret() {
  if (fs.existsSync(SECRET_FILE)) {
    const data = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
    if (data && typeof data.hash === 'string' && /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/.test(data.hash)) {
      return data;
    }
    throw new Error('storage/admin.json no contiene un hash válido.');
  }
  const password = process.env.BIOSMART_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Falta la contraseña del administrador: define BIOSMART_ADMIN_PASSWORD una vez para crear storage/admin.json.');
  }
  const data = {
    email: ADMIN_EMAIL,
    hash: hashPassword(password),
    created_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  console.log('[admin] Contraseña inicial guardada como hash scrypt en ' + path.relative(path.join(__dirname, '..'), SECRET_FILE));
  return data;
}

const secret = loadSecret();

/* Crea la cuenta administradora si la base aún no tiene ninguna cuenta. */
function ensureAdmin() {
  let u = get('SELECT id, email, role FROM users WHERE email = ?', secret.email);
  if (u) return u;
  const info = run(
    'INSERT INTO users (email, password_hash, role, display_name) VALUES (?,?,?,?)',
    secret.email, secret.hash, 'admin', 'Administrador'
  );
  u = { id: Number(info.lastInsertRowid), email: secret.email, role: 'admin' };
  console.log('[admin] Cuenta de administración creada (acceso solo por contraseña).');
  return u;
}

/* Comprueba la contraseña del panel. Se verifica contra la base (no contra el
   archivo) para que el cambio de contraseña desde el panel tenga efecto. */
function unlockAdmin(password) {
  const u = get('SELECT * FROM users WHERE email = ? AND active = 1', secret.email);
  if (!u || u.role !== 'admin') return null;
  if (typeof password !== 'string' || password.length > 200) return null;
  if (!checkPassword(password, u.password_hash)) return null;
  return u;
}

module.exports = { ADMIN_EMAIL, SECRET_FILE, ensureAdmin, unlockAdmin };
