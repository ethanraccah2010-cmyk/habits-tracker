-- ============================================================
-- Migration : journal des phases nutrition (brief §16.1b, P0b)
-- À exécuter dans le SQL Editor Supabase. NE PAS auto-appliquer.
-- Approuvée par Ethan (2026-07-04) : type bulk/maintien, index gardé.
-- ============================================================

create table if not exists nutrition_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('bulk','maintien')),
  started_on date not null,
  ended_on date                       -- NULL = phase COURANTE (ouverte)
);

-- Invariant DB : une seule phase ouverte par utilisateur
create unique index if not exists nutrition_phases_one_open
  on nutrition_phases (user_id) where ended_on is null;

alter table nutrition_phases enable row level security;
create policy "Users manage their nutrition_phases" on nutrition_phases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
