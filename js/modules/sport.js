/* ============================================================
   modules/sport.js — Sport de bout en bout (brief §9.5 + §10).
   Réf. visuelle : maquette pages 5-8, page 5. Accent rouge.

   Règles métier (§10) :
   - 1RM estimé par série (Epley) = kg × (1 + reps/30).
   - Métrique de progression d'un exo = MEILLEUR 1RM de la séance.
   - Le nombre de séries et le volume ne jugent JAMAIS la progression
     (le volume n'est affiché qu'à titre informatif).
   - Epley fiable sous ~12 reps ; au-delà, signalé comme approximatif.

   Séance du jour : pré-remplie depuis le workout_template du jour de
   semaine ; matérialisée en séance réelle indépendante au 1er enregistrement.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, $$, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, addDays, monthLabel } from '../dates.js';

export const accent = '#ff4d4d';
export const header = () =>
  `<div class="pagetitle">Sport</div><div class="pagesub">Séance du jour</div>`;

/* ---------- État ---------- */
let mode = 'empty';     // 'real' | 'proposed' | 'empty'
let session = null;     // { id, title, template_id }
let exos = [];          // [{ id|null, name, order_index, target, sets:[{reps,kg}] }]
const ANIMS = ['🏋️', '💪', '🤸', '🦵', '🔥'];

/* ---------- Epley ---------- */
export const e1rm = (reps, kg) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);
const bestOf = (sets) => sets.reduce((m, s) => Math.max(m, e1rm(s.reps, s.kg)), 0);

/* ---------- Dates ---------- */
const todayDow = () => (new Date().getDay() + 6) % 7; // 0=lundi … 6=dimanche

/* ---------- Accès données ---------- */
async function fetchTodaySession() {
  const { data, error } = await sb.from('workout_sessions')
    .select('id,title,template_id').eq('session_date', dayKey()).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}
async function fetchSessionExercises(sessionId) {
  const { data, error } = await sb.from('session_exercises')
    .select('id,name,order_index,exercise_sets(reps,kg,set_number)')
    .eq('session_id', sessionId).order('order_index', { ascending: true });
  if (error) throw error;
  return (data || []).map(se => ({
    id: se.id, name: se.name, order_index: se.order_index,
    sets: (se.exercise_sets || []).sort((a, b) => a.set_number - b.set_number).map(s => ({ reps: s.reps, kg: +s.kg })),
  }));
}
async function fetchTemplateForToday() {
  const { data, error } = await sb.from('workout_templates')
    .select('id,title,day_of_week,template_exercises(name,target_sets,target_reps,order_index)')
    .eq('day_of_week', todayDow()).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}
