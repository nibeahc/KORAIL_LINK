import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Payload = {
  operation?: 'create_case' | 'update_case_status';
  caseNumber?: string;
  title?: string;
  origin?: string;
  destination?: string;
  cargoType?: string;
  status?: string;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: 'Cross-origin persistence request rejected.' }, { status: 403 });
  const client = adminClient();
  if (!client) return NextResponse.json({ error: 'Server database credentials are not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.operation || !body.caseNumber) return NextResponse.json({ error: 'Invalid persistence request.' }, { status: 400 });

  if (body.operation === 'create_case') {
    const { data: existing, error: lookupError } = await client.from('cases').select('id').eq('case_number', body.caseNumber).maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 502 });
    if (existing) return NextResponse.json({ id: existing.id, existing: true });
    const { data, error } = await client.from('cases').insert({ case_number: body.caseNumber, title: body.title ?? body.caseNumber, origin: body.origin, destination: body.destination, cargo_type: body.cargoType }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ id: data.id });
  }

  if (body.operation === 'update_case_status') {
    const { error } = await client.from('cases').update({ status: body.status, updated_at: new Date().toISOString() }).eq('case_number', body.caseNumber);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unsupported persistence operation.' }, { status: 400 });
}
