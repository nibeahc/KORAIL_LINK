import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const MAX_QUESTION_LENGTH = 2_000;
const CASE_NUMBER = /KORAIL-\d{4}-\d{3}/i;
type HistoryItem = { role: 'user' | 'bot'; text: string };

function error(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function loadCaseContext(caseNumber: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: caseRow } = await db.from('cases').select('*').eq('case_number', caseNumber).maybeSingle();
  if (!caseRow) return null;
  const [ledger, invoices, documents, history] = await Promise.all([
    db.from('cost_ledger_items').select('stage_name,cost_item,quoted_amount,contract_amount,currency,source_type').eq('case_id', caseRow.id),
    db.from('invoice_line_items').select('label,amount,currency,category,invoice_ledger_matches(status,difference)').eq('case_id', caseRow.id),
    db.from('documents').select('document_type,file_name,extraction_status,extraction_result').eq('case_id', caseRow.id).order('created_at', { ascending: false }).limit(10),
    db.from('dispute_chat_messages').select('role,content,created_at').eq('case_id', caseRow.id).order('created_at', { ascending: false }).limit(8),
  ]);
  return { source: 'supabase', case: caseRow, costLedger: ledger.data ?? [], invoiceItems: invoices.data ?? [], documents: documents.data ?? [], conversationHistory: (history.data ?? []).reverse() };
}

const PERSONA = `당신은 KORAIL LINK 정산 도우미입니다. 국제복합운송의 견적·계약·문서·정산 담당자를 돕습니다.
최종 의사결정이나 지급/계약취소를 지시하지 마세요. 제공된 Case 문맥만 근거로 사용하고 없는 수치·사실을 만들지 마세요.
답변은 한국어로, 간결하게 다음 순서를 따르세요: 결론, 근거(금액·항목·문서), 확인 필요.
계약·Invoice 금액은 총액만 말하지 말고 차이를 만든 비용 항목과 상태(일치/금액 차이/신규 항목/매칭 확인 필요)를 설명하세요.
시황은 비용 차이의 확정 원인이 아니라 참고 신호라고 명확히 구분하세요. Case 번호가 문맥에 없으면 '현재 제공된 Case 데이터에서 확인할 수 없습니다'라고 답하세요.`;

export async function POST(request: Request) {
  let payload: { question?: unknown; history?: unknown; context?: unknown };
  try { payload = await request.json(); } catch { return error('Invalid JSON request body.', 400); }
  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) return error('질문은 1~2,000자로 입력하세요.', 400);
  const supplied = payload.context && typeof payload.context === 'object' ? payload.context as Record<string, unknown> : {};
  const requestedNumber = question.match(CASE_NUMBER)?.[0]?.toUpperCase() ?? (typeof supplied.caseId === 'string' ? supplied.caseId : '');
  const databaseContext = requestedNumber ? await loadCaseContext(requestedNumber).catch(() => null) : null;
  const context = databaseContext ?? { source: 'screen_mock', ...supplied };
  const contextText = JSON.stringify(context);
  if (contextText.length > 60_000) return error('Case context is too large.', 413);

  const history: HistoryItem[] = Array.isArray(payload.history) ? payload.history.slice(-10).flatMap((item): HistoryItem[] => {
    if (!item || typeof item !== 'object') return [];
    const value = item as { role?: unknown; text?: unknown };
    return (value.role === 'user' || value.role === 'bot') && typeof value.text === 'string' ? [{ role: value.role, text: value.text.slice(0, 4_000) }] : [];
  }) : [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return error('Anthropic API key is not configured.', 503);
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001', max_tokens: 1200, system: PERSONA,
        messages: [...history.map(item => ({ role: item.role === 'bot' ? 'assistant' : 'user', content: item.text })), { role: 'user', content: `질문: ${question}\n\nCase 문맥(JSON):\n${contextText}` }] }),
    });
    if (!upstream.ok) return error('Claude request failed.', 502);
    const result = await upstream.json() as { content?: Array<{ type?: string; text?: string }> };
    const answer = result.content?.find(block => block.type === 'text')?.text?.trim();
    if (!answer) return error('Claude returned an empty response.', 502);
    return NextResponse.json({ answer, source: databaseContext ? 'supabase' : 'screen_mock' });
  } catch { return error('Could not reach Claude.', 502); }
}

export function GET() { return error('Only POST is supported.', 405); }
