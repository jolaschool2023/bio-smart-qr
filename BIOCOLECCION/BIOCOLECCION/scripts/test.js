/* ============================================================================
   Biodiversidad — BOT DE PRUEBAS AUTOMATIZADAS
   ----------------------------------------------------------------------------
   Levanta un servidor AISLADO (base propia storage/test.db, puerto 8199) y
   simula hasta 1.000 participantes registrándose —sin cuentas ni contraseñas—
   con solo su nombre y una clave de navegador, y compara la clasificación con
   peticiones simultáneas reales.

   Comprueba:
     1. Identidad     nombre visible, clave, validaciones, colección aislada
     2. Colección     cada participante solo ve SU colección (sin fugas)
     3. Registros     nombre + especie + confirmación de observación personal
     4. Simultáneo    cientos de registros de participantes distintos a la vez
     5. Clasificación orden de mayor a menor y cantidades exactas por nombre
     6. Frontend      el frontend se sirve correctamente

   Uso:
      node scripts/test.js                      # 1000 participantes (por defecto)
      node scripts/test.js --n 100              # corrida rápida
      node scripts/test.js --n 1000 --concurrency 40
      node scripts/test.js --keep               # conserva la base de pruebas

   La base real (storage/biocol.db) NO se toca.
   ============================================================================ */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const argOf = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const N = Math.max(1, Number(argOf('n', 1000)));
const CONC = Math.max(1, Number(argOf('concurrency', 25)));
const PORT = Number(argOf('port', 8199));
const KEEP = argv.includes('--keep');
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(ROOT, 'storage', 'test.db');
const RUN = Date.now().toString(36);
const keyOf = (label) => `test-${RUN}-${label}-${crypto.randomBytes(4).toString('hex')}`;

const ANIMALS = [
  ['Mariposa monarca', 'Danaus plexippus'],
  ['Colibrí esmeralda', 'Colibri thalassinus'],
  ['Zorro andino', 'Lycalopex culpaeus'],
  ['Venado cola blanca', 'Odocoileus virginianus'],
  ['Halcón peregrino', 'Falco peregrinus'],
  ['Ajolote', 'Ambystoma mexicanum'],
  ['Tarántula andina', 'Thrixopelma ockertzi'],
  ['Escarabajo rosado', 'Eutheola humilis'],
  ['Libélula azul', 'Erythrodiplax umbrata'],
  ['Sapo común', 'Rhinella spinosa'],
];

/* ---------------- contadores ---------------- */
const latencias = [];
let verificaciones = 0;
let fallos = 0;
const muestrasFallo = [];

function ok(cond, msg) {
  verificaciones += 1;
  if (!cond) throw new Error(msg);
}
function fallo(msg) {
  fallos += 1;
  if (muestrasFallo.length < 10) muestrasFallo.push(`  · ${msg}`);
}

/* ---------------- cliente HTTP simple ---------------- */
class Client {
  constructor(label) {
    this.label = label || 'bot';
  }
  async req(method, p, body) {
    const headers = {};
    let payload;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const t0 = performance.now();
    const res = await fetch(BASE + p, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* HTML o vacío */ }
    latencias.push(performance.now() - t0);
    return { status: res.status, data, text, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b === undefined ? {} : b); }
}

/* ============================================================================
   FASES DE PRUEBA
   ============================================================================ */

