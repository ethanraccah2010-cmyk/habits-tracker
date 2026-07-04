/* ============================================================
   nutrition-phase.js — Accès données phases + ajustements (P0b, §16.1b).
   Partagé entre Réglages (formulaire) et Nutrition (lecture P0b).
   ============================================================ */
import { sb } from './supabase.js';
import { getUserId } from './auth.js';
import { dayKey, addDays, fromKey } from './dates.js';

/* Phase courante = l'unique ligne à ended_on NULL (ou null si journal vide). */
export async function fetchCurrentPhase() {
  const { data, error } = await sb.from('nutrition_phases')
    .select('id,type,started_on').is('ended_on', null).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

/* Démarre une phase : ferme la précédente (ended_on = veille du nouveau début),
   puis insère la nouvelle (ended_on NULL). §16.1b : une seule phase ouverte. */
export async function startPhase(type, startedOn) {
  const user_id = await getUserId();
  const current = await fetchCurrentPhase();
  if (current) {
    if (startedOn <= current.started_on) {
      throw new Error('La nouvelle phase doit commencer après la phase en cours (' + current.started_on + ').');
    }
    const veille = dayKey(addDays(fromKey(startedOn), -1));
    const up = await sb.from('nutrition_phases').update({ ended_on: veille }).eq('id', current.id);
    if (up.error) throw up.error;
  }
  const ins = await sb.from('nutrition_phases')
    .insert({ user_id, type, started_on: startedOn, ended_on: null });
  if (ins.error) throw ins.error;
}

/* Dernier ajustement de cible calorique (le plus récent), ou null. */
export async function fetchLastAdjustment() {
  const { data, error } = await sb.from('nutrition_adjustments')
    .select('target_kcal,changed_on').order('changed_on', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

/* Journalise un ajustement — SEULEMENT si target_kcal a réellement changé
   vs la valeur persistée avant (comparaison faite par l'appelant). */
export async function insertAdjustment(target_kcal) {
  const user_id = await getUserId();
  const { error } = await sb.from('nutrition_adjustments')
    .insert({ user_id, target_kcal, changed_on: dayKey() });
  if (error) throw error;
}
