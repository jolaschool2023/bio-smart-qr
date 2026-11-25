/* ============================================================================
   BIOSMART QR — BOT DE PRUEBAS DE USO (carga)
   ----------------------------------------------------------------------------
   Lanza un servidor AISLADO (base propia storage/loadbot.db, subidas propias
   storage/loadbot-uploads/, puerto 8099, límites de tasa desactivados) y
   ejercita cada parte del sitio con DISTINTOS TIPOS DE USO:

     anónimo · público · usuario frecuente · administrador · malicioso

   Por cada sección ejecuta N pruebas (por defecto 1000, --n 1000), con
   concurrencia real (--concurrency 25) para simular un aula entera.

   Secciones (cada opción del sitio):
     1  Acceso           login, registro, sesión, recuperación, intentos maliciosos
     2  Flora            catálogo, fichas, especies sembradas, 404
     3  Fauna            catálogo, categorías, filtros, presencia potencial
     4  Avistamientos    envíos válidos, inválidos, idempotencia, zona libre, anónimo
     5  Estadísticas     10 indicadores y coherencia de los datos en vivo
     6  Pantallas/menú   HTML, JS, CSS, sin opción QR, fallback SPA
     7  Panel admin      usuarios, auditoría, CSV, CRUD de especies, revisión
     8  Idiomas          4 idiomas, traducciones, permisos, banner de revisión
     9  Seguridad        traversal, cabeceras, métodos, JSON inválido, 404
    10  Fotos            subida JPEG/PNG/WEBP, límite 8 MB, acceso con sesión

   Uso:
     node scripts/loadbot.js                       # 1000 pruebas por sección
     node scripts/loadbot.js --n 50                # prueba rápida
     node scripts/loadbot.js --n 1000 --concurrency 40
     node scripts/loadbot.js --keep                # conserva la base de carga

   La base real (storage/biosmart.db) NO se toca.
   ============================================================================ */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const argOf = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const N = Math.max(1, Number(argOf('n', 1000)));
const CONC = Math.max(1, Number(argOf('concurrency', 25)));
const PORT = Number(argOf('port', 8099));
const KEEP = argv.includes('--keep');
const BASE = `http://127.0.0.1:${PORT}`;

const DB_FILE = path.join(ROOT, 'storage', 'loadbot.db');
const UP_DIR = path.join(ROOT, 'storage', 'loadbot-uploads');
const ADMIN_JSON = path.join(ROOT, 'storage', 'loadbot-admin.json');
const PASSWORD = 'Carga12345!';
const ADMIN_MAIL = 'admin@biosmart.local'; // cuenta interna del panel (acceso solo por contraseña)
const USER_MAIL = 'ciudadano.carga@biosmart.test';
const RUN = Date.now().toString(36);

const ANIMAL_TYPES = ['ave', 'insecto', 'mamifero', 'reptil_anfibio', 'otro', 'no_identificado'];
const BEHAVIORS = ['alimentandose', 'volando', 'descansando', 'anidando', 'interactuando', 'otro', 'no_identificado'];
const LANGS = ['es', 'en', 'qu', 'ay'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const uniq = (p) => `${p}-${RUN}-${Math.random().toString(36).slice(2, 9)}`;
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function is(res, st, msg) {
  if (res.status !== st) {
    throw new Error(`${msg} → HTTP ${res.status} (esperado ${st}): ${String(res.text || '').slice(0, 140)}`);
  }
}

/* ---------------- cliente HTTP con cookie propia ---------------- */
class Client {
  constructor(label) { this.label = label; this.cookie = ''; }
  async req(method, p, body, raw) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let payload;
    if (body !== undefined) {
      headers['content-type'] = raw ? 'text/plain' : 'application/json';
      payload = raw ? body : JSON.stringify(body);
    }
    const t0 = performance.now();
    const res = await fetch(BASE + p, { method, headers, body: payload, redirect: 'manual' });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* CSV o HTML */ }
    return { status: res.status, json, text, headers: res.headers, ms: performance.now() - t0 };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b === undefined ? {} : b); }
  put(p, b) { return this.req('PUT', p, b === undefined ? {} : b); }
  patch(p, b) { return this.req('PATCH', p, b === undefined ? {} : b); }
  del(p) { return this.req('DELETE', p); }
  login(email, password) { return this.post('/api/auth/login', { email, password }); }
}

