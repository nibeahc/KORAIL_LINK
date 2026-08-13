-- Upgrade an already-existing legacy `cases` table in place.
-- `create table if not exists` does not add columns to a table that is already present.
alter table public.cases
  add column if not exists case_number text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists shipper_name text,
  add column if not exists cargo_type text,
  add column if not exists route text,
  add column if not exists container_type text,
  add column if not exists price numeric(18,2) not null default 0,
  add column if not exists status text not null default 'pending_validation',
  add column if not exists master_data jsonb not null default '{}'::jsonb,
  add column if not exists cost_ledger jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists cases_case_number_unique_idx
  on public.cases(case_number)
  where case_number is not null;

create index if not exists cases_owner_id_idx on public.cases(owner_id);
