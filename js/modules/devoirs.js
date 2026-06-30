/* ============================================================
   modules/devoirs.js — Devoirs & Notes (brief §9.8). Accent crème.
   Segment Devoirs | Notes. Notes : Dernières notes | Par matière.
   Moyennes CALCULÉES À LA LECTURE (brief §10) :
     - moyenne matière = pondérée par coefficient (notes ramenées /20)
     - moyenne générale = moyenne SIMPLE des moyennes de matières
   CRUD homework + grades + gestion des matières (subjects).
   Réf. visuelle : maquette pages 5-8, page 8.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, $$, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, fromKey } from '../dates.js';

let subjects = [];   // [{id,name,target_average}]
let grades = [];     // [{id,subject_id,label,grade,out_of,coefficient,class_average,graded_at}]
let homework = [];   // [{id,subject_id,chapter,importance,due_date,next_review_date,done}]
let subview = 'dev'; // 'dev' | 'notes'
let tri = 'recent';  // 'recent' | 'mat'

const IMP = ['Léger', 'Moyen', 'Important'];
const IMPC = { 'Léger': '#1c9b66', 'Moyen': '#EBB54D', 'Important': '#ff5d5d' };
const WD = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/* ---------- Accès données ---------- */
async function fetchAll() {
  const [s, g, h] = await Promise.all([
    sb.from('subjects').select('id,name,target_average').order('name'),
    sb.from('grades').select('id,subject_id,label,grade,out_of,coefficient,class_average,graded_at').order('graded_at', { ascending: false }),
    sb.from('homework').select('id,subject_id,chapter,importance,due_date,next_review_date,done').order('due_date', { ascending: true }),
  ]);
  if (s.error) throw s.error; if (g.error) throw g.error; if (h.error) throw h.error;
  return { subjects: s.data || [], grades: g.data || [], homework: h.data || [] };
}
async function insertSubject(name, target) {
  const user_id = await getUserId();
  const { error } = await sb.from('subjects').insert({ user_id, name, target_average: target });
  if (error) throw error;
}
async function deleteSubject(id) {
  const { error } = await sb.from('subjects').delete().eq('id', id);
  if (error) throw error;
}
async function insertGrade(row) { const { error } = await sb.from('grades').insert(row); if (error) throw error; }
async function deleteGrade(id) { const { error } = await sb.from('grades').delete().eq('id', id); if (error) throw error; }
async function insertHomework(row) { const user_id = await getUserId(); const { error } = await sb.from('homework').insert({ user_id, ...row }); if (error) throw error; }
async function updateHomework(id, row) { const { error } = await sb.from('homework').update(row).eq('id', id); if (error) throw error; }
async function deleteHomework(id) { const { error } = await sb.from('homework').delete().eq('id', id); if (error) throw error; }

/* ---------- Calculs dérivés (à la lecture) ---------- */
const norm20 = (gr) => (Number(gr.grade) / Number(gr.out_of || 20)) * 20;

/* Moyenne d'une matière = pondérée par coefficient (brief §10). */
function subjectAverage(subjectId) {
  const gs = grades.filter(g => g.subject_id === subjectId);
  if (!gs.length) return null;
  let sw = 0, sc = 0;
  for (const g of gs) { const c = Number(g.coefficient || 1); sw += norm20(g) * c; sc += c; }
  return sc ? sw / sc : null;
}
/* Moyenne générale = moyenne SIMPLE des moyennes de matières (coef égal). */
function generalAverage() {
  const avgs = subjects.map(s => subjectAverage(s.id)).filter(v => v != null);
  if (!avgs.length) return null;
  return avgs.reduce((a, b) => a + b, 0) / avgs.length;
}
const fr = (x, d = 1) => x == null ? '—' : x.toFixed(d).replace('.', ',');
const subjName = (id) => subjects.find(s => s.id === id)?.name || '—';

/* ---------- Rendu ---------- */
export const accent = '#f5ebcc';
export const header = () => `<div class="pagetitle">Devoirs & Notes</div><div class="pagesub">Échéances & moyennes</div>`;

