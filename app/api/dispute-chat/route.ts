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
  try { payload = await request.json(); } catch { return error('Invalid JSON request body.', 400); }

  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) return error('question must be 1–2,000 characters.', 400);
  const contextText = JSON.stringify(payload.context ?? {}) ?? '{}';
  if (contextText.length > MAX_CONTEXT_LENGTH) return error('Case context is too large.', 413);

  const history: HistoryItem[] = [];
  for (const item of (Array.isArray(payload.history) ? payload.history.slice(-MAX_HISTORY_ITEMS) : [])) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { role?: unknown; text?: unknown };
    if ((candidate.role !== 'user' && candidate.role !== 'bot') || typeof candidate.text !== 'string') return error('Invalid history item.', 400);
    history.push({ role: candidate.role, text: candidate.text.slice(0, MAX_HISTORY_TEXT_LENGTH) });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  if (!apiKey) return error('Anthropic API key is not configured.', 503);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: 'You are the KORAIL LINK business assistant. Use only the supplied case context as evidence. Clearly state when verification is required, and answer in concise Korean Markdown with amounts, documents, and contract items separated.',
        messages: [
          ...history.map((item) => ({ role: item.role === 'bot' ? 'assistant' : 'user', content: item.text })),
          { role: 'user', content: `Question: ${question}\n\nCase context:\n${contextText}` },
        ],
      }),
    });
    if (!upstream.ok) return error('Claude request failed.', 502);
    const result = (await upstream.json()) as { content?: Array<{ type?: string; text?: string }> };
    const answer = result.content?.find((block) => block.type === 'text')?.text?.trim();
    if (!answer) return error('Claude returned an empty response.', 502);
    return NextResponse.json({ answer, model });
  } catch {
    return error('Could not reach Claude.', 502);
  }
}

export function GET() {
  return error('Only POST is supported.', 405);
}
