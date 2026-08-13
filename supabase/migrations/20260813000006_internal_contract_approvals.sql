create table if not exists public.contract_approvals (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  approver_name text not null,
  approver_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  comment text,
  signature_data_url text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contract_approvals_contract_id_idx on public.contract_approvals(contract_id, created_at);
alter table public.contract_approvals enable row level security;

create policy contract_approvals_via_contract on public.contract_approvals for all
using (exists (select 1 from public.contracts ct join public.cases c on c.id = ct.case_id where ct.id = contract_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))))
with check (exists (select 1 from public.contracts ct join public.cases c on c.id = ct.case_id where ct.id = contract_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'operator')))));
