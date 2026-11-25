/* ============================================================
   BIOSMART QR — Aplicación principal (SPA sin dependencias)
   Pantallas: autenticación, menú, flora, fauna, fichas,
   formulario de avistamiento, estadísticas y panel admin.
   Navegación SOLO por botones (rutas hash). Scroll interno.
   ============================================================ */
'use strict';

/* ---------------- utilidades ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const app = $('#app');

function toast(msg, isErr) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' error' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = $('.modal-back', root);
  back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
  return root;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ¿La sesión activa es de administrador? (los visitantes navegan sin sesión) */
function isAdminUser() { return !!(S.user && S.user.role === 'admin'); }

/* Localización de objetos multilingües {es,en,qu,ay} o texto plano */
const L = (o) => {
  if (!o) return '';
  if (typeof o === 'string') return o;
  return o[getLang()] || o.es || o.free || '';
};
const LZone = (z) => (z ? (z['name_' + getLang()] || z.name_es || z.slug || '') : '');
const fieldLabel = (k) => { const key = 'field.' + k; const v = t(key); return v === key ? String(k).replace(/_/g, ' ') : v; };
const eduLabel = (k) => { const key = 'edu.' + k; const v = t(key); return v === key ? String(k).replace(/_/g, ' ') : v; };
const imgSrc = (im) => (im.upload ? '/api/files/' + encodeURIComponent(im.file) : '/img/' + encodeURIComponent(im.file));
const kindIcon = (kind) => (kind === 'flora' ? '🌿' : '🦋');

/* ---------------- estado ---------------- */
function freshForm() {
  return { photo: null, photoName: '', clientKey: uuid(), result: null };
}
const S = {
  user: null,
  setup: false,
  draft: {},
  species: { flora: null, fauna: null },
  zones: null,
  filter: 'all',
  form: freshForm(),
  stats: null,
  sightings: null,
  scope: 'mine',
};

/* ---------------- captura/restauración de formularios ----------------
   Permite cambiar de idioma o de pestaña sin perder lo escrito. */
function captureForm() {
  const out = {};
  const radios = new Set();
  $$('#app [name]').forEach((el) => {
    if (el.type === 'file') return;
    if (el.type === 'radio') { radios.add(el.name); if (el.checked) out[el.name] = el.value; return; }
    if (el.type === 'checkbox') { out[el.name] = el.checked; return; }
    out[el.name] = el.value;
  });
  radios.forEach((n) => { if (!(n in out)) out[n] = null; });
  return out;
}
function restoreForm(snap) {
  $$('#app [name]').forEach((el) => {
    if (!(el.name in snap) || el.type === 'file') return;
    const v = snap[el.name];
    if (el.type === 'radio') el.checked = v === el.value;
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
}

/* ---------------- barra superior ---------------- */
function langSelect() {
  return LANGS.map((l) => `<option value="${l.code}"${l.code === getLang() ? ' selected' : ''}>${esc(l.label)}</option>`).join('');
}
function topbar() {
  const admin = isAdminUser();
  return `
  <header class="topbar">
    <div class="brand"><span class="logo" aria-hidden="true">🌱</span>
      <div>BIOSMART QR<small>${esc(t('app.subtitle'))}</small></div></div>
    <div class="topbar-spacer"></div>
    <div class="topbar-actions">
      <select class="lang-select" id="lang-select" aria-label="${esc(t('lang.label'))}">${langSelect()}</select>
      <button class="tb-btn${admin ? ' solid' : ''}" data-go="#/admin"><span aria-hidden="true">⚙</span><span class="tb-label">${esc(t('nav.admin'))}</span></button>
      ${admin ? `<div class="user-chip"><span class="u-mail">${esc(S.user.display_name || S.user.email)}</span><span class="u-role">admin</span></div>
      <button class="tb-btn solid" id="btn-logout"><span aria-hidden="true">⏻</span><span class="tb-label">${esc(t('nav.logout'))}</span></button>` : ''}
    </div>
  </header>
  ${needsReview() ? `<div class="review-banner" role="note">${esc(t('review.banner'))}</div>` : ''}`;
}
const backBar = () => `<div class="back-bar"><button class="back-menu-btn" data-go="#/">← ${esc(t('nav.back_menu'))}</button></div>`;
const backBarBottom = () => `<button class="back-menu-btn bottom" data-go="#/">← ${esc(t('nav.back_menu'))}</button>`;

/* ============================================================
   PUERTA DE ADMINISTRACIÓN (solo contraseña; el público no la ve)
   ============================================================ */
function viewAdminGate() {
  return `${backBar()}
  <div class="gate-wrap">
    <div class="gate-card">
      <div class="auth-brand"><span class="logo" aria-hidden="true">🌱</span> ${esc(t('auth.brand'))}</div>
      <h2>${esc(t('admin.gate.title'))}</h2>
      <p class="sub">${esc(t('admin.gate.sub'))}</p>
      <form class="auth-form" id="admin-gate-form" novalidate>
        <div class="field"><label for="gate-pass">${esc(t('admin.gate.password'))} <span class="req">*</span></label>
          <input class="input" type="password" id="gate-pass" name="password" autocomplete="current-password" placeholder="${esc(t('admin.gate.ph'))}" required></div>
        <div id="gate-err"></div>
        <button class="btn big" type="submit">${esc(t('admin.gate.button'))}</button>
      </form>
    </div>
  </div>
  ${backBarBottom()}`;
}

function gateError(msg) {
  const box = $('#gate-err');
  if (box) box.innerHTML = `<div class="alert error" role="alert">${esc(msg)}</div>`;
}

function bindAdminGate() {
  const form = $('#admin-gate-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#gate-pass').value;
    const btn = form.querySelector('button[type="submit"]');
    if (!password) return gateError(t('admin.gate.error'));
    btn.disabled = true;
    try {
      const r = await API.unlock(password);
      S.user = r.user;
      S.setup = false;
      S.draft = {};
      await loadShared();
      toast('✓ ' + t('admin.gate.ok'));
      location.hash = '#/admin';
      render();
    } catch (err) {
      gateError(err.message || t('admin.gate.error'));
      btn.disabled = false;
    }
  });
}

