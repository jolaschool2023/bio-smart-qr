/* Vercel — BIOCOLECCION.
   Los archivos de public/ los sirve Vercel directamente; esta función atiende
   solo /api/* reutilizando el mismo handleApi que el servidor local. */
'use strict';
const { URL } = require('node:url');
const { handleApi } = require('../server/api');

const MAX_BODY = 32 * 1024;
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'same-origin',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const original = new URL(req.url || '/api/', 'http://localhost');
    let pathname = original.pathname;
    if (!pathname.startsWith('/api/')) {
      pathname = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
    }
    const url = new URL(pathname + original.search, 'http://localhost');
    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try { body = await readBody(req); }
      catch (e) {
        return sendJson(res, e.message === 'too_large' ? 413 : 400,
          { error: 'bad_body', message: 'Cuerpo inválido.' });
      }
    }
    return await handleApi(req, res, url, body);
  } catch (err) {
    console.error('[error]', err);
    sendJson(res, 500, { error: 'server', message: 'Error interno del servidor.' });
  }
};
