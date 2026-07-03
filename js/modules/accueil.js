/* ============================================================
   modules/accueil.js — Accueil / tableau de bord (brief §9.1).
   Agrège les autres modules. Tout est calculé à la lecture :
     - Score du jour via computeDailyScore (score.js, §15.4)
     - Coach : message par priorité (le plus urgent gagne)
     - Série flamme : plus longue série d'habitudes en cours
     - Line chart : score reconstitué jour par jour
     - Tuiles : calories du jour, coucher ce soir
     - Prochain événement
   Réf. visuelle : maquette pages 1-4, page 1.
   ============================================================ */
import { sb } from '../supabase.js';
import { $, $$, gem } from '../ui.js';
import { dayKey, addDays, fromKey } from '../dates.js';
import { computeDailyScore } from '../score.js';

let habits = [];
let doneByDay = new Map();      // key -> Set(habit_id)
let sleepByDate = new Map();    // key -> duration_hours (calculée)
let sleepTargets = new Map();   // dow(0=lundi) -> {wakeMin, dur}
let meals = [];                 // repas du jour
let profile = null;            // profile_settings
let nextEvent = null;
let period = '1S';

const PERIODS = { '1S': 7, '2S': 14, '1M': 30, '3M': 90 };
const DOW = (d) => (d.getDay() + 6) % 7;
const parseTimeMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/* ---------- Accès données ---------- */
async function fetchAll() {
  const since = dayKey(addDays(new Date(), -97));
  const nowIso = new Date().toISOString();
  const [hb, logs, sl, tg, ml, ps, ev] = await Promise.all([
    sb.from('habits').select('id,name,icon').eq('archived', false),
    sb.from('habit_logs').select('habit_id,log_date,completed,weight').gte('log_date', since),
    sb.from('sleep_logs').select('log_date,bedtime,wake_time,duration_hours').gte('log_date', since),
    sb.from('sleep_targets').select('day_of_week,wake_time,target_duration_hours'),
    sb.from('meals').select('kcal,meal_date').eq('meal_date', dayKey()),   // calories du jour = date logique
    sb.from('profile_settings').select('target_kcal,target_protein_g,target_carbs_g,target_fat_g').maybeSingle(),
    sb.from('events').select('title,starts_at,ends_at,location').gte('starts_at', nowIso).order('starts_at', { ascending: true }).limit(1),
  ]);
  for (const r of [hb, logs, sl, tg, ml, ps, ev]) if (r.error) throw r.error;
  return { hb: hb.data || [], logs: logs.data || [], sl: sl.data || [], tg: tg.data || [], ml: ml.data || [], ps: ps.data || null, ev: (ev.data || [])[0] || null };
}

function durOf(log) {
  if (log.bedtime && log.wake_time) {
    const d = (new Date(log.wake_time) - new Date(log.bedtime)) / 3600000;
    if (d > 0 && d < 24) return d;
  }
  return log.duration_hours != null ? Number(log.duration_hours) : null;
}

/* ---------- Calculs dérivés ---------- */
/* Taux PONDÉRÉ = Σ poids des occurrences cochées / nb d'habitudes (plafonné à 1).
   Le poids est PAR OCCURRENCE (habit_logs.weight), cohérent avec le module Habitudes. */
function habitsRateFor(key) {
  if (!habits.length) return 0;
  const m = doneByDay.get(key);
  if (!m) return 0;
  let done = 0;
  for (const h of habits) if (m.has(h.id)) done += Number(m.get(h.id)) || 1;
  return Math.min(1, done / habits.length);
}
function sleepRatioFor(key) {
  const dur = sleepByDate.get(key);
  if (dur == null) return 0;
  const t = sleepTargets.get(DOW(fromKey(key)));
  if (!t || !t.dur) return 0;
  return Math.min(dur / t.dur, 1);
}
function scoreFor(key) {
  return computeDailyScore({ habitsRate: habitsRateFor(key), sleepRatio: sleepRatioFor(key) });
}
/* Série la plus longue en cours (toutes habitudes confondues). */
function longestStreak() {
  let max = 0;
  for (const h of habits) {
    let streak = 0, d = fromKey(dayKey());
    if (!(doneByDay.get(dayKey(d))?.has(h.id))) d = addDays(d, -1);
    while (doneByDay.get(dayKey(d))?.has(h.id)) { streak++; d = addDays(d, -1); }
    max = Math.max(max, streak);
  }
  return max;
}
function bedTonight() {
  const t = sleepTargets.get(DOW(new Date()));
  if (!t) return null;
  const c = t.wakeMin - Math.round(t.dur * 60);
  const m = ((c % 1440) + 1440) % 1440;
  return { min: m, wakeMin: t.wakeMin, dur: t.dur };
}
const fmtClock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')} h ${String(min % 60).padStart(2, '0')}`;
const caloriesToday = () => meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);