/* ---------------- bytes de imagen válidos ---------------- */
const jpegBuf = () => Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(700, 0x41), Buffer.from([0xff, 0xd9]),
]);
const pngBuf = () => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(700, 0x42),
]);
const webpBuf = () => Buffer.concat([
  Buffer.from('RIFF', 'ascii'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'), Buffer.alloc(700, 0x43),
]);
const dataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

/* ---------------- utilidades de avistamiento ---------------- */
function sightingPayload(ctx, extra = {}) {
  return {
    clientKey: uniq('carga'),
    animalType: pick(ANIMAL_TYPES),
    behavior: pick(BEHAVIORS),
    individuals: 1 + Math.floor(Math.random() * 6),
    zoneSlug: pick(ctx.data.zonasSel), // sin "otra": esa opción exige texto libre
    speciesSlug: pick(ctx.data.fauna),
    observerName: 'Bot de carga',
    notes: 'Registro generado por el bot de pruebas de uso',
    noHarm: true,
    consent: true,
    ...extra,
  };
}
async function mySightings(client, publicId) {
  const list = await client.get('/api/sightings?scope=mine');
  is(list, 200, 'lista de avistamientos');
  return list.json.sightings.filter((s) => s.public_id === publicId);
}

/* ============================================================================
   SECCIONES — cada una con varios escenarios ponderados (tipos de uso)
   ============================================================================ */

/* 1 · ACCESO ------------------------------------------------------------- */
const S_ACCESO = [
  { w: 28, perfil: 'anónimo', run: async (i, c) => {
    const st = await c.anon.get('/api/auth/status');
    is(st, 200, 'estado público');
    assert(typeof st.json.setup === 'boolean', 'setup debe ser booleano');
    const me = await c.anon.get('/api/auth/me');
    is(me, 200, 'me sin sesión');
    assert(me.json.user === null, 'sin sesión el usuario debe ser null');
    const stats = await c.anon.get('/api/stats');
    is(stats, 200, 'estadísticas abiertas sin sesión');
  } },
  { w: 18, perfil: 'visitante público', run: async (i, c) => {
    const t = new Client('visit');
    const me = await t.get('/api/auth/me');
    is(me, 200, 'me público');
    assert(me.json.user === null, 'sin sesión el usuario es null (no hay cuenta pública)');
    const out = await t.post('/api/auth/logout');
    is(out, 200, 'logout siempre 200');
    const after = await t.get('/api/stats');
    is(after, 200, 'el contenido sigue abierto tras logout');
  } },
  { w: 12, perfil: 'administrador', run: async (i, c) => {
    const me = await c.admin.get('/api/auth/me');
    is(me, 200, 'me del admin');
    assert(me.json.user.role === 'admin', 'rol administrador');
    const users = await c.admin.get('/api/admin/users');
    is(users, 200, 'lista de usuarios');
    assert(users.json.users.some((u) => u.email === ADMIN_MAIL), 'el admin aparece en la lista');
  } },
  { w: 16, perfil: 'registro inválido', run: async (i, c) => {
    const t = new Client('reg');
    const caso = i % 4;
    if (caso === 0) {
      const r = await t.post('/api/auth/register', { email: 'no-es-correo', password: PASSWORD, password2: PASSWORD });
      is(r, 400, 'correo inválido');
    } else if (caso === 1) {
      const r = await t.post('/api/auth/register', { email: uniq('corto') + '@t.bo', password: 'corto', password2: 'corto' });
      is(r, 400, 'contraseña corta');
    } else if (caso === 2) {
      const r = await t.post('/api/auth/register', { email: uniq('dist') + '@t.bo', password: PASSWORD, password2: 'Otra1234567' });
      is(r, 400, 'contraseñas distintas');
    } else {
      const r = await t.post('/api/auth/register', { email: ADMIN_MAIL, password: PASSWORD, password2: PASSWORD });
      is(r, 403, 'alta pública cerrada tras el primer administrador (403)');
    }
  } },
  { w: 14, perfil: 'malicioso', run: async (i, c) => {
    const t = new Client('bad');
    const caso = i % 3;
    if (caso === 0) {
      const r = await t.post('/api/auth/login', { email: "' OR 1=1--", password: 'x' });
      is(r, 401, 'login con inyección SQL en el correo');
    } else if (caso === 1) {
      const r = await t.post('/api/auth/login', { email: ADMIN_MAIL, password: "' OR '1'='1" });
      is(r, 401, 'login con inyección SQL en la contraseña');
    } else {
      const r = await t.post('/api/auth/login', { email: uniq('nadie') + '@nada.bo', password: PASSWORD });
      is(r, 401, 'login de cuenta inexistente');
    }
  } },
  { w: 12, perfil: 'recuperación', run: async (i, c) => {
    const t = new Client('forgot');
    const r = await t.post('/api/auth/forgot', { email: ADMIN_MAIL });
    is(r, 200, 'solicitud de recuperación');
    assert(typeof r.json.message === 'string', 'mensaje de recuperación');
    const p = await t.post('/api/auth/password', { current: 'mala', next: 'Nueva1234567' });
    is(p, 401, 'cambio de contraseña sin sesión');
  } },
];

/* 2 · FLORA -------------------------------------------------------------- */
const S_FLORA = [
  { w: 30, perfil: 'visitante', run: async (i, c) => {
    const r = await c.user.get('/api/species?kind=flora');
    is(r, 200, 'catálogo de flora');
    const slugs = r.json.species.map((s) => s.slug);
    assert(slugs.length >= 3, `flora debe tener >= 3 (tiene ${slugs.length})`);
    for (const required of ['molle', 'chilijchi', 'tamar']) {
      assert(slugs.includes(required), `falta la especie sembrada "${required}"`);
    }
    assert(r.json.species.every((s) => s.kind === 'flora'), 'solo flora en el listado');
    assert(r.json.species.every((s) => s.scientific && s.name.es), 'nombre y científico obligatorios');
  } },
  { w: 22, perfil: 'ficha', run: async (i, c) => {
    const slug = i % 3 === 0 ? ['molle', 'chilijchi', 'tamar'][i % 3] : pick(c.data.flora);
    const r = await c.user.get('/api/species/by-slug/' + slug);
    is(r, 200, `ficha de ${slug}`);
    const sp = r.json.species;
    assert(sp.slug === slug, 'el slug coincide');
    assert(Array.isArray(sp.fields) && sp.fields.length >= 1, 'la ficha tiene secciones');
    assert(Array.isArray(sp.edu), 'sección educativa en arreglo');
    assert(sp.images === undefined || Array.isArray(sp.images), 'imágenes en arreglo');
    assert(['referida', 'potencial', 'pendiente'].includes(sp.status), 'estado de presencia válido');
  } },
  { w: 14, perfil: 'ficha inexistente', run: async (i, c) => {
    const r = await c.user.get('/api/species/by-slug/especie-' + i + '-no-existe');
    is(r, 404, 'ficha inexistente');
  } },
  { w: 14, perfil: 'anónimo', run: async (i, c) => {
    const r = await c.anon.get('/api/species?kind=flora');
    is(r, 200, 'flora abierta sin sesión');
  } },
  { w: 10, perfil: 'filtro', run: async (i, c) => {
    const r = await c.user.get('/api/species?kind=flora');
    is(r, 200, 'flora filtrada');
    const solo = r.json.species.filter((s) => s.slug === 'molle');
    assert(solo.length === 1, 'molle aparece una sola vez');
    const dup = new Set(r.json.species.map((s) => s.id));
    assert(dup.size === r.json.species.length, 'sin especies duplicadas');
  } },
  { w: 10, perfil: 'malicioso', run: async (i, c) => {
    const r = await c.anon.get('/api/species/by-slug/..%2F..%2Fserver%2Fdb');
    assert(r.status !== 200, 'sin traversal hacia el servidor');
    const r2 = await c.user.get('/api/species?kind=' + encodeURIComponent("' OR 1=1--"));
    is(r2, 200, 'filtro de tipo inválido no rompe');
    assert(Array.isArray(r2.json.species), 'respuesta en arreglo');
  } },
];

/* 3 · FAUNA -------------------------------------------------------------- */
const S_FAUNA = [
  { w: 28, perfil: 'visitante', run: async (i, c) => {
    const r = await c.user.get('/api/species?kind=fauna');
    is(r, 200, 'catálogo de fauna');
    const list = r.json.species;
    assert(list.length >= 10, `fauna debe tener >= 10 fichas (tiene ${list.length})`);
    assert(list.every((s) => s.kind === 'fauna'), 'solo fauna');
    assert(list.every((s) => s.scientific && s.name.es), 'nombre y científico');
    assert(list.some((s) => s.status === 'potencial'), 'debe haber presencia potencial sin confirmar');
    assert(list.some((s) => s.pollinator), 'debe haber polinizadores');
  } },
  { w: 22, perfil: 'ficha', run: async (i, c) => {
    const slug = pick(c.data.fauna);
    const r = await c.user.get('/api/species/by-slug/' + slug);
    is(r, 200, `ficha de ${slug}`);
    const sp = r.json.species;
    assert(sp.kind === 'fauna', 'es de fauna');
    assert(typeof sp.sightings === 'number', 'contador de avistamientos');
    assert(typeof sp.confirmedHere === 'boolean', 'flag de presencia confirmada');
  } },
  { w: 16, perfil: 'categorías', run: async (i, c) => {
    const r = await c.user.get('/api/species?kind=fauna');
    is(r, 200, 'fauna');
    const cats = new Set(r.json.species.map((s) => (s.category || '').toLowerCase()));
    assert(cats.size >= 3, `debe haber varias categorías (hay ${cats.size})`);
    const aves = r.json.species.filter((s) => (s.category || '').toLowerCase().startsWith('ave'));
    assert(aves.length >= 1, 'hay fichas de aves');
  } },
  { w: 14, perfil: 'anónimo', run: async (i, c) => {
    const r = await c.anon.get('/api/species?kind=fauna');
    is(r, 200, 'fauna abierta sin sesión');
    const f = await c.anon.get('/api/species/by-slug/picaflor');
    is(f, 200, 'ficha abierta sin sesión');
  } },
  { w: 12, perfil: 'filtro', run: async (i, c) => {
    const r = await c.user.get('/api/species?kind=' + pick(['flora', 'fauna', 'inventario']));
    is(r, 200, 'filtro por tipo');
    assert(Array.isArray(r.json.species), 'arreglo en la respuesta');
    if (r.json.species.length) assert(r.json.species.every((s) => s.kind !== undefined), 'cada ficha indica su tipo');
  } },
  { w: 8, perfil: 'malicioso', run: async (i, c) => {
    const r = await c.user.get('/api/species/' + (i % 2 ? '999999' : '-1'));
    assert(r.status === 404 || r.status === 400, `id inválido debe ser 404/400 (dio ${r.status})`);
  } },
];

/* 4 · AVISTAMIENTOS ------------------------------------------------------ */
async function envioValido(i, c) {
  const payload = sightingPayload(c);
  const r = await c.user.post('/api/sightings', payload);
  is(r, 201, 'envío válido');
  assert(r.json.status === 'pending', 'estado inicial pendiente');
  assert(/^REG-\d{4,}$/.test(r.json.public_id), 'número de registro válido');
  const filas = await mySightings(c.user, r.json.public_id);
  assert(filas.length === 1, 'el registro aparece una sola vez en mi lista');
  return r.json.public_id;
}
const S_AVISTAMIENTOS = [
  { w: 24, perfil: 'visitante', run: (i, c) => envioValido(i, c) },
  { w: 14, perfil: 'usuario frecuente', run: async (i, c) => {
    const payload = sightingPayload(c);
    const r1 = await c.power.post('/api/sightings', payload);
    is(r1, 201, 'primer envío');
    const r2 = await c.power.post('/api/sightings', payload);
    is(r2, 200, 'reenvío idempotente');
    assert(r2.json.duplicate === true, 'marcado como duplicado');
    assert(r2.json.public_id === r1.json.public_id, 'mismo número de registro');
    const filas = await mySightings(c.power, r1.json.public_id);
    assert(filas.length === 1, 'sin registros duplicados');
  } },
  { w: 18, perfil: 'malicioso', run: async (i, c) => {
    const base = sightingPayload(c);
    const casos = [
      [{ ...base, individuals: 0 }, 'individuos 0'],
      [{ ...base, consent: false }, 'sin consentimiento'],
      [{ ...base, noHarm: false }, 'sin confirmación de no daño'],
      [{ ...base, animalType: 'dragon' }, 'tipo de animal inválido'],
      [{ ...base, zoneSlug: 'zona-fantasma' }, 'zona inexistente'],
      [{ ...base, clientKey: '' }, 'sin clientKey'],
      [{ ...base, behavior: 'volando-detras' }, 'comportamiento inválido'],
      [{ ...base, individuals: 999999 }, 'individuos fuera de rango'],
    ];
    const [bad, nombre] = casos[i % casos.length];
    const r = await c.user.post('/api/sightings', bad);
    is(r, 400, nombre);
    const tras = await c.user.get('/api/sightings?scope=mine');
    is(tras, 200, 'la lista sigue funcionando');
    assert(!tras.json.sightings.some((s) => s.client_key === bad.clientKey && bad.clientKey), 'el envío inválido no se guardó');
  } },
  { w: 10, perfil: 'zona libre', run: async (i, c) => {
    const r = await c.user.post('/api/sightings', sightingPayload(c, {
      zoneSlug: 'otra', zoneOther: 'Cerca del puente peatonal ' + i,
    }));
    is(r, 201, 'envío en zona libre');
    const filas = await mySightings(c.user, r.json.public_id);
    assert(filas.length === 1, 'registrado');
  } },
  { w: 10, perfil: 'anónimo', run: async (i, c) => {
    const r = await c.anon.post('/api/sightings', sightingPayload(c));
    is(r, 201, 'envío público permitido sin sesión (QR en la Avenida)');
  } },
  { w: 14, perfil: 'con foto', run: async (i, c) => {
    const tipo = pick([['data:image/jpeg;base64,', jpegBuf()], ['data:image/png;base64,', pngBuf()], ['data:image/webp;base64,', webpBuf()]]);
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: tipo[0] + tipo[1].toString('base64') } }));
    is(r, 201, 'envío con foto');
    const filas = await mySightings(c.user, r.json.public_id);
    assert(filas.length === 1 && filas[0].has_photo, 'indica que tiene foto');
    const phAnon = await c.anon.get('/api/photos/' + filas[0].photo_id);
    is(phAnon, 401, 'la foto queda reservada (sin sesión)');
    const ph = await c.admin.get('/api/photos/' + filas[0].photo_id);
    is(ph, 200, 'el administrador descarga la foto');
    assert(String(ph.headers.get('content-type') || '').startsWith('image/'), 'es una imagen');
  } },
  { w: 6, perfil: 'foto grande', run: async (i, c) => {
    if (i % 100 !== 0) return envioValido(i, c); // 8 MB solo 1 de cada 100
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 100, 0x41)]);
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: 'data:image/jpeg;base64,' + grande.toString('base64') } }));
    is(r, 400, 'foto de más de 8 MB rechazada');
  } },
];

