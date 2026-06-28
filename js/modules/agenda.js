/* ============================================================
   modules/agenda.js — Agenda de bout en bout (brief §9.4).
   CRUD events. Liste des événements à venir groupés par jour.
   Réf. visuelle : maquette pages 1-4, page 4.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, addDays, fromKey } from '../dates.js';

let events = [];   // [{id,title,starts_at,ends_at,location}] triés starts_at ↑

/* ---------- Accès données ---------- */
async function fetchEvents() {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('events')
    .select('id,title,starts_at,ends_at,location')
    .gte('starts_at', since.toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function insertEvent(row) {
  const user_id = await getUserId();
  const { error } = await sb.from('events').insert({ user_id, ...row });
  if (error) throw error;
}
async function updateEvent(id, row) {
  const { error } = await sb.from('events').update(row).eq('id', id);
  if (error) throw error;
}
async function deleteEvent(id) {
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Helpers ---------- */
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const WD = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function dayHeadLabel(key) {
  const tk = dayKey();
  if (key === tk) return `Aujourd'hui · ${prettyDate(key)}`;
  if (key === dayKey(addDays(new Date(), 1))) return `Demain · ${prettyDate(key)}`;
  return prettyDate(key);
}
function prettyDate(key) { const d = fromKey(key); return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`; }

/* Durée + lieu, ligne secondaire. */
function detailLine(ev) {
  const parts = [];
  if (ev.ends_at) {
    const mins = Math.round((new Date(ev.ends_at) - new Date(ev.starts_at)) / 60000);
    if (mins > 0) parts.push(mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) : ''}` : `${mins} min`);
  }
  if (ev.location) parts.push(ev.location);
  return parts.join(' · ') || '—';
}

/* Badge à droite : Passé / À venir / Demain / jour. */
function statusBadge(ev) {
  const now = Date.now();
  const end = ev.ends_at ? new Date(ev.ends_at).getTime() : new Date(ev.starts_at).getTime();
  if (end < now) return { txt: 'Passé', past: true };
  const k = dayKey(new Date(ev.starts_at));
  if (k === dayKey()) {
    const mins = Math.round((new Date(ev.starts_at) - now) / 60000);
    if (mins <= 0) return { txt: 'En cours', past: false };
    if (mins < 60) return { txt: `dans ${mins} min`, past: false };
    return { txt: `dans ${Math.round(mins / 60)} h`, past: false };
  }
  if (k === dayKey(addDays(new Date(), 1))) return { txt: 'Demain', past: false };
  return { txt: WD[fromKey(k).getDay()], past: false };
}

/* ---------- Rendu ---------- */
export const accent = '#1f8fe0';
export const header = () => {
  const n = events.filter(e => dayKey(new Date(e.starts_at)) === dayKey()).length;
  return `<div class="pagetitle">Agenda</div><div class="pagesub">${n} événement${n > 1 ? 's' : ''} aujourd'hui</div>`;
};

export function render() { return `<div id="ag-root"></div>`; }

export async function mount() { await reload(); }

async function reload() {
  const root = $('#ag-root');
  if (!root) return;
  try {
    events = await fetchEvents();
    // rafraîchit le sous-titre de l'en-tête
    const sub = $('#appbar-titles .pagesub'); if (sub) {
      const n = events.filter(e => dayKey(new Date(e.starts_at)) === dayKey()).length;
      sub.textContent = `${n} événement${n > 1 ? 's' : ''} aujourd'hui`;
    }
    paint();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>Impossible de charger l'agenda.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function paint() {
  const root = $('#ag-root');
  if (!events.length) {
    root.innerHTML = `<div class="empty"><p>Aucun événement à venir.<br>Ajoute-en un avec le bouton ＋.</p></div>`;
    return;
  }
  // groupe par jour (clé), dans l'ordre chronologique
  const groups = new Map();
  for (const ev of events) {
    const k = dayKey(new Date(ev.starts_at));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(ev);
  }
  let html = '';
  for (const [k, evs] of groups) {
    html += `<div class="dayhead">${dayHeadLabel(k)}</div>`;
    for (const ev of evs) {
      const b = statusBadge(ev);
      html += `<div class="event ${b.past ? 'past' : ''}" data-id="${ev.id}">
        <span class="tm">${hhmm(ev.starts_at)}</span>
        <div class="bar"></div>
        <div class="body"><div class="ti">${escapeHtml(ev.title)}</div><div class="d">${escapeHtml(detailLine(ev))}</div></div>
        <span class="nx">${b.txt}</span>
      </div>`;
    }
  }
  root.innerHTML = html + '<div style="height:8px"></div>';
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const ev = e.target.closest('[data-id]');
    if (ev) openEditor(events.find(x => x.id === ev.dataset.id));
  });
}