/* Historique d'un exo (par nom) : sessions + séries, pour 1RM & dernière séance. */
async function fetchExoHistory(name) {
  const { data, error } = await sb.from('session_exercises')
    .select('name,exercise_sets(reps,kg),workout_sessions(session_date)')
    .eq('name', name);
  if (error) throw error;
  return (data || [])
    .filter(r => r.workout_sessions)
    .map(r => ({
      date: r.workout_sessions.session_date,
      sets: (r.exercise_sets || []).map(s => ({ reps: s.reps, kg: +s.kg })),
      best: bestOf((r.exercise_sets || []).map(s => ({ reps: s.reps, kg: +s.kg }))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function createSession(title, template_id) {
  const user_id = await getUserId();
  const { data, error } = await sb.from('workout_sessions')
    .insert({ user_id, title, template_id: template_id || null, session_date: dayKey() })
    .select('id,title,template_id').single();
  if (error) throw error;
  return data;
}
async function addSessionExercise(sessionId, name, order_index) {
  const { data, error } = await sb.from('session_exercises')
    .insert({ session_id: sessionId, name, order_index }).select('id').single();
  if (error) throw error;
  return data.id;
}
async function replaceSets(sessionExerciseId, sets) {
  const del = await sb.from('exercise_sets').delete().eq('session_exercise_id', sessionExerciseId);
  if (del.error) throw del.error;
  const rows = sets.filter(s => s.reps > 0 && s.kg > 0)
    .map((s, i) => ({ session_exercise_id: sessionExerciseId, set_number: i + 1, reps: s.reps, kg: s.kg }));
  if (rows.length) {
    const ins = await sb.from('exercise_sets').insert(rows);
    if (ins.error) throw ins.error;
  }
}

/* ---------- Chargement ---------- */
async function load() {
  session = await fetchTodaySession();
  if (session) {
    mode = 'real';
    exos = await fetchSessionExercises(session.id);
    // garde le repère "target" depuis le gabarit si on le retrouve (purement informatif)
  } else {
    const tmpl = await fetchTemplateForToday();
    if (tmpl && (tmpl.template_exercises || []).length) {
      mode = 'proposed';
      session = { id: null, title: tmpl.title, template_id: tmpl.id };
      exos = tmpl.template_exercises
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        .map((te, i) => ({
          id: null, name: te.name, order_index: te.order_index ?? i,
          target: targetLabel(te.target_sets, te.target_reps), sets: [],
        }));
    } else {
      mode = 'empty'; session = null; exos = [];
    }
  }
}
function targetLabel(sets, reps) {
  if (!sets && !reps) return '';
  return `${sets || '?'} séries × ${reps || '?'}`;
}

/* Matérialise une séance proposée en séance réelle indépendante (§9.5). */
async function materialize() {
  if (mode === 'real') return;
  const created = await createSession(session.title, session.template_id);
  session = created; mode = 'real';
  for (let i = 0; i < exos.length; i++) {
    exos[i].id = await addSessionExercise(created.id, exos[i].name, exos[i].order_index ?? i);
  }
}

/* ---------- Rendu ---------- */
export function render() {
  return `<div id="sport-root"></div>`;
}
export async function mount() {
  const root = $('#sport-root');
  try { await load(); paint(); }
  catch (e) { if (root) root.innerHTML = `<div class="empty"><p>Chargement impossible.<br>${esc(e.message || '')}</p></div>`; }
}

function paint() {
  const root = $('#sport-root');
  if (!root) return;
  if (mode === 'empty') {
    root.innerHTML = `<div class="empty">
      <p>Aucune séance aujourd'hui, et pas de gabarit pour ce jour.<br>Ajoute un exercice avec le bouton ＋ pour démarrer.</p>
    </div>`;
    return;
  }
  const doneCount = exos.filter(x => x.sets.length).length;
  const mins = exos.length * 10;
  root.innerHTML = `
    <div class="sess">
      <div class="t">Séance du jour — ${esc(session.title)}</div>
      <div class="s">${exos.length} exercice${exos.length > 1 ? 's' : ''}</div>
      <div class="meta">
        <span><b>${exos.length}</b> exos</span>
        <span><b>~${mins}</b> min</span>
        <span><b>${doneCount}</b> fait${doneCount > 1 ? 's' : ''}</span>
      </div>
      ${mode === 'proposed' ? `<div class="badge-proposed">Proposé depuis ton gabarit</div>` : ''}
    </div>
    ${exos.map((x, i) => exoCard(x, i)).join('')}`;
}
function exoCard(x, i) {
  const logged = x.sets.length > 0;
  const sub = logged
    ? `${x.sets.length} séries · 1RM est. <b>${bestOf(x.sets).toFixed(0)} kg</b>`
    : (x.target || 'à enregistrer');
  return `<div class="exoc ${logged ? 'done' : ''}" data-exo="${i}">
    <div class="eh">
      <span class="anim">${ANIMS[i % ANIMS.length]}</span>
      <div class="en"><div class="n">${esc(x.name)}</div><div class="sub">${sub}</div></div>
      <button class="chart-btn" data-exo-chart="${i}" aria-label="Évolution">📈</button>
    </div>
  </div>`;
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const chart = e.target.closest('[data-exo-chart]');
    if (chart) { e.stopPropagation(); openChart(exos[+chart.dataset.exoChart]); return; }
    const card = e.target.closest('[data-exo]');
    if (card) openEntry(+card.dataset.exo);
  });
}

/* ----- Modal de saisie des séries ----- */
function modalEl() {
  let m = document.getElementById('sport-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'sport-modal'; m.className = 'popscrim';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-mclose')) m.classList.remove('show'); });
  }
  return m;
}

