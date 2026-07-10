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
import { dayKey, addDays, monthLabel, fromKey } from '../dates.js';

export const accent = '#ff4d4d';
export const header = () =>
  `<div class="pagetitle">Sport</div><div class="pagesub">Séance du jour</div>`;

/* ---------- État ---------- */
let mode = 'empty';     // 'real' | 'proposed' | 'empty'
let session = null;     // { id, title, template_id }
let exos = [];          // [{ id|null, name, order_index, target, sets:[{reps,kg}] }]
let viewDate = null;    // jour affiché (date logique). Borné : aujourd'hui ⇄ hier.
let subview = 'planning';   // 'planning' | 'sessions' (semaine type) — S2 §16.6
let templates = [];         // workout_templates + exos, pour « Mes séances »
let windowDates = [];       // fenêtre planning : hier → J+7 (9 dates)
let dayStates = new Map();  // dateKey -> 'fige' | 'plan' | 'calc' | 'empty'
const ANIMS = ['🏋️', '💪', '🤸', '🦵', '🔥'];
const DOW_LABEL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DOW_SHORT = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const TODAY = () => dayKey();

/* ---------- Epley ---------- */
export const e1rm = (reps, kg) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);
const bestOf = (sets) => sets.reduce((m, s) => Math.max(m, e1rm(s.reps, s.kg)), 0);

/* ---------- Dates ---------- */
const dowOf = (dateKey) => (fromKey(dateKey).getDay() + 6) % 7; // 0=lundi … 6=dimanche

/* ---------- Accès données ---------- */
async function fetchSessionForDate(dateKey) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id,title,template_id').eq('session_date', dateKey).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}
/* Nom d'un exo lu via la banque (exercise_id → exercises.name), plus le name texte. */
async function fetchSessionExercises(sessionId) {
  const { data, error } = await sb.from('session_exercises')
    .select('id,exercise_id,order_index,target_reps,exercises(name,type_charge),exercise_sets(reps,kg,set_number)')
    .eq('session_id', sessionId).order('order_index', { ascending: true });
  if (error) throw error;
  return (data || []).map(se => ({
    id: se.id, exercise_id: se.exercise_id, name: se.exercises?.name || '(exercice supprimé)',
    type_charge: se.exercises?.type_charge || 'lesté',
    order_index: se.order_index, target_reps: se.target_reps ?? null,
    target: se.target_reps ? `cible ${se.target_reps} reps` : '',
    sets: (se.exercise_sets || []).sort((a, b) => a.set_number - b.set_number).map(s => ({ reps: s.reps, kg: +s.kg })),
  }));
}
async function fetchTemplateForDate(dateKey) {
  const { data, error } = await sb.from('workout_templates')
    .select('id,title,day_of_week,template_exercises(exercise_id,target_sets,target_reps,order_index,exercises(name,type_charge))')
    .eq('day_of_week', dowOf(dateKey)).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}
/* Historique d'un exo (par exercise_id, banque) : sessions + séries, pour 1RM. */
async function fetchExoHistory(exerciseId) {
  const { data, error } = await sb.from('session_exercises')
    .select('exercise_id,exercise_sets(reps,kg),workout_sessions(session_date)')
    .eq('exercise_id', exerciseId);
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

async function createSession(title, template_id, dateKey = viewDate) {
  const user_id = await getUserId();
  const { data, error } = await sb.from('workout_sessions')
    .insert({ user_id, title, template_id: template_id || null, session_date: dateKey })   // date logique = jour choisi
    .select('id,title,template_id').single();
  if (error) throw error;
  return data;
}
async function deleteWorkoutSession(id) {
  const { error } = await sb.from('workout_sessions').delete().eq('id', id);   // cascade session_exercises → exercise_sets
  if (error) throw error;
}
/* États de la fenêtre : pour chaque date, la séance a-t-elle des exos / des séries ? */
async function fetchWindowSessions(fromK, toK) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id,session_date,session_exercises(id,exercise_sets(id))')
    .gte('session_date', fromK).lte('session_date', toK);
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id, date: s.session_date,
    hasExos: (s.session_exercises || []).length > 0,
    hasSets: (s.session_exercises || []).some(se => (se.exercise_sets || []).length > 0),
  }));
}
async function fetchTemplateDows() {
  const { data, error } = await sb.from('workout_templates').select('day_of_week');
  if (error) throw error;
  return new Set((data || []).map(t => t.day_of_week));
}
async function addSessionExercise(sessionId, exercise_id, order_index, target_reps = null) {
  const { data, error } = await sb.from('session_exercises')
    .insert({ session_id: sessionId, exercise_id, order_index, target_reps }).select('id').single();
  if (error) throw error;
  return data.id;
}