export function render() {
  return `<div id="dn-root">
    <div class="seg dn-seg" id="dn-seg">
      <button data-v="dev" class="${subview === 'dev' ? 'on' : ''}">Devoirs</button>
      <button data-v="notes" class="${subview === 'notes' ? 'on' : ''}">Notes</button>
    </div>
    <div id="dn-body"></div>
  </div>`;
}

export async function mount() { await reload(); }

async function reload() {
  const body = $('#dn-body');
  if (!body) return;
  try {
    const d = await fetchAll();
    subjects = d.subjects; grades = d.grades; homework = d.homework;
    paintBody();
  } catch (e) {
    body.innerHTML = `<div class="empty"><p>Impossible de charger Devoirs & Notes.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function paintBody() {
  const body = $('#dn-body');
  body.innerHTML = subview === 'dev' ? renderDevoirs() : renderNotes();
}

/* ----- Devoirs ----- */
function renderDevoirs() {
  if (!homework.length) return `<div class="empty"><p>Aucun devoir.<br>Ajoute-en un avec le bouton ＋.</p></div>`;
  return homework.map(h => {
    const imp = IMPC[h.importance] || '#8b909c';
    const dd = h.due_date ? fromKey(h.due_date) : null;
    const dleft = dd ? Math.round((dd - startOfToday()) / 86400000) : null;
    const ddc = dleft == null ? '#8b909c' : (dleft <= 1 ? '#ff5d5d' : (dleft <= 3 ? '#EBB54D' : '#8b909c'));
    const jx = dleft == null ? '' : (dleft < 0 ? `J+${-dleft}` : `J-${dleft}`);
    const rev = h.next_review_date ? `🔁 prochaine révision <b>${revLabel(h.next_review_date)}</b>` : '';
    return `<div class="hw ${h.done ? 'done' : ''}" style="--imp:${imp}" data-id="${h.id}">
      <div class="main">
        <div class="top2"><span class="mat">${escapeHtml(subjName(h.subject_id))}</span><span class="imp">${escapeHtml(h.importance || '')}</span></div>
        <div class="chap">${escapeHtml(h.chapter)}</div>
        <div class="rev">${rev}</div>
      </div>
      ${dd ? `<div class="date" style="--ddc:${ddc}"><div class="jx">${jx}</div><div class="dd">${dd.getDate()}</div><div class="dm">${MO[dd.getMonth()]}</div></div>` : ''}
    </div>`;
  }).join('') + '<div style="height:8px"></div>';
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function revLabel(key) {
  const d = fromKey(key), tk = dayKey();
  if (key === tk) return "aujourd'hui";
  if (key === dayKey(new Date(Date.now() + 86400000))) return 'demain';
  return WD[d.getDay()];
}

/* ----- Notes ----- */
function renderNotes() {
  return `<div class="seg dn-tri" id="dn-tri">
      <button data-t="recent" class="${tri === 'recent' ? 'on' : ''}">Dernières notes</button>
      <button data-t="mat" class="${tri === 'mat' ? 'on' : ''}">Par matière</button>
    </div>
    <div id="dn-notesbody">${tri === 'recent' ? renderRecent() : renderByMat()}</div>`;
}
function renderRecent() {
  if (!grades.length) return `<div class="empty"><p>Aucune note.<br>Ajoute-en une avec le bouton ＋.</p></div>`;
  return grades.map(g => `<div class="grade">
      <div class="g">${fr(norm20(g), Number.isInteger(norm20(g)) ? 0 : 1)}<span class="max">/20</span></div>
      <div class="gi"><div class="gt">${escapeHtml(subjName(g.subject_id))} — ${escapeHtml(g.label)}</div>
        <div class="gc">${g.class_average != null ? 'moyenne classe ' + fr(Number(g.class_average)) : (Number(g.out_of) !== 20 ? `note brute ${fr(Number(g.grade))}/${fr(Number(g.out_of), 0)}` : '')}</div></div>
    </div>`).join('') + '<div style="height:8px"></div>';
}
function renderByMat() {
  const sbar = `<div class="subjbar"><button id="dn-managesubj">＋ Gérer les matières</button></div>`;
  if (!subjects.length) return sbar + `<div class="empty"><p>Aucune matière.<br>Crée d'abord une matière (＋ Gérer les matières).</p></div>`;
  const cards = subjects.map(s => {
    const avg = subjectAverage(s.id);
    const target = s.target_average != null ? Number(s.target_average) : null;
    const fillW = avg != null ? Math.min(avg / 20 * 100, 100) : 0;
    const objL = target != null ? target / 20 * 100 : null;
    return `<div class="subj" data-subj="${s.id}">
      <div class="top2"><span class="name">${escapeHtml(s.name)}</span>
        <span class="avg">${fr(avg)} ${target != null ? `<span class="obj">/ obj. ${fr(target)}</span>` : ''}</span></div>
      <div class="track"><div class="fill" style="width:${fillW.toFixed(0)}%"></div>
        ${objL != null ? `<div class="objmark" style="left:${objL.toFixed(0)}%"></div>` : ''}</div>
    </div>`;
  }).join('');
  const gen = generalAverage();
  const genHtml = `<div class="genavg"><span class="l">Moyenne générale</span><span class="v">${fr(gen)} <small>/ 20</small></span></div>`;
  return sbar + cards + genHtml + '<div style="height:8px"></div>';
}

/* ---------- Pop-up matière (liste des notes) ---------- */
function popEl() {
  let p = $('#dn-pop');
  if (!p) {
    p = document.createElement('div'); p.id = 'dn-pop'; p.className = 'popscrim';
    document.body.appendChild(p);
    p.addEventListener('click', (e) => { if (e.target === p || e.target.hasAttribute('data-popclose')) p.classList.remove('show'); });
  }
  return p;
}
function openSubjPop(id) {
  const s = subjects.find(x => x.id === id); if (!s) return;
  const gs = grades.filter(g => g.subject_id === id);
  const avg = subjectAverage(id), target = s.target_average != null ? Number(s.target_average) : null;
  const p = popEl();
  p.innerHTML = `<div class="popcard fichecard">
    <button class="popclose" data-popclose>×</button>
    <div class="mh">${escapeHtml(s.name)}<div class="ma">Moyenne ${fr(avg)} / 20${target != null ? ` · objectif ${fr(target)}` : ''} · ${gs.length} note${gs.length > 1 ? 's' : ''}</div></div>
    <div style="display:flex;flex-direction:column;gap:9px;margin-top:14px">
      ${gs.length ? gs.map(g => `<div class="grade tappable" data-gid="${g.id}">
        <div class="g">${fr(norm20(g), Number.isInteger(norm20(g)) ? 0 : 1)}<span class="max">/20</span></div>
        <div class="gi"><div class="gt">${escapeHtml(g.label)}${Number(g.coefficient) !== 1 ? ` · coef ${fr(Number(g.coefficient))}` : ''}</div>
          <div class="gc">${g.class_average != null ? 'moyenne classe ' + fr(Number(g.class_average)) : '—'}</div></div>
      </div>`).join('') : `<div class="empty"><p>Aucune note dans cette matière.</p></div>`}
    </div>
  </div>`;
  p.classList.add('show');
  // tap une note → proposer suppression
  $$('.grade[data-gid]', p).forEach(el => el.onclick = () => confirmDeleteGrade(el.dataset.gid, id));
}
function confirmDeleteGrade(gid, subjId) {
  const g = grades.find(x => x.id === gid); if (!g) return;
  if (!confirm(`Supprimer la note « ${g.label} » ?`)) return;
  deleteGrade(gid).then(async () => { toast('Note supprimée'); await reload(); openSubjPop(subjId); })
    .catch(err => toast('Échec : ' + (err.message || 'suppression refusée')));
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const seg = e.target.closest('#dn-seg button');
    if (seg) { subview = seg.dataset.v; $$('#dn-seg button', root).forEach(b => b.classList.toggle('on', b === seg)); paintBody(); return; }
    const trib = e.target.closest('#dn-tri button');
    if (trib) { tri = trib.dataset.t; $$('#dn-tri button', root).forEach(b => b.classList.toggle('on', b === trib)); $('#dn-notesbody').innerHTML = tri === 'recent' ? renderRecent() : renderByMat(); return; }
    if (e.target.closest('#dn-managesubj')) { openManageSubjects(); return; }
    const subj = e.target.closest('[data-subj]');
    if (subj) { openSubjPop(subj.dataset.subj); return; }
    const hw = e.target.closest('.hw[data-id]');
    if (hw) { openHomework(homework.find(h => h.id === hw.dataset.id)); return; }
  });
}

