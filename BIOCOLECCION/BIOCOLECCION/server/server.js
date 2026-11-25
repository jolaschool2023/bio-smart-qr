'use strict';
/* Servidor HTTP — Biodiversidad.
   Sirve el frontend (public/) y la API (/api/*). Sin dependencias externas. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { handleApi } = require('./api');
const { DB_FILE } = require('./db');

const PORT = Number(process.env.PORT) || 8091;
// Todas las interfaces (IPv4 + IPv6): se puede abrir en esta PC y en la red local.
const HOST = process.env.HOST || '::';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 32 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

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
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveStatic(pathname, res) {
  let rel = pathname;
  try { rel = decodeURIComponent(pathname); } catch { /* carácter inválido */ }
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('403');
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    // Rutas sin extensión → la aplicación (SPA)
    if (!path.extname(rel)) file = path.join(PUBLIC_DIR, 'index.html');
    else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
  }
  const data = fs.readFileSync(file);
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': data.length,
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  // Cabeceras de seguridad en TODA la respuesta
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
          body = await readBody(req);
        } catch (e) {
          return sendJson(res, e.message === 'too_large' ? 413 : 400,
            { error: 'bad_body', message: 'Cuerpo inválido.' });
        }
      }
      return await handleApi(req, res, url, body); // siempre responde
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('405');
    }
    serveStatic(url.pathname, res);
  } catch (e) {
    console.error('[error]', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server', message: 'Error interno del servidor.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Biodiversidad escuchando en http://localhost:${PORT}`);
  console.log('Base de datos:', DB_FILE);
  console.log('Sin cuentas: cada navegador se identifica con un nombre visible.');
});
server.on('error', (e) => {
  console.error('No se pudo iniciar el servidor:', e.message);
  process.exit(1);
});
