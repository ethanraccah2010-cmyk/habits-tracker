-- ============================================================
-- HABITS-TRACKER — Schéma Supabase v1 (modules manuels uniquement)
-- À coller dans l'éditeur SQL de ton projet Supabase, puis "Run".
-- Toutes les tables sont liées à auth.users via user_id,
-- et protégées par Row Level Security (chacun ne voit que ses données).
-- ============================================================

-- ---------- RÉGLAGES GÉNÉRAUX (issus de l'onboarding) ----------

create table profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_kcal integer,
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer,
  created_at timestamptz default now()
);

-- Objectif de sommeil PAR JOUR (0=lundi … 6=dimanche), individualisable
create table sleep_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  wake_time time not null,
  target_duration_hours numeric(4,2) not null,
  unique (user_id, day_of_week)
);

-- ---------- HABITUDES ----------

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  archived boolean default false,
  created_at timestamptz default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits(id) on delete cascade,
  log_date date not null,
  completed boolean default true,
  unique (habit_id, log_date)  -- une seule coche par habitude par jour
);

-- ---------- POIDS ----------

create table weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,1) not null,
  unique (user_id, log_date)  -- une pesée par jour
);

-- ---------- NUTRITION ----------

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  eaten_at timestamptz not null default now(),
  kcal integer not null,
  protein_g numeric(5,1),
  carbs_g numeric(5,1),
  fat_g numeric(5,1),
  photo_url text  -- pour plus tard : photo + estimation IA
);

-- ---------- SOMMEIL (saisie manuelle en v1) ----------

create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,         -- nuit du ... au ...
  bedtime timestamptz,
  wake_time timestamptz,
  duration_hours numeric(4,2),
  quality_rating numeric(2,1),    -- ex: note sur 5, saisie à la main en v1
  unique (user_id, log_date)
);

-- ---------- SPORT ----------
-- Le "gabarit" hebdo = référence affichée, pas une contrainte (cf. décision validée)

create table workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  title text not null  -- ex: "Push"
);

create table template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references workout_templates(id) on delete cascade,
  name text not null,
  target_sets int,
  target_reps int,
  order_index int default 0
);

-- Une séance RÉELLE, loggée un jour donné (peut venir d'un gabarit ou être libre)
create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  template_id uuid references workout_templates(id),  -- nullable : séance libre possible
  session_date date not null,
  title text not null
);

-- Un exercice DANS une séance réelle (peut différer du gabarit)
create table session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references workout_sessions(id) on delete cascade,
  name text not null,
  order_index int default 0
);

-- Chaque série individuellement : reps + kg
-- C'est la table-clé : le 1RM (Epley) est calculé à partir de ces lignes,
-- jamais à partir du nombre de séries (cf. décision validée).
create table exercise_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid references session_exercises(id) on delete cascade,
  set_number int not null,
  reps int not null,
  kg numeric(5,1) not null
);

-- ---------- BUSINESS (CRM prospects) ----------

create table prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company text not null,
  manager_name text,
  phone text,
  email text,
  sector text,
  demo_url text,
  contact_date date,
  status text check (status in ('Prospect','Négociation','Gagné','Perdu')) default 'Prospect',
  next_action text,
  updated_at timestamptz default now()
);

-- ---------- DEVOIRS & NOTES ----------

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  target_average numeric(4,2)  -- objectif /20, posé en onboarding
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) on delete cascade,
  label text not null,            -- ex: "Révolution française"
  grade numeric(4,2) not null,
  out_of numeric(4,2) not null default 20,
  coefficient numeric(4,2) not null default 1,  -- pondération DANS la matière
  class_average numeric(4,2),
  graded_at date default current_date
);

create table homework (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subject_id uuid references subjects(id),
  chapter text not null,
  importance text check (importance in ('Léger','Moyen','Important')) default 'Moyen',
  due_date date,
  next_review_date date,
  done boolean default false
);

-- ---------- AGENDA ----------

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  source text default 'manuel'  -- pour plus tard : 'vocal_nox', 'apple_calendar', etc.
);

-- ============================================================
-- ROW LEVEL SECURITY — chacun ne voit/modifie que ses propres lignes
-- (à exécuter pour chaque table contenant user_id)
-- ============================================================

alter table profile_settings enable row level security;
alter table sleep_targets enable row level security;
alter table habits enable row level security;
alter table weight_logs enable row level security;
alter table meals enable row level security;
alter table sleep_logs enable row level security;
alter table workout_templates enable row level security;
alter table workout_sessions enable row level security;
alter table prospects enable row level security;
alter table subjects enable row level security;
alter table homework enable row level security;
alter table events enable row level security;

-- Politique générique : un utilisateur ne gère que ses propres lignes.
-- (à répéter par table — exemple pour habits, à dupliquer pour les autres)
create policy "Users manage their own habits" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own weight_logs" on weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own meals" on meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own sleep_logs" on sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own sleep_targets" on sleep_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own profile_settings" on profile_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own workout_templates" on workout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own workout_sessions" on workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own prospects" on prospects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own subjects" on subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own homework" on homework
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own events" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tables sans user_id direct (liées via une table parente) :
-- habit_logs, template_exercises, session_exercises, exercise_sets, grades
-- héritent de la sécurité de leur table parente (habits, workout_templates,
-- workout_sessions, grades→subjects) — une politique basée sur une sous-requête
-- est nécessaire pour ces cas. Exemple pour habit_logs :

alter table habit_logs enable row level security;
create policy "Users manage logs of their own habits" on habit_logs
  for all using (
    habit_id in (select id from habits where user_id = auth.uid())
  ) with check (
    habit_id in (select id from habits where user_id = auth.uid())
  );

-- Le même schéma de politique (via sous-requête sur la table parente) s'applique à :
-- template_exercises (via workout_templates), session_exercises (via workout_sessions),
-- exercise_sets (via session_exercises → workout_sessions), grades (via subjects).
-- Je peux les écrire en détail si tu veux les coller dès maintenant.
