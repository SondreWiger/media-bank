/* Media Bank Frontend */
const qs = sel => document.querySelector(sel);
const ce = (tag, props={}) => Object.assign(document.createElement(tag), props);
let state = {
  query: '',
  type: '',
  sort: 'created_at',
  order: 'DESC',
  page: 1,
  limit: 30,
  items: [],
  selected: null,
  selectedIds: new Set(),
  loading: false,
  folders: [],
  folderId: '', // aktiv mappefilter
  folderCardSelectedId: '', // valgt mappe-kort (enkeltklikk)
};

// henter ting fra serveren, chill
async function fetchMedia({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const url = new URL('/api/media', window.location.origin);
  if (state.query) url.searchParams.set('query', state.query);
  if (state.type) url.searchParams.set('type', state.type);
  if (state.sort) url.searchParams.set('sort', state.sort);
  if (state.order) url.searchParams.set('order', state.order);
  // hvis vi søker – la søk gå på tvers av alle mapper (ikke send folder_id)
  if (!state.query) {
    // ellers behold mappefiltrering (tom streng for rot)
    url.searchParams.set('folder_id', state.folderId);
  }
  url.searchParams.set('page', String(state.page));
  url.searchParams.set('limit', String(state.limit));
  const res = await fetch(url);
  const data = await res.json();
  const newItems = data.items || [];
  state.items = append ? state.items.concat(newItems) : newItems;
  state.loading = false;
  renderGallery();
}

// formaterer filstørrelse
function fileSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1024*1024*1024) return `${(n/1024/1024).toFixed(1)} MB`;
  return `${(n/1024/1024/1024).toFixed(1)} GB`;
}

