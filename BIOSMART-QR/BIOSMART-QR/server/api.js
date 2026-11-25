/* API REST — BIOSMART QR.
   Todas las respuestas son JSON (o CSV para exportación). Sesión por cookie HttpOnly. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { get, all, run, audit, UPLOAD_DIR, newToken } = require('./db');
// El módulo de administración se carga solo al abrir el panel (en Vercel la
// contraseña se configura como variable de entorno y el archivo vive en /tmp).
const {
  hashPassword, verifyPassword, createSession, destroySession,
  currentUser, validatePassword, validateEmail, PASSWORD_MIN,
} = require('./auth');

// ---------- utilidades ----------
const json = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};
const fail = (res, status, code, message, extra = {}) => json(res, status, { error: code, message, ...extra });

const lim = (v, max, dflt = '') => (typeof v === 'string' ? v.trim().slice(0, max) : dflt);
const bool = (v) => v === true || v === 1 || v === '1';
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// Limitador simple en memoria (protección contra abuso)
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  if (max <= 0) return true; // 0 = desactivado (p. ej. entorno local/aula vía variable RL_DISABLED=1)
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n += 1;
  return b.n <= max;
}
/* Límites por IP (máximos por ventana). Ajustables por entorno:
   un aula con muchos equipos tras la misma IP necesita márgenes amplios. */
const RL_DISABLED = process.env.RL_DISABLED === '1';
const RL = {
  register: RL_DISABLED ? 0 : Number(process.env.RL_REGISTER) || 30,
  login: RL_DISABLED ? 0 : Number(process.env.RL_LOGIN) || 60,
  password: RL_DISABLED ? 0 : Number(process.env.RL_PASSWORD) || 30,
  sighting: RL_DISABLED ? 0 : Number(process.env.RL_SIGHTING) || 120,
};
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60_000).unref();

const ANIMAL_TYPES = ['ave', 'insecto', 'mamifero', 'reptil_anfibio', 'otro', 'no_identificado'];
const BEHAVIORS = ['alimentandose', 'volando', 'descansando', 'anidando', 'interactuando', 'otro', 'no_identificado'];
const LANGS = ['es', 'en', 'qu', 'ay'];
const STATUSES = ['pending', 'verified', 'rejected'];

