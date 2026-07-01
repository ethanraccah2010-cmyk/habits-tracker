/* ============================================================
   onboarding.js — Onboarding 8 étapes (brief §9.0), branché sur
   les vraies tables. Écrit TOUT à la validation finale.

   Détection « premier lancement » : présence d'une ligne
   profile_settings pour auth.uid(). profile_settings est écrite
   EN DERNIER → tant qu'elle n'existe pas, on n'est pas onboardé
   (upserts idempotents → un retry après échec réseau reste propre).
   ============================================================ */
import { sb } from './supabase.js';
import { getUserId } from './auth.js';
import { $, gem } from './ui.js';
import { dayKey } from './dates.js';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DSHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const TOTAL = 8;
const DEFAULT_HABITS = ['💧 Boire 2 L d\'eau', '🧘 Méditation', '📖 Lecture', '🏋️ Sport', '🌅 Lever tôt', '📵 Pas d\'écran au lit', '🥗 Manger sain', '📝 Journal'];

/* ---------- Détection onboardé ---------- */
export async function isOnboarded() {
  const uid = await getUserId();
  if (!uid) return false;
  const { data, error } = await sb.from('profile_settings').select('user_id').eq('user_id', uid).maybeSingle();
  if (error) return false; // en cas de doute, ne bloque pas : on laissera l'app tenter
  return !!data;
}

/* ---------- État en mémoire ---------- */
let cur = 0;
let onDoneCb = null;
const state = {
  weight: 72.4,
  sleep: DAYS.map((_, i) => i < 4 ? { wake: '06:00', dur: 7 } : { wake: '08:00', dur: 9 }),
  kcal: 2200, p: 150, g: 250, l: 70,
  habits: new Map(),                     // label -> selected(bool)
  sport: DAYS.map(() => []),             // [dayIdx] -> [{title, exos:[{name,sets,reps}]}]
  subjects: [],                          // [{name, obj}]
};
let sleepSel = new Set();
let sportDay = 0;