/* ---------- Coach : message par priorité ---------- */
function coachMessage() {
  const signals = [];
  // Calories restantes
  if (profile?.target_kcal) {
    const remaining = profile.target_kcal - caloriesToday();
    if (remaining > 150) signals.push({ urg: 6, html: `Il te reste <b>${remaining.toLocaleString('fr-FR')} kcal</b> à manger pour ton objectif du jour.` });
    else if (remaining < -150) signals.push({ urg: 5, html: `Tu as dépassé ton objectif calorique de <b>${(-remaining).toLocaleString('fr-FR')} kcal</b>.` });
  }
  // Coucher ce soir
  const bed = bedTonight();
  if (bed) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const diff = ((bed.min - nowMin) + 1440) % 1440;
    if (diff <= 120) signals.push({ urg: 8, html: `Couche-toi vers <b>${fmtClock(bed.min)}</b> ce soir pour tenir ton objectif de sommeil.` });
    else signals.push({ urg: 3, html: `Objectif au lit ce soir : <b>${fmtClock(bed.min)}</b>.` });
  }
  // Prochain événement imminent
  if (nextEvent) {
    const mins = Math.round((new Date(nextEvent.starts_at) - Date.now()) / 60000);
    if (mins >= 0 && mins <= 180) signals.push({ urg: 9, html: `<b>${escapeHtml(nextEvent.title)}</b> dans ${mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h'} — pense à t'y préparer.` });
  }
  // Habitudes restantes
  if (habits.length) {
    const rate = habitsRateFor(dayKey());
    if (rate < 1) signals.push({ urg: 4, html: `Encore <b>${Math.round((1 - rate) * habits.length)}</b> habitude(s) à cocher aujourd'hui.` });
  }
  if (!signals.length) signals.push({ urg: 0, html: `Tout roule. Belle journée, Ethan.` });
  return signals.sort((a, b) => b.urg - a.urg)[0].html;
}

