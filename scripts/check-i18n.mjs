// Comprueba que todas las claves t('...') usadas en el frontend existen en i18n.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const i18n = fs.readFileSync(path.join(root, 'public/js/i18n.js'), 'utf8');
const keys = new Set([...i18n.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((m) => m[1]));

const missing = new Set();
const dynamic = [];
for (const f of ['app.js', 'admin.js', 'i18n.js']) {
  const s = fs.readFileSync(path.join(root, 'public/js', f), 'utf8');
  for (const m of s.matchAll(/\bt\('([^']+)'\)/g)) {
    if (!keys.has(m[1])) missing.add(`${f}: '${m[1]}'`);
  }
  // claves dinámicas: t('prefijo.' + x) → comprobamos el prefijo
  for (const m of s.matchAll(/\bt\('([a-z_]+)\.' \+/g)) dynamic.push(`${f}: prefijo '${m[1]}.'`);
}

if (missing.size) {
  console.log('CLAVES FALTANTES:');
  for (const k of missing) console.log('  - ' + k);
} else console.log('OK: todas las claves t() literales existen.');
console.log('Prefijos dinámicos (revisar manualmente):', dynamic.join(', ') || 'ninguno');
console.log('Total claves en i18n:', keys.size);
