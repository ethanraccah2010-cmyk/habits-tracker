/* ============================================================
   views.js — registre des vues.
   Chaque vue : accent, en-tête (#appbar-titles), corps (#view),
   et optionnellement mount()/bind()/onFab() pour les modules câblés.
   ============================================================ */
import * as habitudes from './modules/habitudes.js';

const greetHeader = () => {
  const d = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="greet"><h1>Salut Ethan</h1><span class="date">${d}</span></div>`;
};
const titleHeader = (title, sub) =>
  () => `<div class="pagetitle">${title}</div><div class="pagesub">${sub}</div>`;

/* Stub d'étape 1 — sera remplacé par le vrai module. */
const stub = (label) => () =>
  `<div class="stub"><span class="dotty"></span>${label} · module branché aux prochaines étapes.</div>`;

/* Écran "Plus" : grille vers les modules secondaires. */
const PLUS_MODULES = [
  { id: 'sport',    ic: '🏋️', nm: 'Sport',           sub: 'Séances & progression' },
  { id: 'sommeil',  ic: '🌙', nm: 'Sommeil',          sub: 'Nuits & dette' },
  { id: 'business', ic: '💼', nm: 'Business',         sub: 'CRM prospects' },
  { id: 'devoirs',  ic: '📚', nm: 'Devoirs & Notes',  sub: 'Échéances & moyennes' },
];
const plusGrid = () =>
  `<div class="plus-grid">` +
  PLUS_MODULES.map(m =>
    `<button class="plus-card" data-go="${m.id}">
       <span class="ic">${m.ic}</span>
       <span class="nm">${m.nm}</span>
       <span class="sub">${m.sub}</span>
     </button>`).join('') +
  `</div>`;

/* En-tête d'un sous-module : lien retour vers Plus + titre. */
const subHeader = (title, sub) => () =>
  `<button class="back-link" data-go="plus">‹ Plus</button>
   <div class="pagetitle">${title}</div><div class="pagesub">${sub}</div>`;

export const VIEWS = {
  accueil:   { accent: '#8b7bff', tab: true,  header: greetHeader,                              render: stub('Accueil') },
  habitudes: { accent: habitudes.accent, tab: true, header: habitudes.header, render: habitudes.render,
               mount: habitudes.mount, bind: habitudes.bind, onFab: habitudes.onFab },
  nutrition: { accent: '#3fb88a', tab: true,  header: titleHeader('Nutrition', 'Repas & poids'),         render: stub('Nutrition') },
  agenda:    { accent: '#1f8fe0', tab: true,  header: titleHeader('Agenda', 'Tes événements à venir'),    render: stub('Agenda') },

  plus:      { accent: '#8b7bff', tab: false, header: titleHeader('Plus', 'Tous les modules'),  render: plusGrid },

  sport:     { accent: '#ff4d4d', tab: false, header: subHeader('Sport', 'Séances & progression'),   render: stub('Sport') },
  sommeil:   { accent: '#8accff', tab: false, header: subHeader('Sommeil', 'Nuits & dette'),          render: stub('Sommeil') },
  business:  { accent: '#ff6b9d', tab: false, header: subHeader('Business', 'CRM prospects'),         render: stub('Business') },
  devoirs:   { accent: '#f5ebcc', tab: false, header: subHeader('Devoirs & Notes', 'Échéances & moyennes'), render: stub('Devoirs & Notes') },
};

/* Onglets de la tab bar, dans l'ordre, avec le FAB injecté au centre. */
export const TAB_ORDER = ['accueil', 'habitudes', 'nutrition', 'agenda'];
