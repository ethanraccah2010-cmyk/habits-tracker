/* ============================================================
   views.js — registre des vues.
   Chaque vue : accent, en-tête (#appbar-titles), corps (#view),
   et optionnellement mount()/bind()/onFab() pour les modules câblés.
   ============================================================ */
import * as habitudes from './modules/habitudes.js';
import * as nutrition from './modules/nutrition.js';
import * as sport from './modules/sport.js';
import * as sommeil from './modules/sommeil.js';
import * as agenda from './modules/agenda.js';
import * as business from './modules/business.js';
import * as devoirs from './modules/devoirs.js';
import * as settings from './modules/settings.js';

const greetHeader = () => {
  const d = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="greet"><h1>Salut Ethan</h1><span class="date">${d}</span></div>`;
};
const titleHeader = (title, sub) =>
  () => `<div class="pagetitle">${title}</div><div class="pagesub">${sub}</div>`;

/* Stub — sera remplacé par le vrai module à son étape. */
const stub = (label) => () =>
  `<div class="stub"><span class="dotty"></span>${label} · module branché aux prochaines étapes.</div>`;

export const VIEWS = {
  accueil:   { accent: '#8b7bff', tab: true, header: greetHeader, render: stub('Accueil') },
  habitudes: { accent: habitudes.accent, tab: true, header: habitudes.header, render: habitudes.render,
               mount: habitudes.mount, bind: habitudes.bind, onFab: habitudes.onFab },
  nutrition: { accent: nutrition.accent, tab: true, header: nutrition.header, render: nutrition.render,
               mount: nutrition.mount, bind: nutrition.bind, onFab: nutrition.onFab },

  // Destinations du menu speed-dial (déclenché par ••• dans la tab bar)
  agenda:    { accent: agenda.accent, tab: false, header: agenda.header, render: agenda.render,
               mount: agenda.mount, bind: agenda.bind, onFab: agenda.onFab },
  sport:     { accent: sport.accent, tab: false, header: sport.header, render: sport.render,
               mount: sport.mount, bind: sport.bind, onFab: sport.onFab },
  sommeil:   { accent: sommeil.accent, tab: false, header: sommeil.header, render: sommeil.render,
               mount: sommeil.mount, bind: sommeil.bind, onFab: sommeil.onFab },
  business:  { accent: business.accent, tab: false, header: business.header, render: business.render,
               mount: business.mount, bind: business.bind, onFab: business.onFab },
  devoirs:   { accent: devoirs.accent, tab: false, header: devoirs.header, render: devoirs.render,
               mount: devoirs.mount, bind: devoirs.bind, onFab: devoirs.onFab },
  parametres:{ accent: settings.accent, tab: false, header: settings.header, render: settings.render,
               mount: settings.mount, bind: settings.bind },
};

/* Onglets de la tab bar (5ᵉ emplacement = déclencheur ••• du speed-dial). */
export const TAB_ORDER = ['accueil', 'habitudes', 'nutrition'];

/* Destinations du speed-dial (haut → bas), avec leur emoji et accent. */
export const SPEED_DIAL = [
  { id: 'agenda',   label: 'Agenda',          ic: '📅', accent: '#1f8fe0' },
  { id: 'sport',    label: 'Sport',           ic: '🏋️', accent: '#ff4d4d' },
  { id: 'sommeil',  label: 'Sommeil',         ic: '🌙', accent: '#8accff' },
  { id: 'business', label: 'Business',        ic: '💼', accent: '#ff6b9d' },
  { id: 'devoirs',  label: 'Devoirs & Notes', ic: '📚', accent: '#f5ebcc' },
  { id: 'parametres', label: 'Paramètres',    ic: '⚙️', accent: '#8b909c' },
];
export const SPEED_DIAL_IDS = SPEED_DIAL.map(s => s.id);