// Fotos: validación de firma binaria (magic bytes)
function sniffImage(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

// ---------- serialización de especies ----------
function speciesOut(row) {
  if (!row) return null;
  return {
    id: row.id, kind: row.kind, slug: row.slug,
    name: { es: row.name_es, en: row.name_en, qu: row.name_qu, ay: row.name_ay },
    alias: row.alias_es || '', scientific: row.scientific_name, family: row.family || '',
    category: row.category || '', pollinator: !!row.pollinator, status: row.status,
    fields: JSON.parse(row.fields_json), edu: JSON.parse(row.edu_json),
    sources: JSON.parse(row.sources_json), note: JSON.parse(row.note_json),
    images: JSON.parse(row.images_json),
    confirmedHere: !!get(`SELECT 1 x FROM sightings s WHERE s.species_id = ? AND s.status = 'verified' LIMIT 1`, row.id),
    sightings: (get('SELECT COUNT(*) c FROM sightings WHERE species_id = ?', row.id) || {}).c || 0,
    updated_at: row.updated_at, created_at: row.created_at,
  };
}
function speciesFromBody(body, existing = {}) {
  const kind = body.kind || existing.kind;
  if (!['flora', 'fauna'].includes(kind)) return { error: 'kind inválido' };
  const name = body.name || {};
  const name_es = lim(name.es ?? existing.name_es, 120);
  if (!name_es) return { error: 'Falta el nombre en español' };
  const scientific = lim(body.scientific ?? existing.scientific_name, 200);
  if (!scientific) return { error: 'Falta el nombre científico' };
  const cleanList = (list) => (Array.isArray(list) ? list.slice(0, 60).map((f) => ({
    k: lim(f.k, 60), es: lim(f.es, 4000), en: lim(f.en, 4000),
  })).filter((f) => f.k && f.es) : []);
  const cleanImgs = (imgs) => (Array.isArray(imgs) ? imgs.slice(0, 12).map((i) => ({
    file: lim(i.file, 120), upload: bool(i.upload),
    author: lim(i.author || '', 300), license: lim(i.license || '', 120), source: lim(i.source || '', 500),
  })).filter((i) => i.file) : []);
  const obj = {
    kind,
    slug: lim(body.slug || existing.slug || '', 80).toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
    name_es,
    name_en: lim(name.en ?? existing.name_en ?? '', 120) || null,
    name_qu: lim(name.qu ?? existing.name_qu ?? '', 120) || null,
    name_ay: lim(name.ay ?? existing.name_ay ?? '', 120) || null,
    alias_es: lim(body.alias ?? existing.alias_es ?? '', 200) || null,
    scientific_name: scientific,
    family: lim(body.family ?? existing.family ?? '', 120) || null,
    category: lim(body.category ?? existing.category ?? '', 60) || null,
    pollinator: bool(body.pollinator ?? existing.pollinator) ? 1 : 0,
    status: STATUSES.includes(body.status) || ['referida', 'potencial', 'pendiente'].includes(body.status) ? body.status : 'potencial',
    fields_json: JSON.stringify(cleanList(body.fields ?? JSON.parse(existing.fields_json || '[]'))),
    edu_json: JSON.stringify(cleanList(body.edu ?? JSON.parse(existing.edu_json || '[]'))),
    sources_json: JSON.stringify(body.sources ?? JSON.parse(existing.sources_json || '{}')),
    note_json: JSON.stringify(body.note ?? JSON.parse(existing.note_json || '{}')),
    images_json: JSON.stringify(cleanImgs(body.images ?? JSON.parse(existing.images_json || '[]'))),
  };
  if (obj.status === 'verified') obj.status = 'referida';
  if (!['referida', 'potencial', 'pendiente'].includes(obj.status)) return { error: 'status inválido' };
  return obj;
}

// ---------- estadísticas (calculadas SOLO desde la base) ----------
function computeStats() {
  const one = (sql, ...p) => get(sql, ...p) || {};
  const total = one('SELECT COUNT(*) c FROM sightings').c;
  const pending = one("SELECT COUNT(*) c FROM sightings WHERE status='pending'").c;
  const verified = one("SELECT COUNT(*) c FROM sightings WHERE status='verified'").c;
  const rejected = one("SELECT COUNT(*) c FROM sightings WHERE status='rejected'").c;
  const individualsTotal = one('SELECT COALESCE(SUM(individuals),0) c FROM sightings').c;
  const speciesIdentified = one(
    `SELECT COUNT(DISTINCT COALESCE(s.species_name, sp.name_es)) c
       FROM sightings s LEFT JOIN species sp ON sp.id = s.species_id
      WHERE COALESCE(s.species_name, sp.name_es) IS NOT NULL`
  ).c;
  const newSpecies30 = one(
    `SELECT COUNT(DISTINCT COALESCE(s.species_name, sp.name_es)) c
       FROM sightings s LEFT JOIN species sp ON sp.id = s.species_id
      WHERE COALESCE(s.species_name, sp.name_es) IS NOT NULL
        AND s.created_at >= datetime('now','-30 days')`
  ).c;
  const topAnimal = one(
    `SELECT COALESCE(s.species_name, sp.name_es, '—') name,
            SUM(s.individuals) individuals, COUNT(*) n
       FROM sightings s LEFT JOIN species sp ON sp.id = s.species_id
      GROUP BY name ORDER BY individuals DESC, n DESC LIMIT 1`
  );
  const topGroup = one(
    'SELECT animal_type code, COUNT(*) n FROM sightings GROUP BY animal_type ORDER BY n DESC, animal_type LIMIT 1'
  );
  const groups = all('SELECT animal_type code, COUNT(*) n FROM sightings GROUP BY animal_type ORDER BY n DESC');
  const topSpecies = all(
    `SELECT COALESCE(s.species_name, sp.name_es, 'Sin identificar') name,
            SUM(s.individuals) individuals, COUNT(*) n
       FROM sightings s LEFT JOIN species sp ON sp.id = s.species_id
      GROUP BY name ORDER BY individuals DESC, n DESC LIMIT 10`
  );
  const zones = all(
    `SELECT z.id, z.slug, z.name_es, z.name_en, z.name_qu, z.name_ay, z.map_x, z.map_y, z.color,
            COUNT(s.id) n, COALESCE(SUM(s.individuals),0) individuals
       FROM zones z LEFT JOIN sightings s ON s.zone_id = z.id
      GROUP BY z.id ORDER BY n DESC, z.sort`
  );
  const monthly = all(
    `SELECT substr(observed_date,1,7) month, COUNT(*) n, COALESCE(SUM(individuals),0) individuals
       FROM sightings GROUP BY month ORDER BY month DESC LIMIT 12`
  ).reverse();
  const byStatus = STATUSES.map((code) => ({
    code, n: (get('SELECT COUNT(*) c FROM sightings WHERE status=?', code) || {}).c || 0,
  }));
  return {
    total, pending, verified, rejected, individualsTotal, speciesIdentified, newSpecies30,
    topAnimal: topAnimal && topAnimal.name ? topAnimal : null,
    topGroup: topGroup && topGroup.code ? topGroup : null,
    groups, topSpecies, zones, monthly, byStatus,
    lastUpdated: new Date().toISOString(),
  };
}

// ---------- CSV ----------
function toCsv(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(c.get(r))).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}

