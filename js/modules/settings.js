/* ============================================================
   modules/settings.js — Paramètres. Phase nutrition (P0b, §16.1b) +
   déconnexion + sections futures (placeholders). Accent neutre.
   ============================================================ */
import { getSession, signOut } from '../auth.js';
import { $, toast } from '../ui.js';
import { dayKey } from '../dates.js';
import { fetchCurrentPhase, startPhase } from '../nutrition-phase.js';

export const accent = '#8b909c';
export const header = () => `<div class="pagetitle">Paramètres</div><div class="pagesub">Compte & préférences</div>`;

const TYPE_LABEL = { bulk: 'Prise de masse', maintien: 'Maintien' };

export function render() {
  return `<div class="settings" id="set-root">
    <div class="set-card">
      <div class="set-k">Compte</div>
      <div class="set-email" id="set-email">…</div>
    </div>

    <div class="set-card">
      <div class="set-k">Phase nutrition</div>
      <div id="set-phase-cur" class="set-phase-cur">…</div>
      <div class="set-phase-form">
        <select id="set-phase-type" class="set-select">
          <option value="bulk">Prise de masse</option>
          <option value="maintien">Maintien</option>
        </select>
        <input id="set-phase-date" type="date" class="set-date" value="${dayKey()}" max="${dayKey()}">
        <button class="btn-primary" id="set-phase-start">Démarrer</button>
      </div>
      <div class="set-note">Démarrer une phase clôt la précédente (la veille). La reco calorique s'active dès la semaine 3.</div>
    </div>

    <div class="set-group">
      <div class="set-row disabled"><span>Objectifs nutrition</span><span class="set-hint">dans Nutrition</span></div>
      <div class="set-row disabled"><span>Objectifs sommeil</span><span class="set-hint">dans Sommeil</span></div>
      <div class="set-row disabled"><span>Matières & objectifs</span><span class="set-hint">dans Devoirs</span></div>
    </div>

    <div class="set-group">
      <div class="set-row disabled"><span>Notifications</span><span class="set-hint">bientôt</span></div>
      <div class="set-row disabled"><span>Thème</span><span class="set-hint">bientôt</span></div>
      <div class="set-row disabled"><span>Installer l'app (PWA)</span><span class="set-hint">bientôt</span></div>
    </div>

    <button class="btn-ghost-danger" id="set-logout">Se déconnecter</button>
    <div style="height:8px"></div>
  </div>`;
}

export async function mount() {
  const s = await getSession();
  const em = $('#set-email');
  if (em) em.textContent = s?.user?.email || '—';
  await paintPhase();
}

async function paintPhase() {
  const el = $('#set-phase-cur');
  if (!el) return;
  try {
    const p = await fetchCurrentPhase();
    el.innerHTML = p
      ? `<b>${TYPE_LABEL[p.type] || p.type}</b> en cours · depuis le ${frDate(p.started_on)}`
      : `<span class="dim">Aucune phase en cours — P0b reste muet tant qu'aucune phase n'est démarrée.</span>`;
  } catch (e) {
    el.innerHTML = `<span class="dim">Impossible de lire la phase (${escapeHtml(e.message || '')}).</span>`;
  }
}

function frDate(key) {
  return new Date(key + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function bind(root) {
  root.addEventListener('click', async (e) => {
    const start = e.target.closest('#set-phase-start');
    if (start) {
      const type = $('#set-phase-type').value;
      const date = $('#set-phase-date').value;
      if (!date) return;
      start.disabled = true; start.textContent = 'Démarrage…';
      try {
        await startPhase(type, date);
        toast('Phase démarrée');
        await paintPhase();
      } catch (err) {
        toast('Échec : ' + (err.message || 'écriture refusée'));
      } finally {
        start.disabled = false; start.textContent = 'Démarrer';
      }
      return;
    }

    const out = e.target.closest('#set-logout');
    if (out) {
      out.disabled = true; out.textContent = 'Déconnexion…';
      try {
        await signOut();   // app.js onAuthChange → écran de login
      } catch (err) {
        out.disabled = false; out.textContent = 'Se déconnecter';
        toast('Échec : ' + (err.message || 'déconnexion impossible'));
      }
    }
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
