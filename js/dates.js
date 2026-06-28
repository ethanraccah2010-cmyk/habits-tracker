/* ============================================================
   dates.js — utilitaires de dates (clé locale YYYY-MM-DD, etc.)
   On reste en heure LOCALE pour que "aujourd'hui" colle au fuseau d'Ethan.
   ============================================================ */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() + n);
  return c;
}

export function fromKey(key) {
  return new Date(key + 'T00:00:00');
}

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // getDay() 0=dim
export function dowLabel(key) {
  return DOW[fromKey(key).getDay()];
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
export function monthLabel(key) {
  return MONTHS[fromKey(key).getMonth()];
}
