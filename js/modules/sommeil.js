/* ============================================================
   modules/sommeil.js — Sommeil de bout en bout (brief §9.6).
   Saisie → Supabase → relecture → affichage. Tout dérivé (heure de
   coucher, moyenne 7 j, dette, durée d'une nuit) est CALCULÉ À LA
   LECTURE — jamais stocké (brief §4.3, §10 « Sommeil »).
   Réf. visuelle : maquette pages 5-8, page 6.
   ============================================================ */
import { sb } from '../supabase.js';
import { getUserId } from '../auth.js';
import { $, $$, toast, openSheet, closeSheet } from '../ui.js';
import { dayKey, addDays, fromKey } from '../dates.js';

/* ---------- État (en mémoire, source = Supabase) ---------- */
let targets = new Map();   // day_of_week (0=lundi) -> { wake_min, dur_h }
let logs = [];             // [{log_date, bedtime, wake_time, duration_hours, quality_rating}] récents → anciens
let selectedNight = 0;     // index dans la liste des nuits loggées (0 = plus récente)
let period = '1S';

const PERIODS = { '1S': 7, '2S': 14, '1M': 30, '3M': 90 };
const DOW = (d) => (d.getDay() + 6) % 7;        // JS dim=0 → brief lun=0
const DN = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

/* ---------- Helpers temps ---------- */
const parseTimeToMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const hoursToMin = (h) => Math.round((h || 0) * 60);
const fmtClock = (min) => { const m = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')} h ${String(m % 60).padStart(2, '0')}`; };
const fmtDur = (h) => { if (h == null) return '—'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

/* Durée d'une nuit, calculée à la lecture depuis bedtime/wake si dispo. */
function durOf(log) {
  if (log.bedtime && log.wake_time) {
    const d = (new Date(log.wake_time) - new Date(log.bedtime)) / 3600000;
    if (d > 0 && d < 24) return d;
  }
  return log.duration_hours != null ? Number(log.duration_hours) : null;
}

/* ---------- Accès données ---------- */
async function fetchTargets() {
  const { data, error } = await sb.from('sleep_targets').select('day_of_week,wake_time,target_duration_hours');
  if (error) throw error;
  return data || [];
}
async function fetchLogs(sinceKey) {
  const { data, error } = await sb
    .from('sleep_logs')
    .select('log_date,bedtime,wake_time,duration_hours,quality_rating')
    .gte('log_date', sinceKey)
    .order('log_date', { ascending: false });
  if (error) throw error;
  return data || [];
}
async function upsertSleep(row) {
  const user_id = await getUserId();
  const { error } = await sb.from('sleep_logs')
    .upsert({ user_id, ...row }, { onConflict: 'user_id,log_date' });
  if (error) throw error;
}
async function saveTargets(rows) {
  const user_id = await getUserId();
  const payload = rows.map(r => ({ user_id, day_of_week: r.dow, wake_time: r.wake + ':00', target_duration_hours: r.dur }));
  const { error } = await sb.from('sleep_targets').upsert(payload, { onConflict: 'user_id,day_of_week' });
  if (error) throw error;
}

/* ---------- Calculs dérivés ---------- */
/* Heure de coucher conseillée ce soir = réveil − durée visée (sleep_targets du jour). */
function bedTonight() {
  const t = targets.get(DOW(new Date()));
  if (!t) return null;
  return { coucher: t.wake_min - hoursToMin(t.dur_h), wake: t.wake_min, dur: t.dur_h };
}
/* Moyenne sur les 7 dernières nuits loggées. */
function avg7() {
  const ds = logs.slice(0, 7).map(durOf).filter(v => v != null);
  if (!ds.length) return null;
  return ds.reduce((a, b) => a + b, 0) / ds.length;
}
/* Dette = Σ (durée réelle − durée visée du jour) sur les 7 dernières nuits loggées. */
function debt7() {
  let sum = 0, any = false;
  for (const l of logs.slice(0, 7)) {
    const d = durOf(l); if (d == null) continue;
    const t = targets.get(DOW(fromKey(l.log_date)));
    if (!t) continue;
    sum += d - t.dur_h; any = true;
  }
  return any ? sum : null;
}

/* ---------- Rendu ---------- */
export const accent = '#8accff';
export const header = () =>
  `<div class="pagetitle">Sommeil</div><div class="pagesub">Nuits & dette</div>`;

export function render() {
  return `<div id="slp-root"></div>`;
}

export async function mount() { await reload(); }

async function reload() {
  const root = $('#slp-root');
  if (!root) return;
  try {
    const since = dayKey(addDays(new Date(), -97));
    const [tg, lg] = await Promise.all([fetchTargets(), fetchLogs(since)]);
    targets = new Map();
    for (const t of tg) targets.set(t.day_of_week, { wake_min: parseTimeToMin(t.wake_time), dur_h: Number(t.target_duration_hours) });
    logs = lg;
    if (selectedNight >= logs.length) selectedNight = 0;
    paint();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>Impossible de charger le sommeil.<br>${escapeHtml(e.message || '')}</p></div>`;
  }
}

function paint() {
  const root = $('#slp-root');
  const bed = bedTonight();
  const a = avg7(), de = debt7();

  const bedHtml = bed
    ? `<span class="moon">🌙</span><div>
         <div class="lab">Au lit ce soir</div>
         <div class="big">${fmtClock(bed.coucher)}</div>
         <div class="sub">réveil ${fmtClock(bed.wake)} · pour ${fmtDur(bed.dur)} de sommeil</div>
       </div>`
    : `<span class="moon">🌙</span><div>
         <div class="lab">Au lit ce soir</div>
         <div class="big" style="font-size:18px">—</div>
         <div class="sub">Aucun objectif défini. Appuie sur « Modifier mes objectifs » ci-dessous.</div>
       </div>`;

  const debtMin = de == null ? null : Math.round(de * 60);
  const debtTxt = de == null ? '—' : `${debtMin >= 0 ? '+' : '−'}${Math.abs(debtMin)} min`;

  root.innerHTML = `
    <div class="bedhero">${bedHtml}</div>
    <div style="text-align:right;margin:-4px 0 11px"><span class="setlink" id="slp-edit-targets">⚙️ Modifier mes objectifs</span></div>
    <div class="sl2">
      <div class="scard"><div class="l">Moyenne 7 j</div><div class="b">${a == null ? '—' : fmtDur(a)}</div></div>
      <div class="scard debt"><div class="l">Dette de sommeil</div><div class="b ${debtMin != null && debtMin >= 0 ? 'ok' : ''}">${debtTxt}</div></div>
    </div>
    <div class="hyp">
      <span class="tt">Détail de la nuit</span>
      <div class="nightsel" id="slp-nightsel"></div>
      <div class="nightdet" id="slp-nightdet"></div>
    </div>
    <div class="hyp">
      <div class="hh2"><span class="tt" style="margin:0">Temps de sommeil</span>
        <div class="seg" id="slp-seg">
          ${['1S', '2S', '1M', '3M'].map(k => `<button data-k="${k}" class="${k === period ? 'on' : ''}">${k}</button>`).join('')}
        </div>
      </div>
      <svg class="slc" id="slp-line" viewBox="0 0 300 80" preserveAspectRatio="none">
        <defs><linearGradient id="slpg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity=".34"/>
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient></defs>
        <path class="ar" fill="url(#slpg)"></path><path class="ln"></path>
      </svg>
      <div class="slx" id="slp-x"></div>
    </div>
    <div style="height:8px"></div>`;

  paintNights();
  paintLine();
}

function paintNights() {
  const sel = $('#slp-nightsel');
  if (!sel) return;
  if (!logs.length) {
    sel.innerHTML = '';
    $('#slp-nightdet').innerHTML = `<div class="empty" style="grid-column:1/-1"><p>Aucune nuit enregistrée.<br>Ajoute-en une avec le bouton ＋.</p></div>`;
    return;
  }
  const six = logs.slice(0, 6);
  sel.innerHTML = six.map((l, i) => {
    const d = fromKey(l.log_date);
    return `<button data-n="${i}" class="${i === selectedNight ? 'on' : ''}">
      <div class="dd">${d.getDate()}</div><div class="dn">${DN[DOW(d)]}</div></button>`;
  }).join('');
  paintNightDetail();
}

function paintNightDetail() {
  const box = $('#slp-nightdet');
  if (!box) return;
  const l = logs[selectedNight];
  if (!l) { box.innerHTML = ''; return; }
  const coucher = l.bedtime ? fmtClock(new Date(l.bedtime).getHours() * 60 + new Date(l.bedtime).getMinutes()) : '—';
  const reveil = l.wake_time ? fmtClock(new Date(l.wake_time).getHours() * 60 + new Date(l.wake_time).getMinutes()) : '—';
  const q = l.quality_rating != null ? `${Number(l.quality_rating)}/5` : '—';
  box.innerHTML = `
    <div class="nd"><div class="k">Coucher</div><div class="v">${coucher}</div></div>
    <div class="nd"><div class="k">Réveil</div><div class="v">${reveil}</div></div>
    <div class="nd"><div class="k">Durée</div><div class="v acc">${fmtDur(durOf(l))}</div></div>
    <div class="nd"><div class="k">Qualité</div><div class="v">${q}</div></div>`;
}

/* Line chart durée de sommeil sur la période (calculé à la lecture). */
function paintLine() {
  const svg = $('#slp-line'); if (!svg) return;
  const ln = svg.querySelector('.ln'), ar = svg.querySelector('.ar'), xx = $('#slp-x');
  const n = PERIODS[period];
  // map log_date -> durée pour résolution rapide
  const byDate = new Map();
  for (const l of logs) byDate.set(l.log_date, durOf(l));

  // points jour par jour sur la fenêtre (anciens → récents)
  const pts = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(addDays(new Date(), -i));
    pts.push({ key, v: byDate.has(key) ? byDate.get(key) : null });
  }
  const vals = pts.map(p => p.v).filter(v => v != null);
  if (vals.length < 2) {
    ln.setAttribute('d', ''); ar.setAttribute('d', '');
    xx.innerHTML = `<span>Pas assez de nuits pour tracer la courbe.</span>`;
    return;
  }
  const mn = Math.min(...vals) - 0.4, mx = Math.max(...vals) + 0.4;
  const W = 300, H = 80, P = 6;
  // n'utilise que les jours renseignés, dans l'ordre, pour une courbe continue
  const filled = pts.filter(p => p.v != null);
  const m = filled.length;
  const x = (i) => P + i * ((W - 2 * P) / (m - 1));
  const y = (v) => H - P - ((v - mn) / (mx - mn)) * (H - 2 * P);
  let dd = `M${x(0)},${y(filled[0].v).toFixed(1)}`;
  for (let i = 1; i < m; i++) {
    const xc = (x(i - 1) + x(i)) / 2;
    dd += ` C${xc.toFixed(1)},${y(filled[i - 1].v).toFixed(1)} ${xc.toFixed(1)},${y(filled[i].v).toFixed(1)} ${x(i).toFixed(1)},${y(filled[i].v).toFixed(1)}`;
  }
  ln.setAttribute('d', dd);
  ar.setAttribute('d', dd + ` L${x(m - 1).toFixed(1)},${H} L${P},${H} Z`);

  // axe : première et dernière date renseignées
  const lab = (key) => { const d = fromKey(key); return `${d.getDate()}/${d.getMonth() + 1}`; };
  xx.innerHTML = `<span>${lab(filled[0].key)}</span><span>${fmtDur(vals.reduce((a, b) => a + b, 0) / vals.length)} moy.</span><span>${lab(filled[m - 1].key)}</span>`;
}

/* ---------- Interactions ---------- */
export function bind(root) {
  root.addEventListener('click', (e) => {
    const seg = e.target.closest('#slp-seg button');
    if (seg) { period = seg.dataset.k; $$('#slp-seg button', root).forEach(b => b.classList.toggle('on', b === seg)); paintLine(); return; }
    const nb = e.target.closest('[data-n]');
    if (nb) { selectedNight = +nb.dataset.n; $$('#slp-nightsel button', root).forEach(b => b.classList.toggle('on', b === nb)); paintNightDetail(); return; }
    if (e.target.closest('#slp-edit-targets')) { openTargetsSheet(); return; }
  });
}

/* ---------- Édition des objectifs de sommeil (7 jours → sleep_targets) ---------- */
const DAYS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
function openTargetsSheet() {
  // valeurs de départ : cibles existantes, sinon défauts (semaine 7h/06:00, week-end 9h/08:00)
  const rows = DAYS_FULL.map((_, dow) => {
    const t = targets.get(dow);
    if (t) {
      const w = t.wake_min;
      return { dow, wake: `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`, dur: t.dur_h };
    }
    return dow < 5 ? { dow, wake: '06:00', dur: 7 } : { dow, wake: '08:00', dur: 9 };
  });
  const bt = (wake, dur) => { const [h, m] = wake.split(':').map(Number); let x = h * 60 + m - Math.round(dur * 60); x = ((x % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  openSheet(`
    <div class="sheet__title">Objectifs de sommeil</div>
    <p style="font-size:12px;color:var(--dim);margin:-4px 0 12px">Réveil + durée visée par jour. L'heure de coucher est calculée.</p>
    <div id="tg-rows">
      ${rows.map(r => `<div class="dayrow" data-dow="${r.dow}">
        <span class="dn">${DAYS_FULL[r.dow].slice(0, 3)}</span>
        <div class="mini"><span>Réveil</span><input type="time" value="${r.wake}" data-wake></div>
        <div class="mini"><span>Durée (h)</span><input type="number" step="0.25" value="${r.dur}" data-dur></div>
        <span class="bt" data-bt>${bt(r.wake, r.dur)}</span>
      </div>`).join('')}
    </div>
    <button class="btn-primary" id="tg-save" style="margin-top:12px">Enregistrer</button>`);
  const s = $('#sheet');
  // recalcul live du coucher
  $$('#tg-rows .dayrow', s).forEach(row => {
    const wk = row.querySelector('[data-wake]'), du = row.querySelector('[data-dur]'), b = row.querySelector('[data-bt]');
    const upd = () => { b.textContent = bt(wk.value, parseFloat(du.value) || 0); };
    wk.oninput = upd; du.oninput = upd;
  });
  const btn = s.querySelector('#tg-save');
  btn.onclick = async () => {
    const payload = $$('#tg-rows .dayrow', s).map(row => ({
      dow: Number(row.dataset.dow),
      wake: row.querySelector('[data-wake]').value || '06:00',
      dur: parseFloat(row.querySelector('[data-dur]').value) || 0,
    }));
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      await saveTargets(payload);
      closeSheet();
      toast('Objectifs de sommeil enregistrés');
      await reload();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}

/* ---------- FAB : enregistrer une nuit ---------- */
export function onFab() {
  const yday = dayKey(addDays(new Date(), -1));   // par défaut : la nuit d'hier
  openSheet(`
    <div class="sheet__title">Enregistrer une nuit</div>
    <div class="field"><label for="s-date">Nuit du (date de réveil)</label>
      <input id="s-date" type="date" value="${dayKey()}" max="${dayKey()}"></div>
    <div class="field-row" style="display:flex;gap:12px">
      <div class="field" style="flex:1"><label for="s-bed">Coucher</label>
        <input id="s-bed" type="time" value="23:00"></div>
      <div class="field" style="flex:1"><label for="s-wake">Réveil</label>
        <input id="s-wake" type="time" value="07:00"></div>
    </div>
    <div class="field"><label for="s-q">Qualité ressentie : <b id="s-qv">3</b>/5</label>
      <input id="s-q" type="range" min="1" max="5" step="1" value="3" style="width:100%"></div>
    <div class="field"><label>Durée estimée : <b id="s-dur">8 h 00</b></label></div>
    <button class="btn-primary" id="s-add">Enregistrer</button>`);

  const s = $('#sheet');
  const recalc = () => {
    const bm = parseTimeToMin(s.querySelector('#s-bed').value);
    const wm = parseTimeToMin(s.querySelector('#s-wake').value);
    let dm = wm - bm; if (dm <= 0) dm += 1440;        // réveil le lendemain
    s.querySelector('#s-dur').textContent = fmtDur(dm / 60);
  };
  s.querySelector('#s-bed').oninput = recalc;
  s.querySelector('#s-wake').oninput = recalc;
  s.querySelector('#s-q').oninput = (e) => { s.querySelector('#s-qv').textContent = e.target.value; };
  recalc();

  const btn = s.querySelector('#s-add');
  btn.onclick = async () => {
    const dateKey = s.querySelector('#s-date').value;
    const bedV = s.querySelector('#s-bed').value, wakeV = s.querySelector('#s-wake').value;
    if (!dateKey || !bedV || !wakeV) return;
    const bm = parseTimeToMin(bedV), wm = parseTimeToMin(wakeV);
    // log_date = nuit (date de réveil) ; coucher = veille si après minuit serait < réveil
    const wakeDate = fromKey(dateKey);
    const bedDate = (bm < wm) ? wakeDate : addDays(wakeDate, -1);   // coucher la veille si bouclage minuit
    const bedtime = new Date(bedDate); bedtime.setHours(Math.floor(bm / 60), bm % 60, 0, 0);
    const wake = new Date(wakeDate); wake.setHours(Math.floor(wm / 60), wm % 60, 0, 0);
    const quality = Number(s.querySelector('#s-q').value);
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      // duration_hours volontairement non stocké (dérivé) → recalculé à la lecture (brief §4.3)
      await upsertSleep({
        log_date: dateKey,
        bedtime: bedtime.toISOString(),
        wake_time: wake.toISOString(),
        duration_hours: null,
        quality_rating: quality,
      });
      closeSheet();
      toast('Nuit enregistrée');
      selectedNight = 0;
      await reload();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      toast('Échec : ' + (err.message || 'écriture refusée'));
    }
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
