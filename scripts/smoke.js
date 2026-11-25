/* Smoke test HTTP: verifica que todos los assets referenciados en index.html
   respondan 200 y que la API pública responda tras la limpieza de la base.
   Ejecutar con el servidor en :8090 →  node scripts/smoke.js */
'use strict';
const BASE = process.env.BASE || 'http://localhost:8090';

(async () => {
  let bad = 0;
  const check = async (p, expect = 200) => {
    try {
      const r = await fetch(BASE + p);
      const okStatus = r.status === expect;
      const len = Number(r.headers.get('content-length') || (await r.clone().arrayBuffer()).byteLength || 0);
      console.log(`  ${okStatus ? 'ok  ' : 'FAIL'} ${r.status} ${p}${len ? ` (${len} B)` : ''}`);
      if (!okStatus) bad += 1;
      return r;
    } catch (e) { console.log(`  FAIL err ${p} — ${e.message}`); bad += 1; return null; }
  };

  console.log('== Assets de la app');
  const idx = await (await fetch(BASE + '/')).text();
  const refs = [...idx.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
  for (const p of [...new Set(refs)]) await check(p);

  console.log('== Assets JS internos (importados por app.js)');
  for (const p of ['/js/i18n.js', '/js/api.js', '/js/charts.js', '/js/app.js', '/js/admin.js',
    '/css/styles.css', '/img/molle.jpg', '/img/hero.jpg',
    '/img/credits.json']) await check(p);

  console.log('== API pública (sin sesión)');
  for (const p of ['/api/health', '/api/auth/status', '/api/species?kind=flora', '/api/stats', '/api/zones', '/api/sightings']) await check(p);
  const st = await (await fetch(BASE + '/api/auth/status')).json();
  console.log(`  setup=${st.setup} registered=${st.registered}`);

  console.log('== API protegida (debe ser 401 sin sesión)');
  for (const p of ['/api/admin/users', '/api/export/sightings.csv', '/api/admin/audit']) await check(p, 401);

  console.log('== Seguridad');
  const trav = await fetch(BASE + '/..%2f..%2fserver%2fdb.js');
  console.log(`  ${trav.status !== 200 ? 'ok  ' : 'FAIL'} traversal bloqueado (${trav.status})`);
  if (trav.status === 200) bad += 1;

  console.log(`\nRESULTADO: ${bad === 0 ? 'TODO OK' : bad + ' fallos'}`);
  process.exit(bad ? 1 : 0);
})();
