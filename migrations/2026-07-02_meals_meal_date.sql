-- ============================================================
-- Migration : date logique pour `meals`  (brief §"Date logique des entrées manuelles")
-- À exécuter dans le SQL Editor Supabase. NE PAS auto-appliquer.
--
-- Contexte réel (vérifié via information_schema le 2026-07-02) :
--   meals n'a PAS de meal_date, et PAS de created_at.
--   L'horodatage source est `eaten_at` (timestamptz, default now()).
--   → le backfill part de eaten_at, pas de created_at (absent).
--
-- Les autres tables ne sont PAS migrées :
--   habit_logs.log_date et workout_sessions.session_date existent déjà,
--   NOT NULL, et le front passe toujours la date explicitement → un
--   DEFAULT current_date serait cosmétique. Unicité habit_logs déjà sur
--   (habit_id, log_date). Rien à faire côté SQL pour ces deux tables.
-- ============================================================

-- 1. Ajout de la colonne (nullable le temps du backfill)
alter table meals add column if not exists meal_date date;

-- 2. Backfill : jour LOGIQUE = date locale (Europe/Paris) de eaten_at.
--    eaten_at est stocké en UTC ; on reconvertit vers Paris pour que les
--    repas pris après minuit heure locale tombent sur le bon jour.
--    (Si tu préfères la version brute du brief, remplace par eaten_at::date.)
update meals
   set meal_date = (eaten_at at time zone 'Europe/Paris')::date
 where meal_date is null;

-- 3. Verrou : NOT NULL + défaut (filet de sécurité ; le front passera
--    meal_date explicitement, mais le défaut garantit l'invariant).
alter table meals alter column meal_date set not null;
alter table meals alter column meal_date set default current_date;
