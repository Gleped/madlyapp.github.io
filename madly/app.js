'use strict';
/* =========================================================
   Madly – opskrifter og gæstelog
   Al data gemmes lokalt i IndexedDB på enheden.
   ========================================================= */

const APP_VERSION = '1.0.0';

/* ---------- Små hjælpere ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const coll = new Intl.Collator('da', { sensitivity: 'base', numeric: true });
const norm = (s) => String(s || '').toLocaleLowerCase('da').normalize('NFD').replace(/[̀-ͯ]/g, '');
const byId = (arr, id) => arr.find((x) => x.id === id);
const hueOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return (h % 120) + 20; };
const initials = (s) => {
  const words = String(s).replace(/\b(og|&)\b/gi, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
};
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(d) ? iso : d.toLocaleDateString('da-DK', opts);
};
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : '#');

function formatText(t) {
  return esc(t)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" class="chev"><path d="M9 18l6-6-6-6"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
};

/* ---------- Database (IndexedDB) ---------- */
const STORES = ['recipes', 'guests', 'events', 'categories', 'images', 'meta'];
let _db;
function openDB() {
  return (_db ||= new Promise((res, rej) => {
    const r = indexedDB.open('madly', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('Databasefejl')); });
const db = {
  async all(s) { const d = await openDB(); return reqP(d.transaction(s).objectStore(s).getAll()); },
  async get(s, id) { const d = await openDB(); return reqP(d.transaction(s).objectStore(s).get(id)); },
  async put(s, ...vals) { const d = await openDB(); const t = d.transaction(s, 'readwrite'); const os = t.objectStore(s); vals.flat().forEach((v) => os.put(v)); return txDone(t); },
  async del(s, ...ids) { const d = await openDB(); const t = d.transaction(s, 'readwrite'); const os = t.objectStore(s); ids.flat().forEach((i) => os.delete(i)); return txDone(t); },
  async clear(...stores) { const d = await openDB(); const t = d.transaction(stores, 'readwrite'); stores.forEach((s) => t.objectStore(s).clear()); return txDone(t); },
};

/* ---------- State ---------- */
const S = {
  recipes: [], guests: [], events: [], categories: [],
  ui: { q: '', cat: '', sort: 'az', gq: '', gsort: 'az' },
};
const DEFAULT_CATS = ['Hverdag', 'Forret', 'Hovedret', 'Dessert', 'Snack - kage'];

function upsert(arr, item) { const i = arr.findIndex((x) => x.id === item.id); if (i >= 0) arr[i] = item; else arr.push(item); }
function removeFrom(arr, id) { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); }
const sortedCats = () => [...S.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || coll.compare(a.name, b.name));
const catNames = (ids = []) => sortedCats().filter((c) => ids.includes(c.id)).map((c) => c.name);
const guestName = (id) => byId(S.guests, id)?.name || 'Ukendt gæst';

async function loadAll() {
  const [recipes, guests, events, categories] = await Promise.all(['recipes', 'guests', 'events', 'categories'].map((s) => db.all(s)));
  Object.assign(S, { recipes, guests, events, categories });
}

async function seedIfNeeded() {
  const seeded = await db.get('meta', 'seeded');
  if (seeded) return;
  if (!S.categories.length) {
    const cats = DEFAULT_CATS.map((name, i) => ({ id: 'cat-' + norm(name).replace(/[^a-z]+/g, '-'), name, order: i }));
    await db.put('categories', cats);
    S.categories = cats;
  }
  await db.put('meta', { id: 'seeded', at: Date.now() });
}

/* ---------- Billeder ---------- */
const imgCache = new Map(); // "id:size" -> objectURL
async function imageURL(id, size = 'thumb') {
  const k = id + ':' + size;
  if (imgCache.has(k)) return imgCache.get(k);
  const rec = await db.get('images', id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec[size] || rec.full);
  imgCache.set(k, url);
  return url;
}
function forgetImage(id) {
  ['thumb', 'full'].forEach((s) => { const k = id + ':' + s; if (imgCache.has(k)) { URL.revokeObjectURL(imgCache.get(k)); imgCache.delete(k); } });
}
function hydrateImages(root = document) {
  $$('img[data-img]', root).forEach(async (img) => {
    const url = await imageURL(img.dataset.img, img.dataset.size || 'thumb');
    if (url) img.src = url;
  });
}
function loadImageEl(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Billedformatet kan ikke læses')); };
    img.src = url;
  });
}
function resizeTo(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Kunne ikke komprimere billedet'))), 'image/jpeg', quality));
}
async function processImage(file) {
  const { img, url } = await loadImageEl(file);
  try {
    const full = await resizeTo(img, 1600, 0.82);
    const thumb = await resizeTo(img, 480, 0.75);
    return { full, thumb };
  } finally { URL.revokeObjectURL(url); }
}
const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
function dataURLToBlob(d) {
  const [head, b64] = d.split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function thumbHTML(r, size = 'thumb') {
  const first = r?.imageIds?.[0];
  if (first) return `<img data-img="${first}" data-size="${size}" alt="" loading="lazy">`;
  return `<div class="ph" style="--h:${hueOf(r?.title || '')}">${esc((r?.title || '?').trim()[0]?.toUpperCase() || '?')}</div>`;
}

/* ---------- UI-hjælpere ---------- */
const view = $('#view');
const topbar = $('#topbar');
let H = {}; // handlers for den aktuelle visning

function setTop({ title = '', back = null, actions = '', brand = false }) {
  topbar.innerHTML = `
    ${back !== null ? `<button class="icon-btn" data-action="back" data-fallback="${esc(back)}" aria-label="Tilbage">${ICON.back}</button>` : '<span></span>'}
    <h1 class="${brand ? 'brand' : ''}">${brand ? 'Mad<span>ly</span>' : esc(title)}</h1>
    <div class="top-actions">${actions}</div>`;
}
function setTab(name) {
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  document.body.classList.toggle('no-tabs', !name);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function busy(on, text = 'Arbejder …') { $('#busy').hidden = !on; $('#busy-text').textContent = text; }

const dlg = $('#dialog');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(''); });
/** Åbner en dialog. Første knap er den primære (vises til højre / aktiveres med Enter). */
function dialog({ title, body = '', input = null, buttons = [{ label: 'OK', value: 'ok', cls: 'primary' }], stack = false }) {
  return new Promise((resolve) => {
    dlg.innerHTML = `<form method="dialog">
      <h3>${esc(title)}</h3>
      ${body ? `<div class="d-body">${body}</div>` : ''}
      ${input ? `<input class="d-input" name="v" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="off" ${input.required ? 'required' : ''}>` : ''}
      <div class="d-actions ${stack ? 'stack' : ''}">${buttons.map((b) => `<button value="${esc(b.value)}" class="btn ${b.cls || 'ghost'}" ${!b.value ? 'formnovalidate' : ''}>${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    dlg.returnValue = '';
    dlg.onclose = () => {
      dlg.onclose = null;
      const v = dlg.returnValue;
      if (input) resolve(v ? ($('.d-input', dlg).value || '').trim() : null);
      else resolve(v);
    };
    dlg.showModal();
    if (input) setTimeout(() => { const i = $('.d-input', dlg); i.focus(); i.select(); }, 60);
  });
}
const confirmDlg = async (title, body, ok = 'Slet', cls = 'danger') =>
  (await dialog({ title, body, buttons: [{ label: ok, value: 'ok', cls }, { label: 'Annuller', value: '' }] })) === 'ok';
const promptDlg = (title, { value = '', placeholder = '', ok = 'Gem' } = {}) =>
  dialog({ title, input: { value, placeholder, required: true }, buttons: [{ label: ok, value: 'ok', cls: 'primary' }, { label: 'Annuller', value: '' }] });

const lightbox = $('#lightbox');
lightbox.addEventListener('click', () => lightbox.close());

/* ---------- Navigation ---------- */
let navCount = 0, skipCount = false;
const scrollMem = {};
let currentPath = '';

function nav(path, replace = false) {
  const h = '#' + path;
  if (location.hash === h) { route(); return; }
  if (replace) { skipCount = true; location.replace(h); } else location.hash = h;
}
function goBack(fallback, steps = 1) {
  if (navCount >= steps) { navCount -= steps + 1; history.go(-steps); }
  else nav(fallback, true);
}
window.addEventListener('hashchange', () => { if (skipCount) skipCount = false; else navCount++; route(); });

function route() {
  if (currentPath) scrollMem[currentPath] = window.scrollY;
  const raw = location.hash.slice(1) || '/recipes';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const p = path.split('/').filter(Boolean);
  currentPath = path;
  H = {};
  if (dlg.open) dlg.close('');
  if (lightbox.open) lightbox.close();

  if (p[0] === 'recipes' || !p.length) viewRecipes();
  else if (p[0] === 'recipe' && p[1] === 'new') viewRecipeForm(null);
  else if (p[0] === 'recipe' && p[2] === 'edit') viewRecipeForm(p[1]);
  else if (p[0] === 'recipe') viewRecipe(p[1]);
  else if (p[0] === 'guests') viewGuests();
  else if (p[0] === 'guest') viewGuest(p[1]);
  else if (p[0] === 'event' && p[1] === 'new') viewEventForm(null, q);
  else if (p[0] === 'event' && p[2] === 'edit') viewEventForm(p[1], q);
  else if (p[0] === 'settings') viewSettings();
  else viewNotFound();

  const restore = ['recipes', 'guests', 'guest', 'settings'].includes(p[0] || 'recipes');
  window.scrollTo(0, restore ? scrollMem[path] || 0 : 0);
}

/* Globale event-delegeringer */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'back') { e.preventDefault(); goBack(el.dataset.fallback || '/recipes'); return; }
  if (a === 'lightbox') { e.preventDefault(); $('img', lightbox).src = el.src; lightbox.showModal(); return; }
  if (H[a]) { e.preventDefault(); H[a](el, e); }
});
document.addEventListener('input', (e) => H.onInput?.(e));
document.addEventListener('change', (e) => H.onChange?.(e));

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, 120) + 'px'; }