async function doLogout() {
  try { await API.logout(); } catch { /* la sesión ya no existe */ }
  S.user = null;
  S.stats = null; S.sightings = null; S.scope = 'mine';
  S.species = { flora: null, fauna: null }; S.zones = null;
  location.hash = '#/';
  loadShared().finally(() => render());
}

/* ============================================================
   MENÚ PRINCIPAL (4 módulos)
   ============================================================ */
function menuCard(go, icon, titleKey, descKey) {
  return `<button class="menu-card" data-go="${go}" type="button">
    <span class="m-qr" aria-hidden="true">QR</span>
    <span class="m-icon" aria-hidden="true">${icon}</span>
    <span class="m-body" style="display:block">
      <h2>${esc(t(titleKey))}</h2>
      <p>${esc(t(descKey))}</p>
      <span class="m-go" aria-hidden="true">→</span>
    </span>
  </button>`;
}
function viewMenu() {
  const admin = isAdminUser();
  return `
  <div class="menu-hero">
    <h1>BIOSMART <span>QR</span></h1>
    <p>${esc(t('app.subtitle'))}</p>
    <p style="font-size:.9rem;color:#40916c">${esc(t('app.project'))}</p>
  </div>
  <p class="menu-hint">${esc(t('menu.hint'))}</p>
  <div class="menu-grid">
    ${menuCard('#/flora', '🌿', 'menu.flora', 'menu.flora.desc')}
    ${menuCard('#/fauna', '🦋', 'menu.fauna', 'menu.fauna.desc')}
    ${menuCard('#/sighting', '📝', 'menu.sighting', 'menu.sighting.desc')}
    ${menuCard('#/stats', '📊', 'menu.stats', 'menu.stats.desc')}
  </div>
  <p class="menu-hint">${esc(t('menu.foot'))}</p>`;
}

/* ============================================================
   CATÁLOGOS (flora / fauna)
   ============================================================ */
