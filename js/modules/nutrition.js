/* ============================================================
   modules/nutrition.js — Nutrition : segment Repas | Poids (brief §9.3).
   Réf. visuelle : maquette pages 1-4, page 3. Accent vert clair.
   - Repas : calories vs objectif (anneau), macros P/G/L, chips, liste, pop-up.
   - Poids : pesée du matin, poids actuel + gain, courbe en escalier.
   Objectifs : profile_settings (mini-saisie in-module tant que l'onboarding
   n'existe pas). Catégorie de repas dérivée de l'heure (meals n'a pas de type).
   Tout dérivé calculé à la lecture (brief §4.3).
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, $$, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, addDays, monthLabel, fromKey } from '../dates.js';
import { computeWeightVelocity } from '../weight-velocity.js';

export const accent = '#3fb88a';
export const header = () =>
  `<div class="pagetitle">Nutrition</div><div class="pagesub">Repas & poids</div>`;

/* ---------- État ---------- */
let subview = 'repas';            // 'repas' | 'poids'
let chip = 'Tout';
let weightPeriod = '3M';
let settings = null;              // profile_settings
let meals = [];                   // repas du jour
let weights = [];                 // weight_logs (asc)
let presets = [];                 // meal_presets (chargés à la demande)
let viewDate = null;              // jour affiché (date logique). Borné : aujourd'hui ⇄ hier.

/* Navigation de date bornée à 1 jour en arrière (brief §"Date logique"). */
const TODAY = () => dayKey();
const YESTERDAY = () => dayKey(addDays(new Date(), -1));
const onToday = () => viewDate === TODAY();

const MACRO_GOAL_FALLBACK = { kcal: 2200, p: 150, g: 250, l: 70 };
const CHIPS = ['Tout', 'Petit-déj', 'Déjeuner', 'Dîner'];
const WPERIODS = { '1M': 30, '3M': 90, '6M': 182, '1A': 365 };

