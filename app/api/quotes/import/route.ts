import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const required = ['route', 'container_type', 'contract_date', 'amount'];

function csvRows(text: string) {
  const [head, ...lines] = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = head.split(',').map(value => value.trim().toLowerCase());
  if (required.some(column => !headers.includes(column))) throw new Error(`CSV must contain: ${required.join(', ')}`);
  return lines.filter(Boolean).map((line, row) => {
    const values = line.split(',').map(value => value.trim());
    const entry = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const amount = Number(entry.amount);
    if (!entry.route || !entry.container_type || !/^\d{4}-\d{2}-\d{2}$/.test(entry.contract_date) || !Number.isFinite(amount)) throw new Error(`Invalid CSV row ${row + 2}`);
    return { route: entry.route, container_type: entry.container_type, cargo_type: entry.cargo_type || null, contract_date: entry.contract_date, amount, currency: entry.currency || 'USD', details: { case_number: entry.case_number || null, shipper: entry.shipper || null, transport_month: entry.transport_month || entry.contract_date.slice(0, 7), source: 'csv_import' } };
  });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server database credentials are not configured.' }, { status: 503 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 });
  try {
    const rows = csvRows(await file.text());
    if (!rows.length) return NextResponse.json({ error: 'CSV has no data rows.' }, { status: 400 });
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from('historical_quotes').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ imported: rows.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'CSV import failed.' }, { status: 400 }); }
}
