/* Autenticación — BIOSMART QR: hash de contraseñas (scrypt), sesiones y cookies.
   Las contraseñas NUNCA se guardan ni se transmiten en texto plano. */
'use strict';
const crypto = require('node:crypto');
const { get, run, nowPlus, newToken, sha256 } = require('./db');

const SCRYPT_N = 16384;
const SESSION_DAYS = 14;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = stored.split('$');
    const candidate = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N });
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function createSession(res, userId) {
  const token = newToken();
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha256(token), userId, nowPlus(SESSION_DAYS));
  setSessionCookie(res, token);
  return token;
}

function setSessionCookie(res, token) {
  const secure = ''; // en HTTPS se añade '; Secure'
  res.setHeader('Set-Cookie', `bsid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

function destroySession(req, res) {
  const token = parseCookies(req).bsid;
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', 'bsid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).bsid;
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.email, u.role, u.display_name, u.lang, u.active, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`, sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at + 'Z') < new Date()) {
    run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
    return null;
  }
  if (!row.active) return null;
  const { expires_at, ...user } = row;
  return user;
}

const PASSWORD_MIN = 8;
function validatePassword(pw) {
  return typeof pw === 'string' && pw.length >= PASSWORD_MIN && pw.length <= 200;
}
const validateEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.length <= 254;

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession,
  currentUser, parseCookies, validatePassword, validateEmail, PASSWORD_MIN,
};
