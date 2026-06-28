/* ============================================================
   ui.js — helpers partagés (DOM, gemme SVG du coach).
   ============================================================ */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* Gemme facettée, teintée par --accent (brief §6, reprise des maquettes). */
export function gem(size = 56) {
  const h = Math.round(size * 64 / 56);
  return `<svg class="gem" width="${size}" height="${h}" viewBox="0 0 56 64" aria-hidden="true">
    <polygon points="28,2 52,18 44,46 28,62 12,46 4,18" fill="#0f1118" stroke="var(--accent)" stroke-width="1.6"/>
    <polygon points="28,2 52,18 28,26 4,18" fill="var(--accent)" opacity=".55"/>
    <polygon points="28,26 52,18 44,46 28,62" fill="var(--accent)" opacity=".22"/>
    <polygon points="28,26 4,18 12,46 28,62" fill="var(--accent)" opacity=".4"/>
  </svg>`;
}

/* Coche (case d'habitude). */
export const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 13 13"><path d="M2 7l3 3 6-7" stroke="#06120e" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Toast éphémère. */
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1600);
}

/* Feuille de saisie (bottom sheet). */
export function openSheet(html) {
  const s = $('#sheet'), sc = $('#scrim');
  s.innerHTML = html;
  s.hidden = false; sc.hidden = false;
  sc.onclick = closeSheet;
  return s;
}
export function closeSheet() {
  $('#sheet').hidden = true;
  $('#scrim').hidden = true;
}

/* Icônes SVG de la tab bar (tracés repris de la maquette). */
export const TAB_ICONS = {
  accueil:   '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  habitudes: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  nutrition: '<path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4zM6 1v3M10 1v3M14 1v3"/>',
  agenda:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
};