/* ---------- Helpers ---------- */
function bedtime(wake, dur) {
  const [h, m] = wake.split(':').map(Number);
  let mins = h * 60 + m - Math.round(dur * 60);
  if (mins < 0) mins += 1440;
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Montage ---------- */
export function mountOnboarding(onDone) {
  onDoneCb = onDone;
  cur = 0;
  // init habitudes (4 pré-cochées)
  state.habits = new Map(DEFAULT_HABITS.map((h, i) => [h, i < 4]));
  if (!state.subjects.length) state.subjects = [];
  if (!state.sport[0].length) state.sport[0] = [{ title: 'Push', exos: [{ name: 'Développé couché', sets: 4, reps: 8 }] }];

  const el = $('#onboarding');
  el.classList.remove('hide');
  el.innerHTML = `
    <div class="onb-progress" id="onb-progress">${Array.from({ length: TOTAL - 1 }, () => '<i><b></b></i>').join('')}</div>
    <div class="onb-steps" id="onb-steps">
      ${stepWelcome()}${stepWeight()}${stepSleep()}${stepKcal()}${stepHabits()}${stepSport()}${stepSubjects()}${stepRecap()}
    </div>
    <div class="onb-footer">
      <button class="onb-btn ghost" id="onb-back">Retour</button>
      <button class="onb-btn primary" id="onb-next">Commencer</button>
    </div>`;

  wireSleep();
  wireHabits();
  wireSport();
  wireSubjects();
  $('#onb-weight').oninput = (e) => { state.weight = parseFloat(e.target.value) || 0; };
  $('#onb-kcal').oninput = (e) => { state.kcal = parseInt(e.target.value, 10) || 0; };
  $('#onb-p').oninput = (e) => { state.p = parseInt(e.target.value, 10) || 0; };
  $('#onb-g').oninput = (e) => { state.g = parseInt(e.target.value, 10) || 0; };
  $('#onb-l').oninput = (e) => { state.l = parseInt(e.target.value, 10) || 0; };

  $('#onb-back').onclick = () => { if (cur > 0) show(cur - 1); };
  $('#onb-next').onclick = onNext;
  show(0);
}

export function unmountOnboarding() {
  const el = $('#onboarding');
  el.classList.add('hide');
  el.innerHTML = '';
}

/* ---------- Navigation ---------- */
function show(i) {
  cur = i;
  $$all('.onb-step').forEach(s => s.classList.toggle('active', +s.dataset.step === i));
  $('#onb-back').style.visibility = i === 0 ? 'hidden' : 'visible';
  const next = $('#onb-next');
  next.textContent = i === TOTAL - 1 ? 'Terminer' : (i === 0 ? 'Commencer' : 'Continuer');
  next.disabled = false;
  [...$('#onb-progress').children].forEach((b, idx) => {
    b.querySelector('b').style.width = (idx < i ? 100 : idx === i ? 50 : 0) + '%';
  });
  if (i === TOTAL - 1) buildRecap();
}
function $$all(sel) { return [...document.querySelectorAll('#onboarding ' + sel)]; }

async function onNext() {
  if (cur < TOTAL - 1) { show(cur + 1); return; }
  await finalize();
}

/* ---------- Étapes (markup) ---------- */
function stepWelcome() {
  return `<div class="onb-step active" data-step="0">
    <div class="onb-gem">${gem(72)}</div>
    <h1 style="text-align:center">Salut Ethan.<br>Configurons ton app.</h1>
    <p class="sub" style="text-align:center">C'est ton app, tu configures tout toi-même. On pose les bases de chaque module avant le premier jour.</p>
  </div>`;
}
function stepWeight() {
  return `<div class="onb-step" data-step="1">
    <div class="eyebrow">Nutrition · Poids</div>
    <h1>Ton poids ce matin</h1>
    <p class="sub">Pèse-toi à jeun. Modifiable chaque jour dans l'app.</p>
    <div class="field-big"><input type="number" step="0.1" value="${state.weight}" id="onb-weight"><span class="u">kg</span></div>
  </div>`;
}
function stepSleep() {
  return `<div class="onb-step" data-step="2">
    <div class="eyebrow">Sommeil</div>
    <h1>Ton objectif, jour par jour</h1>
    <p class="sub">Sélectionne plusieurs jours pour appliquer la même règle, puis ajuste individuellement si besoin.</p>
    <div class="daysel" id="onb-sleep-daysel"></div>
    <div class="bulkbar">
      <div class="bf"><span>Réveil</span><input type="time" id="onb-bulk-wake" value="06:00"></div>
      <div class="bf"><span>Durée</span><input type="number" step="0.25" id="onb-bulk-dur" value="7"> h</div>
      <button id="onb-bulk-apply">Appliquer</button>
    </div>
    <div class="scrolllist" id="onb-sleep-rows"></div>
  </div>`;
}
function stepKcal() {
  return `<div class="onb-step" data-step="3">
    <div class="eyebrow">Nutrition</div>
    <h1>Tes objectifs caloriques</h1>
    <p class="sub">Saisie manuelle.</p>
    <div class="field-big" style="margin-bottom:10px"><input type="number" value="${state.kcal}" id="onb-kcal"><span class="u">kcal / j</span></div>
    <div class="row3">
      <div class="onb-field"><div class="l">Prot.</div><input type="number" value="${state.p}" id="onb-p"></div>
      <div class="onb-field"><div class="l">Gluc.</div><input type="number" value="${state.g}" id="onb-g"></div>
      <div class="onb-field"><div class="l">Lip.</div><input type="number" value="${state.l}" id="onb-l"></div>
    </div>
  </div>`;
}
function stepHabits() {
  return `<div class="onb-step" data-step="4">
    <div class="eyebrow">Habitudes</div>
    <h1>Tes premières habitudes</h1>
    <p class="sub">Tu en ajouteras d'autres ensuite.</p>
    <div class="pillgrid" id="onb-habits"></div>
    <div class="addcustom"><input type="text" placeholder="Habitude personnalisée" id="onb-habit-custom"><button id="onb-habit-add">＋</button></div>
  </div>`;
}
function stepSport() {
  return `<div class="onb-step" data-step="5">
    <div class="eyebrow">Sport</div>
    <h1>Ton programme de la semaine</h1>
    <p class="sub">Choisis un jour, ajoute une ou plusieurs séances, puis les exos de chaque séance.</p>
    <div class="daysel" id="onb-sport-daysel"></div>
    <div class="scrolllist" id="onb-sport-content"></div>
  </div>`;
}
function stepSubjects() {
  return `<div class="onb-step" data-step="6">
    <div class="eyebrow">Devoirs & notes</div>
    <h1>Tes matières et objectifs</h1>
    <p class="sub">Moyenne cible par matière (coefficient égal entre matières).</p>
    <div class="addsubj"><input type="text" placeholder="Nom de la matière" id="onb-subj-name"><button id="onb-subj-add">＋</button></div>
    <div class="scrolllist" id="onb-subj-list"></div>
  </div>`;
}
function stepRecap() {
  return `<div class="onb-step" data-step="7" style="overflow-y:auto">
    <div class="eyebrow">C'est prêt</div>
    <h1>Récapitulatif</h1>
    <p class="sub">Tout reste modifiable plus tard dans chaque module.</p>
    <div id="onb-summary"></div>
    <div class="onb-err" id="onb-err" style="color:#ff6b6b;font-size:12.5px;min-height:16px;margin-top:4px"></div>
  </div>`;
}

/* ---------- Câblage interactif ---------- */
function wireSleep() {
  const sel = $('#onb-sleep-daysel');
  DAYS.forEach((_, i) => {
    const b = document.createElement('button');
    b.textContent = DSHORT[i];
    b.onclick = () => { b.classList.toggle('on'); sleepSel.has(i) ? sleepSel.delete(i) : sleepSel.add(i); };
    sel.appendChild(b);
  });
  $('#onb-bulk-apply').onclick = () => {
    const w = $('#onb-bulk-wake').value, du = parseFloat($('#onb-bulk-dur').value) || 7;
    if (sleepSel.size === 0) { renderSleepRows(); return; }
    sleepSel.forEach(i => { state.sleep[i] = { wake: w, dur: du }; });
    renderSleepRows();
  };
  renderSleepRows();
}
function renderSleepRows() {
  const wrap = $('#onb-sleep-rows'); wrap.innerHTML = '';
  state.sleep.forEach((d, i) => {
    const row = document.createElement('div'); row.className = 'dayrow';
    row.innerHTML = `<span class="dn">${DSHORT[i]}</span>
      <div class="mini"><span>Réveil</span><input type="time" value="${d.wake}" data-wake></div>
      <div class="mini"><span>Durée</span><input type="number" step="0.25" value="${d.dur}" data-dur></div>
      <span class="bt">${bedtime(d.wake, d.dur)}</span>`;
    const wakeI = row.querySelector('[data-wake]'), durI = row.querySelector('[data-dur]'), bt = row.querySelector('.bt');
    const upd = () => { d.wake = wakeI.value; d.dur = parseFloat(durI.value) || 0; bt.textContent = bedtime(d.wake, d.dur); };
    wakeI.oninput = upd; durI.oninput = upd;
    wrap.appendChild(row);
  });
}
function wireHabits() {
  const grid = $('#onb-habits');
  const render = () => {
    grid.innerHTML = '';
    for (const [label, on] of state.habits) {
      const b = document.createElement('button');
      b.textContent = label; if (on) b.classList.add('on');
      b.onclick = () => { state.habits.set(label, !state.habits.get(label)); b.classList.toggle('on'); };
      grid.appendChild(b);
    }
  };
  render();
  $('#onb-habit-add').onclick = () => {
    const inp = $('#onb-habit-custom'); const v = inp.value.trim();
    if (!v) return;
    const label = '✨ ' + v;
    state.habits.set(label, true); inp.value = ''; render();
  };
}
function wireSport() {
  const sel = $('#onb-sport-daysel');
  DAYS.forEach((_, i) => {
    const b = document.createElement('button');
    b.textContent = DSHORT[i]; if (i === 0) b.classList.add('on');
    b.onclick = () => { sportDay = i; [...sel.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); renderSport(); };
    sel.appendChild(b);
  });
  renderSport();
}
function renderSport() {
  const wrap = $('#onb-sport-content'); wrap.innerHTML = '';
  const sessions = state.sport[sportDay];
  if (!sessions.length) {
    const e = document.createElement('div'); e.className = 'emptyday'; e.textContent = 'Aucune séance ce jour. Ajoute-en une ci-dessous.'; wrap.appendChild(e);
  }
  sessions.forEach((sess, si) => {
    const card = document.createElement('div'); card.className = 'sessioncard';
    card.innerHTML = `<input class="stitle" value="${esc(sess.title)}" data-stitle>`;
    sess.exos.forEach((ex, ei) => {
      const row = document.createElement('div'); row.className = 'exorow';
      row.innerHTML = `<input value="${esc(ex.name)}" placeholder="Exercice" data-name>
        <input type="number" value="${ex.sets}" placeholder="séries" data-sets>
        <input type="number" value="${ex.reps}" placeholder="reps" data-reps>
        <button class="del" data-delexo>×</button>`;
      row.querySelector('[data-name]').oninput = e => ex.name = e.target.value;
      row.querySelector('[data-sets]').oninput = e => ex.sets = +e.target.value || 0;
      row.querySelector('[data-reps]').oninput = e => ex.reps = +e.target.value || 0;
      row.querySelector('[data-delexo]').onclick = () => { sess.exos.splice(ei, 1); renderSport(); };
      card.appendChild(row);
    });
    const addexo = document.createElement('button'); addexo.className = 'addexo'; addexo.textContent = '＋ Ajouter un exercice';
    addexo.onclick = () => { sess.exos.push({ name: '', sets: 3, reps: 10 }); renderSport(); };
    card.appendChild(addexo);
    card.querySelector('[data-stitle]').oninput = e => sess.title = e.target.value;
    const delsess = document.createElement('button'); delsess.className = 'delsession'; delsess.textContent = 'Supprimer cette séance';
    delsess.onclick = () => { sessions.splice(si, 1); renderSport(); };
    card.appendChild(delsess);
    wrap.appendChild(card);
  });
  const addsession = document.createElement('button'); addsession.className = 'addsession'; addsession.textContent = '＋ Ajouter une séance ce jour';
  addsession.onclick = () => { sessions.push({ title: 'Nouvelle séance', exos: [] }); renderSport(); };
  wrap.appendChild(addsession);
}
function wireSubjects() {
  const list = $('#onb-subj-list');
  const render = () => {
    list.innerHTML = '';
    state.subjects.forEach((s, idx) => {
      const row = document.createElement('div'); row.className = 'subjrow';
      row.innerHTML = `<span class="nm">${esc(s.name)}</span>
        <div class="objf"><input type="number" value="${s.obj}" min="0" max="20"><span>/20</span></div>
        <button class="del">×</button>`;
      row.querySelector('input').oninput = e => s.obj = parseFloat((e.target.value || '').replace(',', '.'));
      row.querySelector('.del').onclick = () => { state.subjects.splice(idx, 1); render(); };
      list.appendChild(row);
    });
  };
  render();
  $('#onb-subj-add').onclick = () => {
    const inp = $('#onb-subj-name'); const v = inp.value.trim();
    if (!v) return;
    state.subjects.push({ name: v, obj: 14 }); inp.value = ''; render();
  };
}

/* ---------- Récap ---------- */
function buildRecap() {
  const habits = [...state.habits].filter(([, on]) => on).map(([l]) => l);
  const subjects = state.subjects.map(s => `${s.name} (obj. ${s.obj})`);
  const sleepTxt = DAYS.map((_, i) => `${DSHORT[i]} ${state.sleep[i].dur}h/${state.sleep[i].wake}`).join(' · ');
  const sportTxt = state.sport.map((s, i) => s.length ? `${DSHORT[i]}:${s.map(x => `${x.title}(${x.exos.length} exo)`).join(',')}` : null).filter(Boolean).join(' · ') || '—';
  const rows = [
    ['Poids de départ', `${state.weight} kg`],
    ['Sommeil (par jour)', sleepTxt],
    ['Objectif calorique', `${state.kcal} kcal · ${state.p}P/${state.g}G/${state.l}L`],
    [`Habitudes (${habits.length})`, habits.join(', ') || '—'],
    ['Programme sport', sportTxt],
    [`Matières (${subjects.length})`, subjects.join(' · ') || '—'],
  ];
  $('#onb-summary').innerHTML = rows.map(([l, v]) => `<div class="summary"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span></div>`).join('');
}

/* ---------- Écriture finale (profile_settings EN DERNIER) ---------- */
async function finalize() {
  const next = $('#onb-next'), err = $('#onb-err');
  err.textContent = '';
  next.disabled = true; next.textContent = 'Enregistrement…';
  try {
    const user_id = await getUserId();
    if (!user_id) throw new Error('Session expirée, reconnecte-toi.');

    // 1) Poids de départ
    if (state.weight > 0) {
      const { error } = await sb.from('weight_logs')
        .upsert({ user_id, log_date: dayKey(), weight_kg: state.weight }, { onConflict: 'user_id,log_date' });
      if (error) throw error;
    }

    // 2) Sommeil par jour (7 lignes)
    const sleepRows = state.sleep.map((d, i) => ({
      user_id, day_of_week: i, wake_time: d.wake + ':00', target_duration_hours: d.dur,
    }));
    {
      const { error } = await sb.from('sleep_targets').upsert(sleepRows, { onConflict: 'user_id,day_of_week' });
      if (error) throw error;
    }

    // 3) Habitudes sélectionnées
    const chosen = [...state.habits].filter(([, on]) => on).map(([label]) => label);
    if (chosen.length) {
      const rows = chosen.map(label => {
        const m = label.match(/^(\p{Emoji}|✨)\s*(.*)$/u);
        return m ? { user_id, icon: m[1], name: m[2] } : { user_id, icon: null, name: label };
      });
      const { error } = await sb.from('habits').insert(rows);
      if (error) throw error;
    }

    // 4) Programme sport → workout_templates + template_exercises
    for (let day = 0; day < 7; day++) {
      for (const sess of state.sport[day]) {
        const { data: tpl, error: e1 } = await sb.from('workout_templates')
          .insert({ user_id, day_of_week: day, title: sess.title || 'Séance' }).select().single();
        if (e1) throw e1;
        const exos = sess.exos.filter(x => (x.name || '').trim());
        if (exos.length) {
          const rows = exos.map((x, idx) => ({
            template_id: tpl.id, name: x.name.trim(), target_sets: x.sets || null, target_reps: x.reps || null, order_index: idx,
          }));
          const { error: e2 } = await sb.from('template_exercises').insert(rows);
          if (e2) throw e2;
        }
      }
    }

    // 5) Matières
    const subjRows = state.subjects.filter(s => (s.name || '').trim())
      .map(s => ({ user_id, name: s.name.trim(), target_average: isNaN(s.obj) ? null : s.obj }));
    if (subjRows.length) {
      const { error } = await sb.from('subjects').insert(subjRows);
      if (error) throw error;
    }

    // 6) profile_settings — EN DERNIER (= marqueur "onboardé")
    {
      const { error } = await sb.from('profile_settings').upsert({
        user_id, target_kcal: state.kcal, target_protein_g: state.p, target_carbs_g: state.g, target_fat_g: state.l,
      }, { onConflict: 'user_id' });
      if (error) throw error;
    }

    unmountOnboarding();
    if (onDoneCb) onDoneCb();
  } catch (e) {
    err.textContent = 'Échec : ' + (e.message || 'écriture refusée') + ' — réessaie.';
    next.disabled = false; next.textContent = 'Terminer';
  }
}