/* ---------- FAB : contextuel selon le segment ---------- */
export function onFab() {
  if (subview === 'notes') openGrade(); else openHomework(null);
}

/* ----- Sheet : gestion des matières ----- */
function openManageSubjects() {
  const list = () => subjects.length
    ? subjects.map(s => `<div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
        <span>${escapeHtml(s.name)}${s.target_average != null ? ` <span style="color:var(--dim);font-size:12px">· obj. ${fr(Number(s.target_average))}</span>` : ''}</span>
        <button data-delsubj="${s.id}" style="background:transparent;border:none;color:#ff6b6b;font-size:18px;cursor:pointer">×</button></div>`).join('')
    : `<div style="color:var(--dim);font-size:13px;padding:6px 0">Aucune matière pour l'instant.</div>`;
  openSheet(`
    <div class="sheet__title">Gérer les matières</div>
    <div id="subj-list">${list()}</div>
    <div class="field-row" style="display:flex;gap:12px;margin-top:14px">
      <div class="field" style="flex:2"><label for="subj-name">Nouvelle matière</label><input id="subj-name" type="text" placeholder="Ex. Maths" autocomplete="off"></div>
      <div class="field" style="flex:1"><label for="subj-obj">Objectif /20</label><input id="subj-obj" type="number" inputmode="decimal" placeholder="15"></div>
    </div>
    <button class="btn-primary" id="subj-add">Ajouter la matière</button>`);
  const s = $('#sheet');
  const refresh = async () => { await reload(); s.querySelector('#subj-list').innerHTML = list(); bindDels(); };
  const bindDels = () => $$('[data-delsubj]', s).forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette matière et toutes ses notes ?')) return;
    try { await deleteSubject(b.dataset.delsubj); toast('Matière supprimée'); await refresh(); }
    catch (err) { toast('Échec : ' + (err.message || 'suppression refusée')); }
  });
  bindDels();
  const add = s.querySelector('#subj-add');
  add.onclick = async () => {
    const name = s.querySelector('#subj-name').value.trim();
    if (!name) { s.querySelector('#subj-name').focus(); return; }
    const t = parseFloat((s.querySelector('#subj-obj').value || '').replace(',', '.'));
    add.disabled = true; add.textContent = 'Ajout…';
    try {
      await insertSubject(name, isNaN(t) ? null : t);
      s.querySelector('#subj-name').value = ''; s.querySelector('#subj-obj').value = '';
      await refresh();
      toast('Matière ajoutée');
    } catch (err) { toast('Échec : ' + (err.message || 'écriture refusée')); }
    finally { add.disabled = false; add.textContent = 'Ajouter la matière'; }
  };
}