/* 1 · Identidad y validación ---------------------------------------------- */
async function faseIdentidad() {
  const anon = new Client('anon');

  const lb = await anon.get('/api/leaderboard');
  ok(lb.status === 200 && Array.isArray(lb.data.ranking), 'la clasificación es pública y devuelve lista');

  const sinKey = await anon.get('/api/collection');
  ok(sinKey.status === 400, `colección sin clave → 400 (dio ${sinKey.status})`);

  const keyCorta = await anon.get('/api/collection?key=abc');
  ok(keyCorta.status === 400, `clave demasiado corta → 400 (dio ${keyCorta.status})`);

  const desconocida = await anon.get('/api/collection?key=' + encodeURIComponent(keyOf('desconocida')));
  ok(desconocida.status === 200 && desconocida.data.count === 0 && desconocida.data.records.length === 0,
    'clave desconocida → colección vacía (sin error)');

  const sinNombre = await anon.post('/api/profile', { key: keyOf('anon'), name: 'X' });
  ok(sinNombre.status === 400, `nombre de un carácter → 400 (dio ${sinNombre.status})`);

  const keyFase1 = keyOf('fase1');
  const perfil = await anon.post('/api/profile', { key: keyFase1, name: 'Usuario Acceso' });
  ok(perfil.status === 200 && perfil.data.user.name === 'Usuario Acceso', 'guardar nombre visible → 200');

  const postSinKey = await anon.post('/api/collection',
    { animalName: 'Gato', species: 'Felis catus', observed: true });
  ok(postSinKey.status === 400, `registrar sin clave → 400 (dio ${postSinKey.status})`);

  const sinConfirmar = await anon.post('/api/collection',
    { key: keyOf('obs'), name: 'Usuario Acceso', animalName: 'Búho', species: 'Asio otus', observed: false });
  ok(sinConfirmar.status === 400, `sin confirmar observación → 400 (dio ${sinConfirmar.status})`);

  const vacio = await anon.post('/api/collection',
    { key: keyOf('vacio'), name: 'Usuario Acceso', animalName: '', species: '', observed: true });
  ok(vacio.status === 400, `campos vacíos → 400 (dio ${vacio.status})`);

  const ruta = await anon.get('/api/ruta-que-no-existe');
  ok(ruta.status === 404, `ruta API desconocida → 404 (dio ${ruta.status})`);

  // Usuario con nombre pero SIN registros (aparece en la clasificación con 0)
  return { name: 'Usuario Acceso', key: keyFase1, count: 0 };
}

