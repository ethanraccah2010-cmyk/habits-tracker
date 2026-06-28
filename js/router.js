/* ============================================================
   router.js — routeur de vues mono-page.
   Échange le contenu de #view sans rechargement, pose --accent,
   maintient la tab bar et le bouton "Plus" à jour.
   ============================================================ */
import { $, TAB_ICONS } from './ui.js';
import { VIEWS, TAB_ORDER } from './views.js';

let current = null;
let currentObj = null;
const bound = new Set();

const TAB_LABELS = {
  accueil: 'Accueil', habitudes: 'Habitudes', nutrition: 'Nutrition', agenda: 'Agenda',
};

/* Construit la tab bar : 4 onglets + FAB central (identique maquette §7). */
function renderTabbar() {
  const tab = (id) =>
    `<button class="tab" data-go="${id}" data-tab="${id}">
       <svg viewBox="0 0 24 24">${TAB_ICONS[id]}</svg>${TAB_LABELS[id]}
     </button>`;
  const fab =
    `<button class="fab" id="fab" aria-label="Ajouter">
       <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
     </button>`;
  // Accueil · Habitudes · ＋ · Nutrition · Agenda
  $('#tabbar').innerHTML =
    tab('accueil') + tab('habitudes') + fab + tab('nutrition') + tab('agenda');
}

export function go(name) {
  const view = VIEWS[name];
  if (!view) return;
  current = name;
  currentObj = view;

  // Accent de la page : posé sur :root pour que #app ET les calques
  // hors-#app (sheet, scrim, toast) en héritent.
  document.documentElement.style.setProperty('--accent', view.accent);

  // En-tête + corps
  const viewEl = $('#view');
  $('#appbar-titles').innerHTML = view.header();
  viewEl.innerHTML = view.render();
  viewEl.dataset.view = name;
  viewEl.scrollTop = 0;

  // bind() délégué : une seule fois par type de vue (le listener vit sur #view)
  if (view.bind && !bound.has(name)) { view.bind(viewEl); bound.add(name); }

  // mount() : chargement asynchrone des données du module
  if (view.mount) view.mount(viewEl);

  // États actifs : onglets + bouton Plus
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('on', t.dataset.tab === name));
  $('#plus-btn').classList.toggle('on', name === 'plus' || !view.tab);
}

export function currentView() { return current; }

/* Délégation globale des clics de navigation (data-go). */
function wireNav() {
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-go]');
    if (nav) { go(nav.dataset.go); return; }

    if (e.target.closest('#plus-btn')) { go('plus'); return; }

    if (e.target.closest('#fab')) {
      // Ajout contextuel : le module gère son propre formulaire s'il en a un.
      if (currentObj && currentObj.onFab) currentObj.onFab();
      else openSheetStub();
    }
  });
}

/* Stub de feuille de saisie (l'ajout réel viendra par module). */
function openSheetStub() {
  const sheet = $('#sheet'), scrim = $('#scrim');
  sheet.innerHTML =
    `<div class="pagetitle" style="font-size:18px;margin-bottom:6px">Ajouter</div>
     <div class="stub"><span class="dotty"></span>Saisie de « ${current} » — branchée aux prochaines étapes.</div>`;
  sheet.hidden = false; scrim.hidden = false;
  scrim.onclick = () => { sheet.hidden = true; scrim.hidden = true; };
}

export function startApp(initial = 'accueil') {
  renderTabbar();
  wireNav();
  go(initial);
}
