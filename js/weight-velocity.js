/* ============================================================
   weight-velocity.js — Vitesse de poids hebdomadaire lissée (brief §16.1, P0).
   Fonction PURE, calculée à la lecture, RIEN stocké (§4.3).

   Régression linéaire (moindres carrés) de poids sur le jour, sur une
   fenêtre glissante (14-21 j). Pente × 7 = vitesse en kg/semaine.
   ❌ Pas de M1−M2 (soustraction de moyennes) : cumule le bruit (§16.1).
   Seuil minimum de pesées : en dessous → état 'calibration', jamais une
   vitesse (une régression sur 2-3 points ne lisse rien).
   ============================================================ */

export const WEIGHT_WINDOW_DAYS = 14;   // fenêtre glissante (brief : 14-21 j ; 14 = plus réactif)
export const MIN_WEIGHINS = 4;          // brief : 4 à 5 pesées minimum

/* 'YYYY-MM-DD' → numéro de jour (UTC), pour un axe X entier régulier. */
const dateToNum = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * @param {{log_date:string, weight_kg:number|string}[]} logs  pesées (ordre libre)
 * @param {{windowDays?:number, minPoints?:number, asof?:string}} opts  asof = 'YYYY-MM-DD' (défaut : aujourd'hui)
 * @returns {{state:'calibration'|'ok', n:number, minPoints:number, windowDays:number, velocity:number|null}}
 *          velocity = kg/semaine (positif = prise).
 */
export function computeWeightVelocity(logs, { windowDays = WEIGHT_WINDOW_DAYS, minPoints = MIN_WEIGHINS, asof } = {}) {
  const end = asof ? dateToNum(asof) : Math.floor(Date.now() / 86400000);
  const start = end - (windowDays - 1);

  const pts = (logs || [])
    .map(l => ({ x: dateToNum(l.log_date), y: Number(l.weight_kg) }))
    .filter(p => Number.isFinite(p.y) && p.x >= start && p.x <= end);

  const n = pts.length;
  if (n < minPoints) return { state: 'calibration', n, minPoints, windowDays, velocity: null };

  const xbar = pts.reduce((s, p) => s + p.x, 0) / n;
  const ybar = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - xbar; sxx += dx * dx; sxy += dx * (p.y - ybar); }

  // toutes les pesées le même jour → pente indéfinie : on reste en calibration
  if (sxx === 0) return { state: 'calibration', n, minPoints, windowDays, velocity: null };

  const slopePerDay = sxy / sxx;                 // kg / jour
  return { state: 'ok', n, minPoints, windowDays, velocity: slopePerDay * 7 };  // kg / semaine
}