function viewNotFound() {
  setTab('recipes');
  setTop({ title: 'Ikke fundet', back: '/recipes' });
  view.innerHTML = `<div class="empty"><h3>Siden findes ikke</h3><p>Den er måske blevet slettet.</p><a class="btn primary" href="#/recipes">Til opskrifter</a></div>`;
}

/* =========================================================
   OPSKRIFTER – liste
   ========================================================= */
function viewRecipes() {
  setTab('recipes');
  setTop({ brand: true });
  if (!S.recipes.length) {
    view.innerHTML = `<div class="empty">
      <h3>Ingen opskrifter endnu</h3>
      <p>Tilføj din første opskrift – et billede og en titel er nok til at komme i gang.</p>
      <button class="btn primary" data-action="new-recipe">${ICON.plus} Ny opskrift</button>
    </div><button class="fab" data-action="new-recipe" aria-label="Ny opskrift">${ICON.plus}</button>`;
    H = { 'new-recipe': () => nav('/recipe/new') };
    return;
  }
  if (S.ui.cat && !byId(S.categories, S.ui.cat)) S.ui.cat = '';
  view.innerHTML = `
    <div class="searchbar">${ICON.search}<input type="search" id="q" placeholder="Søg i opskrifter" value="${esc(S.ui.q)}" autocomplete="off" enterkeyhint="search"></div>
    <div class="chips scroll" id="catfilter">
      <button class="chip ${!S.ui.cat ? 'on' : ''}" data-action="filter-cat" data-id="">Alle</button>
      ${sortedCats().map((c) => `<button class="chip ${S.ui.cat === c.id ? 'on' : ''}" data-action="filter-cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}
    </div>
    <div class="listmeta"><span id="count"></span><button class="link-btn" data-action="toggle-sort" id="sortbtn"></button></div>
    <div class="grid" id="grid"></div>
    <button class="fab" data-action="new-recipe" aria-label="Ny opskrift">${ICON.plus}</button>`;
  renderGrid();
  H = {
    'new-recipe': () => nav('/recipe/new'),
    'filter-cat': (el) => {
      S.ui.cat = el.dataset.id;
      $$('#catfilter .chip').forEach((c) => c.classList.toggle('on', c === el));
      renderGrid();
    },
    'toggle-sort': () => { S.ui.sort = S.ui.sort === 'az' ? 'new' : 'az'; renderGrid(); },
    onInput: (e) => { if (e.target.id === 'q') { S.ui.q = e.target.value; renderGrid(); } },
  };
}

function renderGrid() {
  const q = norm(S.ui.q.trim());
  const list = S.recipes.filter((r) =>
    (!S.ui.cat || r.categoryIds?.includes(S.ui.cat)) &&
    (!q || norm(r.title + ' ' + (r.description || '')).includes(q)));
  list.sort(S.ui.sort === 'az' ? (a, b) => coll.compare(a.title, b.title) : (a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('#count').textContent = plural(list.length, 'opskrift', 'opskrifter');
  $('#sortbtn').textContent = S.ui.sort === 'az' ? 'Sorteret: A–Å' : 'Sorteret: Nyeste';
  const grid = $('#grid');
  grid.innerHTML = list.length
    ? list.map((r) => `<a class="card" href="#/recipe/${r.id}">
        <div class="card-img">${thumbHTML(r)}</div>
        <div class="card-body"><h3>${esc(r.title)}</h3><p>${esc(catNames(r.categoryIds).join(' · ') || ' ')}</p></div>
      </a>`).join('')
    : `<div class="empty" style="grid-column:1/-1">Ingen opskrifter matcher.</div>`;
  hydrateImages(grid);
}

/* =========================================================
   OPSKRIFT – visning
   ========================================================= */
function viewRecipe(id) {
  const r = byId(S.recipes, id);
  if (!r) return viewNotFound();
  setTab('recipes');
  setTop({ title: r.title, back: '/recipes', actions: `<button class="icon-btn" data-action="edit" aria-label="Rediger">${ICON.edit}</button>` });

  const hist = S.events.filter((e) => e.recipeIds?.includes(id)).sort(byDateDesc);
  const imgs = r.imageIds || [];
  const links = (r.links || []).filter((l) => l.url);

  view.innerHTML = `
    ${imgs.length ? `<div class="gallery-wrap">
      <div class="gallery" id="gallery">${imgs.map((i) => `<img data-img="${i}" data-size="full" data-action="lightbox" alt="">`).join('')}</div>
      ${imgs.length > 1 ? `<div class="gallery-count"><span id="gi">1</span> / ${imgs.length}</div>` : ''}
    </div>` : ''}
    <article class="recipe">
      <h2 class="title">${esc(r.title)}</h2>
      ${catNames(r.categoryIds).map((n) => `<span class="tag">${esc(n)}</span>`).join('')}
      ${r.description ? `<div class="desc" style="margin-top:10px">${formatText(r.description)}</div>` : ''}
      ${links.length ? `<section class="section"><h3>Links</h3><ul class="links">${links.map((l) => `
        <li><a class="linkrow" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${ICON.link}
          <span><strong>${esc(l.label || hostOf(l.url))}</strong><small>${esc(l.label ? hostOf(l.url) : l.url)}</small></span></a></li>`).join('')}
      </ul></section>` : ''}
      <section class="section">
        <h3>Serveret for</h3>
        ${hist.length ? `<ul class="history">${hist.map((e) => `<li>
            <div class="h-date">${fmtDate(e.date)}${e.title ? ' · ' + esc(e.title) : ''}</div>
            <div>${(e.guestIds || []).map((g) => `<a href="#/guest/${g}">${esc(guestName(g))}</a>`).join(', ')}</div>
          </li>`).join('')}</ul>`
        : '<p class="muted" style="margin:0">Ikke serveret for gæster endnu.</p>'}
      </section>
    </article>`;
  hydrateImages(view);

  const g = $('#gallery'), gi = $('#gi');
  if (g && gi) g.addEventListener('scroll', () => { gi.textContent = Math.round(g.scrollLeft / g.clientWidth) + 1; }, { passive: true });

  H = { edit: () => nav(`/recipe/${id}/edit`) };
}

/* =========================================================
   OPSKRIFT – opret / rediger
   ========================================================= */
let draft = null;
let saving = false;

function viewRecipeForm(id) {
  const r = id ? byId(S.recipes, id) : null;
  if (id && !r) return viewNotFound();
  setTab(null);
  draft = {
    id: r?.id || uid(),
    title: r?.title || '',
    description: r?.description || '',
    categoryIds: [...(r?.categoryIds || (S.ui.cat ? [S.ui.cat] : []))],
    links: (r?.links || []).map((l) => ({ ...l })),
    images: (r?.imageIds || []).map((i) => ({ id: i })),
    removed: [],
    processing: 0,
  };
  setTop({
    title: r ? 'Rediger opskrift' : 'Ny opskrift',
    back: r ? `/recipe/${r.id}` : '/recipes',
    actions: `<button class="btn small primary" data-action="save">Gem</button>`,
  });
  view.innerHTML = `<form class="form" id="rf" autocomplete="off" onsubmit="return false">
    <label class="field"><span>Titel</span>
      <input data-field="title" value="${esc(draft.title)}" placeholder="Fx Lasagne med spinat" enterkeyhint="next"></label>
    <div class="field"><span>Billeder</span><div class="img-edit" id="imgs"></div></div>
    <div class="field"><span>Kategorier</span><div class="chips wrap" id="cats"></div></div>
    <label class="field"><span>Beskrivelse</span>
      <textarea data-field="description" rows="6" placeholder="Ingredienser, fremgangsmåde, noter …">${esc(draft.description)}</textarea></label>
    <div class="field"><span>Links</span><div id="links"></div>
      <button type="button" class="btn ghost" data-action="add-link">${ICON.plus} Tilføj link</button></div>
    <div class="form-actions">
      <button type="button" class="btn primary block" data-action="save">Gem opskrift</button>
      ${r ? `<button type="button" class="btn danger-ghost block" data-action="delete">${ICON.trash} Slet opskrift</button>` : ''}
    </div>
  </form>`;
  renderImgEdit(); renderCatPick(); renderLinkEdit();
  const ta = $('textarea[data-field=description]'); autoGrow(ta);
  if (!r) setTimeout(() => $('[data-field=title]')?.focus(), 80);

  H = {
    onInput: (e) => {
      const t = e.target;
      if (t.dataset.field) { draft[t.dataset.field] = t.value; if (t.tagName === 'TEXTAREA') autoGrow(t); }
      if (t.dataset.link !== undefined) draft.links[+t.dataset.link][t.dataset.lf] = t.value;
    },
    onChange: (e) => { if (e.target.id === 'imgfile') addImages(e.target.files); },
    'toggle-cat': (el) => {
      const cid = el.dataset.id;
      const i = draft.categoryIds.indexOf(cid);
      if (i >= 0) draft.categoryIds.splice(i, 1); else draft.categoryIds.push(cid);
      el.classList.toggle('on', i < 0);
    },
    'new-cat': async () => {
      const c = await createCategory();
      if (c) { draft.categoryIds.push(c.id); renderCatPick(); }
    },
    'add-link': () => {
      draft.links.push({ url: '', label: '' });
      renderLinkEdit();
      $$('#links input[data-lf=url]').pop()?.focus();
    },
    'remove-link': (el) => { draft.links.splice(+el.dataset.i, 1); renderLinkEdit(); },
    'img-remove': (el) => {
      const [im] = draft.images.splice(+el.dataset.i, 1);
      if (im.isNew) URL.revokeObjectURL(im.url); else draft.removed.push(im.id);
      renderImgEdit();
    },
    'img-cover': (el) => {
      const [im] = draft.images.splice(+el.dataset.i, 1);
      draft.images.unshift(im);
      renderImgEdit();
    },
    save: saveRecipe,
    delete: () => deleteRecipe(r),
  };
}

function renderImgEdit() {
  const box = $('#imgs');
  if (!box) return;
  box.innerHTML = draft.images.map((im, i) => `
    <div class="img-tile ${i === 0 ? 'cover' : ''}">
      ${im.url ? `<img src="${im.url}" alt="">` : `<img data-img="${im.id}" alt="">`}
      ${i === 0 ? '<span class="badge">Forside</span>' : `<button type="button" class="tile-btn left" data-action="img-cover" data-i="${i}" aria-label="Brug som forsidebillede">${ICON.star}</button>`}
      <button type="button" class="tile-btn" data-action="img-remove" data-i="${i}" aria-label="Fjern billede">${ICON.x}</button>
    </div>`).join('')
    + Array.from({ length: draft.processing }, () => '<div class="img-busy"><div class="spinner"></div></div>').join('')
    + `<label class="img-add">${ICON.camera}<span>Tilføj</span><input type="file" accept="image/*" multiple hidden id="imgfile"></label>`;
  hydrateImages(box);
}

async function addImages(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  draft.processing += files.length;
  renderImgEdit();
  const d = draft;
  for (const f of files) {
    try {
      const { full, thumb } = await processImage(f);
      d.images.push({ id: uid(), isNew: true, full, thumb, url: URL.createObjectURL(thumb) });
    } catch (err) {
      toast(`${f.name}: ${err.message}`);
    }
    d.processing--;
    if (draft === d) renderImgEdit();
  }
}

function renderCatPick() {
  $('#cats').innerHTML = sortedCats().map((c) =>
    `<button type="button" class="chip ${draft.categoryIds.includes(c.id) ? 'on' : ''}" data-action="toggle-cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')
    + `<button type="button" class="chip add" data-action="new-cat">${ICON.plus} Ny kategori</button>`;
}

