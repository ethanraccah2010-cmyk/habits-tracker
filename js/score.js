/* ============================================================
   score.js — Score du jour (brief §10, décision finale §15.4).
   Fonction PURE et isolée. Poids réglables en UN SEUL endroit
   pour ajout facile des pas (steps) en v2 sans refactor.
   Formule v1 (2 termes, sans qualité de sommeil) :
     score = 0.6 × tauxHabitudes + 0.4 × ratioDuréeSommeil(≤1)
   ============================================================ */

/* Poids configurables — modifier ICI seulement. */
export const SCORE_WEIGHTS = { habits: 0.6, sleep: 0.4 };

/**
 * @param {{habitsRate:number, sleepRatio:number}} p
 *   habitsRate : part d'habitudes complétées du jour (0..1)
 *   sleepRatio : durée dormie / durée visée (plafonné à 1)
 * @returns {number} score sur 100 (entier arrondi)
 */
export function computeDailyScore({ habitsRate = 0, sleepRatio = 0 } = {}) {
  const h = clamp01(habitsRate);
  const s = clamp01(sleepRatio);
  const raw = SCORE_WEIGHTS.habits * h + SCORE_WEIGHTS.sleep * s;
  return Math.round(raw * 100);
}

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
