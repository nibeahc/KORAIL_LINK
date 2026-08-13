-- Case당 계약은 하나만 유지한다(전자서명 상태를 같은 행에 upsert하기 위함).
alter table public.contracts
  add constraint contracts_case_id_key unique (case_id);