/* ---------- Accès données ---------- */
async function fetchSettings() {
  const { data, error } = await sb.from('profile_settings')
    .select('target_kcal,target_protein_g,target_carbs_g,target_fat_g').maybeSingle();
  if (error) throw error;
  return data;
}
async function saveSettings(s) {
  const user_id = await getUserId();
  const { error } = await sb.from('profile_settings').upsert({
    user_id,
    target_kcal: s.kcal, target_protein_g: s.p, target_carbs_g: s.g, target_fat_g: s.l,
  }, { onConflict: 'user_id' });
  if (error) throw error;
}
async function fetchMealsForDate(dateKey) {
  // Filtre par DATE LOGIQUE (meal_date), pas par eaten_at (brief §"Date logique").
  const { data, error } = await sb.from('meals')
    .select('id,name,eaten_at,meal_date,kcal,protein_g,carbs_g,fat_g')
    .eq('meal_date', dateKey)
    .order('eaten_at', { ascending: true });   // ordre par heure DANS la journée
  if (error) throw error;
  return data || [];
}
async function insertMeal(m) {
  const user_id = await getUserId();
  const { error } = await sb.from('meals').insert({
    user_id, name: m.name, eaten_at: m.eaten_at, meal_date: m.meal_date,
    kcal: m.kcal, protein_g: m.p, carbs_g: m.g, fat_g: m.l,
  });
  if (error) throw error;
}
async function deleteMeal(id) {
  const { error } = await sb.from('meals').delete().eq('id', id);
  if (error) throw error;
}
async function fetchPresets() {
  const { data, error } = await sb.from('meal_presets')
    .select('id,name,kcal,protein_g,carbs_g,fat_g').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function insertPreset(pr) {
  const user_id = await getUserId();
  const { error } = await sb.from('meal_presets').insert({
    user_id, name: pr.name, kcal: pr.kcal, protein_g: pr.p, carbs_g: pr.g, fat_g: pr.l,
  });
  if (error) throw error;
}
async function deletePreset(id) {
  const { error } = await sb.from('meal_presets').delete().eq('id', id);
  if (error) throw error;
}
async function fetchWeights() {
  const { data, error } = await sb.from('weight_logs')
    .select('log_date,weight_kg').order('log_date', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function saveWeight(kg) {
  const user_id = await getUserId();
  const { error } = await sb.from('weight_logs')
    .upsert({ user_id, log_date: dayKey(), weight_kg: kg }, { onConflict: 'user_id,log_date' });
  if (error) throw error;
}

/* ---------- Helpers ---------- */
const goal = () => ({
  kcal: settings?.target_kcal || MACRO_GOAL_FALLBACK.kcal,
  p: settings?.target_protein_g || MACRO_GOAL_FALLBACK.p,
  g: settings?.target_carbs_g || MACRO_GOAL_FALLBACK.g,
  l: settings?.target_fat_g || MACRO_GOAL_FALLBACK.l,
});
const hasGoal = () => !!(settings && settings.target_kcal);

function mealCat(iso) {
  const h = new Date(iso).getHours() + new Date(iso).getMinutes() / 60;
  if (h < 11.5) return 'Petit-déj';
  if (h < 17) return 'Déjeuner';
  return 'Dîner';
}
const CAT_EMOJI = { 'Petit-déj': '🥣', 'Déjeuner': '🍱', 'Dîner': '🍽️' };
function hhmm(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function totals() {
  return meals.reduce((a, m) => ({
    kcal: a.kcal + (m.kcal || 0),
    p: a.p + (+m.protein_g || 0),
    g: a.g + (+m.carbs_g || 0),
    l: a.l + (+m.fat_g || 0),
  }), { kcal: 0, p: 0, g: 0, l: 0 });
}
const frKg = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/* ---------- Rendu ---------- */
export function render() {
  return `<div class="nut">
    <div class="seg nut__seg" id="nut-seg">
      <button data-v="repas" class="${subview === 'repas' ? 'on' : ''}">Repas</button>
      <button data-v="poids" class="${subview === 'poids' ? 'on' : ''}">Poids</button>
    </div>
    <div class="nut__top" id="nut-top"></div>
    <div class="nut__list" id="nut-list"></div>
  </div>`;
}

export async function mount() {
  viewDate = TODAY();                     // à chaque montage : on repart sur aujourd'hui
  try {
    [settings, meals, weights] = await Promise.all([fetchSettings(), fetchMealsForDate(viewDate), fetchWeights()]);
    paint();
  } catch (e) {
    const l = $('#nut-list');
    if (l) l.innerHTML = `<div class="empty"><p>Chargement impossible.<br>${esc(e.message || '')}</p></div>`;
  }
}

async function reloadMeals() {
  meals = await fetchMealsForDate(viewDate);
  paintRepas();
}

/* Barre de navigation de date (aujourd'hui ⇄ hier, vue Repas). */
function dateNavHTML() {
  const today = onToday();
  const lab = today ? "Aujourd'hui" : 'Hier';
  const dateStr = fromKey(viewDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="datenav">
    <button class="dn-arrow" data-day-prev ${today ? '' : 'disabled'} aria-label="Jour précédent">‹</button>
    <div class="dn-lab"><b>${lab}</b><span>${dateStr}</span></div>
    <button class="dn-arrow" data-day-next ${today ? 'disabled' : ''} aria-label="Jour suivant">›</button>
  </div>`;
}

function paint() {
  if (subview === 'repas') paintRepas(); else paintPoids();
}

/* ----- REPAS ----- */
function paintRepas() {
  const top = $('#nut-top'), list = $('#nut-list');
  if (!top || !list) return;
  const t = totals(), gg = goal();
  const calPct = Math.min(100, gg.kcal ? t.kcal / gg.kcal * 100 : 0);
  const C = 283;

  const macro = (cls, lab, val, tot) => {
    const pct = tot ? Math.min(100, val / tot * 100) : 0;
    const off = (126 * (1 - pct / 100)).toFixed(1);
    return `<div class="macro ${cls}"><div class="mr">
      <svg width="46" height="46" viewBox="0 0 46 46"><circle class="t" cx="23" cy="23" r="20"/>
      <circle class="p" cx="23" cy="23" r="20" stroke-dasharray="126" style="stroke-dashoffset:${off}"/></svg>
      <span class="pc">${Math.round(pct)}%</span></div>
      <div class="ml">${lab}</div><div class="mv">${Math.round(val)} / ${tot} g</div></div>`;
  };

  top.innerHTML = `
    ${dateNavHTML()}
    <div class="cal-hero">
      <div class="cal-ring">
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle class="t" cx="52" cy="52" r="45"/>
          <circle class="p" id="cal-arc" cx="52" cy="52" r="45" stroke-dasharray="${C}" style="stroke-dashoffset:${C}"/>
        </svg>
        <div class="c"><span class="n">${t.kcal.toLocaleString('fr-FR')}</span><span class="u">kcal</span></div>
      </div>
      <div class="cal-info">
        <div class="lab">Objectif du jour</div>
        ${hasGoal()
          ? `<div class="goal">${gg.kcal.toLocaleString('fr-FR')} kcal</div>
             <div class="rest">reste <b>${Math.max(0, gg.kcal - t.kcal).toLocaleString('fr-FR')} kcal</b></div>`
          : `<div class="goal" style="font-size:15px;color:var(--dim)">non défini</div>`}
        <span class="setlink" id="nut-setgoal">${hasGoal() ? 'Modifier mes objectifs' : 'Définir mes objectifs'}</span>
        <span class="setlink" id="nut-presets" style="margin-left:12px">⭐ Mes plats</span>
      </div>
    </div>
    <div class="macros">
      ${macro('p', 'Protéines', t.p, gg.p)}
      ${macro('g', 'Glucides', t.g, gg.g)}
      ${macro('l', 'Lipides', t.l, gg.l)}
    </div>
    <div class="chips" id="nut-chips">
      ${CHIPS.map(c => `<span class="chip ${c === chip ? 'on' : ''}" data-chip="${c}">${c}</span>`).join('')}
    </div>`;

  // anime l'anneau calories
  requestAnimationFrame(() => {
    const arc = $('#cal-arc');
    if (arc) arc.style.strokeDashoffset = (C * (1 - calPct / 100)).toFixed(1);
  });

  const shown = meals.filter(m => chip === 'Tout' || mealCat(m.eaten_at) === chip);
  if (meals.length === 0) {
    list.innerHTML = `<div class="empty"><p>${onToday() ? 'Aucun repas aujourd’hui' : 'Aucun repas ce jour-là'}.<br>Ajoute-en un avec le bouton ＋.</p></div>`;
  } else {
    list.innerHTML = shown.map(m => {
      const cat = mealCat(m.eaten_at);
      return `<div class="meal" data-meal="${m.id}">
        <div class="mc">
          <div><div class="nm">${esc(m.name)}</div><div class="sub">${cat} · ${hhmm(m.eaten_at)}</div></div>
          <div class="kc"><div class="v">${m.kcal}</div><div class="k">kcal</div></div>
        </div></div>`;
    }).join('') || `<div class="empty"><p>Aucun repas dans « ${chip} ».</p></div>`;
  }
}

/* Carte vitesse de poids (P0, §16.1) — calculée à la lecture. */
function velocityHTML() {
  const v = computeWeightVelocity(weights, { asof: dayKey() });
  if (v.state === 'calibration') {
    return `<div class="wvel calib">
      <div class="l">Vitesse de poids</div>
      <div class="v">Calibration en cours</div>
      <div class="hint">${v.n}/${v.minPoints} pesées sur ${v.windowDays} j — pèse-toi le matin à jeun pour lancer le calcul</div>
    </div>`;
  }
  const kgw = v.velocity;
  const val = `${kgw >= 0 ? '+' : '−'}${Math.abs(kgw).toFixed(2).replace('.', ',')} kg/sem`;
  const cls = kgw >= 0.05 ? 'up' : kgw <= -0.05 ? 'down' : 'flat';
  return `<div class="wvel ${cls}">
    <div class="l">Vitesse de poids · régression ${v.windowDays} j</div>
    <div class="v">${val}</div>
    <div class="hint">${v.n} pesées · pente lissée (indépendante de l'escalier)</div>
    <div class="note">Les 2 premières semaines d'un changement alimentaire reflètent surtout l'eau — lis la tendance, pas le niveau.</div>
  </div>`;
}

/* ----- POIDS ----- */
function paintPoids() {
  const top = $('#nut-top'), list = $('#nut-list');
  if (!top || !list) return;

  const today = dayKey();
  const todayW = weights.find(w => w.log_date === today);
  const cur = weights.length ? weights[weights.length - 1].weight_kg : null;
  const start = weights.length ? weights[0].weight_kg : null;
  const gain = (cur != null && start != null) ? cur - start : null;

  top.innerHTML = `
    <div class="weigh-hero">
      <div>
        <div class="l">Poids ce matin</div>
        <div class="wval"><input type="number" step="0.1" inputmode="decimal" id="w-input"
          value="${todayW ? todayW.weight_kg : (cur ?? '')}"><span class="u">kg</span></div>
        <div class="ok" id="w-ok">${todayW ? '✓ enregistré aujourd\'hui' : ''}</div>
      </div>
      <button class="wsave" id="w-save">Peser</button>
    </div>
    <div class="wstats">
      <div class="wstat"><div class="l">Poids actuel</div><div class="b">${cur != null ? frKg(cur) + ' kg' : '—'}</div></div>
      <div class="wstat"><div class="l">Depuis le début</div>
        <div class="b ${gain != null && gain >= 0 ? 'up' : ''}">${gain != null ? (gain >= 0 ? '+' : '') + frKg(gain) + ' kg' : '—'}</div></div>
    </div>
    ${velocityHTML()}
    <div class="graph">
      <div class="gh"><span class="tt">Évolution du poids</span>
        <div class="seg" id="w-seg">
          ${Object.keys(WPERIODS).map(k => `<button data-k="${k}" class="${k === weightPeriod ? 'on' : ''}">${k === '1A' ? '1an' : k}</button>`).join('')}
        </div>
      </div>
      <svg class="lc" viewBox="0 0 320 80" preserveAspectRatio="none" style="width:100%;height:78px;display:block">
        <path class="wln" id="w-line"></path>
      </svg>
      <div class="gx" id="w-x" style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:5px"></div>
    </div>`;

  drawWeightChart();
  list.innerHTML = `<div style="font-size:11px;color:var(--dim);padding:2px 2px 0">
    Pèse-toi chaque matin à jeun pour une courbe fiable. La marche d'escalier marque chaque nouvelle pesée.</div>`;
}

/* Courbe en escalier (brief §9.3). Structure prête pour un lissage futur (§15.2). */
function drawWeightChart() {
  const line = $('#w-line'), xx = $('#w-x');
  if (!line) return;
  const since = dayKey(addDays(new Date(), -WPERIODS[weightPeriod]));
  const pts = weights.filter(w => w.log_date >= since).map(w => ({ d: w.log_date, v: +w.weight_kg }));
  if (pts.length < 2) {
    line.setAttribute('d', '');
    xx.innerHTML = `<span>${pts.length ? 'une seule pesée — reviens demain' : 'aucune pesée sur la période'}</span>`;
    return;
  }
  const W = 320, H = 80, P = 8;
  const vals = pts.map(p => p.v);
  const mn = Math.min(...vals) - .6, mx = Math.max(...vals) + .6;
  const x = i => P + i * ((W - 2 * P) / (pts.length - 1));
  const y = v => H - P - ((v - mn) / (mx - mn)) * (H - 2 * P);
  let d = `M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(i).toFixed(1)} V${y(pts[i].v).toFixed(1)}`; // escalier
  line.setAttribute('d', d);
  // anime le tracé
  const len = line.getTotalLength();
  line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
  requestAnimationFrame(() => { line.style.transition = 'stroke-dashoffset 1.4s ease'; line.style.strokeDashoffset = 0; });
  // libellés (premier / milieu / aujourd'hui)
  const lbl = (p) => monthLabel(p.d);
  xx.innerHTML = `<span>${lbl(pts[0])}</span><span>${lbl(pts[Math.floor(pts.length / 2)])}</span><span>auj.</span>`;
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', async (e) => {
    const seg = e.target.closest('#nut-seg button');
    if (seg) { subview = seg.dataset.v; $$('#nut-seg button', root).forEach(b => b.classList.toggle('on', b === seg)); paint(); return; }

    if (e.target.closest('[data-day-prev]')) { if (onToday()) { viewDate = YESTERDAY(); reloadMeals(); } return; }
    if (e.target.closest('[data-day-next]')) { if (!onToday()) { viewDate = TODAY(); reloadMeals(); } return; }

    const ch = e.target.closest('[data-chip]');
    if (ch) { chip = ch.dataset.chip; paintRepas(); return; }

    const setg = e.target.closest('#nut-setgoal');
    if (setg) { openGoalSheet(); return; }

    const presetsBtn = e.target.closest('#nut-presets');
    if (presetsBtn) { openPresetManage(); return; }

    const wseg = e.target.closest('#w-seg button');
    if (wseg) { weightPeriod = wseg.dataset.k; $$('#w-seg button', root).forEach(b => b.classList.toggle('on', b === wseg)); drawWeightChart(); return; }

    const wsave = e.target.closest('#w-save');
    if (wsave) { onSaveWeight(); return; }

    const meal = e.target.closest('[data-meal]');
    if (meal) { openMealPop(meal.dataset.meal); return; }
  });
}

async function onSaveWeight() {
  const input = $('#w-input');
  const kg = parseFloat((input.value || '').replace(',', '.'));
  if (!kg || kg <= 0) { input.focus(); return; }
  try {
    await saveWeight(kg);
    weights = await fetchWeights();
    paintPoids();
    toast('Poids enregistré');
  } catch { toast('Échec de l’enregistrement'); }
}

/* ----- Pop-up repas ----- */
function popEl() {
  let p = document.getElementById('meal-pop');
  if (!p) {
    p = document.createElement('div');
    p.id = 'meal-pop'; p.className = 'popscrim';
    document.body.appendChild(p);
    p.addEventListener('click', (e) => {
      if (e.target === p || e.target.hasAttribute('data-popclose')) p.classList.remove('show');
    });
  }
  return p;
}
function openMealPop(id) {
  const m = meals.find(x => x.id === id); if (!m) return;
  const gg = goal();
  const cat = mealCat(m.eaten_at);
  const ringBig = (pct) => (214 * (1 - Math.min(pct, 100) / 100)).toFixed(1);
  const ringSm = (pct) => (132 * (1 - Math.min(pct, 100) / 100)).toFixed(1);
  const calP = m.kcal / gg.kcal * 100, pP = (+m.protein_g || 0) / gg.p * 100,
        gP = (+m.carbs_g || 0) / gg.g * 100, lP = (+m.fat_g || 0) / gg.l * 100;

  const p = popEl();
  p.innerHTML = `<div class="popcard">
    <button class="popclose" data-popclose>×</button>
    <div class="pop-photo">${CAT_EMOJI[cat] || '🍽️'}</div>
    <div class="pop-name">${esc(m.name)}</div>
    <div class="pop-kcal"><b>${m.kcal}</b> kcal · ${cat} · ${hhmm(m.eaten_at)}</div>
    <div class="pop-rings">
      <div class="ringwrap rb"><svg width="84" height="84" viewBox="0 0 84 84" style="transform:rotate(-90deg)">
        <circle cx="42" cy="42" r="34" fill="none" stroke="#ffffff12" stroke-width="7"/>
        <circle cx="42" cy="42" r="34" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="214" style="stroke-dashoffset:214;filter:drop-shadow(0 0 6px var(--accent));transition:stroke-dashoffset .6s ease" data-arc="cal"/></svg>
        <div class="pc" style="color:var(--accent)">${Math.round(calP)}%</div><div class="lab">Calories<br>du jour</div></div>
      <div class="smalls">
        ${smallRing('Prot', pP, 'var(--accent)')}
        ${smallRing('Gluc', gP, '#5AA9E6')}
        ${smallRing('Lip', lP, '#EBB54D')}
      </div>
    </div>
    <button class="btn-secondary" style="margin-top:16px" data-poppreset="${m.id}">⭐ Enregistrer comme plat prédéfini</button>
    <button class="btn-ghost-danger" data-popdel="${m.id}">Supprimer ce repas</button>
  </div>`;
  p.classList.add('show');
  // anime les anneaux
  requestAnimationFrame(() => {
    p.querySelector('[data-arc="cal"]').style.strokeDashoffset = ringBig(calP);
    p.querySelectorAll('[data-arc-sm]').forEach((c, i) => {
      c.style.strokeDashoffset = ringSm([pP, gP, lP][i]);
    });
  });
  // suppression
  p.querySelector('[data-popdel]').onclick = async (ev) => {
    const did = ev.currentTarget.dataset.popdel;
    try { await deleteMeal(did); p.classList.remove('show'); await reloadMeals(); toast('Repas supprimé'); }
    catch { toast('Échec de la suppression'); }
  };
  // enregistrer comme plat prédéfini
  const star = p.querySelector('[data-poppreset]');
  star.onclick = async () => {
    star.disabled = true; star.textContent = 'Enregistrement…';
    try {
      await insertPreset({ name: m.name, kcal: m.kcal, p: m.protein_g ?? null, g: m.carbs_g ?? null, l: m.fat_g ?? null });
      star.textContent = '✓ Ajouté à mes plats';
      toast('Plat prédéfini enregistré');
    } catch (err) {
      star.disabled = false; star.textContent = '⭐ Enregistrer comme plat prédéfini';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}
function smallRing(lab, pct, color) {
  return `<div class="ringwrap rs"><svg width="52" height="52" viewBox="0 0 52 52" style="transform:rotate(-90deg)">
    <circle cx="26" cy="26" r="21" fill="none" stroke="#ffffff12" stroke-width="5"/>
    <circle cx="26" cy="26" r="21" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="132" style="stroke-dashoffset:132;transition:stroke-dashoffset .6s ease" data-arc-sm/></svg>
    <div class="pc" style="color:${color}">${Math.round(pct)}%</div><div class="lab">${lab}</div></div>`;
}

/* ---------- FAB : chooser d'ajout (Manuel / Prédéfini / Photo) ---------- */
export function onFab() {
  if (subview === 'poids') { const i = $('#w-input'); if (i) i.focus(); return; }
  openSheet(`
    <div class="sheet__title">Ajouter un repas</div>
    <button class="btn-primary" id="ch-manual">✍️ Saisie manuelle</button>
    <button class="btn-secondary" id="ch-preset">⭐ Plat prédéfini</button>
    <button class="btn-secondary" id="ch-photo" disabled>📷 Photo — Bientôt (v2)</button>`);
  const s = $('#sheet');
  s.querySelector('#ch-manual').onclick = () => openMealForm(null);
  s.querySelector('#ch-preset').onclick = () => openPresetPicker();
}

/* Sélecteur de plat prédéfini → pré-remplit le formulaire. */
async function openPresetPicker() {
  openSheet(`<div class="sheet__title">Plat prédéfini</div><div id="pp-list"><div style="color:var(--dim);font-size:13px;padding:8px 0">Chargement…</div></div>`);
  const s = $('#sheet');
  try {
    presets = await fetchPresets();
    const list = s.querySelector('#pp-list');
    if (!presets.length) { list.innerHTML = `<div style="color:var(--dim);font-size:13px;padding:8px 0">Aucun plat prédéfini. Enregistre un repas comme plat depuis sa fiche (⭐).</div>`; return; }
    list.innerHTML = presets.map(p => `<button class="preset-row" data-pp="${p.id}">
        <span class="pn">${esc(p.name)}</span>
        <span class="pk">${p.kcal} kcal${p.protein_g != null ? ` · ${p.protein_g}P` : ''}${p.carbs_g != null ? `/${p.carbs_g}G` : ''}${p.fat_g != null ? `/${p.fat_g}L` : ''}</span>
      </button>`).join('');
    $$('[data-pp]', s).forEach(b => b.onclick = () => {
      const pr = presets.find(x => x.id === b.dataset.pp);
      openMealForm({ name: pr.name, kcal: pr.kcal, p: pr.protein_g, g: pr.carbs_g, l: pr.fat_g });
    });
  } catch (err) {
    s.querySelector('#pp-list').innerHTML = `<div style="color:#ff6b6b;font-size:13px">Échec : ${esc(err.message || '')}</div>`;
  }
}

/* Formulaire d'ajout de repas — pré-rempli si `pre` fourni (depuis un preset). */
function openMealForm(pre) {
  const v = (x) => (x == null ? '' : x);
  openSheet(`
    <div class="sheet__title">Ajouter un repas</div>
    <div class="field"><label for="m-name">Nom</label>
      <input id="m-name" type="text" placeholder="Ex. Poulet, riz, brocolis" autocomplete="off" value="${pre ? esc(pre.name) : ''}"></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="m-kcal">Calories</label>
        <input id="m-kcal" type="number" inputmode="numeric" placeholder="kcal" value="${pre ? v(pre.kcal) : ''}"></div>
      <div class="field" style="flex:1"><label for="m-time">Heure</label>
        <input id="m-time" type="time" value="${new Date().toTimeString().slice(0, 5)}"></div>
    </div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="m-p">Protéines</label><input id="m-p" type="number" inputmode="decimal" placeholder="g" value="${pre ? v(pre.p) : ''}"></div>
      <div class="field" style="flex:1"><label for="m-g">Glucides</label><input id="m-g" type="number" inputmode="decimal" placeholder="g" value="${pre ? v(pre.g) : ''}"></div>
      <div class="field" style="flex:1"><label for="m-l">Lipides</label><input id="m-l" type="number" inputmode="decimal" placeholder="g" value="${pre ? v(pre.l) : ''}"></div>
    </div>
    <button class="btn-primary" id="m-add">Ajouter</button>`);
  const s = $('#sheet');
  const btn = s.querySelector('#m-add');
  setTimeout(() => s.querySelector('#m-name').focus(), 250);
  btn.onclick = async () => {
    const name = s.querySelector('#m-name').value.trim();
    const kcal = parseInt(s.querySelector('#m-kcal').value, 10);
    if (!name || !kcal) { s.querySelector('#m-name').focus(); return; }
    const [hh, mm] = s.querySelector('#m-time').value.split(':').map(Number);
    const when = fromKey(viewDate); when.setHours(hh || 0, mm || 0, 0, 0);   // heure sur le JOUR AFFICHÉ
    const num = (id) => { const val = parseFloat((s.querySelector(id).value || '').replace(',', '.')); return isNaN(val) ? null : val; };
    btn.disabled = true; btn.textContent = 'Ajout…';
    try {
      await insertMeal({ name, kcal, eaten_at: when.toISOString(), meal_date: viewDate, p: num('#m-p'), g: num('#m-g'), l: num('#m-l') });
      closeSheet(); subview = 'repas'; await reloadMeals(); toast('Repas ajouté');
    } catch (err) { btn.disabled = false; btn.textContent = 'Ajouter'; toast('Échec : ' + (err.message || 'ajout refusé')); }
  };
}

/* Gestion des plats prédéfinis (liste + suppression). */
async function openPresetManage() {
  openSheet(`<div class="sheet__title">Mes plats prédéfinis</div><div id="pm-list"><div style="color:var(--dim);font-size:13px;padding:8px 0">Chargement…</div></div>`);
  const s = $('#sheet');
  const render = () => {
    const list = s.querySelector('#pm-list');
    if (!presets.length) { list.innerHTML = `<div style="color:var(--dim);font-size:13px;padding:8px 0">Aucun plat. Depuis un repas → ⭐ pour l'enregistrer comme plat.</div>`; return; }
    list.innerHTML = presets.map(p => `<div class="preset-row static">
        <span class="pn">${esc(p.name)}</span>
        <span class="pk">${p.kcal} kcal</span>
        <button class="pdel" data-pmdel="${p.id}" aria-label="Supprimer">×</button>
      </div>`).join('');
    $$('[data-pmdel]', s).forEach(b => b.onclick = async () => {
      try { await deletePreset(b.dataset.pmdel); presets = await fetchPresets(); render(); toast('Plat supprimé'); }
      catch (err) { toast('Échec : ' + (err.message || 'suppression refusée')); }
    });
  };
  try { presets = await fetchPresets(); render(); }
  catch (err) { s.querySelector('#pm-list').innerHTML = `<div style="color:#ff6b6b;font-size:13px">Échec : ${esc(err.message || '')}</div>`; }
}

/* ----- Mini-saisie des objectifs caloriques (in-module) ----- */
function openGoalSheet() {
  const g = goal();
  openSheet(`
    <div class="sheet__title">Objectifs caloriques</div>
    <div class="field"><label for="g-kcal">Calories / jour</label><input id="g-kcal" type="number" inputmode="numeric" value="${hasGoal() ? g.kcal : ''}" placeholder="2200"></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="g-p">Protéines</label><input id="g-p" type="number" value="${hasGoal() ? g.p : ''}" placeholder="g"></div>
      <div class="field" style="flex:1"><label for="g-g">Glucides</label><input id="g-g" type="number" value="${hasGoal() ? g.g : ''}" placeholder="g"></div>
      <div class="field" style="flex:1"><label for="g-l">Lipides</label><input id="g-l" type="number" value="${hasGoal() ? g.l : ''}" placeholder="g"></div>
    </div>
    <button class="btn-primary" id="g-save">Enregistrer</button>`);
  const s = $('#sheet');
  const btn = s.querySelector('#g-save');
  btn.onclick = async () => {
    const kcal = parseInt(s.querySelector('#g-kcal').value, 10);
    if (!kcal) { s.querySelector('#g-kcal').focus(); return; }
    const intv = (id, d) => { const v = parseInt(s.querySelector(id).value, 10); return isNaN(v) ? d : v; };
    btn.disabled = true;
    try {
      await saveSettings({ kcal, p: intv('#g-p', 0), g: intv('#g-g', 0), l: intv('#g-l', 0) });
      settings = await fetchSettings(); closeSheet(); paintRepas(); toast('Objectifs enregistrés');
    } catch (err) { btn.disabled = false; toast('Échec : ' + (err.message || 'enregistrement refusé')); }
  };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
