-- ============================================================
-- Migration : journal des ajustements de cible calorique (brief §16.1b, garde-fou #3)
-- À exécuter dans le SQL Editor Supabase. NE PAS auto-appliquer.
-- Approuvée par Ethan (2026-07-04) : journal auto-rempli, pas de bouton manuel.
--
-- Une ligne insérée par l'app SEULEMENT quand l'éditeur d'objectifs fait
-- réellement CHANGER target_kcal (valeur finale ≠ valeur persistée avant).
-- Garde-fou #3 lit la date de la ligne la PLUS RÉCENTE (ne compte pas les
-- lignes) : reco supprimée si < 14 j ; aucune ligne → pas de blocage.
-- Pas de created_at (cohérent §16, date logique en DATE).
-- ============================================================

create table if not exists nutrition_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  target_kcal integer not null,       -- la NOUVELLE valeur après changement
  changed_on date not null
);

alter table nutrition_adjustments enable row level security;
create policy "Users manage their nutrition_adjustments" on nutrition_adjustments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
