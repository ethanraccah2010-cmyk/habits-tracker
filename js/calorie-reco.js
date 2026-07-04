/* ============================================================
   calorie-reco.js — Reco calorique + 4 garde-fous (brief §16.1b, P0b).
   Fonction PURE. Lit la vitesse (P0a) + la phase + le dernier ajustement,
   renvoie SOIT une reco SOIT un motif de silence — tous les cas au même
   endroit (logique de silence unifiée). Rien stocké (§4.3).

   Garde-fous (§16.1b) :
   1. Actif seulement à partir de la semaine 3 d'une phase (≥ 14 j).
   2. 2 semaines consécutives hors bande (même côté) avant toute suggestion.
   3. Max 1 ajustement / 2 semaines (dernier ajustement < 14 j → silence).
   4. Rappel de saisie (pesée matin, à jeun) — texte, toujours joint.
   ============================================================ */

const dateToNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const daysBetween = (from, to) => dateToNum(to) - dateToNum(from);
const fr2 = (x) => x.toFixed(2).replace('.', ',');

/* Bandes cibles par phase (§16.1b). */
const BANDS = {
  bulk:     { low: 0.25, high: 0.45, label: '0,25–0,45 kg/sem' },
  maintien: { low: -0.10, high: 0.10, label: '±0,1 kg/sem' },
};

const WEEK3_DAYS = 14;      // garde-fou #1 : semaine 3 = à partir de J+14
const COOLDOWN_DAYS = 14;   // garde-fou #3 : max 1 ajustement / 2 semaines
const SAISIE = 'Pesée le matin, à jeun, après toilettes.';   // garde-fou #4

/**
 * @param {{
 *   phase: {type:'bulk'|'maintien', started_on:string}|null,
 *   velNow: {state:'ok'|'calibration', velocity:number|null},
 *   velPrev: {state:'ok'|'calibration', velocity:number|null},
 *   lastAdjustmentOn: string|null,
 *   asof: string
 * }} input
 * @returns {{active:boolean, kind:string, message?:string, direction?:'up'|'down', saisie?:string}}
 */
export function computeCalorieReco({ phase, velNow, velPrev, lastAdjustmentOn, asof }) {
  // (silence) aucune phase ouverte → muet total (§16.1b)
  if (!phase) return { active: false, kind: 'no-phase' };

  const band = BANDS[phase.type];
  // (silence) type sans reco définie — sécurité (le check DB limite à bulk/maintien)
  if (!band) return { active: true, kind: 'no-reco-type', message: `Phase « ${phase.type} » sans règle de reco.`, saisie: SAISIE };

  const typeLabel = phase.type === 'bulk' ? 'Prise de masse' : 'Maintien';
  const sinceDays = daysBetween(phase.started_on, asof);

  // garde-fou #1 — avant la semaine 3 : on ne réagit pas (eau/glycogène)
  if (sinceDays < WEEK3_DAYS) {
    const left = WEEK3_DAYS - sinceDays;
    return { active: true, kind: 'collecting',
      message: `Phase ${typeLabel} · collecte des 2 premières semaines (eau/glycogène). Reco active dans ${left} j.`,
      saisie: SAISIE };
  }

  // besoin de DEUX lectures fiables (cette semaine + il y a 7 j) pour le garde-fou #2
  if (velNow.state !== 'ok' || velPrev.state !== 'ok') {
    return { active: true, kind: 'calibration',
      message: `Phase ${typeLabel} · pas assez de pesées sur 14 j pour une tendance fiable.`,
      saisie: SAISIE };
  }

  const vNow = velNow.velocity, vPrev = velPrev.velocity;
  const posNow = vNow < band.low ? 'below' : vNow > band.high ? 'above' : 'in';

  // dans la bande → « ne rien changer » (ce n'est pas un ajustement → pas de cooldown)
  if (posNow === 'in') {
    return { active: true, kind: 'hold',
      message: `Rythme bon (${fr2(vNow)} kg/sem, cible ${band.label}). Ne rien changer.`,
      saisie: SAISIE };
  }

  // hors bande : garde-fou #2 — exiger 2 semaines consécutives DU MÊME CÔTÉ
  const posPrev = vPrev < band.low ? 'below' : vPrev > band.high ? 'above' : 'in';
  if (posPrev !== posNow) {
    return { active: true, kind: 'confirming',
      message: `Vitesse hors cible cette semaine (${fr2(vNow)} kg/sem), mais une seule lecture = bruit. On confirme sur 2 semaines avant d'ajuster.`,
      saisie: SAISIE };
  }

  // garde-fou #3 — un ajustement récent bloque une nouvelle suggestion
  if (lastAdjustmentOn && daysBetween(lastAdjustmentOn, asof) < COOLDOWN_DAYS) {
    const wait = COOLDOWN_DAYS - daysBetween(lastAdjustmentOn, asof);
    return { active: true, kind: 'cooldown',
      message: `Ajustement récent · on laisse le corps réagir. Nouvelle reco possible dans ${wait} j.`,
      saisie: SAISIE };
  }

  // 2 semaines consécutives hors bande + hors cooldown → SUGGESTION
  if (phase.type === 'bulk') {
    if (posNow === 'below') return { active: true, kind: 'suggest', direction: 'up',
      message: `Prise trop lente (${fr2(vNow)} kg/sem < 0,25 sur 2 semaines) → +150 à 200 kcal/j.`, saisie: SAISIE };
    return { active: true, kind: 'suggest', direction: 'down',
      message: `Prise trop rapide (${fr2(vNow)} kg/sem > 0,45 sur 2 semaines) → −150 kcal/j.`, saisie: SAISIE };
  }
  // maintien
  if (posNow === 'above') return { active: true, kind: 'suggest', direction: 'down',
    message: `Dérive à la hausse (${fr2(vNow)} kg/sem sur 2 semaines) → −150 kcal/j.`, saisie: SAISIE };
  return { active: true, kind: 'suggest', direction: 'up',
    message: `Dérive à la baisse (${fr2(vNow)} kg/sem sur 2 semaines) → +150 kcal/j.`, saisie: SAISIE };
}
