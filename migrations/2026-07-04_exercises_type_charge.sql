-- ============================================================
-- S1a (v2) — type de charge sur la banque (brief §16.2)
-- À exécuter dans le SQL Editor Supabase APRÈS validation. NE PAS auto-appliquer.
-- Delta : la table exercises + exercise_id + drop name + target_reps existent déjà
-- (phase1/phase2). Ici on ajoute UNIQUEMENT type_charge + backfill validé par Ethan.
-- ============================================================

-- ===== BLOC A : colonne + rename + backfill (nullable le temps du backfill) =====

alter table exercises add column if not exists type_charge text
  check (type_charge in ('lesté','pdc'));

-- Renommage validé : Face pull à la bande → Reverse fly (remplacé en salle)
update exercises set name = 'Reverse fly'
  where id = '8f3e9e74-27cc-421f-82b2-d78ca6105af8';

-- pdc (poids de corps, kg=0) — les 3 seuls
update exercises set type_charge = 'pdc' where id in (
  'd5f85784-a6bd-4fe3-b9a6-dd8d6f6e7fe5',  -- Dragon flags
  '94b4e98a-ee2b-4f4b-a60c-a1a18f4bfd80',  -- Relève de jambes
  'd368a59e-f4dc-4e7e-a52a-41db63bf315b'   -- Tractions prise larges
);

-- lesté (tout le reste, y compris Reverse fly)
update exercises set type_charge = 'lesté' where type_charge is null;

-- ===== VÉRIFICATION (à lire AVANT le bloc B) =====
-- select name, type_charge from exercises order by type_charge, name;
-- select count(*) as sans_type from exercises where type_charge is null;   -- doit == 0

-- ===== BLOC B : à lancer SEULEMENT si sans_type = 0 =====
-- alter table exercises alter column type_charge set not null;
