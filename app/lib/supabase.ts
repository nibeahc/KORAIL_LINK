import { createClient } from '@supabase/supabase-js';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const supabaseUrl = viteEnv?.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = viteEnv?.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 로컬 디자인 확인은 Supabase 연결 없이도 목업 데이터로 동작해야 한다. 환경변수가 없을 때
// 모듈 로딩 자체를 중단하지 않고, 연결이 필요한 작업만 기존 catch 경로로 실패하게 둔다.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = createClient(
  supabaseUrl ?? 'http://127.0.0.1:54321',
  supabaseAnonKey ?? 'local-preview-anon-key',
  { auth: { persistSession: isSupabaseConfigured, autoRefreshToken: isSupabaseConfigured } },
);

// Supabase 오류 객체는 code(PostgREST)나 statusCode(Storage) 형태로 권한 문제를 알려준다 —
// 두 형태를 한 곳에서 판별해서 "로그인 권한이 없어 저장할 수 없습니다" 안내로 통일한다.
export function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: string | number } | null | undefined;
  return e?.code === '42501' || String(e?.statusCode) === '401';
}

async function resolveCaseId(caseRef: string) {
  const byId = await supabase.from('cases').select('id').eq('id', caseRef).maybeSingle();
  if (byId.data?.id) return byId.data.id as string;
  const byNumber = await supabase.from('cases').select('id').eq('case_number', caseRef).single();
  if (byNumber.error) throw byNumber.error;
  return byNumber.data.id as string;
}

export async function listCases() {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCase(input: {
  case_number: string;
  title: string;
  origin?: string;
  destination?: string;
  cargo_type?: string;
}) {
  const existing = await supabase.from('cases').select('*').eq('case_number', input.case_number).maybeSingle();
  if (existing.data) return existing.data;
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cases')
    .insert({ ...input, owner_id: user.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// CaseStatus(app/lib/types.ts)의 값을 Supabase cases.status의 체크 제약(draft/active/review/completed/archived)으로 매핑한다.
export async function updateCaseStatus(caseNumber: string, status: string) {
  const dbStatus: Record<string, string> = {
    '검증 대기': 'draft', '검토 필요': 'review',
    '견적 확정': 'active', '계약': 'active', '정산': 'completed',
  };
  const { error } = await supabase.from('cases').update({ status: dbStatus[status] ?? 'draft', updated_at: new Date().toISOString() }).eq('case_number', caseNumber);
  if (error) throw error;
}

export async function uploadCaseDocument(caseId: string, file: File) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');
  const path = `${userData.user.id}/${caseId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from('case-documents').upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function saveDocumentRecord(input: {
  caseId: string;
  file: File;
  documentType: string;
  storagePath: string;
  extractionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('documents').insert({
    case_id: await resolveCaseId(input.caseId),
    uploaded_by: userData.user?.id,
    document_type: input.documentType,
    file_name: input.file.name,
    storage_path: input.storagePath,
    mime_type: input.file.type,
    file_size: input.file.size,
    extraction_status: input.extractionStatus ?? 'pending',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function saveContract(input: {
  caseId: string; terms: unknown; signStatus?: string; externalProvider?: string; externalId?: string;
}) {
  const { data, error } = await supabase.from('contracts').insert({
    case_id: await resolveCaseId(input.caseId),
    terms: input.terms,
    sign_status: input.signStatus ?? 'none',
    external_provider: input.externalProvider,
    external_id: input.externalId,
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function saveTaxInvoice(input: {
  caseId: string; supplyAmount: number; vatAmount: number; totalAmount: number; currency?: string; status?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('tax_invoices').insert({
    case_id: await resolveCaseId(input.caseId),
    supply_amount: input.supplyAmount,
    vat_amount: input.vatAmount,
    total_amount: input.totalAmount,
    currency: input.currency ?? 'KRW',
    status: input.status ?? 'draft',
    created_by: userData.user?.id,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function saveDisputeMessage(input: { caseId: string; role: 'user' | 'assistant' | 'system'; content: string; context?: unknown }) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('dispute_chat_messages').insert({
    case_id: await resolveCaseId(input.caseId), user_id: userData.user?.id, role: input.role, content: input.content, context: input.context ?? {},
  }).select().single();
  if (error) throw error;
  return data;
}