/* 5 · ESTADÍSTICAS ------------------------------------------------------- */
const S_STATS = [
  { w: 34, perfil: 'coherencia', run: async (i, c) => {
    const r = await c.user.get('/api/stats');
    is(r, 200, 'estadísticas');
    const s = r.json.stats;
    assert(typeof s.total === 'number', 'total numérico');
    assert(s.pending + s.verified + s.rejected === s.total,
      `estados incoherentes: ${s.pending}+${s.verified}+${s.rejected} ≠ ${s.total}`);
    const grupos = (s.groups || []).reduce((a, g) => a + g.n, 0);
    assert(grupos === s.total, `grupos ${grupos} ≠ total ${s.total}`);
    const meses = (s.monthly || []).reduce((a, m) => a + m.n, 0);
    assert(meses === s.total, `serie mensual ${meses} ≠ total ${s.total}`);
    assert(s.individualsTotal >= s.total, 'individuos ≥ registros');
    assert(s.speciesIdentified <= s.total, 'especies identificadas ≤ registros');
    assert(s.newSpecies30 <= s.speciesIdentified, 'especies nuevas ≤ identificadas');
  } },
  { w: 22, perfil: 'gráficos', run: async (i, c) => {
    const r = await c.user.get('/api/stats');
    is(r, 200, 'estadísticas');
    const s = r.json.stats;
    assert(Array.isArray(s.topSpecies), 'top de especies en arreglo');
    assert(s.topSpecies.every((t) => t.individuals <= s.individualsTotal), 'individuos del top ≤ total');
    assert(Array.isArray(s.zones) && s.zones.length >= 5, 'todas las zonas presentes');
    const enZona = s.zones.reduce((a, z) => a + z.n, 0);
    assert(enZona <= s.total, 'conteo por zona ≤ total');
    assert(s.zones.every((z) => z.map_x >= 0 && z.map_x <= 100), 'coordenada del croquis válida');
    assert(s.topAnimal === null || s.topAnimal.individuals <= s.individualsTotal, 'top animal coherente');
  } },
  { w: 18, perfil: 'tabla de registros', run: async (i, c) => {
    const r = await c.user.get('/api/sightings?scope=mine');
    is(r, 200, 'tabla');
    assert(Array.isArray(r.json.sightings), 'arreglo');
    assert(r.json.sightings.length <= 500, 'limitado a 500 filas');
    assert(r.json.sightings.every((s) => /^REG-\d+$/.test(s.public_id)), 'números de registro válidos');
    assert(r.json.sightings.every((s) => ['pending', 'verified', 'rejected'].includes(s.status)), 'estados válidos');
  } },
  { w: 14, perfil: 'anónimo', run: async (i, c) => {
    is(await c.anon.get('/api/stats'), 200, 'stats abierto sin sesión');
    is(await c.anon.get('/api/sightings'), 200, 'lista pública sin sesión');
  } },
  { w: 12, perfil: 'alcance', run: async (i, c) => {
    const recientes = await c.user.get('/api/sightings');
    is(recientes, 200, 'registros públicos recientes');
    assert(!recientes.json.sightings.some((s) => s.user_email), 'el listado público no expone correos');
    const all = await c.user.get('/api/sightings?scope=all');
    is(all, 401, 'scope=all reservado al administrador');
    const csv = await c.user.get('/api/export/sightings.csv');
    assert(csv.status === 401 || csv.status === 403, `un visitante no puede exportar (dio ${csv.status})`);
  } },
];

