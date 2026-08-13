'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CaseItem, CaseStatus } from './types';

let client: SupabaseClient | null = null;

/**
 * 설정 누락을 조용히 넘기지 않는다 — URL/키가 없으면 클라이언트 생성 시점에 즉시 예외를 던진다.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase 환경변수가 없습니다. .env.example을 복사해 .env.local을 만들고 ' +
        'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 채우세요.'
    );
  }

  client = createClient(url, anonKey);
  return client;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email: string, password: string, fullName: string) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) return null;
  return data.user;
}

// --- Case CRUD -------------------------------------------------------------
// cases 테이블: Case Master Data·Cost Ledger는 JSONB 컬럼(master_data/cost_ledger)으로 저장한다.
// (백엔드_연동.md 9번, Phase 0 스펙 4-3 — "JSONB 컬럼으로 두거나 별도 테이블로 정규화" 중 JSONB를 택함)

interface CaseRow {
  id: string;
  case_number: string;
  shipper_name: string;
  cargo_type: string;
  route: string;
  container_type: string;
  price: number;
  status: CaseStatus;
  master_data: CaseItem['masterData'];
  cost_ledger: CaseItem['costLedger'];
  created_at: string;
}

function rowToCaseItem(row: CaseRow): CaseItem {
  return {
    id: row.id,
    caseNumber: row.case_number,
    shipperName: row.shipper_name,
    cargoType: row.cargo_type,
    route: row.route,
    containerType: row.container_type,
    price: row.price,
    status: row.status,
    createdAt: row.created_at,
    masterData: row.master_data,
    costLedger: row.cost_ledger ?? [],
  };
}

function caseItemToRow(item: CaseItem) {
  return {
    id: item.id,
    case_number: item.caseNumber,
    shipper_name: item.shipperName,
    cargo_type: item.cargoType,
    route: item.route,
    container_type: item.containerType,
    price: item.price,
    status: item.status,
    master_data: item.masterData,
    cost_ledger: item.costLedger,
  };
}

/** DB에서 Case 목록을 조회한다. 실패하거나 결과가 비어있으면 호출부(state.ts)가 목업으로 폴백한다. */
export async function listCases(): Promise<CaseItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('cases')
    .select('id, case_number, shipper_name, cargo_type, route, container_type, price, status, master_data, cost_ledger, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as CaseRow[]).map(rowToCaseItem);
}

/** best-effort 저장 — 실패 시 예외를 던지므로 호출부가 반드시 .catch()로 감싸야 한다. */
export async function upsertCase(item: CaseItem): Promise<void> {
  const { error } = await getSupabaseClient().from('cases').upsert(caseItemToRow(item));
  if (error) throw error;
}

export async function insertCaseStatusHistory(
  caseId: string,
  previousStatus: CaseStatus,
  nextStatus: CaseStatus,
  changedBy?: string
): Promise<void> {
  const { error } = await getSupabaseClient().from('case_status_history').insert({
    case_id: caseId,
    previous_status: previousStatus,
    next_status: nextStatus,
    changed_by: changedBy ?? null,
  });
  if (error) throw error;
}
