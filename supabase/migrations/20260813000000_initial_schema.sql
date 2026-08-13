create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  company_name text,
  role text not null default 'member' check (role in ('admin','operator','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case Master Data + Cost Ledger는 JSONB 컬럼으로 둔다 (Phase 0 스펙 4-3, app/lib/types.ts의
-- CaseMasterData / CostLedgerLine[] 타입을 그대로 반영). price는 costLedger가 있으면
-- costLedger.quotedAmount 합과 항상 같아야 하는 불변식을 애플리케이션 레이어에서 지킨다.
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  shipper_name text not null,
  cargo_type text not null,
  route text not null,
  container_type text not null,
  price numeric(18,2) not null default 0,
  status text not null default 'pending_validation'
    check (status in ('pending_validation','needs_review','quote_confirmed','contracted','settlement')),
  master_data jsonb not null default '{}'::jsonb,
  cost_ledger jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 유사 견적 매칭 · sigma 판정(A-1, A-3)의 기준 데이터 풀
create table if not exists public.historical_quotes (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  container_type text not null,
  cargo_type text,
  contract_date date not null,
  amount numeric(18,2) not null,
  currency text not null default 'USD',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','completed','failed')),
  extraction_result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  clauses jsonb not null default '[]'::jsonb,
  contract_amount numeric(18,2),
  sign_status text not null default 'none' check (sign_status in ('none','pending','signed','declined','expired')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tax_invoices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  issued_date date not null default current_date,
  supplier_business_number text,
  customer_business_number text,
  tax_type text not null default 'zero_rated' check (tax_type in ('zero_rated','standard')),
  supply_amount numeric(18,2) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  currency text not null default 'KRW',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dispute_chat_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  evidence_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_data (
  id uuid primary key default gen_random_uuid(),
  series text not null,
  observed_at date not null,
  value numeric(24,8) not null,
  source text,
  created_at timestamptz not null default now(),
  unique(series, observed_at)
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  url text,
  source text,
  category text,
  indicator text,
  published_at timestamptz,
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists cases_owner_id_idx on public.cases(owner_id);
create index if not exists case_status_history_case_id_idx on public.case_status_history(case_id);
create index if not exists historical_quotes_route_idx on public.historical_quotes(route, container_type);
create index if not exists documents_case_id_idx on public.documents(case_id);
create index if not exists market_data_series_date_idx on public.market_data(series, observed_at desc);
create index if not exists news_articles_published_idx on public.news_articles(published_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS: 로그인 사용자는 본인 Case, admin/operator는 전체 접근 (백엔드_연동.md 11번)
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_status_history enable row level security;
alter table public.historical_quotes enable row level security;
alter table public.documents enable row level security;
alter table public.contracts enable row level security;
alter table public.tax_invoices enable row level security;
alter table public.dispute_chat_messages enable row level security;
alter table public.market_data enable row level security;
alter table public.news_articles enable row level security;

create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy cases_owner_or_staff on public.cases
  for all
  using (owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))
  with check (owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')));

create policy case_status_history_via_case on public.case_status_history
  for all
  using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))))
  with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))));

create policy documents_via_case on public.documents
  for all
  using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))))
  with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))));

create policy contracts_via_case on public.contracts
  for all
  using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))))
  with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))));

create policy tax_invoices_via_case on public.tax_invoices
  for all
  using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))))
  with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))));

create policy dispute_chat_via_case on public.dispute_chat_messages
  for all
  using (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))))
  with check (exists (select 1 from public.cases c where c.id = case_id and (c.owner_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')))));

-- historical_quotes/market_data/news_articles는 Case에 종속되지 않는 참조 데이터 —
-- 로그인 사용자는 읽기만 가능, 쓰기는 admin/operator만 허용한다.
create policy historical_quotes_read on public.historical_quotes
  for select to authenticated using (true);
create policy historical_quotes_write on public.historical_quotes
  for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')));

create policy market_data_read on public.market_data
  for select to authenticated using (true);
create policy market_data_write on public.market_data
  for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')));

create policy news_articles_read on public.news_articles
  for select to authenticated using (true);
create policy news_articles_write on public.news_articles
  for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operator')));
