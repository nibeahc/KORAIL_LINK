-- External-service case data integration tables.
create table if not exists public.cost_ledger_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  stage_id text not null,
  stage_name text not null,
  mode text not null,
  cost_item text not null,
  quoted_amount numeric(18,2) not null default 0,
  contract_amount numeric(18,2) not null default 0,
  currency text not null default 'USD',
  source_type text not null check (source_type in ('quote_document', 'manual', 'contract', 'legacy_fallback')),
  source_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_field_change_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  field_name text not null,
  previous_value jsonb,
  proposed_value jsonb,
  decision text not null check (decision in ('pending', 'keep_current', 'apply_document')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  category text not null,
  label text not null,
  amount numeric(18,2) not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_ledger_matches (
  id uuid primary key default gen_random_uuid(),
  invoice_line_item_id uuid not null references public.invoice_line_items(id) on delete cascade,
  cost_ledger_item_id uuid references public.cost_ledger_items(id) on delete set null,
  status text not null check (status in ('matched', 'amount_mismatch', 'new_item')),
  difference numeric(18,2),
  created_at timestamptz not null default now()
);

create index if not exists cost_ledger_items_case_id_idx on public.cost_ledger_items(case_id);
create index if not exists case_field_change_history_case_id_idx on public.case_field_change_history(case_id);
create index if not exists invoice_line_items_case_id_idx on public.invoice_line_items(case_id);

alter table public.cost_ledger_items enable row level security;
alter table public.case_field_change_history enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_ledger_matches enable row level security;

create policy cost_ledger_items_via_case on public.cost_ledger_items for all using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator'))))) with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))));
create policy field_change_history_via_case on public.case_field_change_history for all using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator'))))) with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))));
create policy invoice_line_items_via_case on public.invoice_line_items for all using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator'))))) with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))));
create policy invoice_ledger_matches_via_invoice on public.invoice_ledger_matches for all using (exists (select 1 from public.invoice_line_items i join public.cases c on c.id = i.case_id where i.id = invoice_line_item_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator'))))) with check (exists (select 1 from public.invoice_line_items i join public.cases c on c.id = i.case_id where i.id = invoice_line_item_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))));
