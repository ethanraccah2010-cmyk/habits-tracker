-- ============================================================
-- S1a — Banque d'exercices · PHASE 1 : ajout colonnes + backfill (brief §16.2)
-- À exécuter dans le SQL Editor Supabase APRÈS validation. NE PAS auto-appliquer.
-- ⚠️ Ne DROP PAS `name` ici (Phase 2, après vérification du backfill).
-- Faits vérifiés : texte libre, aucune table exercises, ~20 noms, 1 seul vrai
-- doublon (« Tractions lesté » ≡ « Tractions lestées »).
-- ============================================================

-- 1. Banque : un exercice = un id + un nom (rien d'autre ; la cible vit dans la séance)
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null
);
alter table exercises enable row level security;
create policy "Users manage their exercises" on exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Nouvelles colonnes (nullable le temps du backfill)
alter table template_exercises add column if not exists exercise_id uuid references exercises(id);
alter table session_exercises  add column if not exists exercise_id uuid references exercises(id);
alter table session_exercises  add column if not exists target_reps int;   -- cible copiée à la matérialisation

-- 3. Fusion du doublon connu AVANT de peupler la banque (uniformise le nom)
update template_exercises set name = 'Tractions lestées' where btrim(name) = 'Tractions lesté';
update session_exercises  set name = 'Tractions lestées' where btrim(name) = 'Tractions lesté';

-- 4. Peupler la banque : un exercise par nom NORMALISÉ distinct (union des 2 tables),
--    rattaché au user via le parent. distinct on = pas de doublon normalisé en base.
insert into exercises (user_id, name)
select user_id, name from (
  select distinct on (user_id, lower(btrim(name))) user_id, btrim(name) as name
  from (
    select wt.user_id, te.name from template_exercises te
      join workout_templates wt on wt.id = te.template_id
    union all
    select ws.user_id, se.name from session_exercises se
      join workout_sessions ws on ws.id = se.session_id
  ) allnames
  order by user_id, lower(btrim(name))
) canon
where not exists (
  select 1 from exercises e where e.user_id = canon.user_id and lower(e.name) = lower(canon.name)
);

-- 5. Rattacher template_exercises → exercise_id (matching nom normalisé, même user)
update template_exercises te
set exercise_id = e.id
from workout_templates wt, exercises e
where wt.id = te.template_id
  and e.user_id = wt.user_id
  and lower(e.name) = lower(btrim(te.name));

-- 6. Rattacher session_exercises → exercise_id
update session_exercises se
set exercise_id = e.id
from workout_sessions ws, exercises e
where ws.id = se.session_id
  and e.user_id = ws.user_id
  and lower(e.name) = lower(btrim(se.name));

-- 7. Copier la cible du template dans la séance (snapshot), par exercise_id,
--    pour les séances issues d'un template.
update session_exercises se
set target_reps = te.target_reps
from workout_sessions ws, template_exercises te
where ws.id = se.session_id
  and te.template_id = ws.template_id
  and te.exercise_id = se.exercise_id
  and se.target_reps is null;

-- 8. Unicité de la banque : un exo = un id (exact-égalité normalisée). Filet DB de
--    l'anti-doublon « étage 1 » du code. Échoue (et rollback) s'il restait un doublon.
create unique index if not exists exercises_user_name_norm
  on exercises (user_id, lower(btrim(name)));
