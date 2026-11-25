/* Cruza las rutas usadas por el frontend (app.js, admin.js) con las que
   expone el backend (server/api.js) para detectar llamadas inexistentes.
   Ejecutar: node scripts/check-routes.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const backend = read(path.join(root, 'server', 'api.js')).split('\n');

/* --- rutas estáticas: method === 'X' && url.pathname === '/api/...' --- */
const staticRoutes = new Set();
/* --- rutas dinámicas: const v = m(/^\/api\/...$/)  + if (method === 'X' && v) --- */
const dynByVar = new Map(); // nombre de variable → RegExp
const dynRoutes = [];       // { method, re }

for (const line of backend) {
  const d = line.match(/const\s+(\w+)\s*=\s*m\((\/\^.*\/[a-z]*)\)/);
  if (d) {
    const src = d[2].slice(1, d[2].lastIndexOf('/')); // quita los delimitadores /.../
    try { dynByVar.set(d[1], new RegExp(src)); } catch { /* ignorar */ }
  }

  const s = line.match(/method === '([A-Z]+)' && url\.pathname === '([^']+)'/);
  if (s) staticRoutes.add(`${s[1]} ${s[2]}`);

  const cond = line.match(/method === '([A-Z]+)' && \(([^)]+)\)/);
  if (cond) {
    for (const v of cond[2].split('||').map((x) => x.trim())) {
      const re = dynByVar.get(v);
      if (re) dynRoutes.push({ method: cond[1], re });
    }
  }
  const single = line.match(/method === '([A-Z]+)' && (\w+)\)/) || line.match(/method === '([A-Z]+)' && (\w+)(?!\w*\()/);
  if (single && dynByVar.has(single[2]) && !cond) {
    dynRoutes.push({ method: single[1], re: dynByVar.get(single[2]) });
  }
}

console.log('== Rutas estáticas del backend:', staticRoutes.size);
console.log('== Rutas dinámicas del backend:', dynRoutes.length,
  '→', dynRoutes.map((d) => `${d.method} ${d.re.source}`).join(' | '));

/* --- llamadas del frontend --- */
const calls = [];
for (const f of ['public/js/app.js', 'public/js/admin.js', 'public/js/api.js']) {
  const s = read(path.join(root, f));
  for (const m of s.matchAll(/(?:API|api\(\))\.(get|post|put|patch|del|me|login|register|logout)\(\s*(['"`])([^'"`]+)\2/g)) {
    const method = m[1] === 'del' ? 'DELETE' : m[1].toUpperCase();
    calls.push({ method, route: m[3], file: f });
  }
  for (const m of s.matchAll(/href="(\/api\/[^"]+)"/g)) {
    calls.push({ method: 'GET', route: m[1], file: f });
  }
  // definiciones internas del cliente: apiReq('/api/...', { method: 'X' })
  for (const m of s.matchAll(/apiReq\('([^']+)'(?:,\s*\{\s*method:\s*'([A-Z]+)')?/g)) {
    calls.push({ method: m[2] || 'GET', route: m[1], file: f });
  }
}

const missing = [];
// Genera variantes de una ruta con plantillas/concatenación: '/api/x/' + id,
// '/api/translations/${k}/${l}', etc.
function variants(route) {
  const out = new Set();
  let base = route.split('?')[0];
  if (base.endsWith('/')) base += '1';            // concatenación: '/api/species/' + id
  const tokens = (base.match(/\$\{[^}]+\}/g) || []).length;
  const fills = ['1', 'es'];                       // ids numéricos / lang válido
  const combos = tokens <= 1 ? fills : fills.flatMap((a) => fills.map((b) => [a, b]));
  for (const c of combos) {
    let i = 0;
    out.add(base.replace(/\$\{[^}]+\}/g, () => (Array.isArray(c) ? c[i++] : c)));
  }
  return [...out];
}

console.log('\n== Llamadas del frontend:', calls.length);
for (const c of calls) {
  const cands = variants(c.route);
  let ok = cands.some((p) => staticRoutes.has(`${c.method} ${p}`));
  if (!ok) ok = cands.some((p) => dynRoutes.some((d) => d.method === c.method && d.re.test(p)));
  console.log(`   ${ok ? 'ok  ' : 'FALTA'} ${c.method} ${c.route}  (${c.file})`);
  if (!ok) missing.push(`${c.method} ${c.route} (${c.file})`);
}

console.log(`\nRESULTADO: ${missing.length === 0 ? 'todas las rutas del frontend existen en el backend' : missing.length + ' rutas sin implementar:'}`);
for (const x of missing) console.log('   - ' + x);
process.exit(missing.length ? 1 : 0);