/* 6 · PANTALLAS Y MENÚ --------------------------------------------------- */
const S_PANTALLAS = [
  { w: 26, perfil: 'visitante', run: async (i, c) => {
    const r = await c.anon.get('/');
    is(r, 200, 'página principal');
    assert(r.text.includes('BIOSMART'), 'título presente');
    assert(r.text.includes('/js/app.js'), 'carga la aplicación');
    assert(!r.text.includes('/lib/qrcode.min.js'), 'la opción QR ya no se carga');
    assert(r.text.includes('lang-select') || r.text.includes('id="app"'), 'contenedor de la SPA');
  } },
  { w: 20, perfil: 'recursos', run: async (i, c) => {
    const recursos = ['/js/app.js', '/js/admin.js', '/js/charts.js', '/js/api.js', '/js/i18n.js',
      '/css/styles.css', '/img/molle.jpg', '/img/hero.jpg', '/img/credits.json'];
    const p = pick(recursos);
    const r = await c.anon.get(p);
    is(r, 200, 'recurso ' + p);
    assert(r.text.length > 100 || r.headers.get('content-length') !== null, 'recurso con contenido');
  } },
  { w: 18, perfil: 'menú sin QR', run: async (i, c) => {
    const app = await c.anon.get('/js/app.js');
    is(app, 200, 'app.js');
    for (const ruta of ['#/flora', '#/fauna', '#/sighting', '#/stats']) {
      assert(app.text.includes(ruta), `la ruta ${ruta} existe en el enrutador`);
    }
    assert(!app.text.includes('data-go="#/qr"'), 'la opción QR no está en el menú');
    assert(!app.text.includes('case \'qr\''), 'la pantalla QR fue eliminada');
  } },
  { w: 16, perfil: 'rutas de la app', run: async (i, c) => {
    const hash = pick(['/flora', '/fauna', '/sighting', '/stats', '/admin']);
    const r = await c.anon.get('/' + hash);
    is(r, 200, 'fallback SPA para ' + hash);
    assert(r.text.includes('id="app"'), 'sirve la aplicación');
  } },
  { w: 10, perfil: 'idiomas en el HTML', run: async (i, c) => {
    const r = await c.anon.get('/js/i18n.js');
    is(r, 200, 'i18n.js');
    for (const l of LANGS) assert(r.text.includes(`code: '${l}'`), `idioma ${l} definido`);
    assert(r.text.includes('review.banner'), 'aviso de idioma en revisión');
    assert(r.text.includes('REVIEW_LANGS'), 'lista de idiomas en revisión');
  } },
  { w: 10, perfil: 'malicioso', run: async (i, c) => {
    const r = await c.anon.get('/no-existe-' + i);
    is(r, 200, 'SPA resuelve rutas desconocidas');
    const f = await c.anon.get('/server/db.js');
    assert(f.status !== 200 || !f.text.includes('DatabaseSync'), 'no expone el código del servidor');
  } },
];

