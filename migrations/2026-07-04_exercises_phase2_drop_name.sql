-- ============================================================
-- S1a — Banque d'exercices · PHASE 2 : NOT NULL + drop `name` (brief §16.2)
-- ⚠️ À NE LANCER QU'APRÈS avoir VÉRIFIÉ le backfill de la Phase 1
--    (toutes les lignes ont un exercise_id, cibles copiées, plus de « Tractions lesté »).
-- exercise_id devient l'identité de l'exo ; le nom texte disparaît des tables filles.
-- ============================================================

alter table template_exercises alter column exercise_id set not null;
alter table session_exercises  alter column exercise_id set not null;

alter table template_exercises drop column name;
alter table session_exercises  drop column name;
