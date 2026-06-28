/* ============================================================
   modules/business.js — Business / CRM (brief §9.7). Accent rose.
   Liste de prospects en carte compacte → fiche complète au tap +
   bouton Modifier (édition au style fiche). CRUD prospects.
   Réf. visuelle : maquette pages 5-8, page 7.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, toast } from '../ui.js';

let prospects = [];

const STATUSES = ['Prospect', 'Négociation', 'Gagné', 'Perdu'];
const STCLASS = { 'Prospect': 'st-pro', 'Négociation': 'st-neg', 'Gagné': 'st-win', 'Perdu': 'st-lost' };
const STORDER = { 'Négociation': 0, 'Prospect': 1, 'Gagné': 2, 'Perdu': 3 };

/* ---------- Accès données ---------- */
async function fetchProspects() {
  const { data, error } = await sb
    .from('prospects')
    .select('id,company,manager_name,phone,email,sector,demo_url,contact_date,status,next_action,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
async function insertProspect(row) {
  const user_id = await getUserId();
  const { data, error } = await sb.from('prospects').insert({ user_id, ...row }).select().single();
  if (error) throw error;
  return data;
}
async function updateProspect(id, row) {
  const { error } = await sb.from('prospects').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
async function deleteProspect(id) {
  const { error } = await sb.from('prospects').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Rendu ---------- */
export const accent = '#ff6b9d';
export const header = () => {
  const total = prospects.length;
  const neg = prospects.filter(p => p.status === 'Négociation').length;
  return `<div class="pagetitle">Business</div><div class="pagesub">${total} prospect${total > 1 ? 's' : ''}${neg ? ` · ${neg} en négociation` : ''}</div>`;
};

export function render() { return `<div id="bz-root"></div>`; }

export async function mount() { await reload(); }

async function reload() {
  const root = $('#bz-root');
  if (!root) return;
  try {
    prospects = await fetchProspects();
    prospects.sort((a, b) => (STORDER[a.status] ?? 9) - (STORDER[b.status] ?? 9));
    refreshSub();
    paint();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>Impossible de charger les prospects.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function refreshSub() {
  const sub = $('#appbar-titles .pagesub'); if (!sub) return;
  const total = prospects.length, neg = prospects.filter(p => p.status === 'Négociation').length;
  sub.textContent = `${total} prospect${total > 1 ? 's' : ''}${neg ? ` · ${neg} en négociation` : ''}`;
}

function paint() {
  const root = $('#bz-root');
  if (!prospects.length) {
    root.innerHTML = `<div class="empty"><p>Aucun prospect.<br>Ajoute-en un avec le bouton ＋.</p></div>`;
    return;
  }
  root.innerHTML = prospects.map(p => {
    const sec = [p.sector, p.manager_name].filter(Boolean).join(' · ') || '—';
    const dt = p.contact_date ? fmtDate(p.contact_date) : '';
    return `<div class="prospect" data-id="${p.id}">
      <div class="pt"><span class="co">${escapeHtml(p.company)}</span>
        <span class="st ${STCLASS[p.status] || 'st-pro'}">${escapeHtml(p.status || 'Prospect')}</span></div>
      <div class="sec">${escapeHtml(sec)}</div>
      <div class="nx"><span class="ic">→</span>${escapeHtml(p.next_action || 'Pas d’action définie')}<span class="dt">${dt}</span></div>
    </div>`;
  }).join('') + '<div style="height:8px"></div>';
}

const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function fmtDate(key) { const [y, m, d] = key.split('-').map(Number); return `${d} ${MO[m - 1]}`; }

/* ---------- Pop-up fiche / édition ---------- */
function popEl() {
  let p = $('#bz-pop');
  if (!p) {
    p = document.createElement('div');
    p.id = 'bz-pop'; p.className = 'popscrim';
    document.body.appendChild(p);
    p.addEventListener('click', (e) => {
      if (e.target === p || e.target.hasAttribute('data-popclose')) p.classList.remove('show');
    });
  }
  return p;
}

function openFiche(pr) {
  const p = popEl();
  const v = (x) => x ? escapeHtml(x) : '—';
  const demo = pr.demo_url ? `<a href="${escapeAttr(pr.demo_url)}" target="_blank" rel="noopener">Voir le lien ↗</a>` : '—';
  p.innerHTML = `<div class="popcard fichecard fiche">
    <button class="popclose" data-popclose>×</button>
    <div class="co">${escapeHtml(pr.company)}</div>
    <div class="row"><span class="k">Statut</span><span class="vv">${v(pr.status)}</span></div>
    <div class="row"><span class="k">Gérant</span><span class="vv">${v(pr.manager_name)}</span></div>
    <div class="row"><span class="k">Téléphone</span><span class="vv">${v(pr.phone)}</span></div>
    <div class="row"><span class="k">Email</span><span class="vv">${v(pr.email)}</span></div>
    <div class="row"><span class="k">Secteur</span><span class="vv">${v(pr.sector)}</span></div>
    <div class="row"><span class="k">Démo</span><span class="vv">${demo}</span></div>
    <div class="row"><span class="k">Date de contact</span><span class="vv">${pr.contact_date ? fmtDate(pr.contact_date) : '—'}</span></div>
    <div class="row"><span class="k">Prochaine action</span><span class="vv">${v(pr.next_action)}</span></div>
    <button class="modbtn" data-mod>Modifier</button>
  </div>`;
  p.classList.add('show');
  p.querySelector('[data-mod]').onclick = () => openEdit(pr);
}

function openEdit(pr) {
  const isNew = !pr;
  const d = pr || {};
  const p = popEl();
  p.innerHTML = `<div class="popcard fichecard edit">
    <button class="popclose" data-popclose>×</button>
    <div style="font-family:var(--head);font-weight:700;font-size:17px;margin-bottom:6px">${isNew ? 'Nouveau prospect' : 'Modifier le prospect'}</div>
    <label>Entreprise</label><input data-e="company" value="${escapeAttr(d.company)}">
    <div class="g2">
      <div><label>Gérant</label><input data-e="manager_name" value="${escapeAttr(d.manager_name)}"></div>
      <div><label>Secteur</label><input data-e="sector" value="${escapeAttr(d.sector)}"></div>
    </div>
    <div class="g2">
      <div><label>Téléphone</label><input data-e="phone" value="${escapeAttr(d.phone)}"></div>
      <div><label>Email</label><input data-e="email" value="${escapeAttr(d.email)}"></div>
    </div>
    <label>Lien démo</label><input data-e="demo_url" placeholder="https://…" value="${escapeAttr(d.demo_url)}">
    <div class="g2">
      <div><label>Date de contact</label><input data-e="contact_date" type="date" value="${d.contact_date || ''}"></div>
      <div><label>Statut</label><select data-e="status">${STATUSES.map(s => `<option ${s === (d.status || 'Prospect') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <label>Prochaine action</label><input data-e="next_action" value="${escapeAttr(d.next_action)}">
    <button class="save" data-save>${isNew ? 'Ajouter' : 'Enregistrer'}</button>
    ${isNew ? '' : '<button class="del" data-del>Supprimer</button>'}
  </div>`;
  p.classList.add('show');
  setTimeout(() => p.querySelector('[data-e="company"]').focus(), 200);

  const save = p.querySelector('[data-save]');
  save.onclick = async () => {
    const get = (k) => { const el = p.querySelector(`[data-e="${k}"]`); const v = (el.value || '').trim(); return v || null; };
    const company = get('company');
    if (!company) { p.querySelector('[data-e="company"]').focus(); return; }
    const row = {
      company,
      manager_name: get('manager_name'), phone: get('phone'), email: get('email'),
      sector: get('sector'), demo_url: get('demo_url'), contact_date: get('contact_date'),
      status: get('status') || 'Prospect', next_action: get('next_action'),
    };
    save.disabled = true; save.textContent = isNew ? 'Ajout…' : 'Enregistrement…';
    try {
      if (isNew) await insertProspect(row); else await updateProspect(pr.id, row);
      p.classList.remove('show');
      toast(isNew ? 'Prospect ajouté' : 'Prospect modifié');
      await reload();
    } catch (err) {
      save.disabled = false; save.textContent = isNew ? 'Ajouter' : 'Enregistrer';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };

  if (!isNew) {
    const del = p.querySelector('[data-del]');
    del.onclick = async () => {
      del.disabled = true; del.textContent = 'Suppression…';
      try {
        await deleteProspect(pr.id);
        p.classList.remove('show');
        toast('Prospect supprimé');
        await reload();
      } catch (err) {
        del.disabled = false; del.textContent = 'Supprimer';
        toast('Échec : ' + (err.message || 'suppression refusée'));
      }
    };
  }
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) openFiche(prospects.find(p => p.id === card.dataset.id));
  });
}

export function onFab() { openEdit(null); }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