/* 7 · PANEL ADMINISTRATIVO ----------------------------------------------- */
const S_ADMIN = [
  { w: 22, perfil: 'administrador', run: async (i, c) => {
    const users = await c.admin.get('/api/admin/users');
    is(users, 200, 'usuarios');
    assert(users.json.users.length >= 1, 'hay usuarios registrados');
    assert(users.json.users.every((u) => u.role === 'admin' || u.role === 'user'), 'roles válidos');
    assert(!JSON.stringify(users.json.users).includes('password'), 'nunca se filtran contraseñas');
    const audit = await c.admin.get('/api/admin/audit');
    is(audit, 200, 'auditoría');
    assert(audit.json.audit.length >= 1, 'hay acciones registradas');
    assert(audit.json.audit.every((a) => typeof a.action === 'string'), 'acciones con formato');
  } },
  { w: 18, perfil: 'exportación', run: async (i, c) => {
    const csv = await c.admin.get('/api/export/sightings.csv');
    is(csv, 200, 'CSV');
    assert(csv.text.includes('Numero de registro'), 'cabecera del CSV');
    assert(csv.text.split('\r\n').length >= 2, 'CSV con filas');
    const ctype = String(csv.headers.get('content-type') || '');
    assert(ctype.includes('csv') || ctype.includes('text'), 'content-type del CSV');
  } },
  { w: 14, perfil: 'visitante prohibido', run: async (i, c) => {
    is(await c.user.get('/api/admin/users'), 401, 'usuarios para visitante (sin sesión)');
    is(await c.user.get('/api/admin/audit'), 401, 'auditoría para visitante (sin sesión)');
    is(await c.user.get('/api/export/sightings.csv'), 401, 'CSV para visitante (sin sesión)');
    const b = await c.user.del('/api/species/1');
    is(b, 401, 'borrar especie como visitante (sin sesión)');
    const p = await c.user.patch('/api/sightings/REG-0001', { status: 'verified' });
    is(p, 401, 'verificar avistamiento como visitante (sin sesión)');
  } },
  { w: 10, perfil: 'anónimo', run: async (i, c) => {
    is(await c.anon.get('/api/admin/users'), 401, 'usuarios sin sesión');
    is(await c.anon.get('/api/admin/audit'), 401, 'auditoría sin sesión');
    is(await c.anon.get('/api/export/sightings.csv'), 401, 'CSV sin sesión');
  } },
  { w: 22, perfil: 'CRUD de especies', run: async (i, c) => {
    const slug = uniq('carga-sp');
    const crear = await c.admin.post('/api/species', {
      kind: 'fauna',
      name: { es: 'Especie de prueba ' + i, en: 'Test species' },
      scientific: 'Testus carga' + i,
      status: 'pendiente',
      category: 'Aves',
      fields: [{ k: 'grupo', es: 'Ave de prueba', en: 'Test bird' }],
      edu: [], sources: { es: 'prueba', en: 'test' }, note: { es: 'nota', en: 'note' },
      images: [], slug,
    });
    is(crear, 201, 'crear especie');
    const id = crear.json.species.id;
    const editar = await c.admin.put('/api/species/' + id, { scientific: 'Testus modificado' + i });
    is(editar, 200, 'editar especie');
    assert(editar.json.species.scientific === 'Testus modificado' + i, 'cambio aplicado');
    const ver = await c.admin.get('/api/species/' + id);
    is(ver, 200, 'leer especie');
    const borrar = await c.admin.del('/api/species/' + id);
    is(borrar, 200, 'borrar especie');
    const fuera = await c.admin.get('/api/species/' + id);
    is(fuera, 404, 'la especie borrada ya no aparece');
  } },
  { w: 14, perfil: 'revisión de avistamientos', run: async (i, c) => {
    const r = await c.admin.post('/api/sightings', sightingPayload(c, { observerName: 'Revisión bot' }));
    is(r, 201, 'crear registro para revisar');
    const ok = await c.admin.patch('/api/sightings/' + r.json.public_id, { status: 'verified' });
    is(ok, 200, 'verificar');
    assert(ok.json.status === 'verified', 'estado verificado');
    const mal = await c.admin.patch('/api/sightings/' + r.json.public_id, { status: 'inventado' });
    is(mal, 400, 'estado inválido rechazado');
    const volver = await c.admin.patch('/api/sightings/' + r.json.public_id, { status: 'pending' });
    is(volver, 200, 'volver a pendiente');
  } },
  { w: 6, perfil: 'usuarios', run: async (i, c) => {
    const users = await c.admin.get('/api/admin/users');
    is(users, 200, 'usuarios');
    const self = users.json.users.find((u) => u.email === ADMIN_MAIL);
    assert(self && self.role === 'admin', 'el admin conserva su rol');
    const reset = await c.admin.post(`/api/admin/users/${self.id}/reset-password`, { password: 'corto' });
    assert(reset.status === 400, `contraseña corta rechazada (dio ${reset.status})`);
  } },
];