// viser galeri
function renderGallery() {
  const grid = qs('#gallery');
  grid.innerHTML = '';
  // mappe-kort øverst (root) eller en "tilbake"-kort inne i mappe
  if (!state.folderId) {
    for (const f of state.folders) {
      const card = ce('div', { className: 'card folder-card', title: `Åpne ${f.name}` });
      if (String(state.folderCardSelectedId) === String(f.id)) card.classList.add('selected');
      const box = ce('div', { className: 'folder-box', innerHTML: '📁' });
      const meta = ce('div', { className: 'meta' });
      const name = ce('div', { className: 'name', textContent: f.name });
      meta.appendChild(name);
      card.appendChild(box);
      card.appendChild(meta);
      card.onclick = (e) => { e.preventDefault(); state.folderCardSelectedId = String(f.id); renderGallery(); };
      card.ondblclick = (e) => { e.preventDefault(); setFolder(String(f.id)); };
      grid.appendChild(card);
    }
  } else {
    const back = ce('div', { className: 'card folder-card', title: 'Tilbake til alle mapper' });
    const box = ce('div', { className: 'folder-box', innerHTML: '⬅️' });
    const meta = ce('div', { className: 'meta' });
    const name = ce('div', { className: 'name', textContent: 'Tilbake' });
    meta.appendChild(name);
    back.appendChild(box);
    back.appendChild(meta);
    back.onclick = () => setFolder('');
    grid.appendChild(back);
    // vis undermapper i nåværende mappe
    for (const f of state.folders) {
      const card = ce('div', { className: 'card folder-card', title: `Åpne ${f.name}` });
      if (String(state.folderCardSelectedId) === String(f.id)) card.classList.add('selected');
      const fb = ce('div', { className: 'folder-box', innerHTML: '📁' });
      const fm = ce('div', { className: 'meta' });
      const fn = ce('div', { className: 'name', textContent: f.name });
      fm.appendChild(fn);
      card.appendChild(fb);
      card.appendChild(fm);
      card.onclick = (e) => { e.preventDefault(); state.folderCardSelectedId = String(f.id); renderGallery(); };
      card.ondblclick = (e) => { e.preventDefault(); setFolder(String(f.id)); };
      grid.appendChild(card);
    }
  }
  for (const it of state.items) {
    const card = ce('div', { className: 'card' });
    if (state.selectedIds.has(it.id)) card.classList.add('selected');
    const isImg = it.mimetype && it.mimetype.startsWith('image/');
    const img = ce('img', { className: 'thumb', alt: it.original_name });
    img.src = it.thumb_url ? it.thumb_url : (isImg ? it.url : 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"400\"><rect width=\"100%\" height=\"100%\" fill=\"#0b0f17\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" fill=\"#94a3b8\" font-family=\"sans-serif\" font-size=\"18\">${(it.mimetype||'file').split('/')[0].toUpperCase()}</text></svg>`));
    img.ondblclick = () => openModal(it);
    card.appendChild(img);

    // selection checkbox
    const selWrap = ce('div', { className: 'select-box' });
    const cb = ce('input', { type: 'checkbox' });
    cb.checked = state.selectedIds.has(it.id);
    cb.onchange = () => toggleSelect(it.id, cb.checked);
    selWrap.appendChild(cb);
    card.appendChild(selWrap);

    // meta info
    const meta = ce('div', { className: 'meta' });
    const left = ce('div');
    const name = ce('div', { className: 'name', title: it.original_name, textContent: it.original_name });
    const sub = ce('div', { style: 'font-size:11px;color:#9aa3b2', textContent: `${(it.mimetype||'').split(';')[0]} • ${fileSize(it.size||0)}` });
    left.appendChild(name); left.appendChild(sub);

    // actions
    const actions = ce('div', { className: 'actions' });
    const btnTag = ce('button', { className: 'button', textContent: 'Tags' }); // ja, engelsk label, men alle skjønner "tags" :)
    btnTag.onclick = async () => {
      const existing = Array.isArray(it.tags) ? it.tags : [];
      const val = prompt('Komma-separerte tags', existing.join(', '));
      if (val === null) return;
      const tags = val.split(',').map(s => s.trim()).filter(Boolean);
      await fetch(`/api/media/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) });
      fetchMedia(); // oppdaterer lista, lett
    };
    const btnShare = ce('button', { className: 'button', textContent: 'Del' });
    btnShare.onclick = async () => {
      const res = await fetch(`/share/${it.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!data.ok) return alert('Deling feila');
      const link = new URL(data.url, window.location.origin).toString();
      try { await navigator.clipboard.writeText(link); showToast('Lenke kopiert'); } catch { showToast(link); }
    };
    const aDl = ce('a', { className: 'button', textContent: 'Last ned', href: `/download/${it.id}` });
    aDl.setAttribute('download', '');
    const btnDel = ce('button', { className: 'button danger', textContent: 'Slett' });
    btnDel.onclick = async () => {
      if (!confirm('Slette denne fila?')) return;
      await fetch(`/api/media/${it.id}`, { method: 'DELETE' });
      fetchMedia();
    };
    actions.appendChild(btnTag);
    actions.appendChild(btnShare);
    actions.appendChild(aDl);
    actions.appendChild(btnDel);

    // open preview on double-click; context menu on single-click (with small delay)
    let clickTimer;
    card.onclick = (e) => {
      if ((e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.type === 'checkbox'))) return;
      clearTimeout(clickTimer);
      const { clientX, clientY } = e;
      clickTimer = setTimeout(() => {
        showCtxMenuFor(it, clientX, clientY);
      }, 200);
    };
    card.ondblclick = (e) => {
      clearTimeout(clickTimer);
      openModal(it);
    };

    meta.appendChild(left); meta.appendChild(actions);
    card.appendChild(meta);

    grid.appendChild(card);
  }
  // tom-tekst
  if (!state.items.length) {
    grid.appendChild(ce('div', { style: 'grid-column:1/-1;text-align:center;color:#89a', textContent: 'Ingen filer enda. Last opp noe for å komme i gang.' }));
  }
  renderBreadcrumb();
  toggleSelectionToolbar();
  toggleFolderToolbar();
}

// modal
function openModal(item) {
  state.selected = item;
  const modal = qs('#modal');
  const img = qs('#modal-image');
  img.src = item.url;
  modal.classList.add('open');
}

// modal
function closeModal() { qs('#modal').classList.remove('open'); }

// opplasting
function setupUpload() {
  const fileInput = qs('#file-input');
  const uploadBtn = qs('#upload-btn');
  uploadBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) return alert('Velg noen filer først');
    const fd = new FormData();
    for (const f of fileInput.files) fd.append('files', f);
    if (state.folderId) fd.append('folder_id', state.folderId);
    showToast('Laster opp...');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) alert('Opplasting feila :/');
    fileInput.value = '';
    resetAndFetch();
  });
}