/* ----- Sheet : ajouter une note ----- */
function openGrade() {
  if (!subjects.length) { toast('Crée d’abord une matière'); openManageSubjects(); return; }
  openSheet(`
    <div class="sheet__title">Ajouter une note</div>
    <div class="field"><label for="g-subj">Matière</label>
      <select id="g-subj" class="dn-select">${subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="g-label">Intitulé</label><input id="g-label" type="text" placeholder="Ex. Contrôle — dérivées" autocomplete="off"></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="g-grade">Note</label><input id="g-grade" type="number" inputmode="decimal" placeholder="14"></div>
      <div class="field" style="flex:1"><label for="g-out">Sur</label><input id="g-out" type="number" inputmode="decimal" value="20"></div>
      <div class="field" style="flex:1"><label for="g-coef">Coef</label><input id="g-coef" type="number" inputmode="decimal" value="1"></div>
    </div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="g-cls">Moy. classe (option.)</label><input id="g-cls" type="number" inputmode="decimal" placeholder="—"></div>
      <div class="field" style="flex:1"><label for="g-date">Date</label><input id="g-date" type="date" value="${dayKey()}"></div>
    </div>
    <button class="btn-primary" id="g-add">Ajouter</button>`);
  const s = $('#sheet');
  setTimeout(() => s.querySelector('#g-label').focus(), 250);
  const num = (id) => { const v = parseFloat((s.querySelector(id).value || '').replace(',', '.')); return isNaN(v) ? null : v; };
  const btn = s.querySelector('#g-add');
  btn.onclick = async () => {
    const subject_id = s.querySelector('#g-subj').value;
    const label = s.querySelector('#g-label').value.trim();
    const grade = num('#g-grade');
    if (!label || grade == null) { s.querySelector('#g-label').focus(); return; }
    const row = {
      subject_id, label, grade,
      out_of: num('#g-out') ?? 20, coefficient: num('#g-coef') ?? 1,
      class_average: num('#g-cls'), graded_at: s.querySelector('#g-date').value || dayKey(),
    };
    btn.disabled = true; btn.textContent = 'Ajout…';
    try { await insertGrade(row); closeSheet(); toast('Note ajoutée'); await reload(); }
    catch (err) { btn.disabled = false; btn.textContent = 'Ajouter'; toast('Échec : ' + (err.message || 'écriture refusée')); }
  };
}

