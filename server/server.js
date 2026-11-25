/* Servidor HTTP — BIOSMART QR.
   Sirve la aplicación (public/) y la API (/api/*). Sin dependencias externas. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { handleApi } = require('./api');
const { currentUser } = require('./auth');
const { seed } = require('./seed');
const { DB_FILE } = require('./db');
const { ensureAdmin } = require('./admin');

const PORT = Number(process.env.PORT) || 8090;
// Todas las interfaces (IPv4 + IPv6): permite abrir el sitio desde esta PC
// (127.0.0.1 y ::1) y desde otros equipos de la red local. No sale a Internet.
// Usa HOST=127.0.0.1 para restringirlo solo a esta máquina.
const HOST = process.env.HOST || '::';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 12 * 1024 * 1024; // JSON con foto en base64

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=()',
};

function readJsonBody(req) {
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

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, SECURITY_HEADERS); res.end('Prohibido'); return;
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback: cualquier ruta no encontrada sirve la app
      const idx = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(idx, (e2, data) => {
        if (e2) { res.writeHead(404, SECURITY_HEADERS); res.end('No encontrado'); return; }
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const isImg = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico'].includes(ext);
    const isLib = full.includes(`${path.sep}lib${path.sep}`) || full.includes(`${path.sep}img${path.sep}`);
    fs.readFile(full, (e2, data) => {
      if (e2) { res.writeHead(500, SECURITY_HEADERS); res.end('Error'); return; }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': isImg ? 'public, max-age=86400' : isLib ? 'public, max-age=3600' : 'no-cache',
      });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { res.writeHead(400, SECURITY_HEADERS); res.end('Bad request'); return; }

  // Cabeceras de seguridad en TODA la respuesta (estáticos y API)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  try {
    if (url.pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJsonBody(req) : {};
      const user = currentUser(req);
      const handled = await handleApi(req, res, url, body, user);
      if (handled === false) {
        const msg = JSON.stringify({ error: 'not_found', message: 'Recurso no encontrado' });
        res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(msg);
      }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, SECURITY_HEADERS); res.end('Método no permitido'); return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[ERROR]', req.method, url.pathname, err);
    if (!res.headersSent) {
      const msg = JSON.stringify({ error: status >= 500 ? 'server_error' : 'bad_request', message: status >= 500 ? 'Error interno del servidor' : 'Solicitud inválida' });
      res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(msg);
    } else res.end();
  }
});

seed();
ensureAdmin();
server.listen(PORT, HOST, () => {
  console.log(`BIOSMART QR escuchando en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
  console.log('Panel administrativo: acceso por contraseña (botón ⚙).');
});

module.exports = { server };