/* ---------- Feuille de saisie / édition ---------- */
function eventSheet(ev) {
  const isEdit = !!ev;
  const sd = ev ? new Date(ev.starts_at) : new Date();
  const date = ev ? dayKey(sd) : dayKey();
  const start = ev ? `${String(sd.getHours()).padStart(2, '0')}:${String(sd.getMinutes()).padStart(2, '0')}` : new Date().toTimeString().slice(0, 5);
  const end = ev && ev.ends_at ? new Date(ev.ends_at).toTimeString().slice(0, 5) : '';
  openSheet(`
    <div class="sheet__title">${isEdit ? 'Modifier l’événement' : 'Nouvel événement'}</div>
    <div class="field"><label for="e-title">Titre</label>
      <input id="e-title" type="text" placeholder="Ex. Appel client — onboarding" autocomplete="off" value="${ev ? escapeAttr(ev.title) : ''}"></div>
    <div class="field"><label for="e-date">Date</label>
      <input id="e-date" type="date" value="${date}"></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="e-start">Début</label><input id="e-start" type="time" value="${start}"></div>
      <div class="field" style="flex:1"><label for="e-end">Fin (option.)</label><input id="e-end" type="time" value="${end}"></div>
    </div>
    <div class="field"><label for="e-loc">Lieu (option.)</label>
      <input id="e-loc" type="text" placeholder="Ex. visio, bureau…" autocomplete="off" value="${ev && ev.location ? escapeAttr(ev.location) : ''}"></div>
    <button class="btn-primary" id="e-save">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
    ${isEdit ? `<button class="btn-ghost-danger" id="e-del">Supprimer</button>` : ''}
  `);

  const s = $('#sheet');
  setTimeout(() => s.querySelector('#e-title').focus(), 250);

  const toIso = (dKey, t) => { const [hh, mm] = t.split(':').map(Number); const d = fromKey(dKey); d.setHours(hh || 0, mm || 0, 0, 0); return d.toISOString(); };

  const save = s.querySelector('#e-save');
  save.onclick = async () => {
    const title = s.querySelector('#e-title').value.trim();
    const dKey = s.querySelector('#e-date').value;
    const st = s.querySelector('#e-start').value;
    if (!title || !dKey || !st) { s.querySelector('#e-title').focus(); return; }
    const endV = s.querySelector('#e-end').value;
    const row = {
      title,
      starts_at: toIso(dKey, st),
      ends_at: endV ? toIso(dKey, endV) : null,
      location: s.querySelector('#e-loc').value.trim() || null,
    };
    save.disabled = true; save.textContent = isEdit ? 'Enregistrement…' : 'Ajout…';
    try {
      if (isEdit) await updateEvent(ev.id, row); else await insertEvent(row);
      closeSheet();
      toast(isEdit ? 'Événement modifié' : 'Événement ajouté');
      await reload();
    } catch (err) {
      save.disabled = false; save.textContent = isEdit ? 'Enregistrer' : 'Ajouter';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };

  if (isEdit) {
    const del = s.querySelector('#e-del');
    del.onclick = async () => {
      del.disabled = true; del.textContent = 'Suppression…';
      try {
        await deleteEvent(ev.id);
        closeSheet();
        toast('Événement supprimé');
        await reload();
      } catch (err) {
        del.disabled = false; del.textContent = 'Supprimer';
        toast('Échec : ' + (err.message || 'suppression refusée'));
      }
    };
  }
}

function openEditor(ev) { eventSheet(ev); }
export function onFab() { eventSheet(null); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
