import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FIELDS: Record<string, string[]> = {
  contract: ['shipperName', 'destination', 'containerType'],
  packing_list: ['shipperName', 'cargoType', 'origin', 'destination', 'containerType', 'containerCount', 'totalWeightTon'],
  waybill: ['shipperName', 'cargoType', 'destination', 'containerType', 'containerCount', 'totalWeightTon', 'consignee'],
  bl: ['shipperName', 'containerType', 'seaLegOrigin', 'seaLegDestination'],
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function supportedMime(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type || MIME_BY_EXTENSION[extension];
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime) ? mime : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 });

  const form = await request.formData();
  const file = form.get('file');
  const documentType = String(form.get('documentType') ?? '');
  const fields = FIELDS[documentType];
  if (!(file instanceof File) || !fields) return NextResponse.json({ error: '지원하지 않는 문서 또는 요청 형식입니다.' }, { status: 400 });
  const mime = supportedMime(file);
  if (!mime) return NextResponse.json({ error: 'PDF, JPG, PNG, GIF, WEBP 파일만 추출할 수 있습니다.' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: '문서 크기는 15MB 이하여야 합니다.' }, { status: 413 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const source = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

  const prompt = [
    `Extract only these fields from this ${documentType} document: ${fields.join(', ')}.`,
    'Return JSON only, exactly in this shape: {"snapshot":{"field":"value or null"}}.',
    'Use null whenever the value is absent, unreadable, or uncertain. Do not infer or invent information.',
    'For containerCount and totalWeightTon, return only the number without units. Keep company/place names as written in the document.',
  ].join(' ');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        temperature: 0,
        messages: [{ role: 'user', content: [source, { type: 'text', text: prompt }] }],
      }),
    });
    if (!response.ok) return NextResponse.json({ error: `OCR 요청 실패 (${response.status}): ${(await response.text()).slice(0, 240)}` }, { status: 502 });

    const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = body.content?.find((item) => item.type === 'text')?.text ?? '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return NextResponse.json({ error: 'OCR 응답 형식을 해석하지 못했습니다.' }, { status: 502 });
    const result = JSON.parse(json) as { snapshot?: Record<string, unknown> };
    const snapshot = Object.fromEntries(fields.map((field) => {
      const value = result.snapshot?.[field];
      return [field, typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null];
    }));
    return NextResponse.json({ snapshot, mode: 'ocr' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'OCR 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