async function openEntry(idx) {
  const exo = exos[idx];
  // séries de départ : aujourd'hui si déjà saisi, sinon dernière séance loggée, sinon objectif
  let initial = exo.sets.slice();
  if (initial.length === 0) {
    try {
      const hist = await fetchExoHistory(exo.name);
      const prior = hist.filter(h => h.date < dayKey() && h.sets.length).pop();
      if (prior) initial = prior.sets.map(s => ({ ...s }));
    } catch { /* ignore, on retombe sur l'objectif */ }
  }
  if (initial.length === 0) {
    const n = defaultSetCount(exo);
    initial = Array.from({ length: n }, () => ({ reps: '', kg: '' }));
  }

  const m = modalEl();
  m.innerHTML = `<div class="popcard tall">
    <button class="popclose" data-mclose>×</button>
    <div class="entry-h">${esc(exo.name)}</div>
    <div class="entry-sub">${exo.target ? 'Objectif : ' + esc(exo.target) : 'Saisis tes séries'}</div>
    <div id="entry-rows">${initial.map((s, i) => rowHTML(i, s)).join('')}</div>
    <button class="addset" id="entry-add">＋ Ajouter une série</button>
    <div class="savestat">
      <div>1RM estimé<b id="entry-1rm">—</b></div>
      <div style="text-align:right">Volume total<b id="entry-vol">—</b></div>
    </div>
    <button class="saveb" id="entry-save">Enregistrer</button>
    <div class="algo-note">Le 1RM estimé suit la formule d'Epley (kg × (1 + reps/30)). Fiable surtout sous ~12 reps ; au-delà, c'est une approximation.</div>
  </div>`;
  m.classList.add('show');

  const rows = $('#entry-rows', m);
  const recalc = () => {
    let best = 0, vol = 0, approx = false;
    $$('.srow', rows).forEach(rw => {
      const reps = +rw.querySelector('[data-reps]').value || 0;
      const kg = +rw.querySelector('[data-kg]').value || 0;
      vol += reps * kg;
      const oneRm = e1rm(reps, kg);
      if (oneRm > best) { best = oneRm; approx = reps > 12; }
      rw.querySelector('.field.reps')?.classList.toggle('warn', reps > 12);
    });
    $('#entry-1rm', m).innerHTML = best ? `${best.toFixed(1)} kg${approx ? ' <span class="approx">≈</span>' : ''}` : '—';
    $('#entry-vol', m).textContent = vol ? vol.toLocaleString('fr-FR') + ' kg' : '—';
  };
  const renumber = () => $$('.srow .si', rows).forEach((s, i) => s.textContent = 'Série ' + (i + 1));
  rows.addEventListener('input', recalc);
  rows.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { del.closest('.srow').remove(); renumber(); recalc(); }
  });
  $('#entry-add', m).onclick = () => { rows.insertAdjacentHTML('beforeend', rowHTML($$('.srow', rows).length, { reps: '', kg: '' })); renumber(); recalc(); };
  recalc();

  $('#entry-save', m).onclick = async () => {
    const sets = $$('.srow', rows).map(rw => ({
      reps: +rw.querySelector('[data-reps]').value || 0,
      kg: +rw.querySelector('[data-kg]').value || 0,
    }));
    const btn = $('#entry-save', m); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      await materialize();                         // crée la séance réelle si proposée
      const seId = exos[idx].id;                   // id (re)mappé après matérialisation
      await replaceSets(seId, sets);
      await load(); paint();
      m.classList.remove('show');
      toast('Séries enregistrées');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}
function rowHTML(i, s) {
  return `<div class="srow">
    <span class="si">Série ${i + 1}</span>
    <div class="field reps"><input type="number" inputmode="numeric" data-reps value="${s.reps ?? ''}"><span>reps</span></div>
    <div class="field"><input type="number" inputmode="decimal" data-kg value="${s.kg ?? ''}"><span>kg</span></div>
    <button class="del" data-del aria-label="Retirer">×</button>
  </div>`;
}
function defaultSetCount(exo) {
  const t = (exo.target || '').match(/^(\d+)/);
  return t ? Math.min(8, Math.max(1, +t[1])) : 3;
}

/* ----- Modal graphique d'évolution du 1RM ----- */
let chartName = null, chartHist = [], chartPeriod = '1M';
const CPERIODS = { '1S': 7, '1M': 30, '6M': 182, '1A': 365 };

