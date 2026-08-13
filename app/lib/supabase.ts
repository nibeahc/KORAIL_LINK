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

export interface Profile {
  id: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  role: 'admin' | 'operator' | 'member';
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, email, full_name, company_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    companyName: data.company_name,
    role: data.role,
  };
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

export async function upsertContract(
  caseId: string,
  contract: { clauses: unknown; contractAmount: number; signStatus: string; signedAt?: string }
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('contracts')
    .upsert(
      {
        case_id: caseId,
        clauses: contract.clauses,
        contract_amount: contract.contractAmount,
        sign_status: contract.signStatus,
        signed_at: contract.signedAt ?? null,
      },
      { onConflict: 'case_id' }
    );
  if (error) throw error;
}

export async function insertTaxInvoice(
  caseId: string,
  invoice: {
    id: string;
    issuedDate: string;
    supplierBusinessNumber: string;
    customerBusinessNumber: string;
    taxType: string;
    supplyAmount: number;
    vatAmount: number;
    totalAmount: number;
  }
): Promise<void> {
  const { error } = await getSupabaseClient().from('tax_invoices').insert({
    id: invoice.id,
    case_id: caseId,
    issued_date: invoice.issuedDate,
    supplier_business_number: invoice.supplierBusinessNumber,
    customer_business_number: invoice.customerBusinessNumber,
    tax_type: invoice.taxType,
    supply_amount: invoice.supplyAmount,
    vat_amount: invoice.vatAmount,
    total_amount: invoice.totalAmount,
  });
  if (error) throw error;
}

export async function insertDisputeChatMessage(
  caseId: string,
  message: { role: 'user' | 'assistant'; content: string; evidenceRef: unknown }
): Promise<void> {
  const { error } = await getSupabaseClient().from('dispute_chat_messages').insert({
    case_id: caseId,
    role: message.role,
    content: message.content,
    evidence_ref: message.evidenceRef,
  });
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

export async function uploadCaseDocument(input: {
  caseId: string;
  documentType: string;
  file: File;
  extractionResult: Record<string, unknown>;
}): Promise<{ id: string; storagePath: string }> {
  const supabase = getSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in is required to upload a document.');

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${auth.user.id}/${input.caseId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('case-documents').upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('documents')
    .insert({
      case_id: input.caseId,
      uploaded_by: auth.user.id,
      document_type: input.documentType,
      file_name: input.file.name,
      storage_path: storagePath,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      extraction_status: 'completed',
      extraction_result: input.extractionResult,
    })
    .select('id, storage_path')
    .single();
  if (error) {
    await supabase.storage.from('case-documents').remove([storagePath]);
    throw error;
  }
  return { id: data.id, storagePath: data.storage_path };
}

export async function updateDocumentExtractionResult(documentId: string, extractionResult: Record<string, unknown>) {
  const { error } = await getSupabaseClient()
    .from('documents')
    .update({ extraction_result: extractionResult })
    .eq('id', documentId);
  if (error) throw error;
}

export type ExternalCostLedgerItem = {
  stageId: string;
  stageName: string;
  mode: string;
  costItem: string;
  quotedAmount: number;
  contractAmount: number;
  currency: string;
  sourceType: 'quote_document' | 'manual' | 'contract' | 'legacy_fallback';
  sourceDocumentId?: string;
};

async function resolveCaseId(caseRef: string): Promise<string> {
  const { data, error } = await getSupabaseClient().from('cases').select('id').or(`id.eq.${caseRef},case_number.eq.${caseRef}`).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Case를 찾을 수 없습니다.');
  return data.id;
}

export async function replaceCostLedger(caseRef: string, items: ExternalCostLedgerItem[]): Promise<void> {
  const caseId = await resolveCaseId(caseRef);
  const supabase = getSupabaseClient();
  const { error: removeError } = await supabase.from('cost_ledger_items').delete().eq('case_id', caseId);
  if (removeError) throw removeError;
  if (items.length === 0) return;
  const { error } = await supabase.from('cost_ledger_items').insert(
    items.map((item) => ({
      case_id: caseId, stage_id: item.stageId, stage_name: item.stageName, mode: item.mode,
      cost_item: item.costItem, quoted_amount: item.quotedAmount, contract_amount: item.contractAmount,
      currency: item.currency, source_type: item.sourceType, source_document_id: item.sourceDocumentId ?? null,
    }))
  );
  if (error) throw error;
}

export async function listCostLedger(caseRef: string): Promise<ExternalCostLedgerItem[]> {
  const caseId = await resolveCaseId(caseRef);
  const { data, error } = await getSupabaseClient().from('cost_ledger_items').select('*').eq('case_id', caseId).order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    stageId: row.stage_id, stageName: row.stage_name, mode: row.mode, costItem: row.cost_item,
    quotedAmount: Number(row.quoted_amount), contractAmount: Number(row.contract_amount), currency: row.currency,
    sourceType: row.source_type, sourceDocumentId: row.source_document_id ?? undefined,
  }));
}

export async function saveInvoiceComparison(input: {
  caseId: string; documentId?: string; lineItems: { category: string; label: string; amount: number; currency: string }[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error: removeError } = await supabase.from('invoice_line_items').delete().eq('case_id', input.caseId);
  if (removeError) throw removeError;
  if (!input.lineItems.length) return;
  const { data: lines, error } = await supabase.from('invoice_line_items').insert(input.lineItems.map((line) => ({
    case_id: input.caseId, document_id: input.documentId ?? null, category: line.category, label: line.label,
    amount: line.amount, currency: line.currency,
  }))).select('id, label, amount');
  if (error) throw error;
  const ledger = await listCostLedger(input.caseId);
  const matches = (lines ?? []).map((line) => {
    const item = ledger.find((candidate) => candidate.costItem === line.label || candidate.stageName === line.label);
    return { invoice_line_item_id: line.id, cost_ledger_item_id: null, status: item ? (Number(line.amount) === item.contractAmount ? 'matched' : 'amount_mismatch') : 'new_item', difference: item ? Number(line.amount) - item.contractAmount : null };
  });
  if (matches.length) {
    const { error: matchError } = await supabase.from('invoice_ledger_matches').insert(matches);
    if (matchError) throw matchError;
  }
}

export async function decideCaseFieldChange(input: {
  caseId: string; documentId?: string; fieldName: string; previousValue: unknown; proposedValue: unknown;
  decision: 'pending' | 'keep_current' | 'apply_document';
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('case_field_change_history').insert({
    case_id: input.caseId, document_id: input.documentId ?? null, field_name: input.fieldName,
    previous_value: input.previousValue, proposed_value: input.proposedValue, decision: input.decision,
    decided_at: input.decision === 'pending' ? null : new Date().toISOString(),
  });
  if (error) throw error;
  if (input.decision === 'apply_document') {
    const { data: current, error: readError } = await supabase.from('cases').select('master_data').eq('id', input.caseId).single();
    if (readError) throw readError;
    const { error: updateError } = await supabase.from('cases').update({ master_data: { ...(current.master_data ?? {}), [input.fieldName]: input.proposedValue } }).eq('id', input.caseId);
    if (updateError) throw updateError;
  }
}