// ---------- enrutador ----------
async function handleApi(req, res, url, body, user) {
  const m = (re) => url.pathname.match(re);
  const method = req.method;
  const ip = req.socket.remoteAddress || '?';
  const admin = user && user.role === 'admin';
  const needAuth = () => { if (!user) { fail(res, 401, 'auth_required', 'Abre el panel con la contraseña de administrador'); return true; } return false; };
  const needAdmin = () => { if (needAuth()) return true; if (!admin) { fail(res, 403, 'forbidden', 'Se requieren permisos de administrador'); return true; } return false; };

  // ----- salud -----
  if (method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, time: new Date().toISOString() });

  // ----- acceso al panel de administración: SOLO una contraseña -----
  if (method === 'POST' && url.pathname === '/api/auth/admin-unlock') {
    if (!rateLimit(`unlock:${ip}`, RL.login, 300_000)) return fail(res, 429, 'rate', 'Demasiados intentos. Espera unos minutos.');
    const { unlockAdmin } = require('./admin');
    const u = unlockAdmin(body.password);
    if (!u) return fail(res, 401, 'credentials', 'Contraseña incorrecta.');
    run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', u.id);
    createSession(res, u.id);
    audit(u.id, 'user.login', 'user', u.id, { mode: 'password' });
    return json(res, 200, { user: { id: u.id, email: u.email, role: u.role, display_name: u.display_name, lang: u.lang } });
  }

  // ----- autenticación heredada (el público no la necesita) -----
  if (method === 'POST' && url.pathname === '/api/auth/register') {
    if (!rateLimit(`reg:${ip}`, RL.register, 600_000)) return fail(res, 429, 'rate', 'Demasiados intentos. Espera unos minutos.');
    const email = String(body.email || '').trim().toLowerCase();
    const { password, password2 } = body;
    if (!validateEmail(email)) return fail(res, 400, 'email', 'Correo electrónico inválido.');
    if (!validatePassword(password)) return fail(res, 400, 'password', `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    if (password !== password2) return fail(res, 400, 'password2', 'Las contraseñas no coinciden.');
    // Alta pública cerrada: solo el primer usuario (administrador inicial) puede
    // registrarse. Después, la plataforma no pide ni crea cuentas públicas.
    const userCount = (get('SELECT COUNT(*) c FROM users').c) || 0;
    if (userCount > 0) return fail(res, 403, 'setup_only', 'El alta pública está cerrada. El administrador puede restablecer contraseñas; no se crean cuentas nuevas.');
    if (get('SELECT 1 x FROM users WHERE email = ?', email)) return fail(res, 409, 'exists', 'Ya existe una cuenta con ese correo.');
    const isFirst = (get('SELECT COUNT(*) c FROM users').c) === 0;
    const role = isFirst ? 'admin' : 'user';
    const info = run('INSERT INTO users (email, password_hash, role) VALUES (?,?,?)', email, hashPassword(password), role);
    audit(info.lastInsertRowid, 'user.register', 'user', info.lastInsertRowid, { role, first: isFirst });
    createSession(res, Number(info.lastInsertRowid));
    const u = get('SELECT id, email, role, display_name, lang FROM users WHERE id = ?', info.lastInsertRowid);
    return json(res, 201, { user: u, firstUser: isFirst });
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    if (!rateLimit(`login:${ip}`, RL.login, 300_000)) return fail(res, 429, 'rate', 'Demasiados intentos. Espera unos minutos.');
    const email = String(body.email || '').trim().toLowerCase();
    const u = get('SELECT * FROM users WHERE email = ?', email);
    if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) {
      return fail(res, 401, 'credentials', 'Correo o contraseña incorrectos.');
    }
    if (!u.active) return fail(res, 403, 'disabled', 'La cuenta está desactivada. Contacta al administrador.');
    run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', u.id);
    createSession(res, u.id);
    audit(u.id, 'user.login', 'user', u.id, null);
    return json(res, 200, { user: { id: u.id, email: u.email, role: u.role, display_name: u.display_name, lang: u.lang } });
  }

  if (method === 'POST' && url.pathname === '/api/auth/logout') {
    if (user) audit(user.id, 'user.logout', 'user', user.id, null);
    destroySession(req, res);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && url.pathname === '/api/auth/me') return json(res, 200, { user: user || null });

  // Estado público: ¿la plataforma está sin usuarios (primer registro = admin)?
  if (method === 'GET' && url.pathname === '/api/auth/status') {
    const n = (get('SELECT COUNT(*) c FROM users').c) || 0;
    return json(res, 200, { registered: n > 0, setup: n === 0 });
  }

  if (method === 'POST' && url.pathname === '/api/auth/password') {
    if (needAuth()) return;
    if (!rateLimit(`pw:${ip}`, RL.password, 300_000)) return fail(res, 429, 'rate', 'Demasiados intentos.');
    const u = get('SELECT * FROM users WHERE id = ?', user.id);
    if (!verifyPassword(String(body.current || ''), u.password_hash)) return fail(res, 400, 'current', 'Contraseña actual incorrecta.');
    if (!validatePassword(body.next)) return fail(res, 400, 'password', `La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.next), u.id);
    audit(u.id, 'user.password_self', 'user', u.id, null);
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && url.pathname === '/api/auth/forgot') {
    // No hay servicio de correo configurado: el administrador puede restablecer contraseñas.
    return json(res, 200, {
      ok: true, mode: 'admin-reset',
      message: 'Si la cuenta existe, el administrador de la plataforma puede restablecer tu contraseña. Escríbele indicando tu correo.',
    });
  }

  // NOTA: a partir de aquí los endpoints son PÚBLICOS (sin sesión), salvo
  // los marcados explícitamente como de administración (needAdmin).
  // ----- especies -----
  if (method === 'GET' && url.pathname === '/api/species') {
    const kind = url.searchParams.get('kind');
    const rows = all(
      `SELECT * FROM species WHERE deleted = 0 ${kind ? 'AND kind = ?' : ''} ORDER BY kind, name_es`,
      ...(kind ? [kind] : [])
    );
    return json(res, 200, { species: rows.map(speciesOut) });
  }
  const spById = m(/^\/api\/species\/(\d+)$/);
  const spBySlug = m(/^\/api\/species\/by-slug\/([a-z0-9-]+)$/);
  if (method === 'GET' && (spById || spBySlug)) {
    const row = spById ? get('SELECT * FROM species WHERE id = ? AND deleted = 0', spById[1])
                       : get('SELECT * FROM species WHERE slug = ? AND deleted = 0', spBySlug[1]);
    if (!row) return fail(res, 404, 'not_found', 'Especie no encontrada');
    return json(res, 200, { species: speciesOut(row) });
  }
  if (method === 'POST' && url.pathname === '/api/species') {
    if (needAdmin()) return;
    const data = speciesFromBody(body);
    if (data.error) return fail(res, 400, 'invalid', data.error);
    if (!data.slug) data.slug = data.name_es.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (get('SELECT 1 x FROM species WHERE slug = ?', data.slug)) return fail(res, 409, 'slug', 'Ya existe una especie con ese identificador.');
    const info = run(
      `INSERT INTO species (kind, slug, name_es, name_en, name_qu, name_ay, alias_es, scientific_name, family, category,
        pollinator, status, fields_json, edu_json, sources_json, note_json, images_json, created_by)
       VALUES (@kind,@slug,@name_es,@name_en,@name_qu,@name_ay,@alias_es,@scientific_name,@family,@category,
        @pollinator,@status,@fields_json,@edu_json,@sources_json,@note_json,@images_json,@created_by)`,
      { ...data, created_by: user.id });
    audit(user.id, 'species.create', 'species', info.lastInsertRowid, { slug: data.slug });
    return json(res, 201, { species: speciesOut(get('SELECT * FROM species WHERE id = ?', info.lastInsertRowid)) });
  }
  if (method === 'PUT' && spById) {
    if (needAdmin()) return;
    const row = get('SELECT * FROM species WHERE id = ?', spById[1]);
    if (!row) return fail(res, 404, 'not_found', 'Especie no encontrada');
    const data = speciesFromBody({ ...body, kind: body.kind || row.kind }, row);
    if (data.error) return fail(res, 400, 'invalid', data.error);
    delete data.slug; delete data.kind; // identificadores estables
    const sets = Object.keys(data).map((k) => `${k} = @${k}`).join(', ');
    run(`UPDATE species SET ${sets}, updated_at = datetime('now') WHERE id = @id`, { ...data, id: row.id });
    audit(user.id, 'species.update', 'species', row.id, { fields: Object.keys(data) });
    return json(res, 200, { species: speciesOut(get('SELECT * FROM species WHERE id = ?', row.id)) });
  }
  if (method === 'DELETE' && spById) {
    if (needAdmin()) return;
    const row = get('SELECT * FROM species WHERE id = ?', spById[1]);
    if (!row) return fail(res, 404, 'not_found', 'Especie no encontrada');
    run('UPDATE species SET deleted = 1, updated_at = datetime(\'now\') WHERE id = ?', row.id);
    audit(user.id, 'species.delete', 'species', row.id, { slug: row.slug });
    return json(res, 200, { ok: true });
  }

  // ----- zonas -----
  if (method === 'GET' && url.pathname === '/api/zones') {
    return json(res, 200, { zones: all('SELECT * FROM zones ORDER BY sort, id') });
  }
  if (method === 'POST' && url.pathname === '/api/zones') {
    if (needAdmin()) return;
    const slug = lim(body.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '');
    const name_es = lim(body.name_es, 120);
    if (!slug || !name_es) return fail(res, 400, 'invalid', 'Faltan slug o nombre');
    if (get('SELECT 1 x FROM zones WHERE slug = ?', slug)) return fail(res, 409, 'exists', 'Ya existe esa zona');
    const info = run(
      'INSERT INTO zones (slug, name_es, name_en, name_qu, name_ay, description_es, map_x, map_y, color, sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
      slug, name_es, lim(body.name_en, 120) || null, lim(body.name_qu, 120) || null, lim(body.name_ay, 120) || null,
      lim(body.description_es, 1000) || null, Number(body.map_x) || 50, Number(body.map_y) || 50,
      lim(body.color, 20) || '#2d6a4f', Number(body.sort) || 0);
    audit(user.id, 'zone.create', 'zone', info.lastInsertRowid, { slug });
    return json(res, 201, { zone: get('SELECT * FROM zones WHERE id = ?', info.lastInsertRowid) });
  }
  const zoneById = m(/^\/api\/zones\/(\d+)$/);
  if (method === 'PUT' && zoneById) {
    if (needAdmin()) return;
    const row = get('SELECT * FROM zones WHERE id = ?', zoneById[1]);
    if (!row) return fail(res, 404, 'not_found', 'Zona no encontrada');
    const data = {
      name_es: lim(body.name_es, 120) || row.name_es,
      name_en: lim(body.name_en, 120) || null, name_qu: lim(body.name_qu, 120) || null, name_ay: lim(body.name_ay, 120) || null,
      description_es: lim(body.description_es, 1000) || null,
      map_x: Number.isFinite(+body.map_x) ? +body.map_x : row.map_x,
      map_y: Number.isFinite(+body.map_y) ? +body.map_y : row.map_y,
      color: lim(body.color, 20) || row.color,
      sort: Number.isFinite(+body.sort) ? +body.sort : row.sort,
    };
    run(`UPDATE zones SET name_es=@name_es, name_en=@name_en, name_qu=@name_qu, name_ay=@name_ay,
         description_es=@description_es, map_x=@map_x, map_y=@map_y, color=@color, sort=@sort WHERE id=@id`,
      { ...data, id: row.id });
    audit(user.id, 'zone.update', 'zone', row.id, null);
    return json(res, 200, { zone: get('SELECT * FROM zones WHERE id = ?', row.id) });
  }
  if (method === 'DELETE' && zoneById) {
    if (needAdmin()) return;
    const used = get('SELECT COUNT(*) c FROM sightings WHERE zone_id = ?', zoneById[1]).c;
    if (used) return fail(res, 409, 'in_use', `No se puede eliminar: ${used} avistamiento(s) usan esta zona.`);
    run('DELETE FROM zones WHERE id = ?', zoneById[1]);
    audit(user.id, 'zone.delete', 'zone', zoneById[1], null);
    return json(res, 200, { ok: true });
  }

  // ----- avistamientos -----
  if (method === 'GET' && url.pathname === '/api/sightings') {
    // Público: últimos registros (sin correos). Administrador: scope=all (con
    // correos) o scope=mine (los suyos). Usuario con sesión: scope=mine.
    const want = url.searchParams.get('scope');
    let scope = 'recent';
    if (want === 'all') { if (needAdmin()) return; scope = 'all'; }
    else if (want === 'mine' && user) scope = 'mine';
    const cols = `SELECT s.*, z.name_es zone_es, z.name_en zone_en, z.name_qu zone_qu, z.name_ay zone_ay,
                    sp.name_es sp_es, sp.name_en sp_en, sp.name_qu sp_qu, sp.name_ay sp_ay, sp.slug sp_slug,
                    ${scope === 'all' ? 'u.email user_email' : 'NULL user_email'}, ph.filename photo_file, ph.mime photo_mime
               FROM sightings s
               LEFT JOIN zones z ON z.id = s.zone_id
               LEFT JOIN species sp ON sp.id = s.species_id
               ${scope === 'all' ? 'LEFT JOIN users u ON u.id = s.user_id' : ''}
               LEFT JOIN photos ph ON ph.id = s.photo_id`;
    const rows = scope === 'all'
      ? all(`${cols} ORDER BY s.created_at DESC, s.id DESC LIMIT 500`)
      : scope === 'mine'
        ? all(`${cols} WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC LIMIT 500`, user.id)
        : all(`${cols} ORDER BY s.created_at DESC, s.id DESC LIMIT 200`);
    return json(res, 200, {
      scope,
      sightings: rows.map((r) => ({
        public_id: r.public_id, observed_date: r.observed_date, observed_time: r.observed_time,
        animal_type: r.animal_type, behavior: r.behavior, individuals: r.individuals,
        species_name: r.species_name || (r.species_id ? { es: r.sp_es, en: r.sp_en, qu: r.sp_qu, ay: r.sp_ay, slug: r.sp_slug } : null),
        zone: r.zone_id ? { slug: null, es: r.zone_es, en: r.zone_en, qu: r.zone_qu, ay: r.zone_ay } : (r.zone_other ? { free: r.zone_other } : null),
        observer_name: r.observer_name, notes: r.notes, status: r.status,
        has_photo: !!r.photo_id, photo_id: r.photo_id || null, photo_mime: r.photo_mime,
        no_harm: !!r.no_harm, consent: !!r.consent,
        user_email: scope === 'all' ? r.user_email : undefined,
        created_at: r.created_at,
        mine: !!user && r.user_id === user.id,
      })),
    });
  }

  if (method === 'POST' && url.pathname === '/api/sightings') {
    // Público: cualquier visitante puede registrar avistamientos (según el
    // propósito de QR en la Avenida). Se limita por IP si no hay sesión.
    if (!rateLimit(user ? `sight:${user.id}` : `sight:ip:${ip}`, RL.sighting, 3600_000)) return fail(res, 429, 'rate', 'Límite de envíos alcanzado. Inténtalo más tarde.');
    const clientKey = lim(body.clientKey, 80);
    if (!clientKey) return fail(res, 400, 'clientKey', 'Falta el identificador de envío (clientKey).');
    const dup = get('SELECT public_id FROM sightings WHERE client_key = ?', clientKey);
    if (dup) return json(res, 200, { duplicate: true, public_id: dup.public_id, message: 'Este avistamiento ya había sido registrado.' });

    const animalType = String(body.animalType || '');
    const behavior = String(body.behavior || '');
    if (!ANIMAL_TYPES.includes(animalType)) return fail(res, 400, 'animalType', 'Tipo de animal inválido.');
    if (!BEHAVIORS.includes(behavior)) return fail(res, 400, 'behavior', 'Comportamiento inválido.');
    const individuals = Number.parseInt(body.individuals, 10);
    if (!Number.isInteger(individuals) || individuals < 1 || individuals > 100000) return fail(res, 400, 'individuals', 'Cantidad de individuos inválida (1 a 100000).');
    if (!bool(body.noHarm)) return fail(res, 400, 'noHarm', 'Debes confirmar que no molestaste al animal.');
    if (!bool(body.consent)) return fail(res, 400, 'consent', 'Debes dar tu consentimiento de uso del registro.');

    let zoneId = null;
    const zoneOther = lim(body.zoneOther || '', 200);
    if (body.zoneSlug && body.zoneSlug !== 'otra') {
      const z = get('SELECT id FROM zones WHERE slug = ?', String(body.zoneSlug));
      if (!z) return fail(res, 400, 'zone', 'Zona inválida.');
      zoneId = z.id;
    } else if (!zoneOther) {
      return fail(res, 400, 'zone', 'Selecciona una zona o indica “Otra zona”.');
    }

    let speciesId = null;
    let speciesName = null;
    if (body.speciesSlug && body.speciesSlug !== 'no_lo_conozco') {
      const sp = get('SELECT id FROM species WHERE slug = ? AND deleted = 0 AND kind = ?', String(body.speciesSlug), 'fauna');
      if (!sp) return fail(res, 400, 'species', 'Especie inválida.');
      speciesId = sp.id;
    } else if (body.speciesName && body.speciesName !== 'No lo conozco') {
      speciesName = lim(body.speciesName, 120);
      if (!speciesName) return fail(res, 400, 'species', 'Nombre de especie inválido.');
    }

    // Foto opcional (base64) — validada por firma binaria y tamaño
    let photoId = null;
    if (body.photo && body.photo.data) {
      const b64 = String(body.photo.data).replace(/^data:[^,]+,/, '');
      let buf;
      try { buf = Buffer.from(b64, 'base64'); } catch { buf = Buffer.alloc(0); }
      if (buf.length > 8 * 1024 * 1024) return fail(res, 400, 'photo_size', 'La fotografía supera el límite de 8 MB.');
      const sniff = sniffImage(buf);
      if (!sniff) return fail(res, 400, 'photo_type', 'Formato no admitido. Usa JPG, JPEG, PNG o WEBP.');
      if (buf.length < 100) return fail(res, 400, 'photo_empty', 'La fotografía está vacía.');
      const filename = `sight_${Date.now()}_${newToken().slice(0, 10)}.${sniff.ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
      const pi = run('INSERT INTO photos (filename, mime, size, uploaded_by) VALUES (?,?,?,?)', filename, sniff.mime, buf.length, user ? user.id : null);
      photoId = Number(pi.lastInsertRowid);
    }

    // Número de registro único. Con envíos simultáneos (un aula entera) dos
    // peticiones pueden calcular el mismo número: se reintenta con el siguiente.
    let lastErr = null;
    let created = null;
    for (let attempt = 0; attempt < 8 && !created; attempt++) {
      const n = (get('SELECT COUNT(*) c FROM sightings').c || 0) + 1;
      const publicId = `REG-${String(n).padStart(4, '0')}`;
      try {
        const info = run(
          `INSERT INTO sightings (public_id, user_id, animal_type, species_id, species_name, individuals, zone_id, zone_other,
             behavior, photo_id, observed_date, observed_time, observer_name, notes, no_harm, consent, status, client_key)
           VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'),strftime('%H:%M','now','localtime'),?,?,?,?, 'pending', ?)`,
          publicId, user ? user.id : null, animalType, speciesId, speciesName, individuals, zoneId, zoneOther || null,
          behavior, photoId, lim(body.observerName, 120) || null, lim(body.notes, 2000) || null,
          1, 1, clientKey);
        audit(user ? user.id : null, 'sighting.create', 'sighting', info.lastInsertRowid, { public_id: publicId });
        created = publicId;
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) {
          // ¿Es el mismo envío reenviado (idempotencia) u otro que ya tomó el número?
          const again = get('SELECT public_id FROM sightings WHERE client_key = ?', clientKey);
          if (again) return json(res, 200, { duplicate: true, public_id: again.public_id, message: 'Este avistamiento ya había sido registrado.' });
          lastErr = e;
          continue;
        }
        if (photoId) { try { fs.unlinkSync(path.join(UPLOAD_DIR, get('SELECT filename FROM photos WHERE id=?', photoId).filename)); run('DELETE FROM photos WHERE id=?', photoId); } catch {} }
        throw e;
      }
    }
    if (created) return json(res, 201, { ok: true, public_id: created, status: 'pending' });
    if (photoId) { try { fs.unlinkSync(path.join(UPLOAD_DIR, get('SELECT filename FROM photos WHERE id=?', photoId).filename)); run('DELETE FROM photos WHERE id=?', photoId); } catch {} }
    console.error('[WARN] no se pudo asignar número de registro:', lastErr && lastErr.message);
    return fail(res, 503, 'busy', 'Servicio ocupado en este momento. Inténtalo de nuevo.');
  }

  const sightById = m(/^\/api\/sightings\/([^/]+)$/);
  if (method === 'PATCH' && sightById) {
    if (needAdmin()) return;
    const row = get('SELECT * FROM sightings WHERE public_id = ? OR id = ?', sightById[1], sightById[1]);
    if (!row) return fail(res, 404, 'not_found', 'Registro no encontrado');
    const status = String(body.status || '');
    if (!STATUSES.includes(status)) return fail(res, 400, 'status', 'Estado inválido (pending, verified, rejected).');
    run('UPDATE sightings SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', status, row.id);
    audit(user.id, 'sighting.status', 'sighting', row.id, { from: row.status, to: status, public_id: row.public_id });
    return json(res, 200, { ok: true, status });
  }

  // ----- estadísticas -----
  if (method === 'GET' && url.pathname === '/api/stats') return json(res, 200, { stats: computeStats() });

  // ----- exportación CSV (solo administrador) -----
  if (method === 'GET' && url.pathname === '/api/export/sightings.csv') {
    if (needAdmin()) return;
    const rows = all(`SELECT s.*, z.name_es zone_es, COALESCE(sp.name_es, s.species_name, 'Sin identificar') sp_name,
                             u.email user_email
                        FROM sightings s
                        LEFT JOIN zones z ON z.id = s.zone_id
                        LEFT JOIN species sp ON sp.id = s.species_id
                        LEFT JOIN users u ON u.id = s.user_id
                       ORDER BY s.id`);
    const csv = toCsv(rows, [
      { label: 'Numero de registro', get: (r) => r.public_id },
      { label: 'Fecha', get: (r) => r.observed_date },
      { label: 'Hora', get: (r) => r.observed_time },
      { label: 'Especie', get: (r) => r.sp_name },
      { label: 'Tipo de animal', get: (r) => r.animal_type },
      { label: 'Cantidad de individuos', get: (r) => r.individuals },
      { label: 'Zona', get: (r) => r.zone_es || r.zone_other || '' },
      { label: 'Comportamiento', get: (r) => r.behavior },
      { label: 'Estado de verificacion', get: (r) => r.status },
      { label: 'Observador', get: (r) => r.observer_name || '' },
      { label: 'Observaciones', get: (r) => r.notes || '' },
      { label: 'Correo del usuario', get: (r) => r.user_email || '' },
      { label: 'Creado (UTC)', get: (r) => r.created_at },
    ]);
    audit(user.id, 'export.csv', 'sightings', null, { rows: rows.length });
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="biosmart_avistamientos_${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return res.end(csv);
  }

  // ----- fotografías de avistamientos (solo administrador: revisión) -----
  const photoReq = m(/^\/api\/photos\/(\d+)$/);
  if (method === 'GET' && photoReq) {
    if (needAdmin()) return;
    const ph = get('SELECT * FROM photos WHERE id = ?', photoReq[1]);
    if (!ph || !fs.existsSync(path.join(UPLOAD_DIR, ph.filename))) return fail(res, 404, 'not_found', 'Foto no encontrada');
    const data = fs.readFileSync(path.join(UPLOAD_DIR, ph.filename));
    res.writeHead(200, { 'Content-Type': ph.mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=3600' });
    return res.end(data);
  }

  // ----- archivos subidos por administrador (fichas) -----
  const fileReq = m(/^\/api\/files\/([A-Za-z0-9._-]+)$/);
  if (method === 'GET' && fileReq) {
    const name = fileReq[1];
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return fail(res, 400, 'bad', 'Ruta inválida');
    const full = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(full)) return fail(res, 404, 'not_found', 'Archivo no encontrado');
    const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const data = fs.readFileSync(full);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=3600' });
    return res.end(data);
  }

  if (method === 'POST' && url.pathname === '/api/upload') {
    if (needAdmin()) return;
    const b64 = String((body.photo && body.photo.data) || '').replace(/^data:[^,]+,/, '');
    let buf; try { buf = Buffer.from(b64, 'base64'); } catch { buf = Buffer.alloc(0); }
    if (buf.length > 8 * 1024 * 1024) return fail(res, 400, 'size', 'La imagen supera 8 MB.');
    const sniff = sniffImage(buf);
    if (!sniff) return fail(res, 400, 'type', 'Formato no admitido. Usa JPG, JPEG, PNG o WEBP.');
    const filename = `sp_${Date.now()}_${newToken().slice(0, 8)}.${sniff.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
    audit(user.id, 'upload', 'file', filename, { size: buf.length });
    return json(res, 201, { file: filename, upload: true, mime: sniff.mime });
  }

  // ----- traducciones (para revisión de hablantes) -----
  if (method === 'GET' && url.pathname === '/api/translations') {
    const rows = all('SELECT key, lang, value FROM translations');
    const out = {};
    for (const r of rows) { out[r.key] = out[r.key] || {}; out[r.key][r.lang] = r.value; }
    return json(res, 200, { translations: out });
  }
  const trReq = m(/^\/api\/translations\/([a-z0-9_.-]{1,80})\/(es|en|qu|ay)$/);
  if (method === 'PUT' && trReq) {
    if (needAdmin()) return;
    const [, key, lang] = trReq;
    const value = lim(body.value, 1000);
    if (body.value === '') run('DELETE FROM translations WHERE key = ? AND lang = ?', key, lang);
    else run(`INSERT INTO translations (key, lang, value, updated_by, updated_at)
              VALUES (?,?,?,?,datetime('now'))
              ON CONFLICT(key, lang) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
      key, lang, value, user.id);
    audit(user.id, 'translation.set', 'translation', `${key}:${lang}`, { value: value.slice(0, 80) });
    return json(res, 200, { ok: true });
  }

  // ----- administración de usuarios -----
  if (method === 'GET' && url.pathname === '/api/admin/users') {
    if (needAdmin()) return;
    const rows = all(
      `SELECT u.id, u.email, u.role, u.display_name, u.lang, u.active, u.created_at, u.last_login,
              (SELECT COUNT(*) FROM sightings s WHERE s.user_id = u.id) sightings
         FROM users u ORDER BY u.created_at`);
    return json(res, 200, { users: rows.map((r) => ({ ...r, active: !!r.active })) });
  }
  const userReq = m(/^\/api\/admin\/users\/(\d+)$/);
  if (method === 'PATCH' && userReq) {
    if (needAdmin()) return;
    const target = get('SELECT * FROM users WHERE id = ?', userReq[1]);
    if (!target) return fail(res, 404, 'not_found', 'Usuario no encontrado');
    const changes = {};
    if (body.role !== undefined) {
      if (!['admin', 'user'].includes(body.role)) return fail(res, 400, 'role', 'Rol inválido');
      if (target.id === user.id && body.role !== 'admin') return fail(res, 409, 'self', 'No puedes quitar tu propio rol de administrador.');
      if (body.role === 'admin' && target.role !== 'admin') {
        const admins = get("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").c;
        if (admins < 1) return fail(res, 409, 'last', 'Debe quedar al menos un administrador activo.');
      }
      run('UPDATE users SET role = ? WHERE id = ?', body.role, target.id);
      changes.role = body.role;
    }
    if (body.active !== undefined) {
      if (target.id === user.id && !bool(body.active)) return fail(res, 409, 'self', 'No puedes desactivar tu propia cuenta.');
      const admins = get("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").c;
      if (target.role === 'admin' && !bool(body.active) && admins < 2) return fail(res, 409, 'last', 'Debe quedar al menos un administrador activo.');
      run('UPDATE users SET active = ? WHERE id = ?', bool(body.active) ? 1 : 0, target.id);
      changes.active = bool(body.active);
      if (!changes.active) run('DELETE FROM sessions WHERE user_id = ?', target.id);
    }
    if (body.display_name !== undefined) {
      run('UPDATE users SET display_name = ? WHERE id = ?', lim(body.display_name, 120) || null, target.id);
      changes.display_name = true;
    }
    audit(user.id, 'user.update', 'user', target.id, changes);
    return json(res, 200, { ok: true });
  }
  const resetReq = m(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (method === 'POST' && resetReq) {
    if (needAdmin()) return;
    const target = get('SELECT * FROM users WHERE id = ?', resetReq[1]);
    if (!target) return fail(res, 404, 'not_found', 'Usuario no encontrado');
    if (!validatePassword(body.password)) return fail(res, 400, 'password', `La contraseña temporal debe tener al menos ${PASSWORD_MIN} caracteres.`);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.password), target.id);
    run('DELETE FROM sessions WHERE user_id = ?', target.id);
    audit(user.id, 'user.reset_password', 'user', target.id, null);
    return json(res, 200, { ok: true, message: 'Contraseña restablecida y sesiones cerradas.' });
  }

  // ----- auditoría -----
  if (method === 'GET' && url.pathname === '/api/admin/audit') {
    if (needAdmin()) return;
    const rows = all(
      `SELECT a.*, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT 300`);
    return json(res, 200, { audit: rows });
  }

  return false; // no gestionado
}

module.exports = { handleApi, computeStats };
