import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

type FrankfurterRate = { date: string; base: string; quote: string; rate: number };
let cache: { expiresAt: number; rates: Record<string, number>; updatedAt: string } | null = null;

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json({ ...cache, cached: true });

  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=KRW,CNY,KZT,UZS,KGS', { next: { revalidate: 3600 } });
    if (!response.ok) return NextResponse.json({ error: `Frankfurter API 요청 실패 (${response.status})` }, { status: 502 });
    const rows = (await response.json()) as FrankfurterRate[];
    const rates = Object.fromEntries(rows.map((row) => [row.quote, row.rate]));
    const { KRW, CNY, KZT, UZS, KGS } = rates;
    if (![KRW, CNY, KZT, UZS, KGS].every((value) => typeof value === 'number')) return NextResponse.json({ error: '필수 환율 통화가 응답에 없습니다.' }, { status: 502 });

    const result = {
      rates: { usdKrw: KRW, cnyKrw: KRW / CNY, usdKzt: KZT, usdUzs: UZS, usdKgs: KGS },
      updatedAt: rows[0]?.date ?? new Date().toISOString(),
    };
    cache = { ...result, expiresAt: Date.now() + 60 * 60 * 1000 };
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '환율 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
