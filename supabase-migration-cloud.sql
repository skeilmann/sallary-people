-- Bonus Calculator — cross-device sync schema (per-user, RLS enforced)
-- Run this in Supabase Dashboard → SQL Editor.
--
-- If you previously ran supabase-migration-pipeline.sql, the old
-- calculation_pipelines table had an "allow all access" policy that is
-- incompatible with this multi-user model. The DROP below replaces it.

drop table if exists public.calculation_pipelines cascade;
drop table if exists public.calculations cascade;
drop table if exists public.workers cascade;

-- ============ workers ============

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  formula_config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workers_user_id_idx on public.workers(user_id);

alter table public.workers enable row level security;

create policy "workers_select_own" on public.workers
  for select using (user_id = auth.uid());
create policy "workers_insert_own" on public.workers
  for insert with check (user_id = auth.uid());
create policy "workers_update_own" on public.workers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workers_delete_own" on public.workers
  for delete using (user_id = auth.uid());

-- ============ calculations ============
-- user_id is denormalized onto this table so RLS can filter without
-- a subquery into workers. The app sets it explicitly on insert.

create table public.calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  period text not null,
  inputs jsonb not null,
  calculated_amount numeric not null,
  adjustment_amount numeric not null default 0,
  adjustment_note text,
  final_amount numeric not null,
  created_at timestamptz not null default now()
);

create index calculations_user_id_idx on public.calculations(user_id);
create index calculations_worker_id_idx on public.calculations(worker_id);
create index calculations_period_idx on public.calculations(period);

alter table public.calculations enable row level security;

create policy "calculations_select_own" on public.calculations
  for select using (user_id = auth.uid());
create policy "calculations_insert_own" on public.calculations
  for insert with check (user_id = auth.uid());
create policy "calculations_update_own" on public.calculations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calculations_delete_own" on public.calculations
  for delete using (user_id = auth.uid());

-- ============ calculation_pipelines ============
-- unique(user_id) encodes "one pipeline per user" at the DB level,
-- so the app can use upsert(onConflict: 'user_id') safely.

create table public.calculation_pipelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Default Pipeline',
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calculation_pipelines enable row level security;

create policy "pipelines_select_own" on public.calculation_pipelines
  for select using (user_id = auth.uid());
create policy "pipelines_insert_own" on public.calculation_pipelines
  for insert with check (user_id = auth.uid());
create policy "pipelines_update_own" on public.calculation_pipelines
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pipelines_delete_own" on public.calculation_pipelines
  for delete using (user_id = auth.uid());
