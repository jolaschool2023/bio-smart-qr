/* Vercel — BIOSMART QR.
   Los archivos de public/ los sirve Vercel directamente; esta función atiende
   solo /api/* reutilizando el mismo handleApi que el servidor local. */
'use strict';
const { URL } = require('node:url');
const { handleApi } = require('../server/api');
const { currentUser } = require('../server/auth');
const { seed } = require('../server/seed');

const MAX_BODY = 12 * 1024 * 1024;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=()',
};

let ready = false;
function init() {
  if (ready) return;
  seed();
  try {
    require('../server/admin').ensureAdmin();
  } catch (err) {
    // Sin BIOSMART_ADMIN_PASSWORD en Vercel el público sigue funcionando;
    // solo queda desactivado el acceso al panel.
    console.error('[admin] no configurado:', err.message);
  }
  ready = true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('body_too_large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch { reject(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  if (res.headersSent) return res.end();
  const body = JSON.stringify(obj);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

module.exports = async function handler(req, res) {
  init();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const original = new URL(req.url || '/api/', 'http://localhost');
    let pathname = original.pathname;
    if (!pathname.startsWith('/api/')) {
      pathname = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
    }
    const url = new URL(pathname + original.search, 'http://localhost');
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const user = currentUser(req);
    const handled = await handleApi(req, res, url, body, user);
    if (handled === false) json(res, 404, { error: 'not_found', message: 'Recurso no encontrado' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[ERROR]', req.method, req.url, err);
    json(res, status, {
      error: status >= 500 ? 'server_error' : 'bad_request',
      message: status >= 500 ? 'Error interno del servidor' : 'Solicitud inválida',
    });
  }
};