/* 8 · IDIOMAS ------------------------------------------------------------ */
const S_IDIOMAS = [
  { w: 24, perfil: 'visitante', run: async (i, c) => {
    const r = await c.user.get('/api/translations');
    is(r, 200, 'traducciones');
    assert(typeof r.json.translations === 'object', 'objeto de traducciones');
    const js = await c.anon.get('/js/i18n.js');
    is(js, 200, 'i18n.js');
    assert(js.text.includes("'es'") && js.text.includes("'en'"), 'español e inglés');
    assert(js.text.includes('quechua') && js.text.includes('Aymara'), 'quechua y aymara presentes');
    assert(js.text.includes('DICT'), 'diccionario cargado');
  } },
  { w: 20, perfil: 'clave de traducción', run: async (i, c) => {
    const r = await c.user.get('/api/translations');
    is(r, 200, 'traducciones');
    const claves = Object.keys(r.json.translations);
    // la base arranca sin sobrescrituras; el panel admin las va añadiendo
    for (const k of claves.slice(0, 20)) {
      const v = r.json.translations[k];
      assert(typeof v === 'object' && !Array.isArray(v), `la clave ${k} tiene traducciones por idioma`);
      const ls = Object.keys(v);
      assert(ls.length >= 1, `la clave ${k} tiene al menos un idioma`);
      assert(ls.every((l) => LANGS.includes(l)), `la clave ${k} solo usa idiomas admitidos`);
    }
    const js = await c.user.get('/js/i18n.js');
    is(js, 200, 'i18n.js con el diccionario base');
    const clavesDiccionario = (js.text.match(/^\s*'[^']+':\s*\{/gm) || []).length;
    assert(clavesDiccionario >= 250, `diccionario completo (hay ${clavesDiccionario} claves)`);
  } },
  { w: 18, perfil: 'edición admin', run: async (i, c) => {
    const key = 'carga.' + i;
    const set = await c.admin.put(`/api/translations/${key}/es`, { value: 'hola ' + i });
    is(set, 200, 'guardar traducción');
    const list = await c.admin.get('/api/translations');
    is(list, 200, 'listar');
    assert(list.json.translations[key] && list.json.translations[key].es === 'hola ' + i, 'valor guardado');
    const borrar = await c.admin.put(`/api/translations/${key}/es`, { value: '' });
    is(borrar, 200, 'borrar traducción');
    const tras = await c.admin.get('/api/translations');
    assert(!tras.json.translations[key], 'clave eliminada');
  } },
  { w: 16, perfil: 'permisos', run: async (i, c) => {
    const key = 'carga.perms.' + (i % 50);
    is(await c.user.put(`/api/translations/${key}/es`, { value: 'x' }), 401, 'visitante no edita');
    is(await c.anon.put(`/api/translations/${key}/es`, { value: 'x' }), 401, 'anónimo no edita');
    is(await c.user.get('/api/translations'), 200, 'pero sí puede leer');
  } },
  { w: 12, perfil: 'idioma malicioso', run: async (i, c) => {
    const r = await c.admin.put('/api/translations/clave.mala/de', { value: 'x' });
    assert(r.status === 400 || r.status === 404, `idioma no admitido (dio ${r.status})`);
    const r2 = await c.admin.put('/api/translations/Clave Con Espacios/es', { value: 'x' });
    assert(r2.status === 400 || r2.status === 404, `clave inválida (dio ${r2.status})`);
  } },
  { w: 10, perfil: 'preferencia de idioma', run: async (i, c) => {
    const lang = pick(LANGS);
    const t = new Client('lang');
    const js = await t.get('/js/i18n.js');
    is(js, 200, 'i18n.js');
    assert(js.text.includes(`'${lang}'`), `el diccionario incluye ${lang}`);
    assert(/code: '/.test(js.text), 'hay códigos de idioma cargados');
  } },
];

/* 9 · SEGURIDAD ---------------------------------------------------------- */
const S_SEGURIDAD = [
  { w: 22, perfil: 'traversal', run: async (i, c) => {
    const rutas = ['/..%2f..%2fserver%2fdb.js', '/css/..%2f..%2fserver%2fapi.js',
      '/%2e%2e/%2e%2e/server/auth.js', '/img/../../../server/seed.js'];
    const p = pick(rutas);
    const r = await c.anon.get(p);
    assert(r.status !== 200 || !r.text.includes('module.exports'), `path traversal bloqueado en ${p} (dio ${r.status})`);
  } },
  { w: 18, perfil: 'cabeceras', run: async (i, c) => {
    const r = await c.anon.get('/api/health');
    is(r, 200, 'health');
    assert(r.headers.get('x-content-type-options') === 'nosniff', 'cabecera nosniff');
    assert(r.headers.get('x-frame-options') === 'SAMEORIGIN', 'cabecera anti framing');
    assert(r.headers.get('referrer-policy') === 'same-origin', 'cabecera referrer');
    assert(String(r.headers.get('content-type') || '').includes('application/json'), 'JSON en health');
  } },
  { w: 16, perfil: 'métodos', run: async (i, c) => {
    const caso = i % 3;
    if (caso === 0) {
      const r = await c.anon.req('DELETE', '/');
      assert(r.status === 405, `DELETE / debe dar 405 (dio ${r.status})`);
    } else if (caso === 1) {
      const r = await c.anon.req('POST', '/css/styles.css', {});
      assert(r.status === 405, `POST a un estático debe dar 405 (dio ${r.status})`);
    } else {
      const r = await c.anon.req('PUT', '/api/health', {});
      assert(r.status >= 400 && r.status < 500, `PUT inexistente debe ser 4xx (dio ${r.status})`);
    }
  } },
  { w: 14, perfil: 'malicioso', run: async (i, c) => {
    const caso = i % 3;
    if (caso === 0) {
      const r = await c.anon.req('POST', '/api/auth/login', '{"email":', true);
      assert(r.status === 400, `JSON inválido debe dar 400 (dio ${r.status})`);
    } else if (caso === 1) {
      const r = await c.user.get('/api/clave-inexistente-' + i);
      assert(r.status === 404, `API inexistente debe dar 404 (dio ${r.status})`);
      const sin = await c.anon.get('/api/clave-inexistente-' + i);
      assert(sin.status === 404, `API inexistente sin sesión debe dar 404 (dio ${sin.status})`);
    } else {
      const r = await c.anon.post('/api/sightings', 'texto sin json', true);
      assert(r.status === 400 || r.status === 401, `body no JSON debe fallar limpio (dio ${r.status})`);
    }
  } },
  { w: 16, perfil: 'contraseñas', run: async (i, c) => {
    const t = new Client('pw');
    const r = await t.post('/api/auth/register', { email: uniq('pw') + '@t.bo', password: '12345678', password2: '12345678' });
    is(r, 403, 'alta pública cerrada tras el primer administrador');
    const db = await c.admin.get('/api/admin/users');
    is(db, 200, 'el admin ve la lista');
    assert(!JSON.stringify(db.json).includes('12345678'), 'ninguna contraseña aparece en claro');
  } },
  { w: 14, perfil: 'límites de tasa', run: async (i, c) => {
    // En la instalación real los límites están activos; aquí se comprueba que
    // la app sigue respondiendo de forma controlada (200/401/429) sin 500.
    const t = new Client('rl');
    for (let k = 0; k < 3; k++) {
      const r = await t.post('/api/auth/login', { email: USER_MAIL, password: 'mala-' + k });
      assert(r.status === 401 || r.status === 429, `login fallido controlado (dio ${r.status})`);
      assert(r.status !== 500, 'nunca un 500');
    }
  } },
];

/* 10 · FOTOS ------------------------------------------------------------- */
const S_FOTOS = [
  { w: 26, perfil: 'subida JPEG', run: async (i, c) => {
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: dataUrl(jpegBuf(), 'image/jpeg') } }));
    is(r, 201, 'subida JPEG');
    const filas = await mySightings(c.user, r.json.public_id);
    assert(filas[0] && filas[0].has_photo, 'foto asociada');
    const ph = await c.admin.get('/api/photos/' + filas[0].photo_id);
    is(ph, 200, 'consulta de foto');
    assert(String(ph.headers.get('content-type')) === 'image/jpeg', 'mime JPEG');
  } },
  { w: 16, perfil: 'subida PNG', run: async (i, c) => {
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: dataUrl(pngBuf(), 'image/png') } }));
    is(r, 201, 'subida PNG');
    const filas = await mySightings(c.user, r.json.public_id);
    const ph = await c.admin.get('/api/photos/' + filas[0].photo_id);
    is(ph, 200, 'consulta');
    assert(String(ph.headers.get('content-type')) === 'image/png', 'mime PNG');
  } },
  { w: 14, perfil: 'subida WEBP', run: async (i, c) => {
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: dataUrl(webpBuf(), 'image/webp') } }));
    is(r, 201, 'subida WEBP');
    const filas = await mySightings(c.user, r.json.public_id);
    const ph = await c.admin.get('/api/photos/' + filas[0].photo_id);
    is(ph, 200, 'consulta');
    assert(String(ph.headers.get('content-type')) === 'image/webp', 'mime WEBP');
  } },
  { w: 16, perfil: 'formato inválido', run: async (i, c) => {
    const caso = i % 3;
    let data;
    if (caso === 0) data = 'data:text/plain;base64,' + Buffer.from('no soy una imagen').toString('base64');
    else if (caso === 1) data = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    else data = 'data:image/jpeg;base64,' + Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('base64');
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data } }));
    is(r, 400, 'formato de foto no admitido');
    const list = await c.user.get('/api/sightings?scope=mine');
    is(list, 200, 'la lista sigue bien');
  } },
  { w: 14, perfil: 'acceso a fotos', run: async (i, c) => {
    const r = await c.admin.post('/api/sightings', sightingPayload(c, { photo: { data: dataUrl(jpegBuf(), 'image/jpeg') } }));
    is(r, 201, 'registro con foto del admin');
    const filas = await mySightings(c.admin, r.json.public_id);
    const id = filas[0].photo_id;
    const sin = await c.anon.get('/api/photos/' + id);
    is(sin, 401, 'foto sin sesión');
    const otro = await c.power.get('/api/photos/' + id);
    is(otro, 401, 'la foto queda reservada al administrador');
  } },
  { w: 8, perfil: 'id de foto inválido', run: async (i, c) => {
    const r = await c.admin.get('/api/photos/' + (i % 2 ? '0' : 'abc'));
    assert(r.status === 404 || r.status === 400, `id inválido controlado (dio ${r.status})`);
  } },
  { w: 6, perfil: 'foto grande', run: async (i, c) => {
    if (i % 100 !== 0) { // 8 MB solo 1 de cada 100 iteraciones
      const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: dataUrl(jpegBuf(), 'image/jpeg') } }));
      return is(r, 201, 'foto normal');
    }
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 50, 0x42)]);
    const r = await c.user.post('/api/sightings', sightingPayload(c, { photo: { data: 'data:image/jpeg;base64,' + grande.toString('base64') } }));
    is(r, 400, 'foto mayor a 8 MB rechazada');
  } },
];