/* ---------- Rendu ---------- */
export const accent = '#8b7bff';
export const header = () => {
  const d = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="greet"><h1>Salut Ethan</h1><span class="date">${d}</span></div>`;
};

export function render() { return `<div id="ac-root"></div>`; }

export async function mount() { await reload(); }

async function reload() {
  const root = $('#ac-root');
  if (!root) return;
  try {
    const d = await fetchAll();
    habits = d.hb;
    doneByDay = new Map();
    for (const l of d.logs) { if (!l.completed) continue; if (!doneByDay.has(l.log_date)) doneByDay.set(l.log_date, new Map()); doneByDay.get(l.log_date).set(l.habit_id, Number(l.weight) || 1); }
    sleepByDate = new Map();
    for (const s of d.sl) { const v = durOf(s); if (v != null) sleepByDate.set(s.log_date, v); }
    sleepTargets = new Map();
    for (const t of d.tg) sleepTargets.set(t.day_of_week, { wakeMin: parseTimeMin(t.wake_time), dur: Number(t.target_duration_hours) });
    meals = d.ml; profile = d.ps; nextEvent = d.ev;
    paint();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>Impossible de charger l'accueil.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function paint() {
  const root = $('#ac-root');
  const score = scoreFor(dayKey());
  const streak = longestStreak();

  const kcal = caloriesToday();
  const tgt = profile?.target_kcal || null;
  const remaining = tgt != null ? tgt - kcal : null;
  const bed = bedTonight();

  const evHtml = nextEvent ? (() => {
    const dt = new Date(nextEvent.starts_at);
    const hh = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const mins = Math.round((dt - Date.now()) / 60000);
    const rel = mins < 0 ? 'en cours' : (mins < 60 ? `dans ${mins} min` : (dayKey(dt) === dayKey() ? `dans ${Math.round(mins / 60)} h` : 'à venir'));
    const loc = nextEvent.location ? ' · ' + escapeHtml(nextEvent.location) : '';
    return `<div class="event"><span class="tm">${hh}</span><div class="bar"></div>
      <div class="body"><div class="ti">${escapeHtml(nextEvent.title)}</div><div class="d">${rel}${loc}</div></div>
      <span class="nx">${dayKey(dt) === dayKey() ? 'Aujourd’hui' : ''}</span></div>`;
  })() : `<div class="empty" style="padding:16px"><p>Aucun événement à venir.</p></div>`;

  root.innerHTML = `
    <div class="coach" data-coach>
      ${gem(40)}
      <div class="bubble"><div class="typing"><span></span><span></span><span></span></div><div class="msg"></div></div>
    </div>
    <div class="hero">
      <div class="ring"><svg width="118" height="118" viewBox="0 0 118 118">
        <circle class="t" cx="59" cy="59" r="52"></circle>
        <circle class="p" id="ac-ring" cx="59" cy="59" r="52"></circle></svg>
        <div class="c"><span class="n">${score}</span><span class="l">Score</span></div></div>
      <div class="side">
        <div class="streak"><span class="fl">🔥</span><div><div class="n">${streak}</div><div class="sl">jours de série</div></div></div>
        <div class="combo">Combine <b>sommeil</b> et <b>habitudes</b>.</div>
      </div>
    </div>
    <div class="ac-graph" id="ac-graph">
      <div class="gh"><span class="tt">Évolution du score</span>
        <div class="seg" id="ac-seg">${['1S', '2S', '1M', '3M'].map(k => `<button data-k="${k}" class="${k === period ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <svg class="lc" id="ac-line" viewBox="0 0 320 80" preserveAspectRatio="none">
        <defs><linearGradient id="acg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity=".38"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        <path class="ar" fill="url(#acg)"></path><path class="ln"></path></svg>
      <div class="gx" id="ac-x"></div>
    </div>
    <div class="tiles">
      <div class="tile cal"><div class="tl">🍽️ Calories</div>
        <div class="big">${kcal.toLocaleString('fr-FR')}</div>
        <div class="sm">${tgt != null ? `/ ${tgt.toLocaleString('fr-FR')} kcal · reste ${Math.max(0, remaining).toLocaleString('fr-FR')}` : 'objectif non défini'}</div></div>
      <div class="tile bed"><div class="tl">🌙 Au lit ce soir</div>
        <div class="big">${bed ? fmtClock(bed.min) : '—'}</div>
        <div class="sm">${bed ? `réveil ${fmtClock(bed.wakeMin)}` : 'objectif non défini'}</div></div>
    </div>
    ${evHtml}
    <div style="height:8px"></div>`;

  animateCoach();
  animateRing(score);
  paintLine();
}

/* Coach : 1 s d'animation « en train d'écrire » puis message. */
function animateCoach() {
  const c = $('[data-coach]'); if (!c) return;
  const typing = c.querySelector('.typing'), msg = c.querySelector('.msg');
  setTimeout(() => {
    if (!msg.isConnected) return;
    typing.style.display = 'none';
    msg.innerHTML = coachMessage();
    msg.style.display = 'block';
  }, 1000);
}

function animateRing(score) {
  const p = $('#ac-ring'); if (!p) return;
  const C = 326.7;
  requestAnimationFrame(() => { p.style.strokeDashoffset = (C * (1 - score / 100)).toFixed(1); });
}

/* Line chart : score reconstitué jour par jour sur la période. */
function paintLine() {
  const svg = $('#ac-line'); if (!svg) return;
  const ln = svg.querySelector('.ln'), ar = svg.querySelector('.ar'), xx = $('#ac-x');
  const n = PERIODS[period];
  const pts = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(addDays(new Date(), -i));
    const hasData = doneByDay.has(key) || sleepByDate.has(key);
    pts.push({ key, v: hasData ? scoreFor(key) : null });
  }
  const filled = pts.filter(p => p.v != null);
  if (filled.length < 2) {
    ln.setAttribute('d', ''); ar.setAttribute('d', '');
    xx.innerHTML = `<span>Pas assez de données pour tracer la courbe.</span>`;
    return;
  }
  const W = 320, H = 80, P = 6, m = filled.length;
  const mn = Math.max(0, Math.min(...filled.map(p => p.v)) - 6);
  const mx = Math.min(100, Math.max(...filled.map(p => p.v)) + 6);
  const x = (i) => P + i * ((W - 2 * P) / (m - 1));
  const y = (v) => H - P - ((v - mn) / Math.max(1, mx - mn)) * (H - 2 * P);
  let dd = `M${x(0)},${y(filled[0].v).toFixed(1)}`;
  for (let i = 1; i < m; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    dd += ` C${xc.toFixed(1)},${y(filled[i - 1].v).toFixed(1)} ${xc.toFixed(1)},${y(filled[i].v).toFixed(1)} ${x(i).toFixed(1)},${y(filled[i].v).toFixed(1)}`;
  }
  ln.setAttribute('d', dd);
  ar.setAttribute('d', dd + ` L${x(m - 1).toFixed(1)},${H} L${P},${H} Z`);
  const lab = (key) => { const d = fromKey(key); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const avg = Math.round(filled.reduce((a, b) => a + b.v, 0) / m);
  xx.innerHTML = `<span>${lab(filled[0].key)}</span><span>moy. ${avg}</span><span>${lab(filled[m - 1].key)}</span>`;
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const seg = e.target.closest('#ac-seg button');
    if (seg) { period = seg.dataset.k; $$('#ac-seg button', root).forEach(b => b.classList.toggle('on', b === seg)); paintLine(); return; }
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