/* ---------- Banque d'exercices (S1a) ---------- */
async function fetchExercises() {
  const { data, error } = await sb.from('exercises').select('id,name,type_charge').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function createExercise(name, type_charge) {
  const user_id = await getUserId();
  const { data, error } = await sb.from('exercises').insert({ user_id, name, type_charge }).select('id,name,type_charge').single();
  if (error) throw error;
  return data;
}

/* ---------- Semaine type (workout_templates) — S2 « Mes séances » ---------- */
async function fetchTemplates() {
  const { data, error } = await sb.from('workout_templates')
    .select('id,day_of_week,title,template_exercises(id,exercise_id,target_sets,target_reps,order_index,exercises(name))')
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.id, day_of_week: t.day_of_week, title: t.title,
    exos: (t.template_exercises || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map(te => ({ id: te.id, exercise_id: te.exercise_id, name: te.exercises?.name || '?', order_index: te.order_index, target_reps: te.target_reps ?? null })),
  }));
}
async function createTemplate(title, day_of_week) {
  const user_id = await getUserId();
  const { data, error } = await sb.from('workout_templates').insert({ user_id, title, day_of_week }).select('id').single();
  if (error) throw error;
  return data;
}
async function updateTemplate(id, fields) {
  const { error } = await sb.from('workout_templates').update(fields).eq('id', id);
  if (error) throw error;
}
async function deleteTemplate(id) {
  const { error } = await sb.from('workout_templates').delete().eq('id', id);   // cascade template_exercises
  if (error) throw error;
}
async function addTemplateExercise(template_id, exercise_id, order_index) {
  const { error } = await sb.from('template_exercises').insert({ template_id, exercise_id, order_index });
  if (error) throw error;
}
async function deleteTemplateExerciseById(id) {
  const { error } = await sb.from('template_exercises').delete().eq('id', id);
  if (error) throw error;
}
/* Retire un exo d'une séance (ses exercise_sets partent en cascade DB). */
async function deleteSessionExercise(sessionExerciseId) {
  const { error } = await sb.from('session_exercises').delete().eq('id', sessionExerciseId);
  if (error) throw error;
}
/* Retire l'exo du gabarit (ne revient plus aux prochaines séances). Séances déjà générées inchangées. */
async function deleteTemplateExercise(templateId, exerciseId) {
  const { error } = await sb.from('template_exercises')
    .delete().eq('template_id', templateId).eq('exercise_id', exerciseId);
  if (error) throw error;
}
async function replaceSets(sessionExerciseId, sets) {
  const del = await sb.from('exercise_sets').delete().eq('session_exercise_id', sessionExerciseId);
  if (del.error) throw del.error;
  const rows = sets.filter(s => s.reps > 0)          // kg=0 permis (exos PDC)
    .map((s, i) => ({ session_exercise_id: sessionExerciseId, set_number: i + 1, reps: s.reps, kg: s.kg || 0 }));
  if (rows.length) {
    const ins = await sb.from('exercise_sets').insert(rows);
    if (ins.error) throw ins.error;
  }
}