const SECCIONES = [
  { id: 'acceso', titulo: '1. Acceso (login / registro / sesión)', escenarios: S_ACCESO },
  { id: 'flora', titulo: '2. Flora (catálogo y fichas)', escenarios: S_FLORA },
  { id: 'fauna', titulo: '3. Fauna (catálogo y fichas)', escenarios: S_FAUNA },
  { id: 'avistamientos', titulo: '4. Avistamientos (formulario)', escenarios: S_AVISTAMIENTOS },
  { id: 'estadisticas', titulo: '5. Estadísticas (10 indicadores)', escenarios: S_STATS },
  { id: 'pantallas', titulo: '6. Pantallas y menú', escenarios: S_PANTALLAS },
  { id: 'admin', titulo: '7. Panel administrativo', escenarios: S_ADMIN },
  { id: 'idiomas', titulo: '8. Idiomas (es / en / qu / ay)', escenarios: S_IDIOMAS },
  { id: 'seguridad', titulo: '9. Seguridad', escenarios: S_SEGURIDAD },
  { id: 'fotos', titulo: '10. Fotografías', escenarios: S_FOTOS },
];

/* ============================================================================
   MOTOR
   ============================================================================ */
function elegir(escenarios) {
  const total = escenarios.reduce((a, e) => a + e.w, 0);
  let r = Math.random() * total;
  for (const e of escenarios) { r -= e.w; if (r <= 0) return e; }
  return escenarios[escenarios.length - 1];
}

async function ejecutarSeccion(sec, ctx) {
  const res = { titulo: sec.titulo, n: 0, ok: 0, fail: 0, muestras: [], fallos: [], perfiles: new Set() };
  let siguiente = 0;
  const trabajador = async () => {
    while (true) {
      const i = siguiente++;
      if (i >= N) return;
      const esc = elegir(sec.escenarios);
      res.perfiles.add(esc.perfil);
      const t0 = performance.now();
      try {
        await esc.run(i, ctx);
        res.ok += 1;
      } catch (e) {
        res.fail += 1;
        if (res.fallos.length < 6) res.fallos.push(`  · prueba #${i} [${esc.perfil}] ${e.message}`);
      } finally {
        res.muestras.push(performance.now() - t0);
        res.n += 1;
      }
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(CONC, N) }, () => trabajador()));
  res.tiempo = performance.now() - t0;
  res.muestras.sort((a, b) => a - b);
  res.p50 = res.muestras[Math.floor(res.muestras.length * 0.5)] || 0;
  res.p95 = res.muestras[Math.floor(res.muestras.length * 0.95)] || 0;
  return res;
}