async function openChart(exo) {
  chartName = exo.name; chartPeriod = '1M';
  const m = modalEl();
  m.innerHTML = `<div class="popcard">
    <button class="popclose" data-mclose>×</button>
    <div class="entry-h">${esc(exo.name)}</div>
    <div class="exo-chart-sub">1RM estimé (Epley) · <span id="exo-trend" style="font-weight:600"></span></div>
    <div class="seg" id="exo-seg">
      ${Object.keys(CPERIODS).map(k => `<button data-k="${k}" class="${k === chartPeriod ? 'on' : ''}">${k === '1A' ? '1an' : k}</button>`).join('')}
    </div>
    <svg viewBox="0 0 300 120" style="width:100%;height:120px;margin-top:12px">
      <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <path id="exo-area" fill="url(#eg)"></path>
      <path id="exo-line" class="exo-line"></path>
    </svg>
    <div id="exo-x" style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:5px"></div>`;
  m.classList.add('show');
  $('#exo-seg', m).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    chartPeriod = b.dataset.k;
    $$('#exo-seg button', m).forEach(x => x.classList.toggle('on', x === b));
    drawChart();
  });
  try { chartHist = await fetchExoHistory(exo.name); } catch { chartHist = []; }
  drawChart();
}

function drawChart() {
  const m = $('#sport-modal');
  const line = $('#exo-line', m), area = $('#exo-area', m), xx = $('#exo-x', m), trend = $('#exo-trend', m);
  const since = dayKey(addDays(new Date(), -CPERIODS[chartPeriod]));
  // un point par séance (meilleur 1RM de la séance), dans la période
  const pts = chartHist.filter(h => h.date >= since && h.best > 0).map(h => ({ d: h.date, v: h.best }));
  if (pts.length < 2) {
    line.setAttribute('d', ''); area.setAttribute('d', '');
    xx.innerHTML = `<span>${pts.length ? 'une seule séance — reviens après la prochaine' : 'pas encore de données sur la période'}</span>`;
    trend.textContent = ''; return;
  }
  const W = 300, H = 120, P = 8;
  const vals = pts.map(p => p.v), mn = Math.min(...vals) - 3, mx = Math.max(...vals) + 3;
  const x = i => P + i * ((W - 2 * P) / (pts.length - 1));
  const y = v => H - P - ((v - mn) / (mx - mn)) * (H - 2 * P);
  let d = `M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    d += ` C${xc.toFixed(1)},${y(pts[i - 1].v).toFixed(1)} ${xc.toFixed(1)},${y(pts[i].v).toFixed(1)} ${x(i).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
  }
  line.setAttribute('d', d);
  area.setAttribute('d', d + ` L${x(pts.length - 1).toFixed(1)},${H} L${P},${H} Z`);
  const len = line.getTotalLength();
  line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
  requestAnimationFrame(() => { line.style.transition = 'stroke-dashoffset 1.1s ease'; line.style.strokeDashoffset = 0; });
  xx.innerHTML = `<span>${monthLabel(pts[0].d)}</span><span>auj.</span>`;
  const diff = pts[pts.length - 1].v - pts[0].v;
  trend.textContent = diff > 1 ? `▲ +${diff.toFixed(0)} kg` : diff < -1 ? `▼ ${diff.toFixed(0)} kg` : '■ stable';
  trend.style.color = diff > 1 ? '#3fd18a' : diff < -1 ? '#ff6b6b' : '#8b909c';
}

/* ---------- FAB : ajouter un exercice ---------- */
export function onFab() {
  openSheet(`
    <div class="sheet__title">Ajouter un exercice</div>
    <div class="field"><label for="ex-name">Nom de l'exercice</label>
      <input id="ex-name" type="text" placeholder="Ex. Développé couché" autocomplete="off"></div>
    <button class="btn-primary" id="ex-add">Ajouter</button>`);
  const s = $('#sheet');
  const btn = s.querySelector('#ex-add');
  setTimeout(() => s.querySelector('#ex-name').focus(), 250);
  btn.onclick = async () => {
    const name = s.querySelector('#ex-name').value.trim();
    if (!name) { s.querySelector('#ex-name').focus(); return; }
    btn.disabled = true; btn.textContent = 'Ajout…';
    try {
      // garantit une séance réelle : matérialise le gabarit, ou crée une séance libre
      if (mode === 'proposed') await materialize();
      else if (mode === 'empty' || !session) { session = await createSession('Séance du jour', null); mode = 'real'; exos = []; }
      const order = exos.length;
      const id = await addSessionExercise(session.id, name, order);
      exos.push({ id, name, order_index: order, target: '', sets: [] });
      closeSheet(); paint(); toast('Exercice ajouté');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Ajouter';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