/* ----- Sheet : ajouter / éditer un devoir ----- */
function openHomework(hw) {
  if (!subjects.length) { toast('Crée d’abord une matière'); openManageSubjects(); return; }
  const isEdit = !!hw;
  const d = hw || {};
  openSheet(`
    <div class="sheet__title">${isEdit ? 'Modifier le devoir' : 'Nouveau devoir'}</div>
    <div class="field"><label for="h-subj">Matière</label>
      <select id="h-subj" class="dn-select">${subjects.map(s => `<option value="${s.id}" ${s.id === d.subject_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="h-chap">Chapitre / tâche</label><input id="h-chap" type="text" placeholder="Ex. Exercices 12 à 18 — dérivées" value="${escapeAttr(d.chapter)}" autocomplete="off"></div>
    <div class="field"><label for="h-imp">Importance</label>
      <select id="h-imp" class="dn-select">${IMP.map(i => `<option ${i === (d.importance || 'Moyen') ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="h-due">Échéance</label><input id="h-due" type="date" value="${d.due_date || ''}"></div>
      <div class="field" style="flex:1"><label for="h-rev">Prochaine révision</label><input id="h-rev" type="date" value="${d.next_review_date || ''}"></div>
    </div>
    ${isEdit ? `<label style="display:flex;align-items:center;gap:9px;font-size:14px;margin:4px 0 2px"><input type="checkbox" id="h-done" ${d.done ? 'checked' : ''}> Terminé</label>` : ''}
    <button class="btn-primary" id="h-save">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
    ${isEdit ? `<button class="btn-ghost-danger" id="h-del">Supprimer</button>` : ''}`);
  const s = $('#sheet');
  setTimeout(() => s.querySelector('#h-chap').focus(), 250);
  const save = s.querySelector('#h-save');
  save.onclick = async () => {
    const chapter = s.querySelector('#h-chap').value.trim();
    if (!chapter) { s.querySelector('#h-chap').focus(); return; }
    const row = {
      subject_id: s.querySelector('#h-subj').value,
      chapter,
      importance: s.querySelector('#h-imp').value,
      due_date: s.querySelector('#h-due').value || null,
      next_review_date: s.querySelector('#h-rev').value || null,
    };
    if (isEdit) row.done = s.querySelector('#h-done').checked;
    save.disabled = true; save.textContent = isEdit ? 'Enregistrement…' : 'Ajout…';
    try {
      if (isEdit) await updateHomework(hw.id, row); else await insertHomework(row);
      closeSheet(); toast(isEdit ? 'Devoir modifié' : 'Devoir ajouté'); await reload();
    } catch (err) { save.disabled = false; save.textContent = isEdit ? 'Enregistrer' : 'Ajouter'; toast('Échec : ' + (err.message || 'écriture refusée')); }
  };
  if (isEdit) {
    const del = s.querySelector('#h-del');
    del.onclick = async () => {
      del.disabled = true; del.textContent = 'Suppression…';
      try { await deleteHomework(hw.id); closeSheet(); toast('Devoir supprimé'); await reload(); }
      catch (err) { del.disabled = false; del.textContent = 'Supprimer'; toast('Échec : ' + (err.message || 'suppression refusée')); }
    };
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