/* 2 · N bots: nombre visible y colección personal -------------------------- */
async function faseBots(keys, esperado) {
  let siguiente = 0;
  const trabajador = async () => {
    while (true) {
      const i = siguiente++;
      if (i >= N) return;
      try {
        await runBot(i, keys, esperado);
      } catch (e) {
        fallo(`bot #${i}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, N) }, () => trabajador()));
}

async function runBot(i, keys, esperado) {
  const key = keyOf(`bot${i}`);
  const name = `Bot ${i}`;

  // Cambio de nombre dos veces: la última manda
  const p1 = await new Client().post('/api/profile', { key, name: `${name} provisional` });
  ok(p1.status === 200, `crear perfil → ${p1.status} ${p1.data && p1.data.message}`);
  const p2 = await new Client().post('/api/profile', { key, name });
  ok(p2.status === 200 && p2.data.user.name === name, `actualizar nombre → ${p2.status}`);

  // Cada bot registra entre 1 y 5 animales (todos observados por él mismo)
  const k = 1 + (i % 5);
  const ids = [];
  for (let j = 0; j < k; j++) {
    const [animalName, species] = ANIMALS[(i + j) % ANIMALS.length];
    const r = await new Client().post('/api/collection', { key, name, animalName, species, observed: true });
    ok(r.status === 201, `registrar animal → ${r.status} ${r.data && r.data.message}`);
    ok(r.data.record.animalName === animalName && r.data.record.species === species,
      'la respuesta incluye nombre y especie');
    ids.push(r.data.record.id);
  }

  // Su colección debe contener EXACTAMENTE sus registros (sin fugas)
  const col = await new Client().get('/api/collection?key=' + encodeURIComponent(key));
  ok(col.status === 200, `consulta de colección → ${col.status}`);
  ok(col.data.count === k, `su colección debe tener ${k} (dio ${col.data.count})`);
  const propios = col.data.records.map((r) => r.id).sort((a, b) => a - b);
  const esperados = ids.slice().sort((a, b) => a - b);
  ok(propios.join(',') === esperados.join(','), 'la colección solo contiene los registros de esta clave');
  ok(col.data.records.every((r) => r.animalName && r.species), 'cada registro incluye nombre y especie');

  // Una clave distinta no ve sus registros
  const ajena = await new Client().get('/api/collection?key=' + encodeURIComponent(keyOf('ajena') + i));
  ok(ajena.status === 200 && ajena.data.count === 0, 'otra clave no ve los registros');

  keys[i] = key;
  esperado.set(name, k);
}

/* 3 · Registros simultáneos de muchos participantes ------------------------ */
async function faseSimultanea(keys, esperado) {
  const candidatos = [];
  for (let i = 0; i < N && candidatos.length < 100; i++) if (keys[i]) candidatos.push(i);
  ok(candidatos.length >= Math.min(100, N), 'hay participantes con clave para la prueba simultánea');

  const resultados = await Promise.all(candidatos.map(async (i, idx) => {
    const [animalName, species] = ANIMALS[idx % ANIMALS.length];
    return new Client('simultaneo').post('/api/collection',
      { key: keys[i], name: `Bot ${i}`, animalName, species, observed: true });
  }));

  const bien = resultados.filter((r) => r.status === 201).length;
  ok(bien === resultados.length,
    `${resultados.length} registros simultáneos → ${bien}/${resultados.length} con 201`);

  // Sus colecciones quedaron con un registro más
  for (const i of candidatos) {
    esperado.set(`Bot ${i}`, (esperado.get(`Bot ${i}`) || 0) + 1);
  }
  const col = await new Client('verifica').get('/api/collection?key=' + encodeURIComponent(keys[candidatos[0]]));
  ok(col.status === 200 && col.data.count === esperado.get(`Bot ${candidatos[0]}`),
    'la colección refleja el registro simultáneo');
}

/* 4 · Clasificación general ------------------------------------------------ */
async function faseClasificacion(esperado) {
  const lb = await new Client('anon').get('/api/leaderboard');
  ok(lb.status === 200, `clasificación → ${lb.status}`);
  const rank = lb.data.ranking;

  ok(rank.length === esperado.size,
    `todos los participantes aparecen (${rank.length} vs ${esperado.size} esperados)`);

  for (let i = 1; i < rank.length; i++) {
    ok(rank[i - 1].count >= rank[i].count,
      `orden de mayor a menor: ${rank[i - 1].count} antes que ${rank[i].count}`);
  }

  for (const [name, count] of esperado) {
    const row = rank.find((r) => r.name === name);
    ok(!!row && row.count === count,
      `${name} debe tener ${count} registros (dio ${row ? row.count : 'ausente'})`);
  }

  const suma = rank.reduce((a, r) => a + r.count, 0);
  const esperada = [...esperado.values()].reduce((a, b) => a + b, 0);
  ok(suma === esperada, `suma total ${suma} = ${esperada}`);
  ok(lb.data.totalRecords === suma, 'totalRecords coincide con la suma');

  const top = rank[0];
  ok(top.count >= rank[rank.length - 1].count, 'el primero tiene más registros que el último');
}

/* 5 · Perfil persistente por clave ------------------------------------------ */
async function fasePerfil() {
  const key = keyOf('persistente');
  const c = new Client('persistente');

  const primero = await c.post('/api/profile', { key, name: 'Nombre Viejo' });
  ok(primero.status === 200 && primero.data.user.name === 'Nombre Viejo', 'crear perfil');

  const segundo = await c.post('/api/profile', { key, name: 'Nombre Nuevo' });
  ok(segundo.status === 200 && segundo.data.user.name === 'Nombre Nuevo', 'renombrar perfil');

  const col = await c.get('/api/collection?key=' + encodeURIComponent(key));
  ok(col.status === 200 && col.data.name === 'Nombre Nuevo', 'la colección refleja el nuevo nombre');

  const invalido = await c.post('/api/profile', { key, name: 'Z' });
  ok(invalido.status === 400, `nombre inválido → 400 (dio ${invalido.status})`);
}

/* 6 · Frontend -------------------------------------------------------------- */
async function faseFrontend() {
  const anon = new Client('frontend');
  const paginas = ['/', '/css/styles.css', '/js/app.js'];
  for (const p of paginas) {
    const r = await anon.get(p);
    ok(r.status === 200, `asset ${p} → ${r.status}`);
  }
  const html = await anon.get('/');
  ok(html.text.includes('Mi colección'), 'el HTML incluye "Mi colección"');
  ok(html.text.includes('Clasificación'), 'el HTML incluye "Clasificación"');
  ok(!html.text.includes('id="view-auth"'), 'el HTML ya no incluye la pantalla de acceso');
  ok(html.text.includes('id="name-modal"'), 'el HTML incluye el cuadro de nombre');
}

/* ============================================================================
   MOTOR
   ============================================================================ */
async function esperarSalud(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/leaderboard`);
      if (r.ok) return;
    } catch { /* aún arrancando */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('el servidor de pruebas no arrancó');
}

async function main() {
  console.log('==========================================================');
  console.log(' Biodiversidad — bot de pruebas automatizadas (sin cuentas)');
  console.log(` Participantes simulados: ${N} · concurrencia: ${CONC}`);
  console.log(` Servidor aislado: ${BASE} · base: ${path.relative(ROOT, DB_FILE)}`);
  console.log('==========================================================\n');

  // Base aislada limpia
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });

  const hijo = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), BIOCOL_DB: DB_FILE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hijo.stdout.on('data', (d) => process.stdout.write('   [servidor] ' + d));
  hijo.stderr.on('data', (d) => process.stderr.write('   [servidor!] ' + d));

  const terminar = () => { try { hijo.kill(); } catch { /* ya terminado */ } };
  process.on('exit', terminar);
  process.on('SIGINT', () => { terminar(); process.exit(130); });

  const fase = async (nombre, fn) => {
    const t0 = performance.now();
    try {
      const r = await fn();
      console.log(`  ok    ${nombre}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
      return r;
    } catch (e) {
      fallo(`${nombre}: ${e.message}`);
      console.log(`  FALLA ${nombre}: ${e.message}`);
      return null;
    }
  };

  const inicio = Date.now();
  try {
    await esperarSalud();

    const extra = await fase('1. Identidad (nombre visible, clave, validación)', faseIdentidad);

    const keys = new Array(N).fill('');
    const esperado = new Map();
    // El participante creado en la fase 1 también aparece en la clasificación
    if (extra) esperado.set(extra.name, extra.count);
    await fase(`2. ${N} bots: nombre visible y colección personal`, () =>
      faseBots(keys, esperado));
    console.log(`        → participantes creados y verificados: ${esperado.size}`);

    await fase('3. Registros simultáneos (100 participantes a la vez)', () =>
      faseSimultanea(keys, esperado));

    await fase('4. Clasificación general (orden y cantidades)', () =>
      faseClasificacion(esperado));

    await fase('5. Perfil persistente por clave (renombrar)', fasePerfil);

    await fase('6. Frontend (páginas y recursos)', faseFrontend);

    /* ---- informe ---- */
    const ordenado = latencias.slice().sort((a, b) => a - b);
    const p50 = ordenado[Math.floor(ordenado.length * 0.5)] || 0;
    const p95 = ordenado[Math.floor(ordenado.length * 0.95)] || 0;
    const registros = [...esperado.values()].reduce((a, b) => a + b, 0);

    console.log('\n==========================================================');
    console.log(' INFORME FINAL');
    console.log('==========================================================');
    console.log(` Participantes en clasificación: ${esperado.size} (bots: ${N})`);
    console.log(` Registros de animales:  ${registros}`);
    console.log(` Peticiones HTTP:        ${latencias.length}`);
    console.log(` Verificaciones:         ${verificaciones}`);
    console.log(` Fallos:                 ${fallos}`);
    console.log(` Latencia p50 / p95:     ${p50.toFixed(1)} ms / ${p95.toFixed(1)} ms`);
    console.log(` Tiempo total:           ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    if (fallos) {
      console.log('\n Muestras de fallo:');
      muestrasFallo.forEach((m) => console.log(m));
      console.log('\n RESULTADO: FALLÓ — ' + fallos + ' problema(s).');
    } else {
      console.log('\n RESULTADO: TODO CORRECTO ✓');
    }

    terminar();
    await new Promise((r) => setTimeout(r, 400));
    if (!KEEP) {
      for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });
      console.log(' Base de pruebas eliminada (usa --keep para conservarla).');
    } else {
      console.log(' Base de pruebas conservada en storage/test.db');
    }
    process.exit(fallos ? 1 : 0);
  } catch (e) {
    terminar();
    console.error('\n ERROR DEL BOT:', e.message);
    process.exit(2);
  }
}

main();
