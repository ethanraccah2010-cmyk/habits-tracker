/* ============================================================
   modules/settings.js — Paramètres. Déconnexion + sections
   futures (placeholders). Accent neutre.
   ============================================================ */
import { getSession, signOut } from '../auth.js';
import { $, toast } from '../ui.js';

export const accent = '#8b909c';
export const header = () => `<div class="pagetitle">Paramètres</div><div class="pagesub">Compte & préférences</div>`;

export function render() {
  return `<div class="settings" id="set-root">
    <div class="set-card">
      <div class="set-k">Compte</div>
      <div class="set-email" id="set-email">…</div>
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
}

export function bind(root) {
  root.addEventListener('click', async (e) => {
    const out = e.target.closest('#set-logout');
    if (!out) return;
    out.disabled = true; out.textContent = 'Déconnexion…';
    try {
      await signOut();   // app.js onAuthChange → écran de login
    } catch (err) {
      out.disabled = false; out.textContent = 'Se déconnecter';
      toast('Échec : ' + (err.message || 'déconnexion impossible'));
    }
  });
}
