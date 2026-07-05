-- ============================================================
-- Seed du catalogue `foods` (coach) — 28 aliments (photos Ethan, 2026-07-05).
-- À exécuter APRÈS la migration 2026-07-05_foods.sql.
-- Valeurs PAR 100 g. Portions générées (portion_g). ⚠️ certains estimés
-- sans étiquette (miel, amandes, flocons, granola, œuf, moutarde, légumes,
-- raisin, thon, confiture) — corriger si besoin.
-- ============================================================

insert into foods (user_id, name, kcal_100, protein_100, carbs_100, fat_100, portion_g, category)
select u.id, v.name, v.kcal_100, v.protein_100, v.carbs_100, v.fat_100, v.portion_g, v.category
from (select id from auth.users where email = 'ethanraccah@yahoo.com') u,
(values
  ('Beurre de cacahuète',   683, 30.4, 12.9, 55.3, 20,  'encas'),
  ('Miel',                  320,  0.3, 80.0,  0.0, 20,  'encas'),
  ('Poudre d''amande',      613, 21.4,  8.8, 52.5, 30,  'encas'),
  ('Pâtes (macaroni)',      361, 12.0, 72.0,  2.0, 80,  'repas'),
  ('Riz basmati',           354,  6.7, 80.4,  0.4, 65,  'repas'),
  ('Amandes',               600, 21.0, 20.0, 50.0, 30,  'encas'),
  ('Flocons d''avoine',     375, 13.0, 60.0,  7.0, 60,  'repas'),
  ('Muesli chocolat',       400,  9.0, 65.0,  9.0, 50,  'encas'),
  ('Miel Pops',             387,  5.5, 87.0,  1.5, 40,  'encas'),
  ('Riz soufflé',           385,  7.0, 84.0,  2.0, 30,  'encas'),
  ('Whey (Impact)',         386, 75.0,  5.5,  7.5, 30,  'encas'),
  ('Lait demi-écrémé',       47,  3.3,  4.8,  1.6, 200, 'repas'),
  ('Yaourt brassé nature',   99,  2.9,  3.6,  5.4, 150, 'encas'),
  ('Fromage Maasdam',       343, 25.2,  0.0, 26.9, 30,  'encas'),
  ('Œuf',                   145, 13.0,  0.7, 10.0, 55,  'repas'),
  ('Crème fraîche',         291,  2.4,  2.9, 30.0, 30,  'repas'),
  ('Mayonnaise',            680,  1.0,  2.0, 74.0, 15,  'repas'),
  ('Carottes',               40,  0.9,  8.0,  0.2, 100, 'repas'),
  ('Tomates cerises',        20,  0.9,  3.5,  0.2, 100, 'repas'),
  ('Concombre',              15,  0.7,  3.0,  0.1, 100, 'repas'),
  ('Laitue',                 15,  1.0,  2.0,  0.2, 50,  'repas'),
  ('Raisin',                 70,  0.7, 16.0,  0.2, 100, 'encas'),
  ('Maïs doux',              77,  3.0, 12.9,  1.3, 100, 'repas'),
  ('Flageolets',             85,  5.5, 11.0,  0.7, 100, 'repas'),
  ('Thon au naturel',       110, 26.0,  0.0,  1.0, 100, 'repas'),
  ('Pois chiches',          123,  6.3, 15.8,  2.5, 100, 'repas'),
  ('Sauce tomate',           38,  1.6,  6.2,  0.2, 100, 'repas'),
  ('Confiture',             250,  0.4, 60.0,  0.0, 20,  'encas')
) as v(name, kcal_100, protein_100, carbs_100, fat_100, portion_g, category);
