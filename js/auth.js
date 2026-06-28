/* ============================================================
   auth.js — authentification email + mot de passe (brief §5).
   Sans session, auth.uid() est nul → le RLS bloque tout. L'app
   reste donc derrière un login ; la session est persistée ensuite.
   ============================================================ */
import { sb } from './supabase.js';

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getUserId() {
  const s = await getSession();
  return s?.user?.id ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
}

/* Réagit aux changements de session (login / logout / refresh). */
export function onAuthChange(cb) {
  return sb.auth.onAuthStateChange((_event, session) => cb(session));
}
