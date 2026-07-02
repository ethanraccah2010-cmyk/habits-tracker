/* ============================================================
   router.js — routeur de vues mono-page + tab bar + speed-dial.
   Tab bar : Accueil · Habitudes · ＋ · Nutrition · •••
   Le ••• déploie un speed-dial (Agenda, Sport, Sommeil, Business, Devoirs).
   ============================================================ */
import { $, TAB_ICONS } from './ui.js';
import { VIEWS, SPEED_DIAL, SPEED_DIAL_IDS } from './views.js';

let current = null;
let currentObj = null;
const bound = new Set();

const TAB_LABELS = { accueil: 'Accueil', habitudes: 'Habitudes', nutrition: 'Nutrition' };
const DOTS = '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

function renderTabbar() {
  const tab = (id) =>
    `<button class="tab" data-go="${id}" data-tab="${id}">
       <svg viewBox="0 0 24 24">${TAB_ICONS[id]}</svg>${TAB_LABELS[id]}
     </button>`;
  const fab =
    `<button class="fab" id="fab" aria-label="Ajouter">
       <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
     </button>`;
  const more =
    `<button class="tab" id="sd-toggle" data-sd-toggle aria-label="Plus de modules">${DOTS}Plus</button>`;
  // Accueil · Habitudes · ＋ · Nutrition · •••
  $('#tabbar').innerHTML = tab('accueil') + tab('habitudes') + fab + tab('nutrition') + more;
}

/* ---------- Speed-dial ---------- */
function buildSpeedDial() {
  const n = SPEED_DIAL.length;
  const scrim = document.createElement('div');
  scrim.id = 'sd-scrim'; scrim.className = 'sd-scrim';
  const dial = document.createElement('div');
  dial.id = 'speeddial'; dial.className = 'speeddial';
  dial.innerHTML = SPEED_DIAL.map((s, i) =>
    `<button class="sd-pill" data-go="${s.id}" style="--a:${s.accent};--d:${(n - 1 - i) * 0.03}s">
       <span class="sd-lbl">${s.label}</span><span class="sd-ic">${s.ic}</span>
     </button>`).join('');
  document.body.append(scrim, dial);
  scrim.addEventListener('click', closeSpeed);
}
function isSpeedOpen() { return $('#speeddial')?.classList.contains('open'); }
function openSpeed() {
  $('#sd-scrim').classList.add('open');
  $('#speeddial').classList.add('open');
  $('#sd-toggle').classList.add('on');
}
function closeSpeed() {
  $('#sd-scrim').classList.remove('open');
  $('#speeddial').classList.remove('open');
  // ••• reste actif si la vue courante est une destination speed-dial
  $('#sd-toggle').classList.toggle('on', SPEED_DIAL_IDS.includes(current));
}
function toggleSpeed() { isSpeedOpen() ? closeSpeed() : openSpeed(); }

export function go(name) {
  const view = VIEWS[name];
  if (!view) return;
  current = name;
  currentObj = view;
  closeSpeed();

  // Accent de la page : posé sur :root (hérité par #app + calques sheet/scrim/toast/speeddial)
  document.documentElement.style.setProperty('--accent', view.accent);

  const viewEl = $('#view');
  $('#appbar-titles').innerHTML = view.header();
  viewEl.innerHTML = view.render();
  viewEl.dataset.view = name;
  viewEl.scrollTop = 0;

  if (view.bind && !bound.has(name)) { view.bind(viewEl); bound.add(name); }
  if (view.mount) view.mount(viewEl);

  // États actifs : onglets + ••• (actif si destination speed-dial)
  document.querySelectorAll('.tab[data-tab]').forEach(t =>
    t.classList.toggle('on', t.dataset.tab === name));
  $('#sd-toggle').classList.toggle('on', SPEED_DIAL_IDS.includes(name));
}

export function currentView() { return current; }

function wireNav() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sd-toggle]')) { toggleSpeed(); return; }

    const nav = e.target.closest('[data-go]');
    if (nav) { go(nav.dataset.go); return; }  // go() ferme le speed-dial

    if (e.target.closest('#fab')) {
      if (currentObj && currentObj.onFab) currentObj.onFab();
      else openSheetStub();
    }
  });
}

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
  buildSpeedDial();
  wireNav();
  go(initial);
}
