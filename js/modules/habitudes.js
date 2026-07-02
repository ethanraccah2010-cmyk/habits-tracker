/* ============================================================
   modules/habitudes.js — Habitudes de bout en bout (brief §9.2).
   Saisie → Supabase → relecture → affichage. Tout dérivé (séries,
   compteurs, barres) est calculé à la lecture (brief §4.3).
   Réf. visuelle : maquette pages 1-4, page 2.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, $$, CHECK_SVG, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, addDays, dowLabel, monthLabel, fromKey } from '../dates.js';

/* ---------- État du module (en mémoire, source = Supabase) ---------- */
let habits = [];                 // [{id,name,icon}]
let doneByDay = new Map();       // "YYYY-MM-DD" -> Set(habit_id) complétés
let streakByHabit = new Map();   // habit_id -> série courante
let period = '1S';
let selectedBar = -1;            // index de barre sélectionnée (clic)

const PERIODS = { '1S': 7, '2S': 14, '1M': 30, '3M': 90 };
const TODAY = () => dayKey();

/* ---------- Accès données ---------- */
async function fetchHabits() {
  const { data, error } = await sb
    .from('habits')
    .select('id,name,icon,created_at')
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchLogs(sinceKey) {
  const { data, error } = await sb
    .from('habit_logs')
    .select('habit_id,log_date,completed,weight')
    .gte('log_date', sinceKey);
  if (error) throw error;
  return (data || []).filter(l => l.completed);
}

/* Écrit/supprime le log ; `weight` = multiplicateur de CETTE occurrence (défaut 1). */
async function writeLog(habitId, key, done, weight = 1) {
  if (done) {
    const { error } = await sb.from('habit_logs')
      .upsert({ habit_id: habitId, log_date: key, completed: true, weight }, { onConflict: 'habit_id,log_date' });
    if (error) throw error;
  } else {
    const { error } = await sb.from('habit_logs')
      .delete().eq('habit_id', habitId).eq('log_date', key);
    if (error) throw error;
  }
}

async function insertHabit(name, icon) {
  const user_id = await getUserId();
  const { error } = await sb.from('habits').insert({ user_id, name, icon });
  if (error) throw error;
}

async function archiveHabit(id) {
  const { error } = await sb.from('habits').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

/* ---------- Calculs dérivés ---------- */
function rebuildStreaks() {
  streakByHabit = new Map();
  for (const h of habits) {
    let streak = 0;
    // démarre aujourd'hui ; si pas fait aujourd'hui, on part d'hier (série encore "en cours")
    let d = fromKey(TODAY());
    if (!(doneByDay.get(dayKey(d))?.has(h.id))) d = addDays(d, -1);
    while (doneByDay.get(dayKey(d))?.has(h.id)) { streak++; d = addDays(d, -1); }
    streakByHabit.set(h.id, streak);
  }
}

function todayCount() {
  const m = doneByDay.get(TODAY());
  return m ? [...m.keys()].filter(id => habits.some(h => h.id === id)).length : 0;
}

/* Poids de l'occurrence du jour pour une habitude (défaut 1 ; 0 si non faite). */
function logWeight(id, key = TODAY()) {
  const m = doneByDay.get(key);
  return m && m.has(id) ? (Number(m.get(id)) || 1) : 0;
}
/* Taux PONDÉRÉ = Σ poids des occurrences cochées / nombre d'habitudes (plafonné à 1).
   Un ×2 peut ainsi compenser une habitude manquée. */
function weightedRate() {
  if (!habits.length) return 0;
  const done = habits.reduce((s, h) => s + logWeight(h.id), 0);
  return Math.min(1, done / habits.length);
}

/* Série globale affichée (badge flamme) = plus longue série EN COURS (brief §9.1). */
function globalStreak() {
  let max = 0;
  for (const s of streakByHabit.values()) max = Math.max(max, s);
  return max;
}

/* Barres : nb d'habitudes complétées par jour (ou par semaine en 3M). */
function buildBuckets() {
  const n = PERIODS[period];
  const dailyCount = (key) => {
    const set = doneByDay.get(key);
    return set ? set.size : 0;
  };
  const buckets = [];
  if (period === '3M') {
    // 13 semaines, somme des complétions par semaine
    for (let w = 12; w >= 0; w--) {
      let sum = 0; let start = null;
      for (let i = 0; i < 7; i++) {
        const key = dayKey(addDays(new Date(), -(w * 7 + i)));
        if (!start) start = key;
        sum += dailyCount(key);
      }
      buckets.push({ count: sum, label: (w % 4 === 0) ? monthLabel(start) : '' });
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      const key = dayKey(addDays(new Date(), -i));
      buckets.push({ count: dailyCount(key), label: period === '1S' ? dowLabel(key) : '' });
    }
  }
  return buckets;
}

/* ---------- Rendu ---------- */
export const accent = '#1c9b66';
export const header = () =>
  `<div class="pagetitle">Habitudes</div><div class="pagesub">Tes habitudes du jour</div>`;

export function render() {
  return `<div class="hab">
    <div class="hab__top" id="hab-top"></div>
    <div class="hab__list" id="hab-list"></div>
  </div>`;
}

export async function mount() {
  await reload();
}

async function reload() {
  const top = $('#hab-top'), list = $('#hab-list');
  if (!top || !list) return; // vue changée entre-temps
  try {
    const since = dayKey(addDays(new Date(), -97));
    const [hb, logs] = await Promise.all([fetchHabits(), fetchLogs(since)]);
    habits = hb;
    doneByDay = new Map();
    for (const l of logs) {
      if (!doneByDay.has(l.log_date)) doneByDay.set(l.log_date, new Map());
      doneByDay.get(l.log_date).set(l.habit_id, Number(l.weight) || 1);
    }
    rebuildStreaks();
    paintTop();
    paintList();
  } catch (e) {
    list.innerHTML = `<div class="empty"><p>Impossible de charger les habitudes.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function paintTop() {
  const top = $('#hab-top');
  if (habits.length === 0) { top.innerHTML = ''; return; }

  const total = habits.length;
  const done = todayCount();
  const streak = globalStreak();
  const buckets = buildBuckets();
  if (selectedBar < 0 || selectedBar >= buckets.length) selectedBar = buckets.length - 1;
  const mx = Math.max(1, ...buckets.map(b => b.count));
  const dense = buckets.length > 14;

  const barsHtml = buckets.map((b, i) => {
    const h = b.count === 0 ? 4 : Math.round(28 + (b.count / mx) * 60);
    return `<div class="col">
      <div class="b ${i === selectedBar ? 'max' : ''}" data-bar="${i}" style="--h:${h}px;animation-delay:${i * .04}s"></div>
      ${b.label ? `<span class="d">${b.label}</span>` : ''}
    </div>`;
  }).join('');

  top.innerHTML = `
    <div class="graph">
      <div class="gh">
        <span class="tt">Habitudes complétées</span>
        <div class="seg" id="hab-seg">
          ${['1S', '2S', '1M', '3M'].map(k =>
            `<button data-k="${k}" class="${k === period ? 'on' : ''}">${k}</button>`).join('')}
        </div>
      </div>
      <div class="bars ${dense ? 'dense' : ''}" id="hab-bars">${barsHtml}</div>
    </div>
    <div class="prog">
      <div class="ph">
        <span class="pt"><b id="hab-count">${done}</b> / <span>${total}</span> habitudes</span>
        <span class="flame">🔥 <b id="hab-flame">${streak}</b> j</span>
      </div>
      <div class="track"><div class="fill" id="hab-fill" style="width:0%"></div></div>
    </div>`;

  // Anime la barre de 0 → cible (largeur = taux PONDÉRÉ) au montage / changement de période.
  requestAnimationFrame(() => {
    const f = $('#hab-fill');
    if (f) f.style.width = (weightedRate() * 100).toFixed(0) + '%';
  });
}

/* Mise à jour EN PLACE (sans recréer les éléments) → la transition joue. */
function updateProgress() {
  const total = habits.length, done = todayCount(), streak = globalStreak();
  const c = $('#hab-count'); if (c) c.textContent = done;
  const fl = $('#hab-flame'); if (fl) fl.textContent = streak;
  const f = $('#hab-fill'); if (f) f.style.width = (weightedRate() * 100).toFixed(0) + '%';
}

function updateBarsHeights() {
  const wrap = $('#hab-bars'); if (!wrap) return;
  const buckets = buildBuckets();
  const mx = Math.max(1, ...buckets.map(b => b.count));
  [...wrap.querySelectorAll('.b')].forEach((el, i) => {
    const b = buckets[i]; if (!b) return;
    const h = b.count === 0 ? 4 : Math.round(28 + (b.count / mx) * 60);
    el.style.animation = 'none';        // libère la hauteur du keyframe "grow"
    el.style.height = h + 'px';         // transition height ease-out
  });
}

function applyBarSelection() {
  const wrap = $('#hab-bars'); if (!wrap) return;
  [...wrap.querySelectorAll('.b')].forEach((el, i) => el.classList.toggle('max', i === selectedBar));
}

function paintList() {
  const list = $('#hab-list');
  if (habits.length === 0) {
    list.innerHTML = `<div class="empty">
      <p>Aucune habitude pour l'instant.<br>Commence par en créer une avec le bouton ＋.</p>
    </div>`;
    return;
  }
  const todayMap = doneByDay.get(TODAY()) || new Map();
  list.innerHTML = habits.map(h => {
    const done = todayMap.has(h.id);
    const s = streakByHabit.get(h.id) || 0;
    const w = logWeight(h.id);
    return `<div class="habit" data-id="${h.id}">
      <input type="checkbox" ${done ? 'checked' : ''} tabindex="-1">
      <span class="box">${CHECK_SVG}</span>
      <span class="ic">${h.icon || '✅'}</span>
      <span class="txt">${escapeHtml(h.name)}</span>
      <button class="mult ${done ? '' : 'hidden'}" data-mult aria-label="Multiplicateur du jour">×${done ? String(w).replace('.', ',') : '1'}</button>
      <span class="mini-strk">${s > 0 ? '🔥 ' + s : ''}</span>
      <button class="del" data-del aria-label="Archiver">×</button>
    </div>`;
  }).join('');
}

/* Cycle le multiplicateur de l'occurrence du jour : 1 → 1,5 → 2 → 1. */
const MULT_CYCLE = [1, 1.5, 2];
async function cycleMult(id) {
  const key = TODAY();
  const m = doneByDay.get(key);
  if (!m || !m.has(id)) return;                 // seulement si l'habitude est cochée
  const cur = Number(m.get(id)) || 1;
  const next = MULT_CYCLE[(MULT_CYCLE.indexOf(cur) + 1) % MULT_CYCLE.length];
  m.set(id, next);
  syncMultBadge(id, next);
  updateProgress();
  try { await writeLog(id, key, true, next); }
  catch { m.set(id, cur); syncMultBadge(id, cur); updateProgress(); toast('Échec de l’enregistrement'); }
}
function syncMultBadge(id, w) {
  const row = $(`.habit[data-id="${id}"]`, $('#hab-list'));
  const b = row?.querySelector('[data-mult]');
  if (b) b.textContent = '×' + String(w).replace('.', ',');
}

/* ---------- Interactions ---------- */
async function toggle(id) {
  const key = TODAY();
  if (!doneByDay.has(key)) doneByDay.set(key, new Map());
  const m = doneByDay.get(key);
  const willBeDone = !m.has(id);

  // optimiste — mise à jour EN PLACE (la barre anime sa largeur). Nouvelle occurrence = ×1.
  if (willBeDone) m.set(id, 1); else m.delete(id);
  rebuildStreaks();
  syncRow(id, willBeDone);
  updateProgress();
  updateBarsHeights();

  try {
    await writeLog(id, key, willBeDone, 1);
  } catch (e) {
    // rollback
    if (willBeDone) m.delete(id); else m.set(id, 1);
    rebuildStreaks();
    syncRow(id, !willBeDone);
    updateProgress();
    updateBarsHeights();
    toast('Échec de l’enregistrement');
  }
}

/* Met à jour une seule ligne sans tout repeindre (préserve l'animation de la case). */
function syncRow(id, done) {
  const row = $(`.habit[data-id="${id}"]`, $('#hab-list'));
  if (!row) return;
  row.querySelector('input').checked = done;
  const s = streakByHabit.get(id) || 0;
  row.querySelector('.mini-strk').textContent = s > 0 ? '🔥 ' + s : '';
  const b = row.querySelector('[data-mult]');           // badge ×N : visible + réinitialisé à ×1
  if (b) { b.classList.toggle('hidden', !done); b.textContent = '×1'; }
}

async function remove(id) {
  try {
    await archiveHabit(id);
    toast('Habitude archivée');
    await reload();
  } catch { toast('Échec de l’archivage'); }
}

/* Délégation des clics dans la vue (liste + sélecteur période + barres). */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const seg = e.target.closest('#hab-seg button');
    if (seg) { period = seg.dataset.k; selectedBar = -1; paintTop(); return; }

    const bar = e.target.closest('[data-bar]');
    if (bar) { selectedBar = +bar.dataset.bar; applyBarSelection(); return; }

    const mb = e.target.closest('[data-mult]');
    if (mb) { e.stopPropagation(); cycleMult(mb.closest('.habit').dataset.id); return; }

    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); remove(del.closest('.habit').dataset.id); return; }

    const row = e.target.closest('.habit');
    if (row) toggle(row.dataset.id);
  });
}

/* ---------- FAB : créer une habitude ---------- */
const EMOJIS = ['✅', '🧘', '📖', '💧', '🏋️', '🌅', '🥗', '📵', '📝', '🚶', '🧊', '💊'];
let pickedEmoji = '✅';

export function onFab() {
  pickedEmoji = '✅';
  openSheet(`
    <div class="sheet__title">Créer une habitude</div>
    <div class="field">
      <label for="h-name">Nom</label>
      <input id="h-name" type="text" placeholder="Ex. Méditation 10 min" autocomplete="off">
    </div>
    <div class="field">
      <label>Icône</label>
      <div class="emoji-row" id="h-emoji">
        ${EMOJIS.map((e, i) => `<button data-e="${e}" class="${i === 0 ? 'on' : ''}">${e}</button>`).join('')}
      </div>
    </div>
    <button class="btn-primary" id="h-create">Créer</button>
  `);

  const sheet = $('#sheet');
  sheet.querySelector('#h-emoji').addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    pickedEmoji = b.dataset.e;
    $$('#h-emoji button', sheet).forEach(x => x.classList.toggle('on', x === b));
  });
  const create = sheet.querySelector('#h-create');
  setTimeout(() => sheet.querySelector('#h-name').focus(), 250);
  create.addEventListener('click', async () => {
    const name = sheet.querySelector('#h-name').value.trim();
    if (!name) { sheet.querySelector('#h-name').focus(); return; }
    create.disabled = true; create.textContent = 'Création…';
    try {
      await insertHabit(name, pickedEmoji);
      closeSheet();
      toast('Habitude créée');
      await reload();
    } catch (err) {
      create.disabled = false; create.textContent = 'Créer';
      toast('Échec : ' + (err.message || 'création refusée'));
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
