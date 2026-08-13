import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 503 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return NextResponse.json({ error: 'PDF, JPG, or PNG invoice is required.' }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const source = file.type === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: file.type, data } } : { type: 'image', source: { type: 'base64', media_type: file.type, data } };
  const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001', max_tokens: 1400, temperature: 0, messages: [{ role: 'user', content: [source, { type: 'text', text: 'Extract invoice charges. Return JSON only: {"invoiceNumber":"string or null","currency":"USD","lineItems":[{"label":"charge name","amount":123.45,"currency":"USD"}]}. Include every payable charge row, exclude tax totals/subtotals, use null or [] if unreadable. Never invent values.' }] }] }) });
  if (!response.ok) return NextResponse.json({ error: `Invoice OCR failed (${response.status}).` }, { status: 502 });
  try {
    const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = body.content?.find(block => block.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { invoiceNumber?: unknown; currency?: unknown; lineItems?: Array<{ label?: unknown; amount?: unknown; currency?: unknown }> };
    const lineItems = (parsed.lineItems ?? []).flatMap(item => typeof item.label === 'string' && Number.isFinite(Number(item.amount)) ? [{ label: item.label.trim(), amount: Number(item.amount), currency: item.currency === 'KRW' ? 'KRW' : 'USD' }] : []);
    return NextResponse.json({ invoiceNumber: typeof parsed.invoiceNumber === 'string' ? parsed.invoiceNumber : null, currency: parsed.currency === 'KRW' ? 'KRW' : 'USD', lineItems, mode: 'ocr' });
  } catch { return NextResponse.json({ error: 'Invoice OCR response could not be parsed.' }, { status: 502 }); }
}
