/* ============================================================
   coach.js — Mini coach de fin de journée (brief §16.3, P1).
   Déclencheur = vitesse de poids lissée SOUS la cible (P0a), PAS la somme
   calorique du jour. Suggestion = un encas du catalogue `foods` qui rentre
   dans les kcal restantes du jour. Tout calculé à la lecture (§4.3).
   ============================================================ */

const BULK_LOW = 0.25;   // seuil bas de la bande bulk (§16.1b) : sous cette vitesse = « ça ralentit »

/* Valeurs d'une portion (dérivées à la lecture depuis les /100 g). */
function perPortion(f) {
  const g = f.portion_g || 100;
  return {
    name: f.name,
    kcal: Math.round((f.kcal_100 || 0) * g / 100),
    protein: f.protein_100 != null ? Math.round(f.protein_100 * g / 100) : null,
  };
}

/* Choisit l'encas le plus « remplissant » qui tient dans les kcal restantes.
   Si rien ne tient (peu/pas de restes), renvoie le plus petit encas. */
export function pickSnack(foods, remainingKcal) {
  const snacks = (foods || []).filter(f => (f.category || '') === 'encas').map(perPortion);
  if (!snacks.length) return null;
  const cap = remainingKcal && remainingKcal > 0 ? remainingKcal : Infinity;
  const fits = snacks.filter(s => s.kcal <= cap).sort((a, b) => b.kcal - a.kcal);
  return fits[0] || snacks.slice().sort((a, b) => a.kcal - b.kcal)[0];
}

/* Renvoie le message de nudge (HTML) ou null (silence).
   @param phase   {type, started_on} | null
   @param velocity {state, velocity} (P0a)
   @param remainingKcal number|null (objectif − consommé du jour)
   @param foods   catalogue */
export function snackNudge({ phase, velocity, remainingKcal, foods }) {
  if (!phase || phase.type !== 'bulk') return null;          // pilotage prise de masse uniquement
  if (!velocity || velocity.state !== 'ok') return null;     // pas assez de pesées → muet
  if (velocity.velocity >= BULK_LOW) return null;            // sur/au-dessus cible → silence (§16.3)
  const snack = pickSnack(foods, remainingKcal);
  if (!snack) return null;
  const v = velocity.velocity.toFixed(2).replace('.', ',');
  const macro = snack.protein != null ? `, ${snack.protein} g prot` : '';
  return `Ta prise ralentit (${v} kg/sem). Cale un encas dense : <b>${esc(snack.name)}</b> (~${snack.kcal} kcal${macro}).`;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
