/* Pruebas de integración — BIOSMART QR
   Cubre: salud, apertura del panel solo con contraseña, alta pública cerrada,
   roles, sesión, especies, zonas, avistamiento con foto, idempotencia
   (sin duplicados), estadísticas, CSV, traducciones, autorización y
   contraseñas nunca en texto plano.
   IMPORTANTE: escribe datos (un avistamiento). Ejecutarla contra un servidor
   AISLADO, no contra la base real:
     PowerShell:
       $env:BIOSMART_DB="storage/test-api.db"; $env:BIOSMART_ADMIN_JSON="storage/test-api-admin.json"
       $env:BIOSMART_ADMIN_PASSWORD="secreto12345"; $env:PORT="8198"; $env:RL_DISABLED="1"; node server/server.js
       $env:BASE="http://localhost:8198"; $env:BIOSMART_DB="storage/test-api.db"
       $env:BIOSMART_ADMIN_PASSWORD="secreto12345"; node tests/api.test.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'http://localhost:8090';
const RUN = Date.now().toString(36);
const USER_EMAIL = `user.${RUN}@test.bo`;
const PW = process.env.BIOSMART_ADMIN_PASSWORD || 'secreto12345';

let passed = 0;
let failed = 0;
const fails = [];

function ok(cond, name, extra = '') {
  if (cond) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const section = (s) => console.log(`\n== ${s}`);

/* cliente con cookies */
function makeClient() {
  let cookie = '';
  return async function req(method, urlPath, body, opts = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(BASE + urlPath, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    const sc = res.headers.get('set-cookie');
    if (sc && !opts.noCookie) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* CSV u otro */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

/* JPEG mínimo válido para las pruebas (firma FF D8 FF + cuerpo) */
function fakeJpeg() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 0x42), Buffer.from([0xff, 0xd9])]);
}