async function esperarSalud(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* aún arrancando */ }
    await sleep(250);
  }
  throw new Error('el servidor de pruebas no arrancó');
}

async function main() {
  console.log('==========================================================');
  console.log(' BIOSMART QR — bot de pruebas de uso');
  console.log(` Secciones: ${SECCIONES.length} · pruebas por sección: ${N}`);
  console.log(` Total de pruebas: ${SECCIONES.length * N} · concurrencia: ${CONC}`);
  console.log(` Servidor aislado: ${BASE} · base: ${path.relative(ROOT, DB_FILE)}`);
  console.log('==========================================================\n');

  // base aislada limpia
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm', ADMIN_JSON]) fs.rmSync(f, { force: true });
  fs.rmSync(UP_DIR, { recursive: true, force: true });

  const hijo = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BIOSMART_DB: DB_FILE,
      BIOSMART_UPLOADS: UP_DIR,
      BIOSMART_ADMIN_JSON: ADMIN_JSON,
      BIOSMART_ADMIN_PASSWORD: PASSWORD,
      RL_DISABLED: '1', // sin límites: el bot hace miles de peticiones
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hijo.stdout.on('data', (d) => process.stdout.write('   [servidor] ' + d));
  hijo.stderr.on('data', (d) => process.stderr.write('   [servidor!] ' + d));

  const terminar = () => { try { hijo.kill(); } catch { /* ya terminado */ } };
  process.on('exit', terminar);
  process.on('SIGINT', () => { terminar(); process.exit(130); });

  try {
    await esperarSalud();

    /* ---- datos iniciales ---- */
    console.log(' Preparando entorno de prueba…');
    // Acceso al panel solo por contraseña; los demás clientes son visitantes
    // anónimos (el público no necesita cuenta).
    const admin = new Client('admin');
    const r1 = await admin.post('/api/auth/admin-unlock', { password: PASSWORD });
    is(r1, 200, 'apertura del panel con la contraseña');
    assert(r1.json.user.role === 'admin', 'la sesión del panel debe ser admin');

    const user = new Client('visitante');   // público anónimo
    const power = new Client('frecuente');  // público anónimo

    const anon = new Client('anon');
    is(await anon.get('/api/health'), 200, 'salud');

    const fl = await user.get('/api/species?kind=flora');
    is(fl, 200, 'flora sembrada');
    const fa = await user.get('/api/species?kind=fauna');
    is(fa, 200, 'fauna sembrada');
    const zn = await user.get('/api/zones');
    is(zn, 200, 'zonas sembradas');
    const data = {
      flora: fl.json.species.map((s) => s.slug),
      fauna: fa.json.species.map((s) => s.slug),
      zones: zn.json.zones.map((z) => z.slug),
      zonasSel: zn.json.zones.filter((z) => z.slug !== 'otra').map((z) => z.slug),
    };
    assert(data.flora.length >= 3 && data.fauna.length >= 10 && data.zonasSel.length >= 4, 'datos sembrados completos');
    console.log(`   flora: ${data.flora.length} · fauna: ${data.fauna.length} · zonas: ${data.zones.length}\n`);

    const ctx = { admin, user, power, anon, data };

    /* ---- secciones ---- */
    const resultados = [];
    for (const sec of SECCIONES) {
      process.stdout.write(`   ${sec.titulo} … `);
      const r = await ejecutarSeccion(sec, ctx);
      resultados.push(r);
      console.log(`${r.ok}/${r.n} ok${r.fail ? `  ✗ ${r.fail}` : ''}  (${(r.tiempo / 1000).toFixed(1)} s)`);
      if (r.fail) r.fallos.forEach((f) => console.log(f));
    }

    /* ---- informe ---- */
    const totalN = resultados.reduce((a, r) => a + r.n, 0);
    const totalOk = resultados.reduce((a, r) => a + r.ok, 0);
    const totalFail = resultados.reduce((a, r) => a + r.fail, 0);
    const todos = resultados.flatMap((r) => r.muestras).sort((a, b) => a - b);
    const p95global = todos[Math.floor(todos.length * 0.95)] || 0;

    console.log('\n==========================================================');
    console.log(' INFORME FINAL');
    console.log('==========================================================');
    const fila = (t, n, ok, fail, p50, p95) =>
      console.log(` ${t.padEnd(40, ' ')} ${String(n).padStart(6)} ${String(ok).padStart(6)} ${String(fail).padStart(6)} ${String(p50.toFixed(1)).padStart(8)} ${String(p95.toFixed(1)).padStart(8)}`);
    console.log(' '.repeat(4) + 'SECCIÓN'.padEnd(40) + 'PRUEBAS  OK     FALLOS  p50 ms   p95 ms');
    console.log('-'.repeat(110));
    for (const r of resultados) fila(r.titulo, r.n, r.ok, r.fail, r.p50, r.p95);
    console.log('-'.repeat(110));
    fila('TOTAL', totalN, totalOk, totalFail, todos[Math.floor(todos.length * 0.5)] || 0, p95global);

    console.log('\n Tipos de uso probados en cada parte del sitio:');
    const perfiles = new Set();
    resultados.forEach((r) => r.perfiles.forEach((p) => perfiles.add(p)));
    console.log('   ' + [...perfiles].join(' · '));
    console.log(`\n Tiempo total: ${((Date.now() - inicio) / 1000).toFixed(1)} s · p95 global: ${p95global.toFixed(1)} ms`);

    if (totalFail > 0) {
      console.log('\n RESULTADO: FALLÓ — ' + totalFail + ' pruebas con errores (ver arriba).');
    } else {
      console.log('\n RESULTADO: TODAS LAS PRUEBAS PASARON ✓');
    }

    if (!KEEP) {
      terminar();
      await sleep(400);
      for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });
      fs.rmSync(UP_DIR, { recursive: true, force: true });
      console.log(' Base de carga eliminada (usa --keep para conservarla).');
    } else {
      console.log(' Base de carga conservada en storage/loadbot.db');
      terminar();
    }
    process.exit(totalFail ? 1 : 0);
  } catch (e) {
    terminar();
    console.error('\n ERROR DEL BOT:', e.message);
    process.exit(2);
  }
}

const inicio = Date.now();
main();