// søk
function setupSearch() {
  const input = qs('#search');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = input.value.trim(); resetAndFetch(); }, 300);
  });
}

// Filters & pagination
function setupFilters() {
  const typeSel = qs('#filter-type');
  const sortField = qs('#sort-field');
  const sortOrder = qs('#sort-order');
  const folderSel = qs('#folder-select');
  if (typeSel) typeSel.onchange = () => { state.type = typeSel.value; resetAndFetch(); };
  if (sortField) sortField.onchange = () => { state.sort = sortField.value; resetAndFetch(); };
  if (sortOrder) sortOrder.onchange = () => { state.order = sortOrder.value; resetAndFetch(); };
  if (folderSel) folderSel.onchange = () => { setFolder(folderSel.value); };
  const loadMore = qs('#btn-load-more');
  if (loadMore) loadMore.onclick = () => { state.page += 1; fetchMedia({ append: true }); };
}

// Selection helpers
function toggleSelect(id, on) {
  if (on) state.selectedIds.add(id); else state.selectedIds.delete(id);
  renderGallery();
}

function toggleSelectionToolbar() {
  const bar = qs('#selection-toolbar');
  if (!bar) return;
  bar.style.display = state.selectedIds.size ? 'flex' : 'none';
}

// valg
function setupSelectionBar() {
  const selAll = qs('#btn-select-all');
  const clearSel = qs('#btn-clear-sel');
  const bulkDel = qs('#btn-bulk-del');
  const moveBtn = qs('#btn-move-folder');
  if (selAll) selAll.onclick = () => { state.items.forEach(i => state.selectedIds.add(i.id)); renderGallery(); };
  if (clearSel) clearSel.onclick = () => { state.selectedIds.clear(); renderGallery(); };
  if (bulkDel) bulkDel.onclick = async () => {
    if (!state.selectedIds.size) return alert('Ingen valgt');
    if (!confirm(`Slette ${state.selectedIds.size} stk?`)) return;
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      await fetch(`/api/media/${id}`, { method: 'DELETE' });
    }
    state.selectedIds.clear();
    resetAndFetch();
  };
  if (moveBtn) moveBtn.onclick = async () => {
    if (!state.selectedIds.size) return alert('Ingen valgt');
    const target = state.folderId || prompt('Skriv inn mappe-ID (eller velg mappe først)') || '';
    if (!target) return;
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      await fetch(`/api/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: parseInt(target, 10) || null }) });
    }
    state.selectedIds.clear();
    resetAndFetch();
  };
}

// breadcrumb og mappehåndtering
async function renderBreadcrumb() {
  const el = qs('#breadcrumb');
  if (!el) return;
  if (!state.folderId) { el.innerHTML = '<a href="#" id="bc-root">Alle mapper</a>'; qs('#bc-root').onclick = (e)=>{e.preventDefault(); setFolder('');}; return; }
  // build chain by walking up parents
  const chain = [];
  let cur = state.folderId;
  for (let i=0;i<10 && cur; i++) {
    const r = await (await fetch(`/api/folders/${cur}`)).json();
    if (!r.ok) break;
    chain.push(r.item);
    cur = r.item.parent_id ? String(r.item.parent_id) : '';
  }
  chain.reverse();
  // render clickable trail
  const parts = ['<a href="#" data-fid="" class="bc">Alle mapper</a>'];
  for (const f of chain) {
    parts.push(`<span style="opacity:.6">/</span> <a href="#" data-fid="${f.id}" class="bc">${f.name}</a>`);
  }
  el.innerHTML = parts.join(' ');
  el.querySelectorAll('a.bc').forEach(a=>{
    a.onclick = (e)=>{ e.preventDefault(); setFolder(a.getAttribute('data-fid')||''); };
  });
  // sync dropdown
  const sel = qs('#folder-select');
  if (sel) sel.value = String(state.folderId);
}

function setFolder(fid) {
  state.folderId = fid || '';
  state.selectedIds.clear();
  state.folderCardSelectedId = '';
  loadFolders().then(()=>renderBreadcrumb());
  resetAndFetch();
}

// mappe-verktøylinje
function toggleFolderToolbar() {
  const bar = qs('#folder-toolbar');
  if (!bar) return;
  bar.style.display = (state.folderCardSelectedId || state.folderId) ? 'flex' : 'none';
}

function setupFolderToolbarActions() {
  const bar = qs('#folder-toolbar');
  if (!bar) return;
  const btnOpen = qs('#ft-open');
  const btnNew = qs('#ft-new');
  const btnRen = qs('#ft-rename');
  const btnIps = qs('#ft-ips');
  const btnDel = qs('#ft-delete');
  const activeFolderId = () => state.folderCardSelectedId || state.folderId || '';
  if (btnOpen) btnOpen.onclick = () => { const id = activeFolderId(); if (id && id !== state.folderId) setFolder(id); };
  if (btnNew) btnNew.onclick = async () => {
    const id = activeFolderId();
    if (!id) return;
    const name = prompt('Navn på undermappe?');
    if (!name) return;
    await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent_id: parseInt(id, 10) }) });
    await loadFolders();
    renderGallery();
  };
  if (btnRen) btnRen.onclick = async () => {
    const id = activeFolderId();
    if (!id) return;
    const cur = await (await fetch(`/api/folders/${id}`)).json();
    if (!cur.ok) return;
    const name = prompt('Nytt navn på mappe', cur.item.name || '');
    if (name === null) return;
    await fetch(`/api/folders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    await loadFolders();
    renderGallery();
  };
  if (btnIps) btnIps.onclick = async () => {
    const id = activeFolderId();
    if (!id) return;
    const raw = prompt('Komma-separerte IP-er (f.eks 127.0.0.1, 10.0.0.5)');
    if (raw === null) return;
    const ips = raw.split(',').map(s => s.trim()).filter(Boolean);
    await fetch(`/api/folders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed_ips: ips }) });
    await loadFolders();
    renderGallery();
  };
  if (btnDel) btnDel.onclick = async () => {
    const id = activeFolderId();
    if (!id) return;
    if (!confirm('Slette mappe? (må være tom)')) return;
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(()=>({error:'ukjent feil'}));
      alert(data.error || 'Sletting feila');
      return;
    }
    // hvis vi slettet mappen vi står i, gå opp ett nivå (til forelderen)
    if (String(state.folderId) === String(id)) {
      const cur = await (await fetch(`/api/folders/${id}`)).json().catch(()=>null);
      const parent = cur && cur.ok ? (cur.item.parent_id ? String(cur.item.parent_id) : '') : '';
      state.folderCardSelectedId = '';
      setFolder(parent);
    } else {
      state.folderCardSelectedId = '';
      await loadFolders();
      renderGallery();
    }
  };
}

// Drag & drop uploads
function setupDropzone() {
  const dz = qs('#dropzone');
  if (!dz) return;
  const prevent = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover','dragleave','drop'].forEach(ev => dz.addEventListener(ev, prevent));
  dz.addEventListener('dragover', () => dz.classList.add('dragover'));
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', async (e) => {
    dz.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (state.folderId) fd.append('folder_id', state.folderId);
    showToast(`Laster opp ${files.length} fil(er)...`);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) alert('Opplasting feila');
    resetAndFetch();
  });
}

// Mapper (folders)
async function loadFolders() {
  const url = new URL('/api/folders', window.location.origin);
  if (state.folderId !== '') url.searchParams.set('parent_id', state.folderId);
  // root returns parent_id IS NULL when no param
  const res = await fetch(url);
  const data = await res.json();
  state.folders = data.items || [];
  const sel = qs('#folder-select');
  if (!sel) return;
  const current = state.folderId;
  sel.innerHTML = '';
  sel.appendChild(new Option('Alle mapper', ''));
  for (const f of state.folders) {
    const opt = new Option(`${f.name} (#${f.id})`, String(f.id));
    sel.appendChild(opt);
  }
  sel.value = current || '';
}

function setupFolderButtons() {
  const btnNew = qs('#folder-new');
  const btnIps = qs('#folder-ips');
  const sel = qs('#folder-select');
  if (btnNew) btnNew.onclick = async () => {
    const name = prompt('Navn på mappe?');
    if (!name) return;
    await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent_id: state.folderId || null }) });
    await loadFolders();
  };
  if (btnIps) btnIps.onclick = async () => {
    if (!sel || !sel.value) return alert('Velg en mappe først');
    const raw = prompt('Komma-separerte IP-er (f.eks 127.0.0.1, 10.0.0.5)');
    if (raw === null) return;
    const ips = raw.split(',').map(s => s.trim()).filter(Boolean);
    await fetch(`/api/folders/${sel.value}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed_ips: ips }) });
    await loadFolders();
  };
}

// Toast notifications
let toastTimer;
function showToast(text) {
  const t = qs('#toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// reset og fetch
function resetAndFetch() {
  state.page = 1;
  fetchMedia({ append: false });
}

// init
window.addEventListener('DOMContentLoaded', () => {
  console.log('hei ✌️ media-bank frontenden er på'); // teen dev energy
  setupUpload();
  setupSearch();
  setupFilters();
  setupSelectionBar();
  setupDropzone();
  setupFolderButtons();
  setupFolderToolbarActions();
  loadFolders();
  const closeBtn = qs('#modal-close');
  if (closeBtn) closeBtn.onclick = closeModal;
  const modal = qs('#modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  setupContextMenu();
  resetAndFetch();
});

// Context menu for filer
let ctxCurrentItem = null;
function setupContextMenu() {
  const menu = qs('#ctx-menu');
  if (!menu) return;
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('open')) return;
    if (!menu.contains(e.target)) hideCtxMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });
  window.addEventListener('scroll', hideCtxMenu, { passive: true });
  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (!ctxCurrentItem) return;
    hideCtxMenu();
    const it = ctxCurrentItem;
    if (act === 'open') {
      openModal(it);
    } else if (act === 'download') {
      window.open(`/download/${it.id}`, '_blank');
    } else if (act === 'share') {
      const res = await fetch(`/share/${it.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!data.ok) return alert('Deling feila');
      const link = new URL(data.url, window.location.origin).toString();
      try { await navigator.clipboard.writeText(link); showToast('Lenke kopiert'); } catch { showToast(link); }
    } else if (act === 'rename') {
      const val = prompt('Nytt navn på filen', it.original_name || '');
      if (val === null) return;
      await fetch(`/api/media/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original_name: val }) });
      resetAndFetch();
    } else if (act === 'tags') {
      const existing = Array.isArray(it.tags) ? it.tags : [];
      const val = prompt('Komma-separerte tags', existing.join(', '));
      if (val === null) return;
      const tags = val.split(',').map(s => s.trim()).filter(Boolean);
      await fetch(`/api/media/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) });
      resetAndFetch();
    } else if (act === 'move') {
      const target = state.folderId || prompt('Skriv inn mappe-ID') || '';
      if (!target) return;
      await fetch(`/api/media/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder_id: parseInt(target, 10) || null }) });
      resetAndFetch();
    } else if (act === 'delete') {
      if (!confirm('Slette denne fila?')) return;
      await fetch(`/api/media/${it.id}`, { method: 'DELETE' });
      resetAndFetch();
    }
  });
}

function showCtxMenuFor(item, x, y) {
  ctxCurrentItem = item;
  const menu = qs('#ctx-menu');
  if (!menu) return;
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  menu.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
}

function hideCtxMenu() {
  const menu = qs('#ctx-menu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  ctxCurrentItem = null;
}