const FAUNA_FILTERS = [
  ['all', 'cat.filter.all'],
  ['aves', 'cat.filter.aves'],
  ['mamiferos', 'cat.filter.mamiferos'],
  ['reptiles', 'cat.filter.reptiles'],
  ['mariposas', 'cat.filter.mariposas'],
  ['insectos', 'cat.filter.insectos'],
  ['polinizadores', 'cat.filter.polinizadores'],
];
function matchFilter(sp, f) {
  if (f === 'all') return true;
  if (f === 'polinizadores') return !!sp.pollinator;
  const c = (sp.category || '').toLowerCase();
  if (f === 'aves') return c.startsWith('ave');
  if (f === 'mamiferos') return c.startsWith('mam');
  if (f === 'reptiles') return c.startsWith('rept') || c.startsWith('anfib');
  if (f === 'mariposas') return c.startsWith('mariposa');
  if (f === 'insectos') return c.startsWith('insecto');
  return true;
}
function statusBadge(sp) {
  const map = { referida: 'cat.status.referida', potencial: 'cat.status.potencial', pendiente: 'cat.status.pendiente' };
  return `<span class="badge ${esc(sp.status)}">${esc(t(map[sp.status] || 'cat.status.potencial'))}</span>`;
}
function spCard(sp) {
  const name = L(sp.name) || sp.name_es;
  const im = sp.images && sp.images[0];
  return `<button class="species-card" data-go="#/${sp.kind}/${esc(sp.slug)}" type="button">
    <span class="sp-photo">${im ? `<img src="${esc(imgSrc(im))}" alt="${esc(name)}" loading="lazy">` : ''}
      ${statusBadge(sp)}</span>
    <span class="sp-info">
      <span class="sp-name">${esc(name)}</span>
      <span class="sp-sci">${esc(sp.scientific)}</span>
      ${sp.confirmedHere ? `<span class="badge confirmed">${esc(t('cat.badge.confirmed'))}</span>` : ''}
    </span>
  </button>`;
}
function viewCatalog(kind) {
  const list = S.species[kind];
  const isFauna = kind === 'fauna';
  if (!list) {
    return `${backBar()}
      <div class="module-head"><h1>${kindIcon(kind)} ${esc(t(kind === 'flora' ? 'cat.flora.title' : 'cat.fauna.title'))}</h1></div>
      <div class="species-grid">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
  }
  const shown = isFauna ? list.filter((sp) => matchFilter(sp, S.filter)) : list;
  return `
  ${backBar()}
  <div class="module-head">
    <h1>${kindIcon(kind)} ${esc(t(kind === 'flora' ? 'cat.flora.title' : 'cat.fauna.title'))}</h1>
    <p>${esc(t(kind === 'flora' ? 'cat.flora.sub' : 'cat.fauna.sub'))}</p>
  </div>
  ${isFauna ? `<div class="chips" role="group" aria-label="${esc(t('cat.filter'))}">
    ${FAUNA_FILTERS.map(([v, k]) => `<button type="button" class="chip" data-filter="${v}" aria-pressed="${S.filter === v}">${esc(t(k))}</button>`).join('')}
  </div>` : ''}
  ${shown.length
    ? `<div class="species-grid">${shown.map(spCard).join('')}</div>`
    : `<div class="center-state"><div class="cs-ico">🔍</div><p>${esc(t('cat.empty'))}</p></div>`}
  ${backBarBottom()}`;
}

/* ============================================================
   FICHA DE ESPECIE
   ============================================================ */
function fItem(label, value) {
  if (!value) return '';
  return `<div class="f-item"><div class="f-label">${esc(label)}</div><div class="f-value">${esc(value)}</div></div>`;
}
function viewFicha(kind, slug) {
  const list = S.species[kind];
  const sp = list && list.find((x) => x.slug === slug);
  const head = `<div class="back-bar">
      <button class="back-menu-btn" data-go="#/${kind}">‹ ${esc(t('cat.detail.back'))}</button>
      <button class="back-menu-btn" data-go="#/">← ${esc(t('nav.back_menu'))}</button>
    </div>`;
  if (!list) return `${head}<div class="skeleton" style="height:320px"></div>`;
  if (!sp) {
    return `${head}<div class="center-state"><div class="cs-ico">🧐</div>
      <p>${esc(t('cat.empty'))}</p></div>${backBarBottom()}`;
  }
  const name = L(sp.name) || sp.name_es;
  const im = sp.images && sp.images[0];
  const en = getLang() === 'en';
  const val = (x) => (en && x.en ? x.en : x.es);
  const sources = sp.sources && (en && sp.sources.en ? sp.sources.en : sp.sources.es);
  const note = sp.note && (en && sp.note.en ? sp.note.en : sp.note.es);
  return `
  ${head}
  <div class="ficha">
    <div class="ficha-hero">
      <div class="ficha-photo">${im ? `<img src="${esc(imgSrc(im))}" alt="${esc(name)}">` : ''}</div>
      <div class="ficha-title">
        <h2>${kindIcon(kind)} ${esc(name)}</h2>
        <div class="sci">${esc(sp.scientific)}</div>
        <div class="meta">
          ${statusBadge(sp)}
          ${sp.confirmedHere ? `<span class="badge confirmed">${esc(t('cat.badge.confirmed'))}</span>` : ''}
          ${sp.family ? `<span class="pill">${esc(t('cat.family'))}: ${esc(sp.family)}</span>` : ''}
          ${sp.category ? `<span class="pill">${esc(t('cat.category'))}: ${esc(sp.category)}</span>` : ''}
          ${sp.alias ? `<span class="pill">${esc(t('cat.alias'))}: ${esc(sp.alias)}</span>` : ''}
          ${sp.pollinator ? `<span class="pill">🐝 ${esc(t('cat.filter.polinizadores'))}</span>` : ''}
          <span class="pill">${sp.sightings} ${esc(t('cat.sightings_n'))}</span>
        </div>
      </div>
    </div>
    ${note ? `<div class="ficha-note"><strong>⚠ ${esc(t('cat.note'))}:</strong> ${esc(note)}</div>` : ''}
    <div class="ficha-sections">
      <section class="f-section"><h3>📖 ${esc(t('cat.sections'))}</h3>
        <div class="f-grid">${(sp.fields || []).map((f) => fItem(fieldLabel(f.k), val(f))).join('')}</div></section>
      ${(sp.edu || []).length ? `<section class="f-section"><h3>💡 ${esc(t('cat.edu'))}</h3>
        <div class="f-grid">${sp.edu.map((f) => fItem(eduLabel(f.k), val(f))).join('')}</div></section>` : ''}
      ${(sp.images || []).length ? `<section class="f-section"><h3>📷 ${esc(t('cat.images'))}</h3>
        <div class="gallery">${sp.images.map((x) => `
          <figure><img src="${esc(imgSrc(x))}" alt="${esc(name)}" loading="lazy">
            <figcaption>${esc(t('cat.credit'))} ${esc(x.author || '—')} · ${esc(x.license || '—')}
              ${x.source ? `· <a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">Wikimedia</a>` : ''}</figcaption>
          </figure>`).join('')}</div></section>` : ''}
      ${sources ? `<section class="f-section"><h3>📚 ${esc(t('cat.sources'))}</h3>
        <p class="sources">${esc(sources)}</p></section>` : ''}
    </div>
  </div>
  ${backBarBottom()}`;
}

/* ============================================================
   CROQUIS (zona de la Avenida Ecológica — sin coordenadas exactas)
   ============================================================ */
function croquisSVG(zones, opts = {}) {
  const { selected = null, counts = null, interactive = false } = opts;
  const cards = zones.map((z) => {
    const cx = 8 + (Number(z.map_x) || 50) * 0.84;   // 8..92
    const cy = 10 + (Number(z.map_y) || 50) * 0.38;  // 10..48
    const x = Math.min(Math.max(cx - 14, 2), 70);
    const y = Math.min(Math.max(cy - 7, 2), 44);
    const label = (LZone(z) || z.slug || '').slice(0, 17);
    const n = counts && counts[z.slug] != null ? counts[z.slug] : null;
    const sel = selected && selected === z.slug ? ' sel' : '';
    return `<g class="cz${sel}" data-slug="${esc(z.slug)}"${interactive ? ' role="button" tabindex="0"' : ''}>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="28" height="14" rx="3"
            fill="${z.color || '#ffffff'}" fill-opacity="0.9" stroke="#1b4332" stroke-width="1.1"/>
      <text x="${(x + 14).toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="middle">${esc(label)}</text>
      ${n != null ? `<text class="cz-count" x="${(x + 14).toFixed(1)}" y="${(y + 11).toFixed(1)}" text-anchor="middle">${n} ${esc(t('stats.map.count'))}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="croquis" viewBox="0 0 100 60" role="img" aria-label="${esc(t('stats.map.title'))}">
    <rect x="1" y="1" width="98" height="58" rx="5" fill="#d8f3dc" stroke="#95d5b2" stroke-width="1"/>
    <path d="M3 50 Q 30 44 52 32 T 97 12" stroke="#e7dca8" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M3 50 Q 30 44 52 32 T 97 12" stroke="#ffffff" stroke-width="0.6" stroke-dasharray="2.5 2.5" fill="none"/>
    <text x="4" y="57.5" font-size="2.7" fill="#2d6a4f" font-weight="700">Avenida Ecológica de Chabám · Tiquipaya</text>
    ${cards}
  </svg>`;
}

/* ============================================================
   FORMULARIO DE AVISTAMIENTO
   ============================================================ */
const ANIMAL_TYPES = ['ave', 'insecto', 'mamifero', 'reptil_anfibio', 'otro', 'no_identificado'];
const BEHAVIORS = ['alimentandose', 'volando', 'descansando', 'anidando', 'interactuando', 'otro', 'no_identificado'];

const opt = (id, name, value, label) =>
  `<label class="opt" for="${id}"><input type="radio" name="${name}" id="${id}" value="${value}"><span>${esc(label)}</span></label>`;

function viewSighting() {
  if (S.form.result) {
    const r = S.form.result;
    return `${backBar()}
      <div class="alert success" style="margin-top:20px" role="status">
        <div>
          <strong>${esc(t('form.success.title'))}</strong>
          <p>${esc(t('form.success.text'))}</p>
          <p>${esc(t('form.success.id'))} <strong>${esc(r.public_id)}</strong></p>
          <p>${esc(t('form.success.pending'))}</p>
        </div>
      </div>
      <div class="back-bar">
        <button class="btn" id="again-btn" type="button">＋ ${esc(t('form.success.again'))}</button>
        <button class="btn ghost" data-go="#/stats" type="button">📊 ${esc(t('form.success.stats'))}</button>
      </div>
      ${backBarBottom()}`;
  }
  const zones = S.zones || [];
  const fauna = S.species.fauna || [];
  const now = new Date();
  return `
  ${backBar()}
  <div class="module-head"><h1>📝 ${esc(t('form.title'))}</h1><p>${esc(t('form.sub'))}</p></div>
  <div class="form-progress" aria-hidden="true">${'<span class="fp"></span>'.repeat(6)}</div>
  <div id="sight-alert"></div>
  <form id="sight-form" novalidate>
    <div class="q-card"><h3><span class="q-num">1</span><span>${esc(t('form.q1'))} <span class="req">*</span></span></h3>
      <div class="opt-grid">${ANIMAL_TYPES.map((v) => opt('q1-' + v, 'animalType', v, t('form.q1.' + v))).join('')}</div>
    </div>

    <div class="q-card"><h3><span class="q-num">2</span><span>${esc(t('form.q2'))}</span></h3>
      <div class="opt-grid">
        ${opt('q2-cat', 'knowMode', 'catalog', t('form.q2.catalog'))}
        ${opt('q2-wr', 'knowMode', 'write', t('form.q2.write'))}
        ${opt('q2-unk', 'knowMode', 'unknown', t('form.q2.unknown'))}
      </div>
      <div class="field-row" style="margin-top:14px">
        <div class="field" id="q2-panel-cat">
          <label for="speciesSlug">${esc(t('cat.select'))}</label>
          <select class="input" id="speciesSlug" name="speciesSlug">
            <option value="">—</option>
            ${fauna.map((sp) => `<option value="${esc(sp.slug)}">${esc(L(sp.name) || sp.name_es)} (${esc(sp.scientific)})</option>`).join('')}
          </select>
        </div>
        <div class="field ${''}" id="q2-panel-write" hidden>
          <label for="speciesName">${esc(t('form.q2.write'))}</label>
          <input class="input" type="text" id="speciesName" name="speciesName" maxlength="120" placeholder="${esc(t('form.q2.write_ph'))}">
        </div>
      </div>
    </div>

    <div class="q-card"><h3><span class="q-num">3</span><span>${esc(t('form.q3'))} <span class="req">*</span></span></h3>
      <p class="q-hint">${esc(t('form.q3.hint'))}</p>
      <div class="field-row"><div class="field">
        <input class="input" type="number" id="individuals" name="individuals" min="1" max="100000" step="1" inputmode="numeric" placeholder="1">
      </div></div>
    </div>

    <div class="q-card"><h3><span class="q-num">4</span><span>${esc(t('form.q4'))} <span class="req">*</span></span></h3>
      <div class="field-row"><div class="field">
        <label for="zoneSelect">${esc(t('stats.zone'))}</label>
        <select class="input" id="zoneSelect" name="zoneSlug">
          <option value="">—</option>
          ${zones.filter((z) => z.slug !== 'otra').map((z) => `<option value="${esc(z.slug)}">${esc(LZone(z))}</option>`).join('')}
          <option value="otra">${esc(t('form.q4.other'))}</option>
        </select>
      </div></div>
      <div class="field" id="zone-other-wrap" hidden style="margin-top:12px">
        <label for="zoneOther">${esc(t('form.q4.other'))}</label>
        <input class="input" type="text" id="zoneOther" name="zoneOther" maxlength="200" placeholder="${esc(t('form.q4.other_ph'))}">
      </div>
      <div class="croquis-box">
        <h4>${esc(t('form.q4.map_hint'))}</h4>
        ${croquisSVG(zones.filter((z) => z.slug !== 'otra'), { selected: null, interactive: true })}
      </div>
    </div>

    <div class="q-card"><h3><span class="q-num">5</span><span>${esc(t('form.q5'))} <span class="req">*</span></span></h3>
      <div class="opt-grid">${BEHAVIORS.map((v) => opt('q5-' + v, 'behavior', v, t('form.q5.' + v))).join('')}</div>
    </div>

    <div class="q-card"><h3><span class="q-num">6</span><span>${esc(t('form.q6'))}</span></h3>
      <p class="q-hint">${esc(t('form.q6.hint'))}</p>
      <div class="photo-box">
        <div class="ph-ico" aria-hidden="true">🖼️</div>
        <div class="photo-actions">
          <button type="button" class="btn soft" id="pick-gallery">${esc(t('form.photo.gallery'))}</button>
          <button type="button" class="btn soft" id="pick-camera">${esc(t('form.photo.camera'))}</button>
        </div>
        <input type="file" id="photo-file" class="hidden" accept="image/jpeg,image/png,image/webp">
        <input type="file" id="photo-cam" class="hidden" accept="image/jpeg,image/png,image/webp" capture="environment">
        <div class="photo-error hidden" id="photo-err" role="alert"></div>
        <div class="photo-preview ${S.form.photo ? 'show' : ''}" id="photo-preview">
          <img id="photo-img" src="${S.form.photo ? esc(S.form.photo) : ''}" alt="">
          <div class="photo-meta"><span id="photo-name">${esc(S.form.photoName)}</span>
            <span class="row-actions">
              <button type="button" class="btn small ghost" id="photo-change">${esc(t('form.photo.change'))}</button>
              <button type="button" class="btn small danger" id="photo-remove">${esc(t('form.photo.remove'))}</button>
            </span></div>
        </div>
      </div>
    </div>

    <div class="q-card">
      <div class="auto-fields">
        <span class="auto-field">🕒 ${esc(t('form.auto'))}: <span id="auto-dt">${esc(now.toLocaleString())}</span></span>
      </div>
      <div class="field-row" style="margin-top:14px">
        <div class="field"><label for="observer">${esc(t('form.observer'))}</label>
          <input class="input" type="text" id="observer" name="observerName" maxlength="120" placeholder="${esc(t('form.observer.ph'))}"></div>
        <div class="field"><label for="notes">${esc(t('form.notes'))} <span class="help-inline">(${esc(t('common.optional'))})</span></label>
          <textarea class="input" id="notes" name="notes" maxlength="2000" placeholder="${esc(t('form.notes.ph'))}"></textarea></div>
      </div>
      <div class="check-line"><input type="checkbox" id="noharm" name="noHarm"><label for="noharm">${esc(t('form.noharm'))} <span class="req">*</span></label></div>
      <div class="check-line"><input type="checkbox" id="consent" name="consent"><label for="consent">${esc(t('form.consent'))} <span class="req">*</span></label></div>
    </div>

    <button class="btn big" type="submit" id="submit-sight">📤 ${esc(t('form.submit'))}</button>
    <p class="menu-hint" style="padding-top:10px">${esc(t('form.sub'))}</p>
  </form>
  ${backBarBottom()}`;
}

function q2Answered() {
  const mode = (document.querySelector('#sight-form [name="knowMode"]:checked') || {}).value || 'catalog';
  if (mode === 'unknown') return true;
  if (mode === 'write') return !!($('#speciesName') && $('#speciesName').value.trim());
  return !!($('#speciesSlug') && $('#speciesSlug').value);
}
function updateProgress() {
  const answered = [
    !!document.querySelector('#sight-form [name="animalType"]:checked'),
    q2Answered(),
    Number(($('#individuals') || {}).value || 0) >= 1,
    !!(($('#zoneSelect') || {}).value),
    !!document.querySelector('#sight-form [name="behavior"]:checked'),
    !!S.form.photo,
  ];
  $$('.form-progress .fp').forEach((el, i) => el.classList.toggle('done', !!answered[i]));
}
function syncKnowMode() {
  const mode = (document.querySelector('#sight-form [name="knowMode"]:checked') || {}).value || 'catalog';
  const cat = $('#q2-panel-cat'); const wr = $('#q2-panel-write');
  if (cat) cat.hidden = mode !== 'catalog';
  if (wr) wr.hidden = mode !== 'write';
}
function showSightError(msg) {
  const box = $('#sight-alert');
  if (!box) return;
  box.innerHTML = `<div class="alert error" role="alert">${esc(msg)}</div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindSighting() {
  const again = $('#again-btn');
  if (again) {
    again.addEventListener('click', () => { S.form = freshForm(); render(); });
    return;
  }
  const form = $('#sight-form');
  if (!form) return;

  form.addEventListener('input', updateProgress);
  form.addEventListener('change', (e) => {
    updateProgress();
    if (e.target.name === 'knowMode') syncKnowMode();
    if (e.target.id === 'zoneSelect') {
      const other = $('#zone-other-wrap');
      if (other) other.hidden = e.target.value !== 'otra';
      $$('.croquis .cz').forEach((g) => g.classList.toggle('sel', g.dataset.slug === e.target.value));
    }
  });
  syncKnowMode();
  updateProgress();

  // Selección de zona tocando el croquis
  $$('.croquis .cz').forEach((g) => {
    const pick = () => {
      const sel = $('#zoneSelect');
      if (!sel) return;
      sel.value = g.dataset.slug;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sel.focus({ preventScroll: true });
    };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });

  // Fotografía
  const errBox = $('#photo-err');
  const setPhoto = async (file) => {
    errBox.classList.add('hidden');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      errBox.textContent = t('form.photo.invalid'); errBox.classList.remove('hidden'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      errBox.textContent = t('form.photo.toobig'); errBox.classList.remove('hidden'); return;
    }
    try {
      S.form.photo = await compressImage(file, 1600, 0.86);
      S.form.photoName = file.name;
      $('#photo-img').src = S.form.photo;
      $('#photo-name').textContent = file.name;
      $('#photo-preview').classList.add('show');
      updateProgress();
    } catch (err) {
      errBox.textContent = err.message; errBox.classList.remove('hidden');
    }
  };
  $('#pick-gallery').addEventListener('click', () => $('#photo-file').click());
  $('#pick-camera').addEventListener('click', () => $('#photo-cam').click());
  $('#photo-file').addEventListener('change', (e) => setPhoto(e.target.files[0]));
  $('#photo-cam').addEventListener('change', (e) => setPhoto(e.target.files[0]));
  $('#photo-change').addEventListener('click', () => $('#photo-file').click());
  $('#photo-remove').addEventListener('click', () => {
    S.form.photo = null; S.form.photoName = '';
    $('#photo-preview').classList.remove('show');
    $('#photo-img').removeAttribute('src');
    $('#photo-file').value = ''; $('#photo-cam').value = '';
    updateProgress();
  });

  // Envío: NADA se guarda hasta que el servidor confirme
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const animalType = (document.querySelector('[name="animalType"]:checked') || {}).value;
    const behavior = (document.querySelector('[name="behavior"]:checked') || {}).value;
    const individuals = Number.parseInt(($('#individuals') || {}).value, 10);
    const zoneSlug = ($('#zoneSelect') || {}).value;
    const noHarm = $('#noharm').checked;
    const consent = $('#consent').checked;
    const mode = (document.querySelector('[name="knowMode"]:checked') || {}).value || 'catalog';

    if (!animalType || !behavior) return showSightError(t('form.required'));
    if (!Number.isInteger(individuals) || individuals < 1) return showSightError(t('form.err.individuals'));
    if (!zoneSlug) return showSightError(t('form.required'));
    if (zoneSlug === 'otra' && !$('#zoneOther').value.trim()) return showSightError(t('form.required'));
    if (!noHarm || !consent) return showSightError(t('form.consent_required'));

    const payload = {
      clientKey: S.form.clientKey,
      animalType, behavior, individuals,
      observerName: $('#observer').value,
      notes: $('#notes').value,
      noHarm, consent,
    };
    if (zoneSlug === 'otra') payload.zoneOther = $('#zoneOther').value.trim();
    else payload.zoneSlug = zoneSlug;

    if (mode === 'catalog' && $('#speciesSlug').value) payload.speciesSlug = $('#speciesSlug').value;
    else if (mode === 'write' && $('#speciesName').value.trim()) payload.speciesName = $('#speciesName').value.trim();
    else if (mode === 'unknown') payload.speciesName = 'No lo conozco';

    if (S.form.photo) payload.photo = { data: S.form.photo };

    const btn = $('#submit-sight');
    btn.disabled = true;
    btn.textContent = '⏳ ' + t('form.sending');
    try {
      const r = await API.post('/api/sightings', payload);
      S.form.result = { public_id: r.public_id, duplicate: !!r.duplicate };
      S.form.clientKey = uuid(); // clave nueva para el próximo registro
      render();
      toast('✓ ' + t('form.success.title'));
    } catch (err) {
      showSightError(err.message || t('form.error.retry'));
      btn.disabled = false;
      btn.innerHTML = '📤 ' + esc(t('form.submit'));
    }
  });
}

/* ============================================================
   ESTADÍSTICAS (todo calculado en vivo desde la base)
   ============================================================ */
function viewStats() {
  return `${backBar()}
  <div class="module-head"><h1>📊 ${esc(t('stats.title'))}</h1><p>${esc(t('stats.sub'))}</p></div>
  <div id="stats-content"><div class="kpi-grid">${'<div class="skeleton"></div>'.repeat(4)}</div></div>
  ${backBarBottom()}`;
}

async function loadStats() {
  // Público: últimos registros (sin correos). Admin: suyos o todos.
  const scope = isAdminUser() ? (S.scope === 'all' ? 'all' : 'mine') : 'recent';
  const [st, si] = await Promise.all([
    API.get('/api/stats'),
    API.get('/api/sightings?scope=' + scope),
  ]);
  S.stats = st.stats;
  S.sightings = si.sightings;
}

function paintStats() {
  const box = $('#stats-content');
  if (!box) return;
  const s = S.stats;
  const isAdmin = isAdminUser();
  const zoneTop = (s.zones || []).find((z) => z.n > 0) || null;

  const kpis = [
    ['stats.total', s.total, '', ''],
    ['stats.species_id', s.speciesIdentified, '', ''],
    ['stats.individuals', s.individualsTotal, '', ''],
    ['stats.top_animal', s.topAnimal ? s.topAnimal.name : '—', s.topAnimal ? `${s.topAnimal.individuals} ${t('stats.top_animal.unit')}` : '', 'small'],
    ['stats.top_group', s.topGroup ? t('type.' + s.topGroup.code) : '—', s.topGroup ? `${s.topGroup.n}` : '', 'small'],
    ['stats.top_zone', zoneTop ? LZone(zoneTop) : '—', zoneTop ? `${zoneTop.n} ${t('stats.map.count')}` : '', 'small'],
    ['stats.new_species', s.newSpecies30, '', ''],
    ['stats.pending', s.pending, '', 'k-warn'],
    ['stats.verified', s.verified, '', ''],
    ['stats.rejected', s.rejected, '', 'k-info'],
  ];

  const groups = (s.groups || []).map((g) => ({ label: t('type.' + g.code), value: g.n }));
  const zoneRows = (s.zones || []).filter((z) => z.n > 0);
  const zoneData = zoneRows.map((z) => ({ label: LZone(z), value: z.n }));
  const monthly = (s.monthly || []).map((m) => ({ label: m.month, value: m.n }));
  const topSp = (s.topSpecies || []).map((x) => ({ label: x.name, value: x.individuals }));

  const counts = {};
  (s.zones || []).forEach((z) => { counts[z.slug] = z.n; });

  const rows = S.sightings || [];
  const statusName = { pending: 'status.pending', verified: 'status.verified', rejected: 'status.rejected' };

  box.innerHTML = `
  ${s.total === 0 ? `<div class="alert info">${esc(t('stats.empty'))}</div>` : ''}
  <div class="kpi-grid">
    ${kpis.map(([k, v, sub, cls]) => `
      <div class="kpi ${cls === 'k-warn' || cls === 'k-info' ? cls : ''}">
        <div class="k-label">${esc(t(k))}</div>
        <div class="k-value ${cls === 'small' ? 'small' : ''}">${esc(String(v))}</div>
        ${sub ? `<div class="k-sub">${esc(sub)}</div>` : ''}
      </div>`).join('')}
  </div>

  <div class="charts-grid">
    <div class="chart-card"><h3>🥧 ${esc(t('stats.chart_groups'))}</h3>${donutChart(groups, { centerLabel: t('stats.total') })}</div>
    <div class="chart-card"><h3>📊 ${esc(t('stats.chart_zones'))}</h3>${barChart(zoneData)}</div>
    <div class="chart-card"><h3>📈 ${esc(t('stats.chart_time'))}</h3>${lineChart(monthly)}</div>
    <div class="chart-card"><h3>🏆 ${esc(t('stats.chart_species'))}</h3>${barChart(topSp)}</div>
  </div>

  <div class="chart-card" style="margin-bottom:16px">
    <h3>🗺️ ${esc(t('stats.map.title'))}</h3>
    ${croquisSVG(s.zones || [], { counts })}
    <p class="map-note">${esc(t('stats.map.note'))}</p>
    <p class="map-note">${esc(t('stats.tip'))}</p>
  </div>

  <div class="table-card">
    <div class="table-head">
      <h3>🗒️ ${esc(t('stats.table'))} — ${esc(isAdmin ? (S.scope === 'all' ? t('stats.table.all') : t('stats.table.own')) : t('stats.table.recent'))}</h3>
      <div class="row-actions">
        ${isAdmin ? `<button class="btn small ghost" type="button" id="scope-btn">${esc(S.scope === 'all' ? t('stats.table.own') : t('stats.table.all'))}</button>
          <a class="btn small soft" href="/api/export/sightings.csv" download>${esc(t('stats.export'))}</a>` : ''}
        <button class="btn small" type="button" id="refresh-stats">${esc(t('stats.refresh'))}</button>
      </div>
    </div>
    <div class="table-scroll">
      ${rows.length ? `
      <table>
        <thead><tr>
          <th>${esc(t('stats.num'))}</th><th>${esc(t('stats.date'))}</th><th>${esc(t('stats.time'))}</th>
          <th>${esc(t('stats.species'))}</th><th>${esc(t('stats.group'))}</th>
          <th>${esc(t('stats.individuals_col'))}</th><th>${esc(t('stats.zone'))}</th>
          <th>${esc(t('stats.behavior'))}</th><th>${esc(t('stats.status'))}</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td class="td-num">${esc(r.public_id)}</td>
            <td>${esc(r.observed_date)}</td>
            <td>${esc(r.observed_time)}</td>
            <td>${esc(L(r.species_name) || '—')}</td>
            <td>${esc(t('type.' + r.animal_type))}</td>
            <td>${esc(r.individuals)}</td>
            <td>${esc(L(r.zone) || '—')}</td>
            <td>${esc(t('beh.' + r.behavior))}</td>
            <td><span class="badge ${esc(r.status)}">${esc(t(statusName[r.status] || 'status.pending'))}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="table-empty">${esc(t('stats.empty'))}</div>`}
    </div>
  </div>`;

  const refresh = $('#refresh-stats');
  if (refresh) refresh.addEventListener('click', () => refreshStats());
  const scopeBtn = $('#scope-btn');
  if (scopeBtn) scopeBtn.addEventListener('click', () => {
    S.scope = S.scope === 'all' ? 'mine' : 'all';
    refreshStats();
  });
}

async function refreshStats() {
  const box = $('#stats-content');
  if (box) box.innerHTML = `<div class="kpi-grid">${'<div class="skeleton"></div>'.repeat(4)}</div>`;
  try {
    await loadStats();
    paintStats();
  } catch (err) {
    if (box) box.innerHTML = `<div class="alert error">${esc(err.message)}</div>
      <div class="back-bar"><button class="btn" type="button" id="retry-stats">${esc(t('stats.refresh'))}</button></div>`;
    const retry = $('#retry-stats');
    if (retry) retry.addEventListener('click', () => refreshStats());
  }
}

/* ============================================================
   PANEL ADMINISTRATIVO (módulo admin.js)
   ============================================================ */
function viewAdmin() {
  if (!isAdminUser()) return viewAdminGate();
  return `${backBar()}
  <div class="module-head"><h1>⚙ ${esc(t('admin.title'))}</h1><p>${esc(t('admin.sub'))}</p></div>
  <div id="admin-root"></div>
  ${backBarBottom()}`;
}

/* ============================================================
   CARGA DE DATOS COMPARTIDOS
   ============================================================ */
async function loadShared() {
  const [zones, flora, fauna, tr] = await Promise.all([
    API.get('/api/zones').catch(() => ({ zones: [] })),
    API.get('/api/species?kind=flora').catch(() => ({ species: [] })),
    API.get('/api/species?kind=fauna').catch(() => ({ species: [] })),
    API.get('/api/translations').catch(() => ({ translations: {} })),
  ]);
  S.zones = zones.zones;
  S.species.flora = flora.species;
  S.species.fauna = fauna.species;
  setOverrides(tr.translations);
}
async function ensureSpecies(kind) {
  if (S.species[kind]) return;
  try {
    const r = await API.get('/api/species?kind=' + kind);
    S.species[kind] = r.species;
  } catch { S.species[kind] = []; }
}

/* ============================================================
   ENRUTADOR Y RENDER
   ============================================================ */
function changeLang(code) {
  const snap = captureForm();
  setLang(code);
  render(snap);
}

function render(snap) {
  const hash = (location.hash || '#/').replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  const screen = parts[0] || 'menu';
  let content = '';
  switch (screen) {
    case 'menu': content = viewMenu(); break;
    case 'flora': content = parts[1] ? viewFicha('flora', parts[1]) : viewCatalog('flora'); break;
    case 'fauna': content = parts[1] ? viewFicha('fauna', parts[1]) : viewCatalog('fauna'); break;
    case 'sighting': content = viewSighting(); break;
    case 'stats': content = viewStats(); break;
    case 'admin': content = viewAdmin(); break;
    default: content = viewMenu();
  }

  const prevBody = $('#app .screen-body');
  const prevScroll = prevBody ? prevBody.scrollTop : 0;

  app.innerHTML = `<div class="screen active">${topbar()}<div class="screen-body"><div class="wrap">${content}</div></div></div>`;

  const body = $('#app .screen-body');
  if (snap) { restoreForm(snap); if (body) body.scrollTop = prevScroll; }
  else if (body) body.scrollTop = 0;

  bind(screen, parts);
}

function bind(screen, parts) {
  switch (screen) {
    case 'flora':
    case 'fauna': {
      if (parts[1]) {
        const wasMissing = !S.species[screen];
        ensureSpecies(screen).then(() => { if (wasMissing) render(); });
      } else if (!S.species[screen]) {
        ensureSpecies(screen).then(() => render());
      } else {
        $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
          S.filter = b.dataset.filter;
          render();
        }));
      }
      break;
    }
    case 'sighting': bindSighting(); break;
    case 'stats': refreshStats(); break;
    case 'admin': {
      if (isAdminUser() && window.Admin) {
        window.Admin.render($('#admin-root'), {
          S, t, esc, toast, openModal, closeModal, api: API,
          refresh: () => render(),
          reloadShared: () => loadShared(),
          currentUser: S.user,
        });
      } else {
        bindAdminGate();
      }
      break;
    }
    default: break;
  }
}

/* ---------------- eventos globales ---------------- */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { e.preventDefault(); location.hash = go.dataset.go; return; }
  if (e.target.closest('#btn-logout')) { doLogout(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'lang-select') changeLang(e.target.value);
});
window.addEventListener('hashchange', () => render());
window.addEventListener('bs:unauthorized', () => {
  if (S.user) { S.user = null; toast(t('msg.no_permission'), true); render(); }
});

/* ---------------- arranque ---------------- */
(async function boot() {
  try { setLang(localStorage.getItem('biosmart_lang') || 'es'); } catch { setLang('es'); }
  try {
    const me = await API.me();
    S.user = me.user || null;
  } catch { S.user = null; }
  try {
    const st = await API.get('/api/auth/status');
    S.setup = !!st.setup;
  } catch { /* sin backend: se sigue igual */ }
  try { await loadShared(); } catch { /* los catálogos llegan al entrar */ }
  render();
})();
