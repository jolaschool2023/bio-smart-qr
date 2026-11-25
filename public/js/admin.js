/* ============================================================
   BIOSMART QR — Panel administrativo
   Pestañas: usuarios, flora, fauna, avistamientos, zonas,
   traducciones y auditoría. CRUD completo vía API.
   ============================================================ */
'use strict';

window.Admin = (function () {
  let ctx = null;          // { api, t, esc, toast, openModal, closeModal, refresh, S, currentUser }
  let tab = 'users';
  let filterStatus = 'all';

  const esc = (...a) => ctx.esc(...a);
  const t = (...a) => ctx.t(...a);
  const api = () => ctx.api;

  /* ---------------- estructura ---------------- */
  const TABS = [
    ['users', 'admin.tab.users', '👥'],
    ['flora', 'admin.tab.flora', '🌿'],
    ['fauna', 'admin.tab.fauna', '🦋'],
    ['sightings', 'admin.tab.sightings', '👁'],
    ['zones', 'admin.tab.zones', '🗺'],
    ['trad', 'admin.tab.trad', '🌐'],
    ['audit', 'admin.tab.audit', '📜'],
  ];

  function render(root, context) {
    ctx = context;
    root.innerHTML = `
      <div class="admin-tabs" role="tablist">
        ${TABS.map(([id, key, ico]) => `
          <button type="button" class="admin-tab" data-tab="${id}" role="tab" aria-pressed="${tab === id}">
            <span aria-hidden="true">${ico}</span> ${esc(t(key))}</button>`).join('')}
      </div>
      <div id="admin-panel" class="admin-panel"><div class="skeleton"></div></div>`;
    root.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      render(root, context);
    }));
    const panel = root.querySelector('#admin-panel');
    const load = {
      users: loadUsers, flora: () => loadSpecies('flora'), fauna: () => loadSpecies('fauna'),
      sightings: loadSightings, zones: loadZones, trad: loadTrad, audit: loadAudit,
    }[tab];
    load(panel).catch((err) => {
      panel.innerHTML = `<div class="alert error">${esc(err.message || t('common.error_generic'))}</div>`;
    });
  }

  /* ---------------- usuarios ---------------- */
  async function loadUsers(panel) {
    const { users } = await api().get('/api/admin/users');
    panel.innerHTML = `
      <div class="table-card">
        <div class="table-head"><h3>👥 ${esc(t('admin.tab.users'))}</h3></div>
        <div class="table-scroll"><table>
          <thead><tr>
            <th>${esc(t('admin.users.email'))}</th><th>${esc(t('admin.users.role'))}</th>
            <th>${esc(t('admin.users.active'))}</th><th>${esc(t('admin.users.sightings'))}</th>
            <th>${esc(t('admin.users.created'))}</th><th>${esc(t('admin.users.last'))}</th>
            <th>${esc(t('admin.users.actions'))}</th>
          </tr></thead>
          <tbody>${users.map((u) => `
            <tr data-id="${u.id}">
              <td>${esc(u.email)}</td>
              <td><span class="tag ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? esc(t('nav.admin')) : 'user'}</span></td>
              <td><span class="tag ${u.active ? '' : 'off'}">${u.active ? '✓' : '✗'}</span></td>
              <td>${u.sightings}</td>
              <td>${esc((u.created_at || '').slice(0, 10))}</td>
              <td>${esc((u.last_login || '—').slice(0, 16))}</td>
              <td><div class="row-actions">
                ${u.id !== ctx.currentUser.id ? `
                  <button class="btn small ${u.role === 'admin' ? 'ghost' : 'soft'}" data-act="role">
                    ${esc(u.role === 'admin' ? t('admin.users.make_user') : t('admin.users.make_admin'))}</button>
                  <button class="btn small ${u.active ? 'danger' : 'soft'}" data-act="active">
                    ${esc(u.active ? t('admin.users.deactivate') : t('admin.users.activate'))}</button>` : ''}
                <button class="btn small ghost" data-act="reset">${esc(t('admin.users.reset_pw'))}</button>
              </div></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;

    panel.querySelectorAll('tr[data-id]').forEach((row) => {
      const id = row.dataset.id;
      const user = users.find((u) => String(u.id) === id);
      row.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', async () => {
        try {
          if (b.dataset.act === 'role') {
            await api().patch('/api/admin/users/' + id, { role: user.role === 'admin' ? 'user' : 'admin' });
          } else if (b.dataset.act === 'active') {
            await api().patch('/api/admin/users/' + id, { active: !user.active });
          } else if (b.dataset.act === 'reset') {
            resetPasswordModal(user);
            return;
          }
          ctx.toast('✓ ' + t('admin.saved'));
          loadUsers(panel);
        } catch (err) { ctx.toast(err.message, true); }
      }));
    });
  }

  function resetPasswordModal(user) {
    ctx.openModal(`
      <h3>${esc(t('admin.users.reset_pw'))}</h3>
      <p class="sub">${esc(user.email)}</p>
      <div class="field" style="margin-top:12px">
        <label for="new-pw">${esc(t('admin.new_pw'))}</label>
        <input class="input" type="password" id="new-pw" minlength="8" autocomplete="new-password">
      </div>
      <div id="reset-err"></div>
      <div class="modal-actions">
        <button class="btn ghost" id="r-cancel">${esc(t('admin.action.cancel'))}</button>
        <button class="btn" id="r-save">${esc(t('admin.action.save'))}</button>
      </div>`);
    document.getElementById('r-cancel').addEventListener('click', ctx.closeModal);
    document.getElementById('r-save').addEventListener('click', async () => {
      const pw = document.getElementById('new-pw').value;
      try {
        await api().post(`/api/admin/users/${user.id}/reset-password`, { password: pw });
        ctx.closeModal();
        ctx.toast('✓ ' + t('admin.saved'));
      } catch (err) {
        document.getElementById('reset-err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
      }
    });
  }

  /* ---------------- especies (flora / fauna) ---------------- */
  async function loadSpecies(kind, panel) {
    panel = panel || document.getElementById('admin-panel');
    const { species } = await api().get('/api/species?kind=' + kind);
    const statusLabel = { referida: 'cat.status.referida', potencial: 'cat.status.potencial', pendiente: 'cat.status.pendiente' };
    panel.innerHTML = `
      <div class="table-card">
        <div class="table-head">
          <h3>${kind === 'flora' ? '🌿' : '🦋'} ${esc(t(kind === 'flora' ? 'admin.tab.flora' : 'admin.tab.fauna'))}</h3>
          <div class="row-actions"><button class="btn small" id="sp-add">${esc(t('admin.action.add'))}</button></div>
        </div>
        <div class="table-scroll"><table>
          <thead><tr>
            <th>${esc(t('admin.species.name_es'))}</th><th>${esc(t('admin.species.sci'))}</th>
            <th>${esc(t('admin.species.family'))}</th><th>${esc(t('admin.species.status'))}</th>
            <th>${esc(t('stats.table'))}</th><th>${esc(t('admin.users.actions'))}</th>
          </tr></thead>
          <tbody>${species.map((sp) => `
            <tr data-id="${sp.id}">
              <td><strong>${esc(sp.name.es)}</strong>${sp.alias ? `<br><small>${esc(sp.alias)}</small>` : ''}</td>
              <td><em>${esc(sp.scientific)}</em></td>
              <td>${esc(sp.family || '—')}${sp.category ? `<br><small>${esc(sp.category)}</small>` : ''}</td>
              <td><span class="badge ${esc(sp.status)}">${esc(t(statusLabel[sp.status] || 'cat.status.potencial'))}</span>
                  ${sp.pollinator ? '<br><small>🐝</small>' : ''}</td>
              <td>${sp.sightings}</td>
              <td><div class="row-actions">
                <button class="btn small soft" data-act="edit">${esc(t('admin.action.edit'))}</button>
                <button class="btn small danger" data-act="del">${esc(t('admin.action.delete'))}</button>
              </div></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;

    panel.querySelector('#sp-add').addEventListener('click', () => speciesModal(kind, null, () => loadSpecies(kind, panel)));
    panel.querySelectorAll('tr[data-id]').forEach((row) => {
      const sp = species.find((x) => String(x.id) === row.dataset.id);
      row.querySelector('[data-act="edit"]').addEventListener('click', () => speciesModal(kind, sp, () => loadSpecies(kind, panel)));
      row.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (!window.confirm(t('admin.confirm.delete'))) return;
        try {
          await api().del('/api/species/' + sp.id);
          ctx.toast('✓ ' + t('admin.deleted'));
          loadSpecies(kind, panel);
        } catch (err) { ctx.toast(err.message, true); }
      });
    });
  }

  function rowField(k, es, en, del) {
    return `<div class="edit-row">
      <input data-f="k" value="${esc(k)}" placeholder="${esc(t('admin.field.key'))}">
      <textarea data-f="es" placeholder="${esc(t('admin.field.es'))}">${esc(es)}</textarea>
      <textarea data-f="en" placeholder="${esc(t('admin.field.en'))}">${esc(en)}</textarea>
      <button type="button" class="btn small danger" data-del>✕</button>
    </div>`;
  }

  function speciesModal(kind, sp, done) {
    const isNew = !sp;
    const img = (sp && sp.images && sp.images[0]) || null;
    const F = (sp && sp.fields) || [];
    const E = (sp && sp.edu) || [];
    const name = (sp && sp.name) || {};
    const sources = (sp && sp.sources) || {};
    const note = (sp && sp.note) || {};
    const CATS = ['Aves', 'Mamíferos', 'Reptiles', 'Anfibios', 'Mariposas', 'Insectos'];

    ctx.openModal(`
      <h3>${esc(isNew ? t('admin.action.add') : t('admin.action.edit'))} — ${esc(t(kind === 'flora' ? 'admin.tab.flora' : 'admin.tab.fauna'))}</h3>
      <div class="edit-grid">
        <div class="field-set"><h4>${esc(t('admin.species.name_es'))}</h4>
          <div class="edit-row" style="grid-template-columns:1fr 1fr 1fr 1fr">
            <input id="sp-es" placeholder="Español *" value="${esc(name.es || '')}">
            <input id="sp-en" placeholder="English" value="${esc(name.en || '')}">
            <input id="sp-qu" placeholder="Quechua" value="${esc(name.qu || '')}">
            <input id="sp-ay" placeholder="Aymara" value="${esc(name.ay || '')}">
          </div>
        </div>
        <div class="edit-row" style="grid-template-columns:1fr 1fr 1fr">
          <input id="sp-sci" placeholder="${esc(t('admin.species.sci'))} *" value="${esc((sp && sp.scientific) || '')}">
          <input id="sp-family" placeholder="${esc(t('admin.species.family'))}" value="${esc((sp && sp.family) || '')}">
          <input id="sp-alias" placeholder="${esc(t('cat.alias'))}" value="${esc((sp && sp.alias) || '')}">
        </div>
        <div class="edit-row" style="grid-template-columns:1fr 1fr 1fr auto">
          ${kind === 'fauna'
            ? `<input id="sp-cat" list="cat-list" placeholder="${esc(t('admin.species.category'))}" value="${esc((sp && sp.category) || '')}">
               <datalist id="cat-list">${CATS.map((c) => `<option value="${c}">`).join('')}</datalist>`
            : `<span></span>`}
          <select id="sp-status">
            ${['referida', 'potencial', 'pendiente'].map((s) => `<option value="${s}"${sp && sp.status === s ? ' selected' : ''}>${esc(t({ referida: 'cat.status.referida', potencial: 'cat.status.potencial', pendiente: 'cat.status.pendiente' }[s]))}</option>`).join('')}
          </select>
          <label class="check-line" style="margin:0;padding:8px 12px">
            <input type="checkbox" id="sp-poll" ${sp && sp.pollinator ? 'checked' : ''}>
            <span>${esc(t('admin.species.pollinator'))}</span></label>
          <span></span>
        </div>

        <div class="field-set"><h4>${esc(t('admin.species.fields'))}</h4>
          <div id="sp-fields" class="edit-grid">${F.map((f) => rowField(f.k, f.es, f.en)).join('')}</div>
          <button type="button" class="btn small soft" id="add-field" style="margin-top:8px">${esc(t('admin.field.add'))}</button>
        </div>

        <div class="field-set"><h4>${esc(t('admin.species.edu'))}</h4>
          <div id="sp-edu" class="edit-grid">${E.map((f) => rowField(f.k, f.es, f.en)).join('')}</div>
          <button type="button" class="btn small soft" id="add-edu" style="margin-top:8px">${esc(t('admin.field.add'))}</button>
        </div>

        <div class="field-set"><h4>${esc(t('admin.species.sources'))}</h4>
          <textarea id="sp-src-es" style="width:100%;min-height:60px" placeholder="Español">${esc(sources.es || '')}</textarea>
          <textarea id="sp-src-en" style="width:100%;min-height:60px" placeholder="English">${esc(sources.en || '')}</textarea>
        </div>
        <div class="field-set"><h4>${esc(t('admin.species.note'))}</h4>
          <textarea id="sp-note-es" style="width:100%;min-height:60px" placeholder="Español">${esc(note.es || '')}</textarea>
          <textarea id="sp-note-en" style="width:100%;min-height:60px" placeholder="English">${esc(note.en || '')}</textarea>
        </div>

        <div class="field-set"><h4>${esc(t('admin.species.image'))}</h4>
          <div class="edit-row" style="grid-template-columns:150px 1fr">
            <div id="sp-img-prev" style="border-radius:10px;overflow:hidden;background:var(--g8);min-height:90px">
              ${img ? `<img src="${img.upload ? '/api/files/' + esc(img.file) : '/img/' + esc(img.file)}" alt="" style="width:100%;height:90px;object-fit:cover">` : ''}
            </div>
            <div class="edit-grid">
              <input type="file" id="sp-file" accept="image/jpeg,image/png,image/webp">
              <input id="sp-img-author" placeholder="${esc(t('cat.credit'))} autor / fuente" value="${esc((img && img.author) || '')}">
              <input id="sp-img-license" placeholder="Licencia (ej. CC BY-SA 4.0)" value="${esc((img && img.license) || '')}">
              <input id="sp-img-source" placeholder="URL de origen" value="${esc((img && img.source) || '')}">
            </div>
          </div>
        </div>

        <div id="sp-err"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="sp-cancel">${esc(t('admin.action.cancel'))}</button>
        <button class="btn" id="sp-save">${esc(t('admin.action.save'))}</button>
      </div>`);

    const $id = (i) => document.getElementById(i);

    // filas dinámicas
    const bindRows = (container) => {
      container.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => b.closest('.edit-row').remove();
      });
    };
    bindRows($id('sp-fields'));
    bindRows($id('sp-edu'));
    $id('add-field').addEventListener('click', () => {
      $id('sp-fields').insertAdjacentHTML('beforeend', rowField('', '', ''));
      bindRows($id('sp-fields'));
    });
    $id('add-edu').addEventListener('click', () => {
      $id('sp-edu').insertAdjacentHTML('beforeend', rowField('', '', ''));
      bindRows($id('sp-edu'));
    });

    // imagen
    let uploaded = img ? { file: img.file, upload: !!img.upload } : null;
    $id('sp-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = await window.compressImage(file, 1600, 0.86);
        const r = await api().post('/api/upload', { photo: { data } });
        uploaded = { file: r.file, upload: true };
        $id('sp-img-prev').innerHTML = `<img src="/api/files/${esc(r.file)}" alt="" style="width:100%;height:90px;object-fit:cover">`;
        ctx.toast('✓ ' + t('admin.saved'));
      } catch (err) { ctx.toast(err.message, true); }
    });

    $id('sp-cancel').addEventListener('click', ctx.closeModal);

    $id('sp-save').addEventListener('click', async () => {
      const readRows = (box) => Array.from(box.querySelectorAll('.edit-row')).map((r) => ({
        k: r.querySelector('[data-f="k"]').value.trim(),
        es: r.querySelector('[data-f="es"]').value.trim(),
        en: r.querySelector('[data-f="en"]').value.trim(),
      })).filter((r) => r.k && r.es);

      const payload = {
        kind,
        name: {
          es: $id('sp-es').value.trim(), en: $id('sp-en').value.trim(),
          qu: $id('sp-qu').value.trim(), ay: $id('sp-ay').value.trim(),
        },
        scientific: $id('sp-sci').value.trim(),
        family: $id('sp-family').value.trim(),
        alias: $id('sp-alias').value.trim(),
        category: kind === 'fauna' ? $id('sp-cat').value.trim() : '',
        status: $id('sp-status').value,
        pollinator: $id('sp-poll').checked,
        fields: readRows($id('sp-fields')),
        edu: readRows($id('sp-edu')),
        sources: { es: $id('sp-src-es').value.trim(), en: $id('sp-src-en').value.trim() },
        note: { es: $id('sp-note-es').value.trim(), en: $id('sp-note-en').value.trim() },
        images: uploaded ? [{
          file: uploaded.file, upload: uploaded.upload,
          author: $id('sp-img-author').value.trim(),
          license: $id('sp-img-license').value.trim(),
          source: $id('sp-img-source').value.trim(),
        }] : [],
      };
      try {
        if (isNew) await api().post('/api/species', payload);
        else await api().put('/api/species/' + sp.id, payload);
        ctx.closeModal();
        ctx.toast('✓ ' + t('admin.saved'));
        done();
      } catch (err) {
        $id('sp-err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
      }
    });
  }

  /* ---------------- revisión de avistamientos ---------------- */
  async function loadSightings(panel) {
    const { sightings } = await api().get('/api/sightings?scope=all');
    const statusLabel = { pending: 'status.pending', verified: 'status.verified', rejected: 'status.rejected' };
    const shown = sightings.filter((s) => filterStatus === 'all' || s.status === filterStatus);
    panel.innerHTML = `
      <div class="chips">
        ${['all', 'pending', 'verified', 'rejected'].map((f) => `
          <button type="button" class="chip" data-f="${f}" aria-pressed="${filterStatus === f}">
            ${esc(f === 'all' ? t('cat.filter.all') : t(statusLabel[f]))}</button>`).join('')}
      </div>
      <div class="table-card">
        <div class="table-head"><h3>👁 ${esc(t('admin.tab.sightings'))} (${shown.length})</h3></div>
        <div class="table-scroll"><table>
          <thead><tr>
            <th>${esc(t('stats.num'))}</th><th>${esc(t('stats.date'))}</th><th>${esc(t('stats.species'))}</th>
            <th>${esc(t('stats.zone'))}</th><th>${esc(t('stats.individuals_col'))}</th>
            <th>${esc(t('admin.sightings.from'))}</th><th>${esc(t('stats.status'))}</th>
            <th>${esc(t('admin.users.actions'))}</th>
          </tr></thead>
          <tbody>${shown.map((s) => `
            <tr data-id="${esc(s.public_id)}">
              <td class="td-num">${esc(s.public_id)}</td>
              <td>${esc(s.observed_date)}<br><small>${esc(s.observed_time)}</small></td>
              <td>${esc(s.species_name ? (typeof s.species_name === 'object' ? (s.species_name.es || '') : s.species_name) : '—')}
                  ${s.notes ? `<br><small title="${esc(s.notes)}">${esc(s.notes.slice(0, 60))}${s.notes.length > 60 ? '…' : ''}</small>` : ''}</td>
              <td>${esc(s.zone ? (s.zone.free || s.zone.es || '') : '—')}</td>
              <td>${esc(s.individuals)}</td>
              <td><small>${esc(s.user_email || '—')}${s.observer_name ? '<br>' + esc(s.observer_name) : ''}</small></td>
              <td><span class="badge ${esc(s.status)}">${esc(t(statusLabel[s.status]))}</span></td>
              <td><div class="row-actions">
                ${s.has_photo ? `<button class="btn small ghost" data-act="photo">${esc(t('admin.sightings.photo'))}</button>` : ''}
                ${s.status !== 'verified' ? `<button class="btn small soft" data-act="verify">${esc(t('admin.sightings.verify'))}</button>` : ''}
                ${s.status !== 'pending' ? `<button class="btn small ghost" data-act="pending">${esc(t('admin.sightings.pending'))}</button>` : ''}
                ${s.status !== 'rejected' ? `<button class="btn small danger" data-act="reject">${esc(t('admin.sightings.reject'))}</button>` : ''}
              </div></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;

    panel.querySelectorAll('.chip[data-f]').forEach((c) => c.addEventListener('click', () => {
      filterStatus = c.dataset.f;
      loadSightings(panel);
    }));
    panel.querySelectorAll('tr[data-id]').forEach((row) => {
      const s = shown.find((x) => x.public_id === row.dataset.id);
      row.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'photo') {
          ctx.openModal(`
            <h3>${esc(s.public_id)} — 📷</h3>
            <img src="/api/photos/${s.photo_id}" alt="" style="width:100%;border-radius:12px">
            <div class="modal-actions"><button class="btn" id="p-close">${esc(t('common.close'))}</button></div>`);
          document.getElementById('p-close').addEventListener('click', ctx.closeModal);
          return;
        }
        try {
          const status = act === 'verify' ? 'verified' : act === 'reject' ? 'rejected' : 'pending';
          await api().patch('/api/sightings/' + encodeURIComponent(s.public_id), { status });
          ctx.toast('✓ ' + t('admin.saved'));
          loadSightings(panel);
        } catch (err) { ctx.toast(err.message, true); }
      }));
    });
  }

  /* ---------------- zonas ---------------- */
  async function loadZones(panel) {
    const { zones } = await api().get('/api/zones');
    const zCells = (z) => `
        <td><input data-z="slug" value="${esc(z.slug)}" placeholder="${esc(t('admin.zones.slug'))}" ${z.id ? 'readonly' : ''}></td>
        <td><input data-z="name_es" value="${esc(z.name_es || '')}" placeholder="Español"></td>
        <td><input data-z="name_en" value="${esc(z.name_en || '')}" placeholder="English"></td>
        <td><input data-z="name_qu" value="${esc(z.name_qu || '')}" placeholder="Quechua"></td>
        <td><input data-z="name_ay" value="${esc(z.name_ay || '')}" placeholder="Aymara"></td>
        <td><input data-z="map_x" type="number" min="0" max="100" value="${z.map_x}" style="width:70px">
            <input data-z="map_y" type="number" min="0" max="100" value="${z.map_y}" style="width:70px"></td>
        <td><input data-z="color" type="color" value="${esc(z.color || '#2d6a4f')}"></td>
        <td><div class="row-actions">
          <button class="btn small soft" data-act="save">${esc(t('admin.action.save'))}</button>
          ${z.id ? `<button class="btn small danger" data-act="del">${esc(t('admin.action.delete'))}</button>` : ''}
        </div></td>`;
    panel.innerHTML = `
      <div class="table-card">
        <div class="table-head">
          <h3>🗺 ${esc(t('admin.tab.zones'))}</h3>
          <div class="row-actions"><button class="btn small" id="z-add">${esc(t('admin.action.add'))}</button></div>
        </div>
        <div class="table-scroll"><table>
          <thead><tr>
            <th>${esc(t('admin.zones.slug'))}</th><th>${esc(t('admin.zones.name'))}</th>
            <th colspan="3"></th><th>${esc(t('admin.zones.pos'))}</th><th>${esc(t('admin.zones.color'))}</th>
            <th>${esc(t('admin.users.actions'))}</th>
          </tr></thead>
          <tbody id="z-body">
            ${zones.map((z) => `<tr data-id="${z.id}">${zCells(z)}</tr>`).join('')}
            <tr data-new data-id="0" style="display:none">${zCells({ id: 0, slug: '', name_es: '', map_x: 50, map_y: 50, color: '#52b788' })}</tr>
          </tbody>
        </table></div>
      </div>`;

    const bindRow = (row) => {
      const isNew = row.hasAttribute('data-new');
      const val = (k) => (row.querySelector(`[data-z="${k}"]`) || {}).value;
      const saveBtn = row.querySelector('[data-act="save"]');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        const payload = {
          slug: val('slug'), name_es: val('name_es'), name_en: val('name_en'),
          name_qu: val('name_qu'), name_ay: val('name_ay'),
          map_x: Number(val('map_x')), map_y: Number(val('map_y')), color: val('color'),
        };
        try {
          if (isNew) await api().post('/api/zones', payload);
          else await api().put('/api/zones/' + row.dataset.id, payload);
          ctx.toast('✓ ' + t('admin.saved'));
          await ctx.reloadShared();
          loadZones(panel);
        } catch (err) { ctx.toast(err.message, true); }
      });
      const delBtn = row.querySelector('[data-act="del"]');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!window.confirm(t('admin.confirm.delete'))) return;
        try {
          await api().del('/api/zones/' + row.dataset.id);
          ctx.toast('✓ ' + t('admin.deleted'));
          await ctx.reloadShared();
          loadZones(panel);
        } catch (err) { ctx.toast(err.message, true); }
      });
    };
    panel.querySelectorAll('#z-body tr').forEach(bindRow);
    panel.querySelector('#z-add').addEventListener('click', () => {
      const row = panel.querySelector('tr[data-new]');
      row.style.display = '';
      row.querySelector('[data-z="slug"]').focus();
    });
  }

  /* ---------------- traducciones (revisión por hablantes) ---------------- */
  async function loadTrad(panel) {
    const { translations } = await api().get('/api/translations');
    const keys = Object.keys(translations).sort();
    const rows = [];
    keys.forEach((k) => Object.keys(translations[k]).forEach((lang) => {
      rows.push({ key: k, lang, value: translations[k][lang] });
    }));
    panel.innerHTML = `
      <div class="alert info">${esc(t('admin.trad.note'))}</div>
      <div class="field-set" style="margin-bottom:16px">
        <div class="edit-row" style="grid-template-columns:1fr 120px 2fr auto">
          <input id="tr-key" list="tr-keys" placeholder="${esc(t('admin.trad.key'))}">
          <datalist id="tr-keys">${Object.keys(DICT).slice(0, 400).map((k) => `<option value="${k}">`).join('')}</datalist>
          <select id="tr-lang">${LANGS.map((l) => `<option value="${l.code}"${l.code === getLang() ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select>
          <input id="tr-value" placeholder="${esc(t('admin.trad.value'))}">
          <button class="btn small" id="tr-save">${esc(t('admin.action.save'))}</button>
        </div>
        <div id="tr-err"></div>
      </div>
      <div class="table-card">
        <div class="table-head"><h3>🌐 ${esc(t('admin.tab.trad'))} (${rows.length})</h3></div>
        <div class="table-scroll"><table>
          <thead><tr><th>${esc(t('admin.trad.key'))}</th><th>${esc(t('admin.trad.lang'))}</th>
            <th>${esc(t('admin.trad.value'))}</th><th>${esc(t('admin.users.actions'))}</th></tr></thead>
          <tbody>${rows.length ? rows.map((r) => `
            <tr data-key="${esc(r.key)}" data-lang="${r.lang}">
              <td><code>${esc(r.key)}</code></td>
              <td><span class="tag">${r.lang}</span></td>
              <td>${esc(r.value)}</td>
              <td><div class="row-actions">
                <button class="btn small ghost" data-act="use">${esc(t('admin.action.edit'))}</button>
                <button class="btn small danger" data-act="del">${esc(t('admin.action.delete'))}</button>
              </div></td>
            </tr>`).join('') : `<tr><td colspan="4" class="table-empty">${esc(t('admin.audit.empty'))}</td></tr>`}</tbody>
        </table></div>
      </div>`;

    panel.querySelector('#tr-save').addEventListener('click', async () => {
      const key = panel.querySelector('#tr-key').value.trim();
      const lang = panel.querySelector('#tr-lang').value;
      const value = panel.querySelector('#tr-value').value;
      if (!/^[a-z0-9_.-]{1,80}$/.test(key)) {
        panel.querySelector('#tr-err').innerHTML = `<div class="alert error">${esc(t('admin.trad.key'))}</div>`;
        return;
      }
      try {
        await api().put(`/api/translations/${encodeURIComponent(key)}/${lang}`, { value });
        ctx.toast('✓ ' + t('admin.saved'));
        await ctx.reloadShared();
        loadTrad(panel);
      } catch (err) { ctx.toast(err.message, true); }
    });
    panel.querySelectorAll('tr[data-key]').forEach((row) => {
      row.querySelector('[data-act="use"]').addEventListener('click', () => {
        panel.querySelector('#tr-key').value = row.dataset.key;
        panel.querySelector('#tr-lang').value = row.dataset.lang;
        panel.querySelector('#tr-value').value = row.querySelector('td:nth-child(3)').textContent;
        panel.querySelector('#tr-value').focus();
      });
      row.querySelector('[data-act="del"]').addEventListener('click', async () => {
        try {
          await api().put(`/api/translations/${encodeURIComponent(row.dataset.key)}/${row.dataset.lang}`, { value: '' });
          ctx.toast('✓ ' + t('admin.deleted'));
          await ctx.reloadShared();
          loadTrad(panel);
        } catch (err) { ctx.toast(err.message, true); }
      });
    });
  }

  /* ---------------- auditoría ---------------- */
  async function loadAudit(panel) {
    const { audit } = await api().get('/api/admin/audit');
    panel.innerHTML = `
      <div class="table-card">
        <div class="table-head"><h3>📜 ${esc(t('admin.tab.audit'))}</h3></div>
        <div class="table-scroll"><table>
          <thead><tr>
            <th>${esc(t('admin.audit.when'))}</th><th>${esc(t('admin.audit.who'))}</th>
            <th>${esc(t('admin.audit.action'))}</th><th>${esc(t('admin.audit.entity'))}</th>
            <th>${esc(t('admin.audit.detail'))}</th>
          </tr></thead>
          <tbody>${audit.length ? audit.map((a) => `
            <tr>
              <td><small>${esc(a.created_at)}</small></td>
              <td><small>${esc(a.email || '—')}</small></td>
              <td><code>${esc(a.action)}</code></td>
              <td><small>${esc(a.entity || '—')} ${a.entity_id ? '#' + esc(a.entity_id) : ''}</small></td>
              <td class="audit-detail" title="${esc(a.detail || '')}">${esc((a.detail || '').slice(0, 90))}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="table-empty">${esc(t('admin.audit.empty'))}</td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  return { render };
})();
