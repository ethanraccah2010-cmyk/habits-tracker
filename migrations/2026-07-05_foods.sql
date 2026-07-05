-- ============================================================
-- Coach — catalogue d'aliments FIXE (brief §16.3 étendu : reco encas/repas)
-- À exécuter dans le SQL Editor Supabase APRÈS validation. NE PAS auto-appliquer.
-- Base figée, remplie une fois par seed (hors app, depuis photos d'étiquettes).
-- L'utilisateur n'ajoute pas d'aliment via l'app pour l'instant.
--
-- Valeurs stockées PAR 100 g (factuelles, de l'étiquette) + une portion type
-- en grammes (générée). Le par-portion (kcal/macros d'une portion) est CALCULÉ
-- À LA LECTURE, jamais stocké (brief §4.3).
-- ============================================================

create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kcal_100 integer not null,          -- kcal / 100 g
  protein_100 numeric(5,1),           -- g / 100 g
  carbs_100 numeric(5,1),             -- g / 100 g
  fat_100 numeric(5,1),               -- g / 100 g
  portion_g integer,                  -- portion type (générée), en grammes
  category text                       -- 'encas' | 'repas'
);

alter table foods enable row level security;
create policy "Users manage their foods" on foods
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
