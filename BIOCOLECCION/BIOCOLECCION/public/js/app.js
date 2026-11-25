'use strict';
/* Biodiversidad — Mi colección y Clasificación general (sin cuentas). */

const $ = (s) => document.querySelector(s);
const state = { view: null };

/* Identidad del navegador: clave + nombre visible (sin cuentas) */
function clientKey() {
  let k = null;
  try { k = localStorage.getItem('biocol.key'); } catch { /* almacenamiento bloqueado */ }
  if (!k) {
    k = (crypto.randomUUID ? crypto.randomUUID() : 'k-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    try { localStorage.setItem('biocol.key', k); } catch { /* seguir igualmente */ }
  }
  return k;
}
function storedName() {
  try { return localStorage.getItem('biocol.name') || null; } catch { return null; }
}
function storeName(name) {
  try { localStorage.setItem('biocol.name', name); } catch { /* seguir igualmente */ }
}
const KEY = clientKey();
state.name = storedName();

/* ---------------- utilidades ---------------- */
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
  return { status: res.status, data };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

let toastTimer;
function toast(msg, isError) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('toast--error', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3400);
}

function showFormError(sel, msg) {
  const el = $(sel);
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showView(name) {
  state.view = name;
  for (const v of ['collection', 'ranking']) {
    $('#view-' + v).classList.toggle('hidden', v !== name);
  }
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('is-active', t.dataset.view === name));
}

/* ---------------- caja de perfil (nombre visible) ---------------- */
function displayName() {
  return state.name || 'Anónimo';
}
function renderProfileBox() {
  const box = $('#profilebox');
  box.innerHTML =
    `<span class="who">👤 ${esc(displayName())}</span>` +
    `<button class="btn btn--ghost btn--sm" id="change-name-btn" type="button">Cambiar nombre</button>`;
  $('#change-name-btn').addEventListener('click', () => openNameModal(state.name || ''));
}

/* ---------------- modal de nombre ---------------- */
function openNameModal(value) {
  $('#name-input').value = value || '';
  showFormError('#name-error', '');
  $('#name-modal').classList.remove('hidden');
  setTimeout(() => $('#name-input').focus(), 30);
}
function closeNameModal() {
  $('#name-modal').classList.add('hidden');
}
document.querySelectorAll('[data-close-name]').forEach((el) =>
  el.addEventListener('click', closeNameModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNameModal(); });

async function saveName(rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    showFormError('#name-error', 'Escribe tu nombre (mínimo 2 caracteres).');
    return false;
  }
  const { status, data } = await api('POST', '/api/profile', { key: KEY, name });
  if (status !== 200) {
    showFormError('#name-error', (data && data.message) || 'No se pudo guardar tu nombre.');
    return false;
  }
  state.name = data.user.name;
  storeName(state.name);
  renderProfileBox();
  closeNameModal();
  toast(`Hola, ${state.name} 👋`);
  return true;
}

$('#name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showFormError('#name-error', '');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  await saveName(new FormData(e.target).get('name'));
  btn.disabled = false;
});

$('#name-anonymous').addEventListener('click', async () => {
  await saveName('Anónimo');
});

/* ---------------- navegación ---------------- */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', async () => {
    const view = tab.dataset.view;
    showView(view);
    if (view === 'collection') await loadCollection();
    else await loadRanking();
  });
});

/* ---------------- mi colección ---------------- */
async function loadCollection() {
  const { status, data } = await api('GET', '/api/collection?key=' + encodeURIComponent(KEY));
  if (status !== 200) {
    toast((data && data.message) || 'No se pudo cargar tu colección.', true);
    return;
  }
  if (data.name && data.name !== state.name) {
    state.name = data.name;
    storeName(data.name);
    renderProfileBox();
  }
  const records = data.records || [];
  $('#collection-count').textContent =
    `${records.length} ${records.length === 1 ? 'animal' : 'animales'}`;

  const tbody = $('#collection-table tbody');
  tbody.innerHTML = records.map((r, i) => `
    <tr>
      <td class="muted">${records.length - i}</td>
      <td><strong>${esc(r.animalName)}</strong></td>
      <td><em>${esc(r.species)}</em></td>
      <td class="muted">${esc(fmtDate(r.createdAt))}</td>
    </tr>`).join('');

  const vacia = records.length === 0;
  $('#collection-empty').classList.toggle('hidden', !vacia);
  $('#collection-table').classList.toggle('hidden', vacia);
}

$('#collection-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showFormError('#collection-error', '');
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const { status, data } = await api('POST', '/api/collection', {
    key: KEY,
    name: state.name || undefined,
    animalName: fd.get('animalName'),
    species: fd.get('species'),
    observed: fd.get('observed') === 'on',
  });
  btn.disabled = false;
  if (status !== 201) {
    showFormError('#collection-error', (data && data.message) || 'No se pudo registrar el animal.');
    return;
  }
  if (data.user && data.user.name && data.user.name !== state.name) {
    state.name = data.user.name;
    storeName(state.name);
    renderProfileBox();
  }
  e.target.reset();
  await loadCollection();
  toast(`Registrado: ${data.record.animalName} ✓`);
});

/* ---------------- clasificación ---------------- */
async function loadRanking() {
  const { status, data } = await api('GET', '/api/leaderboard?key=' + encodeURIComponent(KEY));
  if (status !== 200) { toast('No se pudo cargar la clasificación.', true); return; }

  const rank = data.ranking || [];
  $('#ranking-total').textContent =
    `${rank.length} ${rank.length === 1 ? 'participante' : 'participantes'} · ${data.totalRecords} registros`;

  const max = Math.max(1, ...rank.map((r) => r.count));
  const tbody = $('#ranking-table tbody');
  tbody.innerHTML = rank.map((r, i) => {
    const medal = i < 3
      ? `<span class="medal medal--${i + 1}">${['🥇', '🥈', '🥉'][i]}</span>`
      : `<span class="medal">${i + 1}</span>`;
    const isMe = !!r.isMe;
    return `
      <tr${isMe ? ' class="rank-me"' : ''}>
        <td class="pos">${medal}</td>
        <td class="name">
          <strong>${esc(r.name)}</strong>${isMe ? ' <span class="badge-me">Tú</span>' : ''}
          <div class="bar"><span style="width:${Math.round((r.count / max) * 100)}%"></span></div>
        </td>
        <td class="count">${r.count}</td>
      </tr>`;
  }).join('');

  const vacia = rank.length === 0;
  $('#ranking-empty').classList.toggle('hidden', !vacia);
  $('#ranking-table').classList.toggle('hidden', vacia);
}

/* ---------------- inicio ---------------- */
(async function init() {
  renderProfileBox();
  showView('collection');
  await loadCollection();
  if (!state.name) openNameModal(''); // solo la primera vez
})();