/* ---------- Chargement ---------- */
async function load() {
  session = await fetchSessionForDate(viewDate);
  if (session) {
    mode = 'real';
    exos = await fetchSessionExercises(session.id);
    // garde le repère "target" depuis le gabarit si on le retrouve (purement informatif)
  } else {
    const tmpl = await fetchTemplateForDate(viewDate);
    if (tmpl && (tmpl.template_exercises || []).length) {
      mode = 'proposed';
      session = { id: null, title: tmpl.title, template_id: tmpl.id };
      exos = tmpl.template_exercises
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        .map((te, i) => ({
          id: null, exercise_id: te.exercise_id, name: te.exercises?.name || '?',
          type_charge: te.exercises?.type_charge || 'lesté',
          order_index: te.order_index ?? i,
          target: targetLabel(te.target_sets, te.target_reps), target_reps: te.target_reps ?? null, sets: [],
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
    // copie la cible du gabarit dans la séance (snapshot, §16.2)
    exos[i].id = await addSessionExercise(created.id, exos[i].exercise_id, exos[i].order_index ?? i, exos[i].target_reps ?? null);
  }
}

/* ---------- Rendu ---------- */
export function render() {
  return `<div class="seg sport-seg" id="sport-seg">
      <button data-sv="planning" class="${subview === 'planning' ? 'on' : ''}">Planning</button>
      <button data-sv="sessions" class="${subview === 'sessions' ? 'on' : ''}">Mes séances</button>
    </div>
    <div id="sport-root"></div>`;
}
export async function mount() {
  viewDate = TODAY();                    // à chaque montage : on repart sur aujourd'hui
  subview = 'planning';
  const root = $('#sport-root');
  try { await Promise.all([load(), computeWindow()]); await paintView(); }
  catch (e) { if (root) root.innerHTML = `<div class="empty"><p>Chargement impossible.<br>${esc(e.message || '')}</p></div>`; }
}

/* Aiguille la vue selon le segment. */
async function paintView() {
  if (subview === 'sessions') await paintTemplates();
  else paint();
}

async function reloadView() {
  try { await Promise.all([load(), computeWindow()]); paint(); }
  catch (e) { const root = $('#sport-root'); if (root) root.innerHTML = `<div class="empty"><p>Chargement impossible.<br>${esc(e.message || '')}</p></div>`; }
}

/* Fenêtre du planning : hier → J+7, + résolution des 3 états par jour (§16.6). */
async function computeWindow() {
  windowDates = [];
  for (let i = -1; i <= 7; i++) windowDates.push(dayKey(addDays(new Date(), i)));
  const [sessions, dows] = await Promise.all([
    fetchWindowSessions(windowDates[0], windowDates[windowDates.length - 1]),
    fetchTemplateDows(),
  ]);
  dayStates = new Map();
  for (const key of windowDates) {
    const s = sessions.find(x => x.date === key);
    if (s && s.hasSets) dayStates.set(key, 'fige');          // ≥1 série loggée → figé
    else if (s) dayStates.set(key, 'plan');                  // session sans set → planifié
    else if (dows.has(dowOf(key))) dayStates.set(key, 'calc'); // rien en base mais gabarit ce jour → calculé
    else dayStates.set(key, 'empty');
  }
}

/* Bande horizontale de jours (apparence sélecteur de nuits Sommeil, fenêtre futur). */
function windowStripHTML() {
  return `<div class="planstrip" id="plan-strip">${windowDates.map(k => {
    const d = fromKey(k);
    const st = dayStates.get(k) || 'empty';
    const today = k === TODAY();
    return `<button class="ps-day ${k === viewDate ? 'on' : ''}" data-plandate="${k}">
        <span class="pd-dd">${d.getDate()}</span>
        <span class="pd-dn">${DOW_SHORT[dowOf(k)]}${today ? ' ·' : ''}</span>
        <span class="pd-dot ${st}"></span>
      </button>`;
  }).join('')}</div>`;
}

const isFige = () => mode === 'real' && exos.some(x => x.sets.length > 0);

function paint() {
  const root = $('#sport-root');
  if (!root) return;
  const planBtn = isFige() ? '' : `<button class="plan-btn" data-plan-open>${mode === 'real' ? 'Changer la séance planifiée' : 'Planifier une séance'}</button>`;

  if (mode === 'empty') {
    root.innerHTML = windowStripHTML() + `<div class="empty">
      <p>Aucune séance ce jour-là, et pas de gabarit.<br>Planifie une séance ou ajoute un exercice avec ＋.</p>
    </div>${planBtn}`;
    return;
  }
  const doneCount = exos.filter(x => x.sets.length).length;
  root.innerHTML = windowStripHTML() + `
    <div class="sess">
      <div class="t">${esc(session.title)}</div>
      <div class="s">${exos.length} exercice${exos.length > 1 ? 's' : ''}</div>
      <div class="meta">
        <span><b>${exos.length}</b> exos</span>
        <span><b>${doneCount}</b> fait${doneCount > 1 ? 's' : ''}</span>
      </div>
      ${mode === 'proposed' ? `<div class="badge-proposed">Proposé depuis ton gabarit</div>` : isFige() ? `<div class="badge-fige">Séance loggée</div>` : `<div class="badge-plan">Planifié</div>`}
    </div>
    ${exos.map((x, i) => exoCard(x, i)).join('')}
    ${planBtn}`;
}
function exoCard(x, i) {
  const logged = x.sets.length > 0;
  const pdc = x.type_charge === 'pdc';
  const sub = logged
    ? (pdc
        ? `${x.sets.length} séries · best <b>${Math.max(...x.sets.map(s => s.reps))} reps</b>`
        : `${x.sets.length} séries · 1RM est. <b>${bestOf(x.sets).toFixed(0)} kg</b>`)
    : (x.target || 'à enregistrer');
  return `<div class="exoc ${logged ? 'done' : ''}" data-exo="${i}">
    <div class="eh">
      <span class="anim">${ANIMS[i % ANIMS.length]}</span>
      <div class="en"><div class="n">${esc(x.name)}</div><div class="sub">${sub}</div></div>
      <button class="chart-btn" data-exo-chart="${i}" aria-label="Évolution">📈</button>
      <button class="chart-btn del-btn" data-exo-del="${i}" aria-label="Retirer">🗑</button>
    </div>
  </div>`;
}

/* ---------- « Mes séances » (semaine type) — S2 Tâche 1 ---------- */
async function paintTemplates() {
  const root = $('#sport-root'); if (!root) return;
  try { templates = await fetchTemplates(); }
  catch (e) { root.innerHTML = `<div class="empty"><p>Chargement impossible.<br>${esc(e.message || '')}</p></div>`; return; }
  const cards = templates.length
    ? templates.map(t => `<div class="tpl" data-tpl="${t.id}">
        <div class="tpl-h"><span class="tpl-day">${DOW_LABEL[t.day_of_week]}</span><span class="tpl-title">${esc(t.title)}</span></div>
        <div class="tpl-exos">${t.exos.length ? t.exos.map(x => esc(x.name)).join(' · ') : 'Aucun exercice'}</div>
      </div>`).join('')
    : `<div class="empty"><p>Aucune séance type.<br>Crée ta première avec « ＋ Créer une séance ».</p></div>`;
  root.innerHTML = `<button class="tpl-new" data-tpl-new>＋ Créer une séance</button>${cards}<div style="height:8px"></div>`;
}

async function reopenEditor(id) {
  templates = await fetchTemplates();
  const t = templates.find(x => x.id === id);
  if (t) openTemplateEditor(t);
}

function openCreateTemplate() {
  openSheet(`
    <div class="sheet__title">Nouvelle séance type</div>
    <div class="field"><label for="ntpl-name">Nom</label><input id="ntpl-name" type="text" placeholder="Ex. Push" autocomplete="off"></div>
    <div class="field"><label for="ntpl-day">Jour habituel</label>
      <select id="ntpl-day" class="dn-select">${DOW_LABEL.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
    <button class="btn-primary" id="ntpl-create">Créer</button>`);
  const s = $('#sheet');
  setTimeout(() => s.querySelector('#ntpl-name').focus(), 250);
  s.querySelector('#ntpl-create').onclick = async () => {
    const title = s.querySelector('#ntpl-name').value.trim();
    if (!title) { s.querySelector('#ntpl-name').focus(); return; }
    const day = +s.querySelector('#ntpl-day').value;
    try { const t = await createTemplate(title, day); closeSheet(); await paintTemplates(); toast('Séance créée'); await reopenEditor(t.id); }
    catch (err) { toast('Échec : ' + (err.message || 'création refusée')); }
  };
}

function openTemplateEditor(t) {
  openSheet(`
    <div class="sheet__title">Modifier la séance</div>
    <div class="field"><label for="tpl-name">Nom</label><input id="tpl-name" type="text" value="${esc(t.title)}" autocomplete="off"></div>
    <div class="field"><label for="tpl-day">Jour habituel</label>
      <select id="tpl-day" class="dn-select">${DOW_LABEL.map((d, i) => `<option value="${i}" ${i === t.day_of_week ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div class="field"><label>Exercices</label>
      <div id="tpl-exos">${t.exos.length
        ? t.exos.map(x => `<div class="tpl-exo-row"><span>${esc(x.name)}</span><button class="pdel" data-tdel="${x.id}" aria-label="Retirer">×</button></div>`).join('')
        : '<div style="color:var(--dim);font-size:12.5px;padding:4px 0">Aucun exercice — ajoute-en un.</div>'}</div>
    </div>
    <button class="btn-secondary" id="tpl-addexo">＋ Ajouter un exercice</button>
    <button class="btn-primary" id="tpl-save">Enregistrer</button>
    <button class="btn-ghost-danger" id="tpl-del">Supprimer la séance</button>`);
  const s = $('#sheet');
  $$('[data-tdel]', s).forEach(b => b.onclick = async () => {
    try { await deleteTemplateExerciseById(b.dataset.tdel); await reopenEditor(t.id); }
    catch (err) { toast('Échec : ' + (err.message || 'suppression refusée')); }
  });
  s.querySelector('#tpl-addexo').onclick = () => openBankForTemplate(t.id);
  s.querySelector('#tpl-save').onclick = async () => {
    const title = s.querySelector('#tpl-name').value.trim();
    if (!title) { s.querySelector('#tpl-name').focus(); return; }
    const day = +s.querySelector('#tpl-day').value;
    try { await updateTemplate(t.id, { title, day_of_week: day }); closeSheet(); await paintTemplates(); toast('Séance enregistrée'); }
    catch (err) { toast('Échec : ' + (err.message || 'enregistrement refusé')); }
  };
  s.querySelector('#tpl-del').onclick = async () => {
    if (!confirm('Supprimer cette séance type ?')) return;
    try { await deleteTemplate(t.id); closeSheet(); await paintTemplates(); toast('Séance supprimée'); }
    catch (err) { toast('Échec : ' + (err.message || 'suppression refusée')); }
  };
}

/* Ouvre la banque en mode « ajout à un template ». */
function openBankForTemplate(templateId) {
  bankPickHandler = async (exId) => {
    try {
      const order = templates.find(t => t.id === templateId)?.exos.length || 0;
      await addTemplateExercise(templateId, exId, order);
      bankEl().classList.remove('show');
      await reopenEditor(templateId);
      toast('Exercice ajouté');
    } catch (err) { toast('Échec : ' + (err.message || 'écriture refusée')); }
  };
  openBank('Ajouter à la séance');
}

/* ---------- Planifier une séance sur une date (S2 Tâche 2) ---------- */
/* Snapshot atomique : session + ses exos créés ensemble (0 exo = repos, jamais accidentel). */
async function planTemplateOnDate(template, date) {
  const existing = await fetchSessionForDate(date);       // jour non figé → on remplace proprement
  if (existing) await deleteWorkoutSession(existing.id);  // cascade session_exercises (pas de set car non figé)
  const created = await createSession(template.title, template.id, date);
  for (let i = 0; i < template.exos.length; i++) {
    const te = template.exos[i];
    await addSessionExercise(created.id, te.exercise_id, te.order_index ?? i, te.target_reps ?? null);
  }
}

async function openPlanPicker(date) {
  if (isFige()) { toast('Séance déjà loggée ce jour — non planifiable (déplacement en T3).'); return; }
  openSheet(`<div class="sheet__title">Planifier une séance</div>
    <p style="font-size:12px;color:var(--dim);margin:-4px 0 12px">${fromKey(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
    <div id="plan-list"><div style="color:var(--dim);font-size:13px;padding:8px 0">Chargement…</div></div>`);
  const s = $('#sheet');
  try {
    templates = await fetchTemplates();
    const list = s.querySelector('#plan-list');
    if (!templates.length) { list.innerHTML = `<div style="color:var(--dim);font-size:13px;padding:8px 0">Aucune séance type. Crée-en une dans « Mes séances ».</div>`; return; }
    list.innerHTML = templates.map(t => `<button class="preset-row" data-plt="${t.id}">
        <span class="pn">${esc(t.title)}</span>
        <span class="pk">${DOW_LABEL[t.day_of_week]} · ${t.exos.length} exo${t.exos.length > 1 ? 's' : ''}</span>
      </button>`).join('');
    $$('[data-plt]', s).forEach(b => b.onclick = async () => {
      const t = templates.find(x => x.id === b.dataset.plt);
      try { await planTemplateOnDate(t, date); closeSheet(); await reloadView(); toast('Séance planifiée'); }
      catch (err) { toast('Échec : ' + (err.message || 'écriture refusée')); }
    });
  } catch (err) { s.querySelector('#plan-list').innerHTML = `<div style="color:#ff6b6b;font-size:13px">Échec : ${esc(err.message || '')}</div>`; }
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const sv = e.target.closest('#sport-seg button');
    if (sv) { subview = sv.dataset.sv; $$('#sport-seg button', root).forEach(b => b.classList.toggle('on', b === sv)); paintView(); return; }

    // ----- Mes séances (semaine type) -----
    if (e.target.closest('[data-tpl-new]')) { openCreateTemplate(); return; }
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) { const t = templates.find(x => x.id === tpl.dataset.tpl); if (t) openTemplateEditor(t); return; }

    // ----- Planning (fenêtre de dates) -----
    const pd = e.target.closest('[data-plandate]');
    if (pd) { const k = pd.dataset.plandate; if (k !== viewDate) { viewDate = k; reloadView(); } return; }
    if (e.target.closest('[data-plan-open]')) { openPlanPicker(viewDate); return; }
    const del = e.target.closest('[data-exo-del]');
    if (del) { e.stopPropagation(); openRemove(+del.dataset.exoDel); return; }
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

/* ----- Suppression d'un exo en séance (S1b, §16.2) ----- */
function openRemove(idx) {
  const exo = exos[idx];
  if (!exo) return;
  const hasSets = (exo.sets || []).length > 0;
  const hasTemplate = !!(session && session.template_id);
  const m = modalEl();
  m.innerHTML = `<div class="popcard">
    <button class="popclose" data-mclose>×</button>
    <div class="entry-h">Retirer « ${esc(exo.name)} » ?</div>
    ${hasSets
      ? `<div class="rm-warn">⚠️ ${exo.sets.length} série${exo.sets.length > 1 ? 's' : ''} enregistrée${exo.sets.length > 1 ? 's' : ''} dans cette séance ${exo.sets.length > 1 ? 'seront perdues' : 'sera perdue'}.</div>`
      : `<div class="entry-sub">Retiré de cette séance — jamais de la banque.</div>`}
    <button class="saveb" data-rm="once">Retirer de cette séance</button>
    ${hasTemplate ? `<button class="addset" data-rm="future" style="margin-top:8px">Retirer aussi des prochaines séances</button>` : ''}
    <button class="btn-ghost-danger" data-rm="cancel" style="margin-top:8px">Annuler</button>
  </div>`;
  m.classList.add('show');
  m.querySelector('[data-rm="cancel"]').onclick = () => m.classList.remove('show');
  m.querySelector('[data-rm="once"]').onclick = () => doRemove(idx, false);
  const fut = m.querySelector('[data-rm="future"]');
  if (fut) fut.onclick = () => doRemove(idx, true);
}

async function doRemove(idx, alsoTemplate) {
  const exo = exos[idx];
  const m = modalEl();
  const btns = [...m.querySelectorAll('[data-rm]')];
  btns.forEach(b => b.disabled = true);
  try {
    if (mode === 'proposed') {
      // séance non matérialisée : "cette fois" = matérialiser SANS cet exo ; "prochaines" = retirer du gabarit
      if (alsoTemplate) {
        if (session?.template_id) await deleteTemplateExercise(session.template_id, exo.exercise_id);
        exos.splice(idx, 1);
      } else {
        exos.splice(idx, 1);
        await materialize();       // persiste la séance du jour sans cet exo (gabarit inchangé)
      }
    } else {
      if (exo.id) await deleteSessionExercise(exo.id);       // cascade → exercise_sets
      if (alsoTemplate && session?.template_id) await deleteTemplateExercise(session.template_id, exo.exercise_id);
    }
    m.classList.remove('show');
    await reloadView();
    toast('Exercice retiré');
  } catch (err) {
    btns.forEach(b => b.disabled = false);
    toast('Échec : ' + (err.message || 'suppression refusée'));
  }
}

async function openEntry(idx) {
  const exo = exos[idx];
  // séries de départ : aujourd'hui si déjà saisi, sinon dernière séance loggée, sinon objectif
  let initial = exo.sets.slice();
  if (initial.length === 0) {
    try {
      const hist = await fetchExoHistory(exo.exercise_id);
      const prior = hist.filter(h => h.date < viewDate && h.sets.length).pop();
      if (prior) initial = prior.sets.map(s => ({ ...s }));
    } catch { /* ignore, on retombe sur l'objectif */ }
  }
  if (initial.length === 0) {
    const n = defaultSetCount(exo);
    initial = Array.from({ length: n }, () => ({ reps: '', kg: '' }));
  }

  const pdc = exo.type_charge === 'pdc';
  const m = modalEl();
  m.innerHTML = `<div class="popcard tall">
    <button class="popclose" data-mclose>×</button>
    <div class="entry-h">${esc(exo.name)}</div>
    <div class="entry-sub">${exo.target ? 'Objectif : ' + esc(exo.target) : (pdc ? 'Poids de corps · saisis tes reps' : 'Saisis tes séries')}</div>
    <div id="entry-rows">${initial.map((s, i) => rowHTML(i, s, pdc)).join('')}</div>
    <button class="addset" id="entry-add">＋ Ajouter une série</button>
    ${pdc
      ? `<div class="savestat"><div>Meilleure série<b id="entry-best">—</b></div><div style="text-align:right">Total reps<b id="entry-vol">—</b></div></div>`
      : `<div class="savestat"><div>1RM estimé<b id="entry-1rm">—</b></div><div style="text-align:right">Volume total<b id="entry-vol">—</b></div></div>`}
    <button class="saveb" id="entry-save">Enregistrer</button>
    ${pdc
      ? `<div class="algo-note">Exercice au poids de corps : on suit les <b>reps</b> (pas de 1RM ni de charge).</div>`
      : `<div class="algo-note">Le 1RM estimé suit la formule d'Epley (kg × (1 + reps/30)). Fiable surtout sous ~12 reps ; au-delà, c'est une approximation.</div>`}
  </div>`;
  m.classList.add('show');

  const rows = $('#entry-rows', m);
  const recalc = () => {
    let best = 0, vol = 0, approx = false, bestReps = 0, totReps = 0;
    $$('.srow', rows).forEach(rw => {
      const reps = +rw.querySelector('[data-reps]').value || 0;
      const kg = +(rw.querySelector('[data-kg]')?.value) || 0;
      vol += reps * kg;
      totReps += reps;
      if (reps > bestReps) bestReps = reps;
      const oneRm = e1rm(reps, kg);
      if (oneRm > best) { best = oneRm; approx = reps > 12; }
      rw.querySelector('.field.reps')?.classList.toggle('warn', !pdc && reps > 12);
    });
    if (pdc) {
      $('#entry-best', m).textContent = bestReps ? bestReps + ' reps' : '—';
      $('#entry-vol', m).textContent = totReps ? totReps + ' reps' : '—';
    } else {
      $('#entry-1rm', m).innerHTML = best ? `${best.toFixed(1)} kg${approx ? ' <span class="approx">≈</span>' : ''}` : '—';
      $('#entry-vol', m).textContent = vol ? vol.toLocaleString('fr-FR') + ' kg' : '—';
    }
  };
  const renumber = () => $$('.srow .si', rows).forEach((s, i) => s.textContent = 'Série ' + (i + 1));
  rows.addEventListener('input', recalc);
  rows.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { del.closest('.srow').remove(); renumber(); recalc(); }
  });
  $('#entry-add', m).onclick = () => { rows.insertAdjacentHTML('beforeend', rowHTML($$('.srow', rows).length, { reps: '', kg: '' }, pdc)); renumber(); recalc(); };
  recalc();

  $('#entry-save', m).onclick = async () => {
    const sets = $$('.srow', rows).map(rw => ({
      reps: +rw.querySelector('[data-reps]').value || 0,
      kg: pdc ? 0 : (+(rw.querySelector('[data-kg]')?.value) || 0),
    }));
    const btn = $('#entry-save', m); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      await materialize();                         // crée la séance réelle si proposée
      const seId = exos[idx].id;                   // id (re)mappé après matérialisation
      await replaceSets(seId, sets);
      await reloadView();
      m.classList.remove('show');
      toast('Séries enregistrées');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}
function rowHTML(i, s, pdc = false) {
  return `<div class="srow ${pdc ? 'pdc' : ''}">
    <span class="si">Série ${i + 1}</span>
    <div class="field reps"><input type="number" inputmode="numeric" data-reps value="${s.reps ?? ''}"><span>reps</span></div>
    ${pdc ? '' : `<div class="field"><input type="number" inputmode="decimal" data-kg value="${s.kg ?? ''}"><span>kg</span></div>`}
    <button class="del" data-del aria-label="Retirer">×</button>
  </div>`;
}
function defaultSetCount(exo) {
  const t = (exo.target || '').match(/^(\d+)/);
  return t ? Math.min(8, Math.max(1, +t[1])) : 3;
}

/* ----- Modal graphique d'évolution (1RM lesté / reps pdc) ----- */
let chartName = null, chartHist = [], chartPeriod = '1M', chartPdc = false;
const CPERIODS = { '1S': 7, '1M': 30, '6M': 182, '1A': 365 };

async function openChart(exo) {
  chartName = exo.name; chartPeriod = '1M'; chartPdc = exo.type_charge === 'pdc';
  const m = modalEl();
  m.innerHTML = `<div class="popcard">
    <button class="popclose" data-mclose>×</button>
    <div class="entry-h">${esc(exo.name)}</div>
    <div class="exo-chart-sub">${chartPdc ? 'Meilleure série (reps)' : '1RM estimé (Epley)'} · <span id="exo-trend" style="font-weight:600"></span></div>
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
  try { chartHist = await fetchExoHistory(exo.exercise_id); } catch { chartHist = []; }
  drawChart();
}

function drawChart() {
  const m = $('#sport-modal');
  const line = $('#exo-line', m), area = $('#exo-area', m), xx = $('#exo-x', m), trend = $('#exo-trend', m);
  const since = dayKey(addDays(new Date(), -CPERIODS[chartPeriod]));
  // un point par séance : meilleur 1RM (lesté) OU meilleure série en reps (pdc)
  const metric = (h) => chartPdc ? Math.max(0, ...h.sets.map(s => s.reps || 0)) : h.best;
  const pts = chartHist.filter(h => h.date >= since && metric(h) > 0).map(h => ({ d: h.date, v: metric(h) }));
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
  const u = chartPdc ? 'reps' : 'kg';
  trend.textContent = diff > 1 ? `▲ +${diff.toFixed(0)} ${u}` : diff < -1 ? `▼ ${diff.toFixed(0)} ${u}` : '■ stable';
  trend.style.color = diff > 1 ? '#3fd18a' : diff < -1 ? '#ff6b6b' : '#8b909c';
}

/* ---------- FAB : banque d'exercices plein écran (S1a) ---------- */
let bank = [];   // exercises chargés à l'ouverture
let bankPickHandler = pickExercise;   // que faire quand on choisit un exo (séance par défaut ; template en « Mes séances »)

const norm = (s) => s.trim().toLowerCase();
const findExact = (name) => bank.find(e => norm(e.name) === norm(name));
/* Ressemblance v1 = « règle bête » : partage d'un mot entier, ou inclusion. */
function findSimilar(name) {
  const n = norm(name); const toks = new Set(n.split(/\s+/).filter(Boolean));
  return bank.find(e => {
    const en = norm(e.name);
    if (en === n) return false;
    if (en.includes(n) || n.includes(en)) return true;
    return en.split(/\s+/).filter(Boolean).some(t => toks.has(t));
  });
}

function bankEl() {
  let b = document.getElementById('exo-bank');
  if (!b) {
    b = document.createElement('div'); b.id = 'exo-bank'; b.className = 'exo-bank';
    document.body.appendChild(b);
    b.addEventListener('click', (e) => { if (e.target.hasAttribute('data-bank-close')) b.classList.remove('show'); });
  }
  return b;
}

export async function onFab() {
  if (subview === 'sessions') { openCreateTemplate(); return; }   // « Mes séances » → créer un template
  bankPickHandler = pickExercise;                                 // Planning → ajouter à la séance du jour
  await openBank('Ajouter un exercice');
}

/* Ouvre la banque plein écran ; la sélection passe par bankPickHandler. */
async function openBank(title) {
  const b = bankEl();
  b.innerHTML = `<div class="exo-bank__head">
      <button class="exo-bank__x" data-bank-close aria-label="Fermer">✕</button>
      <div class="exo-bank__t">${esc(title)}</div>
    </div>
    <div class="exo-bank__create">
      <input id="exo-new" type="text" placeholder="Nouvel exercice…" autocomplete="off">
      <button id="exo-create" class="btn-primary">Créer</button>
    </div>
    <div class="exo-bank__typerow">
      <span class="tlab">Type de charge</span>
      <div class="exo-type-seg" id="exo-type">
        <button data-t="lesté" class="on">Lesté</button>
        <button data-t="pdc">Poids de corps</button>
      </div>
    </div>
    <div class="exo-bank__list" id="exo-list"><div class="exo-bank__load">Chargement de la banque…</div></div>`;
  b.classList.add('show');

  try { bank = await fetchExercises(); } catch (e) { $('#exo-list', b).innerHTML = `<div class="empty"><p>Banque indisponible.<br>${esc(e.message || '')}</p></div>`; return; }
  renderBankList();

  $$('#exo-type button', b).forEach(btn => btn.onclick = () => {
    $$('#exo-type button', b).forEach(x => x.classList.toggle('on', x === btn));
    renderBankList();                                     // filtre la liste sur le type sélectionné
  });
  $('#exo-create', b).onclick = () => attemptCreate($('#exo-new', b).value);
  $('#exo-new', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptCreate(e.target.value); });
}

/* Type de charge choisi dans le formulaire (défaut lesté). */
const selectedType = () => bankEl().querySelector('#exo-type button.on')?.dataset.t || 'lesté';

function renderBankList() {
  const list = $('#exo-list');
  if (!list) return;
  const type = selectedType();
  const shown = bank.filter(e => (e.type_charge || 'lesté') === type);
  if (!shown.length) {
    list.innerHTML = `<div class="empty"><p>Aucun exercice ${type === 'pdc' ? 'au poids de corps' : 'lesté'}.<br>Crée-en un ci-dessus (le type suit ce sélecteur).</p></div>`;
    return;
  }
  list.innerHTML = shown.map(e => `<button class="exo-bank__item" data-pick="${e.id}">
      <span class="xn">${esc(e.name)}</span>
      <span class="xt ${e.type_charge === 'pdc' ? 'pdc' : 'les'}">${e.type_charge === 'pdc' ? 'PDC' : 'Lesté'}</span>
    </button>`).join('');
  $$('[data-pick]', list).forEach(btn => btn.onclick = () => bankPickHandler(btn.dataset.pick));
}

/* Anti-doublon 2 étages (trim + minuscules). */
function attemptCreate(raw) {
  const name = (raw || '').trim();
  if (!name) return;
  const exact = findExact(name);
  if (exact) { bankPickHandler(exact.id); return; }   // étage 1 : égalité → réutiliser, muet
  const similar = findSimilar(name);
  if (similar) {                                        // étage 2 : ressemblance → avertir, pas bloquer
    const box = bankEl();
    const warn = document.createElement('div');
    warn.className = 'exo-bank__warn';
    warn.innerHTML = `<div class="w-card">
      <div class="w-t">Ça ressemble à « ${esc(similar.name)} »</div>
      <div class="w-s">Tu veux vraiment créer un autre exercice « ${esc(name)} » ?</div>
      <button class="btn-secondary" id="w-reuse">Réutiliser « ${esc(similar.name)} »</button>
      <button class="btn-primary" id="w-create">Créer « ${esc(name)} »</button>
      <button class="btn-ghost-danger" id="w-cancel">Annuler</button>
    </div>`;
    box.appendChild(warn);
    warn.querySelector('#w-reuse').onclick = () => { warn.remove(); bankPickHandler(similar.id); };
    warn.querySelector('#w-create').onclick = () => { warn.remove(); doCreate(name, selectedType()); };
    warn.querySelector('#w-cancel').onclick = () => warn.remove();
    return;
  }
  doCreate(name, selectedType());                       // aucun voisin → création directe
}

async function doCreate(name, type_charge) {
  try {
    const ex = await createExercise(name, type_charge);
    bank.push(ex);
    await bankPickHandler(ex.id);
  } catch (err) { toast('Échec : ' + (err.message || 'création refusée')); }
}

/* Sélection = ajoute l'exo à la séance courante (via exercise_id). */
async function pickExercise(exerciseId) {
  const ex = bank.find(e => e.id === exerciseId);
  try {
    if (mode === 'proposed') await materialize();
    else if (mode === 'empty' || !session) { session = await createSession('Séance du jour', null); mode = 'real'; exos = []; }
    const order = exos.length;
    const id = await addSessionExercise(session.id, exerciseId, order, null);
    exos.push({ id, exercise_id: exerciseId, name: ex?.name || '?', type_charge: ex?.type_charge || 'lesté', order_index: order, target: '', target_reps: null, sets: [] });
    bankEl().classList.remove('show');
    await reloadView(); toast('Exercice ajouté');
  } catch (err) { toast('Échec : ' + (err.message || 'écriture refusée')); }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