function renderLinkEdit() {
  $('#links').innerHTML = draft.links.map((l, i) => `
    <div class="link-edit">
      <input type="url" inputmode="url" autocapitalize="off" placeholder="https://…" value="${esc(l.url)}" data-link="${i}" data-lf="url">
      <input placeholder="Navn (valgfrit), fx Valdemarsro" value="${esc(l.label || '')}" data-link="${i}" data-lf="label">
      <button type="button" class="icon-btn" data-action="remove-link" data-i="${i}" aria-label="Fjern link">${ICON.trash}</button>
    </div>`).join('');
}

function cleanLinks(links) {
  return links
    .map((l) => ({ url: (l.url || '').trim(), label: (l.label || '').trim() }))
    .filter((l) => l.url)
    .map((l) => ({ ...l, url: /^https?:\/\//i.test(l.url) ? l.url : 'https://' + l.url.replace(/^\/+/, '') }));
}

async function saveRecipe() {
  if (saving) return;
  const title = draft.title.trim();
  if (!title) { toast('Opskriften mangler en titel'); $('[data-field=title]')?.focus(); return; }
  if (draft.processing) { toast('Vent et øjeblik – billederne behandles stadig'); return; }
  saving = true;
  try {
    const old = byId(S.recipes, draft.id);
    const newImgs = draft.images.filter((i) => i.isNew);
    if (newImgs.length) await db.put('images', newImgs.map((i) => ({ id: i.id, full: i.full, thumb: i.thumb })));
    const now = Date.now();
    const rec = {
      id: draft.id,
      title,
      description: draft.description.trim(),
      categoryIds: draft.categoryIds.filter((c) => byId(S.categories, c)),
      links: cleanLinks(draft.links),
      imageIds: draft.images.map((i) => i.id),
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    await db.put('recipes', rec);
    if (draft.removed.length) { await db.del('images', draft.removed); draft.removed.forEach(forgetImage); }
    newImgs.forEach((i) => imgCache.set(i.id + ':thumb', i.url));
    upsert(S.recipes, rec);
    toast('Opskrift gemt');
    if (old) goBack(`/recipe/${rec.id}`);
    else nav(`/recipe/${rec.id}`, true);
  } catch (err) {
    toast('Kunne ikke gemme: ' + err.message);
  } finally { saving = false; }
}

async function deleteRecipe(r) {
  const used = S.events.filter((e) => e.recipeIds?.includes(r.id));
  const ok = await confirmDlg('Slet opskrift?',
    `<b>${esc(r.title)}</b> slettes permanent.${used.length ? ` Den fjernes også fra ${plural(used.length, 'begivenhed', 'begivenheder')}.` : ''}`);
  if (!ok) return;
  for (const e of used) { e.recipeIds = e.recipeIds.filter((x) => x !== r.id); }
  if (used.length) await db.put('events', used);
  await db.del('images', r.imageIds || []);
  (r.imageIds || []).forEach(forgetImage);
  await db.del('recipes', r.id);
  removeFrom(S.recipes, r.id);
  toast('Opskrift slettet');
  goBack('/recipes', 2);
}

/* ---------- Kategorier ---------- */
async function createCategory() {
  const name = await promptDlg('Ny kategori', { placeholder: 'Fx Tilbehør', ok: 'Opret' });
  if (!name) return null;
  const existing = S.categories.find((c) => coll.compare(c.name, name) === 0);
  if (existing) { toast('Kategorien findes allerede'); return existing; }
  const order = Math.max(-1, ...S.categories.map((c) => c.order ?? 0)) + 1;
  const c = { id: uid(), name, order };
  await db.put('categories', c);
  S.categories.push(c);
  return c;
}

/* =========================================================
   GÆSTER – liste
   ========================================================= */
function guestStats(gid) {
  const evs = S.events.filter((e) => e.guestIds?.includes(gid));
  return { count: evs.length, last: evs.reduce((m, e) => (e.date > m ? e.date : m), '') };
}

function viewGuests() {
  setTab('guests');
  setTop({ title: 'Gæster' });
  if (!S.guests.length) {
    view.innerHTML = `<div class="empty">
      <h3>Ingen gæster endnu</h3>
      <p>Opret fx “Mikkel og Cecilie”, og log hvad I fik, når de var på besøg.</p>
      <button class="btn primary" data-action="new-guest">${ICON.plus} Ny gæst</button>
    </div><button class="fab" data-action="new-guest" aria-label="Ny gæst">${ICON.plus}</button>`;
    H = { 'new-guest': newGuest };
    return;
  }
  view.innerHTML = `
    <div class="searchbar">${ICON.search}<input type="search" id="gq" placeholder="Søg i gæster" value="${esc(S.ui.gq)}" autocomplete="off"></div>
    <div class="listmeta"><span id="gcount"></span><button class="link-btn" data-action="toggle-gsort" id="gsortbtn"></button></div>
    <ul class="list" id="glist" style="margin-top:0"></ul>
    <button class="fab" data-action="new-guest" aria-label="Ny gæst">${ICON.plus}</button>`;
  renderGuestList();
  H = {
    'new-guest': newGuest,
    'toggle-gsort': () => { S.ui.gsort = S.ui.gsort === 'az' ? 'recent' : 'az'; renderGuestList(); },
    onInput: (e) => { if (e.target.id === 'gq') { S.ui.gq = e.target.value; renderGuestList(); } },
  };
}

function renderGuestList() {
  const q = norm(S.ui.gq.trim());
  const list = S.guests.filter((g) => !q || norm(g.name).includes(q)).map((g) => ({ g, ...guestStats(g.id) }));
  list.sort(S.ui.gsort === 'az' ? (a, b) => coll.compare(a.g.name, b.g.name) : (a, b) => b.last.localeCompare(a.last) || coll.compare(a.g.name, b.g.name));
  $('#gcount').textContent = plural(list.length, 'gæst', 'gæster');
  $('#gsortbtn').textContent = S.ui.gsort === 'az' ? 'Sorteret: A–Å' : 'Sorteret: Seneste besøg';
  $('#glist').innerHTML = list.length ? list.map(({ g, count, last }) => `
    <li><a class="row" href="#/guest/${g.id}">
      <div class="avatar" style="--h:${hueOf(g.name)}">${esc(initials(g.name))}</div>
      <div class="grow"><strong>${esc(g.name)}</strong>
        <small>${count ? `${plural(count, 'besøg', 'besøg')} · senest ${fmtDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Ingen besøg endnu'}</small></div>
      ${ICON.chev}
    </a></li>`).join('') : '<li class="pick-empty" style="padding:16px">Ingen gæster matcher.</li>';
}

async function createGuest(name) {
  const g = { id: uid(), name, createdAt: Date.now() };
  await db.put('guests', g);
  S.guests.push(g);
  return g;
}
async function newGuest() {
  const name = await promptDlg('Ny gæst', { placeholder: 'Fx Mikkel og Cecilie', ok: 'Opret' });
  if (!name) return;
  const g = await createGuest(name);
  nav(`/guest/${g.id}`);
}

/* =========================================================
   GÆST – visning
   ========================================================= */
function viewGuest(id) {
  const g = byId(S.guests, id);
  if (!g) return viewNotFound();
  setTab('guests');
  setTop({ title: g.name, back: '/guests', actions: `<button class="icon-btn" data-action="guest-menu" aria-label="Flere valg">${ICON.more}</button>` });
  const evs = S.events.filter((e) => e.guestIds?.includes(id)).sort(byDateDesc);

  view.innerHTML = `
    <div class="guest-head">
      <div class="avatar lg" style="--h:${hueOf(g.name)}">${esc(initials(g.name))}</div>
      <div><h2>${esc(g.name)}</h2>
        <p class="muted">${evs.length ? `${plural(evs.length, 'besøg', 'besøg')} · senest ${fmtDate(evs[0].date)}` : 'Ingen besøg endnu'}</p></div>
    </div>
    <button class="btn primary block" data-action="new-event">${ICON.plus} Ny begivenhed</button>
    <div class="events">${evs.map((e) => eventCard(e, id)).join('')}</div>
    ${!evs.length ? '<div class="empty" style="padding-top:28px">Opret en begivenhed, når de har været på besøg, og vælg de retter, I fik.</div>' : ''}`;
  hydrateImages(view);

  H = {
    'new-event': () => nav(`/event/new?guest=${id}`),
    'edit-event': (el) => nav(`/event/${el.dataset.id}/edit?guest=${id}`),
    'guest-menu': async () => {
      const v = await dialog({
        title: g.name, stack: true,
        buttons: [{ label: 'Omdøb', value: 'rename', cls: 'ghost' }, { label: 'Slet gæst', value: 'delete', cls: 'danger-ghost' }, { label: 'Annuller', value: '' }],
      });
      if (v === 'rename') {
        const name = await promptDlg('Omdøb gæst', { value: g.name });
        if (name && name !== g.name) { g.name = name; await db.put('guests', g); viewGuest(id); toast('Navn ændret'); }
      } else if (v === 'delete') {
        await deleteGuest(g);
      }
    },
  };
}

function eventCard(e, currentGuestId) {
  const others = (e.guestIds || []).filter((x) => x !== currentGuestId);
  const recipes = (e.recipeIds || []).map((rid) => byId(S.recipes, rid)).filter(Boolean);
  return `<article class="event">
    <header>
      <div><div class="e-date">${fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        ${e.title ? `<div class="e-title">${esc(e.title)}</div>` : ''}</div>
      <button class="icon-btn small" data-action="edit-event" data-id="${e.id}" aria-label="Rediger begivenhed">${ICON.edit}</button>
    </header>
    ${others.length ? `<div class="e-with muted">Sammen med ${others.map((g) => `<a href="#/guest/${g}">${esc(guestName(g))}</a>`).join(', ')}</div>` : ''}
    ${recipes.length ? `<ul class="e-recipes">${recipes.map((r) => `
      <li><a href="#/recipe/${r.id}"><div class="thumb">${thumbHTML(r)}</div>
        <div><strong>${esc(r.title)}</strong><small>${esc(catNames(r.categoryIds).join(' · '))}</small></div></a></li>`).join('')}</ul>`
      : '<p class="e-empty">Ingen retter valgt.</p>'}
    ${e.note ? `<div class="e-note">${formatText(e.note)}</div>` : ''}
  </article>`;
}

async function deleteGuest(g) {
  const evs = S.events.filter((e) => e.guestIds?.includes(g.id));
  const solo = evs.filter((e) => e.guestIds.length === 1);
  const ok = await confirmDlg('Slet gæst?',
    `<b>${esc(g.name)}</b> slettes.${solo.length ? ` ${plural(solo.length, 'begivenhed', 'begivenheder')}, hvor kun denne gæst var med, slettes også.` : ''}`);
  if (!ok) return;
  const shared = evs.filter((e) => e.guestIds.length > 1);
  shared.forEach((e) => { e.guestIds = e.guestIds.filter((x) => x !== g.id); });
  if (shared.length) await db.put('events', shared);
  if (solo.length) await db.del('events', solo.map((e) => e.id));
  solo.forEach((e) => removeFrom(S.events, e.id));
  await db.del('guests', g.id);
  removeFrom(S.guests, g.id);
  toast('Gæst slettet');
  goBack('/guests');
}

/* =========================================================
   BEGIVENHED – opret / rediger
   ========================================================= */
let edraft = null;

function viewEventForm(id, q) {
  const ev = id ? byId(S.events, id) : null;
  if (id && !ev) return viewNotFound();
  setTab(null);
  const fromGuest = q.get('guest');
  edraft = {
    id: ev?.id || uid(),
    date: ev?.date || todayISO(),
    title: ev?.title || '',
    note: ev?.note || '',
    guestIds: [...(ev?.guestIds || (fromGuest && byId(S.guests, fromGuest) ? [fromGuest] : []))],
    recipeIds: [...(ev?.recipeIds || [])],
    rq: '', rcat: '',
    fromGuest,
  };
  const backTo = fromGuest ? `/guest/${fromGuest}` : '/guests';
  setTop({ title: ev ? 'Rediger begivenhed' : 'Ny begivenhed', back: backTo, actions: `<button class="btn small primary" data-action="save">Gem</button>` });

  view.innerHTML = `<form class="form" autocomplete="off" onsubmit="return false">
    <label class="field"><span>Dato</span><input type="date" data-field="date" value="${esc(edraft.date)}"></label>
    <label class="field"><span>Anledning (valgfri)</span><input data-field="title" value="${esc(edraft.title)}" placeholder="Fx Nytårsaften"></label>
    <div class="field"><span>Gæster</span><div class="chips wrap" id="gpick"></div></div>
    <div class="field"><span>Det fik vi</span>
      <ul class="selected" id="rsel"></ul>
      <div class="picker">
        <div class="searchbar small">${ICON.search}<input type="search" id="rq" placeholder="Find opskrift" autocomplete="off"></div>
        <div class="chips scroll" id="rcats"></div>
        <ul class="pick-list" id="rlist"></ul>
      </div>
    </div>
    <label class="field"><span>Noter (valgfri)</span>
      <textarea data-field="note" rows="3" placeholder="Fx allergier, vin, hvad der faldt i god jord …">${esc(edraft.note)}</textarea></label>
    <div class="form-actions">
      <button type="button" class="btn primary block" data-action="save">Gem begivenhed</button>
      ${ev ? `<button type="button" class="btn danger-ghost block" data-action="delete">${ICON.trash} Slet begivenhed</button>` : ''}
    </div>
  </form>`;
  renderGuestPick(); renderSelected(); renderRecipeCats(); renderRecipePick();
  autoGrow($('textarea[data-field=note]'));

  H = {
    onInput: (e) => {
      const t = e.target;
      if (t.dataset.field) { edraft[t.dataset.field] = t.value; if (t.tagName === 'TEXTAREA') autoGrow(t); }
      if (t.id === 'rq') { edraft.rq = t.value; renderRecipePick(); }
    },
    'toggle-guest': (el) => {
      const gid = el.dataset.id, i = edraft.guestIds.indexOf(gid);
      if (i >= 0) edraft.guestIds.splice(i, 1); else edraft.guestIds.push(gid);
      el.classList.toggle('on', i < 0);
    },
    'add-guest': async () => {
      const name = await promptDlg('Ny gæst', { placeholder: 'Fx Anna og Jonas', ok: 'Opret' });
      if (!name) return;
      const g = await createGuest(name);
      edraft.guestIds.push(g.id);
      renderGuestPick();
    },
    'rcat': (el) => { edraft.rcat = el.dataset.id; $$('#rcats .chip').forEach((c) => c.classList.toggle('on', c === el)); renderRecipePick(); },
    'toggle-recipe': (el) => {
      const rid = el.dataset.id, i = edraft.recipeIds.indexOf(rid);
      if (i >= 0) edraft.recipeIds.splice(i, 1); else edraft.recipeIds.push(rid);
      el.classList.toggle('on', i < 0);
      renderSelected();
    },
    'unselect-recipe': (el) => {
      edraft.recipeIds = edraft.recipeIds.filter((x) => x !== el.dataset.id);
      renderSelected();
      $$(`#rlist [data-id="${el.dataset.id}"]`).forEach((b) => b.classList.remove('on'));
    },
    save: saveEvent,
    delete: () => deleteEvent(ev),
  };
}

function renderGuestPick() {
  const gs = [...S.guests].sort((a, b) => coll.compare(a.name, b.name));
  $('#gpick').innerHTML = gs.map((g) =>
    `<button type="button" class="chip ${edraft.guestIds.includes(g.id) ? 'on' : ''}" data-action="toggle-guest" data-id="${g.id}">${esc(g.name)}</button>`).join('')
    + `<button type="button" class="chip add" data-action="add-guest">${ICON.plus} Ny gæst</button>`;
}
function renderSelected() {
  const box = $('#rsel');
  const rs = edraft.recipeIds.map((id) => byId(S.recipes, id)).filter(Boolean);
  box.innerHTML = rs.map((r) => `<li><div class="thumb">${thumbHTML(r)}</div><span class="grow">${esc(r.title)}</span>
    <button type="button" class="icon-btn" data-action="unselect-recipe" data-id="${r.id}" aria-label="Fjern">${ICON.x}</button></li>`).join('');
  box.hidden = !rs.length;
  hydrateImages(box);
}
function renderRecipeCats() {
  $('#rcats').innerHTML = `<button type="button" class="chip on" data-action="rcat" data-id="">Alle</button>`
    + sortedCats().map((c) => `<button type="button" class="chip" data-action="rcat" data-id="${c.id}">${esc(c.name)}</button>`).join('');
}
function renderRecipePick() {
  const q = norm(edraft.rq.trim());
  const list = S.recipes
    .filter((r) => (!edraft.rcat || r.categoryIds?.includes(edraft.rcat)) && (!q || norm(r.title).includes(q)))
    .sort((a, b) => coll.compare(a.title, b.title));
  const box = $('#rlist');
  box.innerHTML = list.length ? list.map((r) => `<li>
      <button type="button" class="${edraft.recipeIds.includes(r.id) ? 'on' : ''}" data-action="toggle-recipe" data-id="${r.id}">
        <div class="thumb">${thumbHTML(r)}</div>
        <div class="grow"><strong>${esc(r.title)}</strong><small>${esc(catNames(r.categoryIds).join(' · '))}</small></div>
        <span class="check">${ICON.check}</span>
      </button></li>`).join('')
    : `<li class="pick-empty">${S.recipes.length ? 'Ingen opskrifter matcher.' : 'Du har ingen opskrifter endnu. Opret dem under Opskrifter.'}</li>`;
  hydrateImages(box);
}

async function saveEvent() {
  if (saving) return;
  if (!edraft.date) { toast('Vælg en dato'); return; }
  const guestIds = edraft.guestIds.filter((g) => byId(S.guests, g));
  if (!guestIds.length) { toast('Vælg mindst én gæst'); return; }
  saving = true;
  try {
    const old = byId(S.events, edraft.id);
    const ev = {
      id: edraft.id, date: edraft.date, title: edraft.title.trim(), note: edraft.note.trim(),
      guestIds, recipeIds: edraft.recipeIds.filter((r) => byId(S.recipes, r)),
      createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
    };
    await db.put('events', ev);
    upsert(S.events, ev);
    toast('Begivenhed gemt');
    const target = edraft.fromGuest && guestIds.includes(edraft.fromGuest) ? edraft.fromGuest : guestIds[0];
    if (edraft.fromGuest === target) goBack(`/guest/${target}`);
    else nav(`/guest/${target}`, true);
  } catch (err) {
    toast('Kunne ikke gemme: ' + err.message);
  } finally { saving = false; }
}

async function deleteEvent(ev) {
  if (!(await confirmDlg('Slet begivenhed?', `Begivenheden d. <b>${fmtDate(ev.date)}</b> slettes. Opskrifterne bliver ikke slettet.`))) return;
  await db.del('events', ev.id);
  removeFrom(S.events, ev.id);
  toast('Begivenhed slettet');
  goBack(edraft.fromGuest ? `/guest/${edraft.fromGuest}` : '/guests');
}

/* =========================================================
   INDSTILLINGER – kategorier og backup
   ========================================================= */
async function viewSettings() {
  setTab('settings');
  setTop({ title: 'Indstillinger' });
  view.innerHTML = `
    <section class="card-sec">
      <h3>Kategorier</h3>
      <ul class="list compact" id="catlist"></ul>
      <button class="btn ghost block" data-action="add-cat">${ICON.plus} Ny kategori</button>
    </section>
    <section class="card-sec">
      <h3>Backup</h3>
      <p class="muted">Dine data ligger kun på denne enhed. Tag en backup jævnligt, og gem filen et sikkert sted, fx i iCloud Drive eller Google Drev. Filen indeholder også billederne.</p>
      <div class="stats">${plural(S.recipes.length, 'opskrift', 'opskrifter')} · ${plural(S.guests.length, 'gæst', 'gæster')} · ${plural(S.events.length, 'begivenhed', 'begivenheder')}</div>
      <p class="muted small" id="storage" style="margin:0 0 4px"></p>
      <p class="muted small" id="lastexport" style="margin:0 0 14px"></p>
      <button class="btn primary block" data-action="export">Eksportér backup</button>
      <label class="btn ghost block">Importér backup<input type="file" accept="application/json,.json" hidden id="importfile"></label>
    </section>
    <section class="card-sec">
      <h3>Om Madly</h3>
      <p class="muted small" style="margin:0">Version ${APP_VERSION}. Appen virker uden internet, når den først er åbnet én gang.</p>
    </section>`;
  renderCatList();

  H = {
    'add-cat': async () => { if (await createCategory()) renderCatList(); },
    'rename-cat': async (el) => {
      const c = byId(S.categories, el.dataset.id);
      const name = await promptDlg('Omdøb kategori', { value: c.name });
      if (name && name !== c.name) { c.name = name; await db.put('categories', c); renderCatList(); }
    },
    'delete-cat': async (el) => {
      const c = byId(S.categories, el.dataset.id);
      const used = S.recipes.filter((r) => r.categoryIds?.includes(c.id));
      if (!(await confirmDlg('Slet kategori?', `<b>${esc(c.name)}</b> slettes.${used.length ? ` Den fjernes fra ${plural(used.length, 'opskrift', 'opskrifter')} – selve opskrifterne bevares.` : ''}`))) return;
      used.forEach((r) => { r.categoryIds = r.categoryIds.filter((x) => x !== c.id); });
      if (used.length) await db.put('recipes', used);
      await db.del('categories', c.id);
      removeFrom(S.categories, c.id);
      renderCatList();
    },
    'move-cat': async (el) => {
      const cats = sortedCats();
      const i = cats.findIndex((c) => c.id === el.dataset.id), j = i + (+el.dataset.dir);
      if (j < 0 || j >= cats.length) return;
      [cats[i], cats[j]] = [cats[j], cats[i]];
      cats.forEach((c, k) => { c.order = k; });
      await db.put('categories', cats);
      renderCatList();
    },
    export: exportData,
    onChange: (e) => { if (e.target.id === 'importfile' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } },
  };

  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null && $('#storage')) $('#storage').textContent = `Bruger ca. ${(est.usage / 1048576).toFixed(1)} MB på enheden.`;
  } catch { /* ignore */ }
  const last = await db.get('meta', 'lastExport');
  if ($('#lastexport')) $('#lastexport').textContent = last ? `Seneste backup: ${fmtDate(new Date(last.at).toISOString())}` : 'Du har ikke taget en backup endnu.';
}

function renderCatList() {
  const cats = sortedCats();
  $('#catlist').innerHTML = cats.map((c, i) => {
    const n = S.recipes.filter((r) => r.categoryIds?.includes(c.id)).length;
    return `<li><div class="row">
      <div class="grow"><strong>${esc(c.name)}</strong><small>${plural(n, 'opskrift', 'opskrifter')}</small></div>
      <button class="icon-btn small" data-action="move-cat" data-id="${c.id}" data-dir="-1" aria-label="Flyt op" ${i === 0 ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg></button>
      <button class="icon-btn small" data-action="move-cat" data-id="${c.id}" data-dir="1" aria-label="Flyt ned" ${i === cats.length - 1 ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
      <button class="icon-btn small" data-action="rename-cat" data-id="${c.id}" aria-label="Omdøb">${ICON.edit}</button>
      <button class="icon-btn small" data-action="delete-cat" data-id="${c.id}" aria-label="Slet">${ICON.trash}</button>
    </div></li>`;
  }).join('') || '<li class="pick-empty" style="padding:14px">Ingen kategorier.</li>';
}

async function exportData() {
  busy(true, 'Forbereder backup …');
  try {
    const rawImages = await db.all('images');
    const images = [];
    for (const im of rawImages) images.push({ id: im.id, full: await blobToDataURL(im.full), thumb: await blobToDataURL(im.thumb || im.full) });
    const data = {
      app: 'madly', format: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
      categories: S.categories, recipes: S.recipes, guests: S.guests, events: S.events, images,
    };
    const name = `madly-backup-${todayISO()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    busy(false);
    const file = new File([blob], name, { type: 'application/json' });
    let done = false;
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: 'Madly backup' }); done = true; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!done) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    await db.put('meta', { id: 'lastExport', at: Date.now() });
    toast('Backup klar');
    if (currentPath === '/settings') viewSettings();
  } catch (err) {
    busy(false);
    toast('Backup fejlede: ' + err.message);
  }
}

async function importData(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Filen kunne ikke læses'); return; }
  if (data?.app !== 'madly' || !Array.isArray(data.recipes)) { toast('Filen er ikke en Madly-backup'); return; }
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  const choice = await dialog({
    title: 'Importér backup',
    body: `Filen er fra ${fmtDate(data.exportedAt)} og indeholder ${plural(n(data.recipes), 'opskrift', 'opskrifter')}, ${plural(n(data.guests), 'gæst', 'gæster')} og ${plural(n(data.events), 'begivenhed', 'begivenheder')}.<br><br>
      <b>Flet</b> tilføjer og opdaterer – intet slettes.<br><b>Erstat</b> sletter alt på denne enhed og indlæser backuppen.`,
    stack: true,
    buttons: [{ label: 'Flet', value: 'merge', cls: 'primary' }, { label: 'Erstat alt', value: 'replace', cls: 'danger-ghost' }, { label: 'Annuller', value: '' }],
  });
  if (!choice) return;
  if (choice === 'replace' && !(await confirmDlg('Er du sikker?', 'Alle nuværende opskrifter, gæster og begivenheder på denne enhed slettes.', 'Ja, erstat'))) return;
  busy(true, 'Importerer …');
  try {
    const images = (data.images || []).filter((i) => i?.id && i.full).map((i) => ({ id: i.id, full: dataURLToBlob(i.full), thumb: dataURLToBlob(i.thumb || i.full) }));
    if (choice === 'replace') {
      await db.clear('recipes', 'guests', 'events', 'categories', 'images');
      [...imgCache.keys()].forEach((k) => URL.revokeObjectURL(imgCache.get(k)));
      imgCache.clear();
    } else {
      images.forEach((i) => forgetImage(i.id));
    }
    const arr = (a) => (Array.isArray(a) ? a.filter((x) => x?.id) : []);
    await db.put('categories', arr(data.categories));
    await db.put('guests', arr(data.guests));
    await db.put('events', arr(data.events));
    await db.put('recipes', arr(data.recipes));
    for (let i = 0; i < images.length; i += 25) await db.put('images', images.slice(i, i + 25));
    await db.put('meta', { id: 'seeded', at: Date.now() });
    await loadAll();
    busy(false);
    toast('Backup importeret');
    viewSettings();
  } catch (err) {
    busy(false);
    toast('Import fejlede: ' + err.message);
  }
}

/* ---------- Start ---------- */
async function init() {
  try {
    await loadAll();
    await seedIfNeeded();
  } catch (err) {
    view.innerHTML = `<div class="empty"><h3>Kunne ikke åbne databasen</h3><p>${esc(err.message)}</p><p class="small">Bruger du privat browsing? Så kan appen ikke gemme data.</p></div>`;
    return;
  }
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
