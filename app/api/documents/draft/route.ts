import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FIELD_MAP = { shipperName: '송하인', consignee: '수하인', cargoType: '품목', origin: '출발지', destination: '도착지', container: '컨테이너', totalWeightTon: '총중량', incoterms: '운송조건' } as const;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });
  const masterData = await request.json().catch(() => null);
  if (!masterData || typeof masterData !== 'object') return NextResponse.json({ error: 'Case 데이터가 필요합니다.' }, { status: 400 });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001', max_tokens: 1000, temperature: 0,
        system: 'You draft an SMGS waybill. Use only the supplied Case data. Never infer missing facts. Return JSON only.',
        messages: [{ role: 'user', content: `Return {"snapshot":{"shipperName":"... or null","consignee":"... or null","cargoType":"... or null","origin":"... or null","destination":"... or null","container":"... or null","totalWeightTon":"... or null","incoterms":"... or null"}}. Case: ${JSON.stringify(masterData)}` }],
      }),
    });
    if (!response.ok) return NextResponse.json({ error: `Claude 초안 생성 실패 (${response.status})` }, { status: 502 });
    const result = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = result.content?.find((block) => block.type === 'text')?.text ?? '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return NextResponse.json({ error: '초안 응답 형식을 해석하지 못했습니다.' }, { status: 502 });
    const parsed = JSON.parse(json) as { snapshot?: Record<string, unknown> };
    const fields = Object.entries(FIELD_MAP).map(([key, label]) => {
      const value = parsed.snapshot?.[key];
      return { label, value: typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null };
    });
    return NextResponse.json({ fields, mode: 'llm' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '초안 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
