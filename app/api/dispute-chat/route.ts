import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_QUESTION_LENGTH = 2_000;
const MAX_CONTEXT_LENGTH = 60_000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_TEXT_LENGTH = 4_000;

type HistoryItem = { role: 'user' | 'bot'; text: string };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let payload: { question?: unknown; history?: unknown; context?: unknown };
  try {
    payload = await request.json();
  } catch {
    return error('올바른 JSON 요청 본문이 필요합니다.', 400);
  }

  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) return error('question은 1~2,000자여야 합니다.', 400);

  const contextText = JSON.stringify(payload.context ?? {}) ?? '{}';
  if (contextText.length > MAX_CONTEXT_LENGTH) return error('context가 너무 큽니다. 문서 원문 대신 요약을 전송하세요.', 413);

  const rawHistory = Array.isArray(payload.history) ? payload.history.slice(-MAX_HISTORY_ITEMS) : [];
  const history: HistoryItem[] = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { role?: unknown; text?: unknown };
    if ((candidate.role !== 'user' && candidate.role !== 'bot') || typeof candidate.text !== 'string') {
      return error('history.role은 user 또는 bot이어야 합니다.', 400);
    }
    history.push({ role: candidate.role, text: candidate.text.slice(0, MAX_HISTORY_TEXT_LENGTH) });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? 'google/gemma-3-27b-it:free';
  if (!apiKey) return error('챗봇 서버 환경변수가 설정되지 않았습니다.', 503);

  const messages = [
    {
      role: 'system',
      content:
        '당신은 KORAIL LINK 분쟁 검토 보조자입니다. 제공된 case context의 사실만 근거로 한국어로 답하세요. 불확실한 내용은 확인이 필요하다고 명시하고, 금액·문서·계약 항목을 구분해 간결한 Markdown으로 답하세요.',
    },
    ...history.map((item) => ({ role: item.role === 'bot' ? 'assistant' : 'user', content: item.text })),
    { role: 'user', content: `질문: ${question}\n\nCase context:\n${contextText}` },
  ];

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
      },
      body: JSON.stringify({ model, messages }),
    });
    if (!upstream.ok) return error('LLM 공급자 요청에 실패했습니다.', 502);
    const result = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) return error('LLM 응답이 비어 있습니다.', 502);
    return NextResponse.json({ answer, model });
  } catch {
    return error('LLM 공급자에 연결할 수 없습니다.', 502);
  }
}

export function GET() {
  return error('POST 요청만 지원합니다.', 405);
}