(async function main() {
  console.log('BASE:', BASE);

  section('1. Salud y estado inicial');
  const anon = makeClient();
  const health = await anon('GET', '/api/health');
  ok(health.status === 200 && health.json.ok === true, 'GET /api/health responde ok');
  const status = await anon('GET', '/api/auth/status');
  ok(status.status === 200 && typeof status.json.setup === 'boolean', 'GET /api/auth/status público');

  section('2. Público sin sesión y zonas administrativas protegidas');
  for (const p of ['/api/species?kind=flora', '/api/zones', '/api/stats', '/api/sightings']) {
    const r = await anon('GET', p);
    ok(r.status === 200, `público sin sesión → 200 en ${p}`);
  }
  const sightPublic = await anon('GET', '/api/sightings');
  ok(sightPublic.json && !sightPublic.json.sightings.some((s) => s.user_email), 'el listado público no expone correos');
  for (const p of ['/api/admin/users', '/api/export/sightings.csv', '/api/admin/audit']) {
    const r = await anon('GET', p);
    ok(r.status === 401, `protegido sin sesión → 401 en ${p}`);
  }

  section('3. Acceso al panel por contraseña (sin cuentas públicas)');
  const c1 = makeClient();
  const badEmail = await c1('POST', '/api/auth/register', { email: 'no-es-correo', password: PW, password2: PW });
  ok(badEmail.status === 400, 'registro rechaza correo inválido');
  const shortPw = await c1('POST', '/api/auth/register', { email: `x.${RUN}@t.bo`, password: 'corto', password2: 'corto' });
  ok(shortPw.status === 400, 'registro rechaza contraseña corta');
  const mismatch = await c1('POST', '/api/auth/register', { email: `x.${RUN}@t.bo`, password: PW, password2: 'distinta123' });
  ok(mismatch.status === 400, 'registro rechaza contraseñas distintas');

  const reg = await c1('POST', '/api/auth/admin-unlock', { password: PW });
  ok(reg.status === 200 && reg.json && reg.json.user, `contraseña correcta abre el panel (HTTP ${reg.status})`);
  ok(reg.json && reg.json.user && reg.json.user.role === 'admin', 'la sesión del panel es administrador');
  const segunda = await c1('POST', '/api/auth/register', { email: USER_EMAIL, password: PW, password2: PW });
  ok(segunda.status === 403 && segunda.json && segunda.json.error === 'setup_only', 'alta pública cerrada (403)');
  const wrong = await c1('POST', '/api/auth/admin-unlock', { password: 'otra-cosa' });
  ok(wrong.status === 401, 'contraseña incorrecta → 401');
  if (!reg.json || !reg.json.user) {
    console.log('\nNo se pudo abrir el panel de pruebas: se detiene la suite.');
    console.log(`RESULTADO: ${passed} ok, ${failed + 1} fallidos`);
    process.exit(1);
  }

  section('4. Sesión y logout');
  const c2 = makeClient();
  const badLogin = await c2('POST', '/api/auth/admin-unlock', { password: 'otra-cosa' });
  ok(badLogin.status === 401, 'contraseña incorrecta → 401');
  const login = await c2('POST', '/api/auth/admin-unlock', { password: PW });
  ok(login.status === 200 && login.json.user, 'contraseña correcta abre el panel');
  const usedEmail = login.json.user.email;
  const isAdmin = login.status === 200 && login.json.user.role === 'admin';
  ok(isAdmin, 'la sesión de pruebas tiene rol administrador');
  const me = await c2('GET', '/api/auth/me');
  ok(me.status === 200 && me.json.user && me.json.user.email === usedEmail, '/api/auth/me devuelve la sesión');

  section('5. Seguridad de contraseñas');
  const dbFile = process.env.BIOSMART_DB || path.join(__dirname, '..', 'storage', 'biosmart.db');
  const walFile = dbFile + '-wal';
  if (fs.existsSync(dbFile)) {
    // SQLite en modo WAL: los datos recientes viven en el archivo auxiliar
    const raw = Buffer.concat([
      fs.readFileSync(dbFile),
      fs.existsSync(walFile) ? fs.readFileSync(walFile) : Buffer.alloc(0),
    ]);
    const hayPlain = raw.includes(Buffer.from(PW));
    const hayScrypt = raw.includes(Buffer.from('scrypt$'));
    ok(!hayPlain, 'la contraseña en texto plano NO está en la base');
    ok(hayScrypt, 'hash scrypt presente en la base');
  } else {
    console.log('  (base no encontrada en ruta esperada, se omite comprobación binaria)');
  }
  const cPw = makeClient(); // cliente aparte: no debe tocar la sesión admin de c2
  const dbl = await cPw('POST', '/api/auth/admin-unlock', { password: PW });
  ok(dbl.status === 200, 'la contraseña sigue abriendo el panel tras verificar el hash');

  section('6. Especies y zonas');
  const flora = await c2('GET', '/api/species?kind=flora');
  ok(flora.status === 200 && flora.json.species.length >= 3, `flora con al menos 3 especies (${flora.json && flora.json.species.length})`);
  const slugs = (flora.json ? flora.json.species : []).map((s) => s.slug);
  ok(['molle', 'chilijchi', 'tamar'].every((x) => slugs.includes(x)), 'semilla exacta: molle, chilijchi, tamar');
  const fauna = await c2('GET', '/api/species?kind=fauna');
  ok(fauna.status === 200 && fauna.json.species.length >= 10, 'fauna con al menos 10 fichas');
  const spOk = fauna.json.species.every((s) => s.scientific && s.name && s.name.es);
  ok(spOk, 'todas las fichas tienen nombre y científico');
  const potencial = fauna.json.species.some((s) => s.status === 'potencial');
  ok(potencial, 'hay especies marcadas como presencia potencial (sin confirmar)');
  const one = await c2('GET', '/api/species/by-slug/molle');
  ok(one.status === 200 && one.json.species.fields.length > 5, 'ficha por slug con campos');
  const missing = await c2('GET', '/api/species/by-slug/no-existe-xyz');
  ok(missing.status === 404, 'especie inexistente → 404');
  const zones = await c2('GET', '/api/zones');
  ok(zones.status === 200 && zones.json.zones.length >= 5, 'zonas sembradas (>=5)');

  section('7. Avistamiento con foto (nada guardado hasta el envío)');
  const ck = `client-${RUN}-1`;
  const payload = {
    clientKey: ck,
    animalType: 'ave',
    behavior: 'volando',
    individuals: 3,
    zoneSlug: zones.json.zones[0].slug,
    speciesSlug: 'picaflor',
    observerName: 'Prueba Autónoma',
    notes: 'Registro de prueba automatizado',
    noHarm: true,
    consent: true,
    photo: { data: 'data:image/jpeg;base64,' + fakeJpeg().toString('base64') },
  };
  const s1 = await c2('POST', '/api/sightings', payload);
  ok(s1.status === 201 && s1.json.public_id, `avistamiento creado (${s1.json && s1.json.public_id})`);
  ok(s1.json.status === 'pending', 'estado inicial: pendiente de revisión');

  section('8. Sin duplicados (idempotencia por clientKey)');
  const s2 = await c2('POST', '/api/sightings', payload);
  ok(s2.status === 200 && s2.json.duplicate === true && s2.json.public_id === s1.json.public_id,
    'reenvío con el mismo clientKey devuelve el mismo registro');
  const list1 = await c2('GET', '/api/sightings?scope=mine');
  const dupes = list1.json.sightings.filter((r) => r.public_id === s1.json.public_id);
  ok(dupes.length === 1, 'solo un registro con ese número');

  section('9. Validaciones del formulario');
  const noConsent = await c2('POST', '/api/sightings', { ...payload, clientKey: ck + '-b', consent: false });
  ok(noConsent.status === 400, 'sin consentimiento → 400');
  const noHarm = await c2('POST', '/api/sightings', { ...payload, clientKey: ck + '-c', noHarm: false });
  ok(noHarm.status === 400, 'sin confirmación de no daño → 400');
  const zeroInd = await c2('POST', '/api/sightings', { ...payload, clientKey: ck + '-d', individuals: 0 });
  ok(zeroInd.status === 400, 'individuos < 1 → 400');
  const badType = await c2('POST', '/api/sightings', { ...payload, clientKey: ck + '-e', animalType: 'dragon' });
  ok(badType.status === 400, 'tipo de animal inválido → 400');
  const badZone = await c2('POST', '/api/sightings', { ...payload, clientKey: ck + '-f', zoneSlug: 'zona-fantasma' });
  ok(badZone.status === 400, 'zona inválida → 400');
  const badPhoto = await c2('POST', '/api/sightings', {
    ...payload, clientKey: ck + '-g',
    photo: { data: 'data:text/plain;base64,' + Buffer.from('no soy imagen').toString('base64') },
  });
  ok(badPhoto.status === 400, 'foto con formato no admitido → 400');
  const noKey = await c2('POST', '/api/sightings', { ...payload, clientKey: '' });
  ok(noKey.status === 400, 'sin clientKey → 400');

  section('10. Zona "otra" con texto libre');
  const other = await c2('POST', '/api/sightings', {
    clientKey: ck + '-otra', animalType: 'insecto', behavior: 'alimentandose', individuals: 1,
    zoneSlug: 'otra', zoneOther: 'Cerca del puente peatonal', noHarm: true, consent: true,
  });
  ok(other.status === 201, 'avistamiento en zona libre permitido');

  section('11. Estadísticas calculadas desde la base');
  const st = await c2('GET', '/api/stats');
  ok(st.status === 200, 'GET /api/stats responde');
  const S = st.json.stats;
  ok(S.total >= 2, `total de avistamientos coherente (${S.total})`);
  ok(S.individualsTotal >= 4, `suma de individuos coherente (${S.individualsTotal})`);
  ok(Array.isArray(S.groups) && S.groups.length >= 1, 'distribución por grupo presente');
  ok(Array.isArray(S.monthly) && S.monthly.length >= 1, 'serie mensual presente');
  ok(Array.isArray(S.topSpecies) && S.topSpecies.length >= 1, 'top especies presente');
  ok(Array.isArray(S.zones) && S.zones.some((z) => z.n > 0), 'conteo por zona presente');
  ok(S.pending >= 1, 'hay registros pendientes de revisión');
  ok(S.speciesIdentified >= 1, 'especies identificadas >= 1');

  section('12. Fotografía subida accesible con sesión');
  const withPhoto = list1.json.sightings.find((r) => r.has_photo);
  ok(!!withPhoto, 'el registro con foto indica has_photo');
  if (withPhoto) {
    const ph = await c2('GET', '/api/photos/' + withPhoto.photo_id);
    ok(ph.status === 200 && ph.headers.get('content-type', '').startsWith('image/'), 'GET /api/photos/:id devuelve imagen');
  }
  const phAnon = await anon('GET', '/api/photos/1');
  ok(phAnon.status === 401, 'foto protegida sin sesión (401)');

  section('13. Exportación CSV (solo administrador)');
  const csv = await c2('GET', '/api/export/sightings.csv');
  if (isAdmin) {
    ok(csv.status === 200 && csv.text.includes('Numero de registro'), 'CSV descargable para admin');
    ok(csv.text.split('\r\n').length >= 3, 'CSV con filas de datos');
  } else {
    ok(csv.status === 403, 'CSV denegado a usuario no admin');
  }

  section('14. Alta pública cerrada y panel solo para administrador');
  const c3 = makeClient();
  const regBlocked = await c3('POST', '/api/auth/register', { email: USER_EMAIL, password: PW, password2: PW });
  ok(regBlocked.status === 403, 'segundo registro rechazado (alta cerrada)');
  const users = await c3('GET', '/api/admin/users');
  ok(users.status === 401, 'sin sesión no se accede a /api/admin/users');
  const audit = await c3('GET', '/api/admin/audit');
  ok(audit.status === 401, 'sin sesión no se accede a auditoría');
  const delTry = await c3('DELETE', '/api/species/1');
  ok(delTry.status === 401, 'sin sesión no se borran especies');
  const updTry = await c3('PATCH', '/api/sightings/REG-0001', { status: 'verified' });
  ok(updTry.status === 401, 'sin sesión no se verifican avistamientos');

  const adminUsers = await c2('GET', '/api/admin/users');
  if (isAdmin) {
    ok(adminUsers.status === 200 && adminUsers.json.users.length >= 1, 'admin lista usuarios');
    const auditAdmin = await c2('GET', '/api/admin/audit');
    ok(auditAdmin.status === 200 && auditAdmin.json.audit.length >= 3, 'auditoría registra acciones');
  } else {
    ok(adminUsers.status === 403, 'sin admin real disponible: se omite (o configura ADMIN_EMAIL/ADMIN_PASSWORD)');
  }

  section('15. Revisión de avistamientos (admin)');
  const all = await c2('GET', '/api/sightings?scope=all');
  ok(all.status === 200 && all.json.sightings.some((r) => r.user_email), 'admin ve todos los registros con usuario');
  const target = all.json.sightings.find((r) => r.status === 'pending');
  if (target && isAdmin) {
    const v = await c2('PATCH', '/api/sightings/' + target.public_id, { status: 'verified' });
    ok(v.status === 200 && v.json.status === 'verified', 'admin verifica un registro');
    const v2 = await c3('GET', '/api/stats');
    ok(v2.json.stats.verified >= 1, 'estadísticas reflejan la verificación');
    const rj = await c2('PATCH', '/api/sightings/' + target.public_id, { status: 'nope' });
    ok(rj.status === 400, 'estado inválido rechazado');
  }

  section('16. Traducciones');
  const tr = await c2('GET', '/api/translations');
  ok(tr.status === 200 && typeof tr.json.translations === 'object', 'GET /api/translations');
  const trSet = await c2('PUT', '/api/translations/test.key/es', { value: 'hola' });
  ok(trSet.status === 200, 'PUT traducción permitido para admin');
  const trAnon = await anon('PUT', '/api/translations/test.key/es', { value: 'x' });
  ok(trAnon.status === 401, 'PUT traducción denegado sin sesión');
  const trUser = await c3('PUT', '/api/translations/test.key/es', { value: 'x' });
  ok(trUser.status === 401, 'PUT traducción denegado sin sesión');
  const trDel = await c2('PUT', '/api/translations/test.key/es', { value: '' });
  ok(trDel.status === 200, 'borrado de traducción (valor vacío)');

  section('17. Especies: CRUD de administrador');
  const created = await c2('POST', '/api/species', {
    kind: 'fauna',
    name: { es: 'Especie de prueba', en: 'Test species' },
    scientific: 'Testus exemplum',
    status: 'pendiente',
    category: 'Aves',
    fields: [{ k: 'grupo', es: 'Ave de prueba', en: 'Test bird' }],
    edu: [], sources: { es: 'prueba', en: 'test' }, note: { es: 'nota', en: 'note' }, images: [],
  });
  ok(created.status === 201 && created.json.species.id, 'POST especie (admin) crea ficha');
  if (created.json && created.json.species) {
    const id = created.json.species.id;
    const upd = await c2('PUT', '/api/species/' + id, { scientific: 'Testus modificado' });
    ok(upd.status === 200 && upd.json.species.scientific === 'Testus modificado', 'PUT actualiza la ficha');
    const dup = await c2('POST', '/api/species', {
      kind: 'fauna', name: { es: 'Otra' }, scientific: 'Otro', status: 'pendiente',
    });
    ok(dup.status === 201 || dup.status === 409, 'segunda creación controlada');
    const del = await c2('DELETE', '/api/species/' + id);
    ok(del.status === 200, 'DELETE elimina la ficha de prueba');
    const gone = await c2('GET', '/api/species/' + id);
    ok(gone.status === 404, 'especie eliminada ya no aparece');
  }

  section('18. Logout y sesión invalidada');
  const out = await c2('POST', '/api/auth/logout', {});
  ok(out.status === 200, 'logout correcto');
  const after = await c2('GET', '/api/auth/me');
  ok(after.status === 200 && after.json && after.json.user === null, 'la sesión queda invalidada tras logout');
  const floraAfter = await c2('GET', '/api/species?kind=flora');
  ok(floraAfter.status === 200, 'el contenido público sigue abierto tras logout');

  section('19. Archivos estáticos de la app');
  for (const p of ['/', '/css/styles.css', '/js/app.js', '/js/admin.js', '/js/i18n.js', '/js/api.js', '/js/charts.js', '/lib/qrcode.min.js', '/img/molle.jpg']) {
    const r = await fetch(BASE + p);
    ok(r.status === 200, `estático 200: ${p}`);
  }
  const traversal = await fetch(BASE + '/..%2f..%2fserver%2fdb.js');
  ok(traversal.status !== 200, 'sin path traversal hacia el servidor');

  /* resultado */
  console.log(`\n===============================\nRESULTADO: ${passed} ok, ${failed} fallidos`);
  if (failed) {
    console.log('Fallos:');
    fails.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('ERROR FATAL:', e);
  process.exit(1);
});
