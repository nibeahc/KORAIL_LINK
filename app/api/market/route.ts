import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

type FrankfurterRate = { date: string; base: string; quote: string; rate: number };
type MarketPoint = { date: string; value: number };
let cache: { expiresAt: number; rates: Record<string, number>; updatedAt: string; series: Record<string, MarketPoint[]> } | null = null;

async function fetchLatestBrent(): Promise<{ value: number; date: string; series: MarketPoint[] } | null> {
  const response = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU', { next: { revalidate: 3600 } });
  if (!response.ok) return null;
  const points: MarketPoint[] = [];
  for (const line of (await response.text()).trim().split(/\r?\n/).slice(1)) {
    const [date, rawValue] = line.split(',');
    const value = Number(rawValue);
    if (date && Number.isFinite(value)) points.push({ date, value });
  }
  const series = points.slice(-30);
  const latest = series.at(-1);
  return latest ? { value: latest.value, date: latest.date, series } : null;
}

async function fetchFxHistory(): Promise<Record<string, MarketPoint[]>> {
  const from = new Date(); from.setDate(from.getDate() - 45);
  const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=KRW,CNY,KZT,UZS,KGS&from=${from.toISOString().slice(0, 10)}`, { next: { revalidate: 3600 } });
  if (!response.ok) return {};
  const byDate = new Map<string, Record<string, number>>();
  for (const row of (await response.json()) as FrankfurterRate[]) byDate.set(row.date, { ...(byDate.get(row.date) ?? {}), [row.quote]: row.rate });
  const output: Record<string, MarketPoint[]> = { usdKrw: [], cnyKrw: [], usdKzt: [], usdUzs: [], usdKgs: [] };
  for (const [date, rates] of byDate) {
    if (rates.KRW) output.usdKrw.push({ date, value: rates.KRW });
    if (rates.KRW && rates.CNY) output.cnyKrw.push({ date, value: rates.KRW / rates.CNY });
    if (rates.KZT) output.usdKzt.push({ date, value: rates.KZT });
    if (rates.UZS) output.usdUzs.push({ date, value: rates.UZS });
    if (rates.KGS) output.usdKgs.push({ date, value: rates.KGS });
  }
  return Object.fromEntries(Object.entries(output).map(([key, values]) => [key, values.slice(-30)]));
}

async function fetchKobcIndices(): Promise<{ kcci: number; kci: number; date?: string } | null> {
  const response = await fetch('https://www.kobc.or.kr/ebz/shippinginfoeng/kcci/gridList.do?mId=0302000000', { next: { revalidate: 7 * 24 * 60 * 60 } });
  if (!response.ok) return null;
  const text = (await response.text())
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const kcci = text.match(/KCCI\s+Comprehensive Index\s+100%\s+([\d,]+)/i)?.[1];
  const kci = text.match(/KCI\s+China\s+15%\s+([\d,]+)/i)?.[1];
  if (!kcci || !kci) return null;
  const date = text.match(/Current Index\s+(\d{4}-\d{2}-\d{2})/i)?.[1];
  return { kcci: Number(kcci.replaceAll(',', '')), kci: Number(kci.replaceAll(',', '')), date };
}

async function fetchKobcHistory(): Promise<Record<string, MarketPoint[]>> {
  const response = await fetch('https://www.kobc.or.kr/ebz/shippinginfoeng/timeseries/gridList.do?mId=0304000000', { next: { revalidate: 7 * 24 * 60 * 60 } });
  if (!response.ok) return {};
  const rows = [...(await response.text()).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const kcci: MarketPoint[] = [];
  const kci: MarketPoint[] = [];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cell[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '')) continue;
    const values = cells.slice(1).map((value) => Number(value.replaceAll(',', '')));
    // KOBC timeseries order: date, KCCI, KUWI ... KWAI, KCI, KJI, KSEI.
    if (Number.isFinite(values[0])) kcci.push({ date: cells[0], value: values[0] });
    if (Number.isFinite(values[11])) kci.push({ date: cells[0], value: values[11] });
  }
  return { ...(kcci.length > 1 ? { kcci: kcci.slice(-30) } : {}), ...(kci.length > 1 ? { kci: kci.slice(-30) } : {}) };
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json({ ...cache, cached: true });

  try {
    const [response, brent, kobc, fxHistory, kobcHistory] = await Promise.all([
      fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=KRW,CNY,KZT,UZS,KGS', { next: { revalidate: 3600 } }),
      fetchLatestBrent().catch(() => null),
      fetchKobcIndices().catch(() => null),
      fetchFxHistory().catch(() => ({})),
      fetchKobcHistory().catch(() => ({})),
    ]);
    if (!response.ok) return NextResponse.json({ error: `Frankfurter API 요청 실패 (${response.status})` }, { status: 502 });
    const rows = (await response.json()) as FrankfurterRate[];
    const rates = Object.fromEntries(rows.map((row) => [row.quote, row.rate]));
    const { KRW, CNY, KZT, UZS, KGS } = rates;
    if (![KRW, CNY, KZT, UZS, KGS].every((value) => typeof value === 'number')) return NextResponse.json({ error: '필수 환율 통화가 응답에 없습니다.' }, { status: 502 });

    const result = {
      rates: { usdKrw: KRW, cnyKrw: KRW / CNY, usdKzt: KZT, usdUzs: UZS, usdKgs: KGS, ...(brent ? { brent: brent.value } : {}), ...(kobc ? { kcci: kobc.kcci, kci: kobc.kci } : {}) },
      updatedAt: kobc?.date ?? brent?.date ?? rows[0]?.date ?? new Date().toISOString(),
      series: { ...fxHistory, ...(brent ? { brent: brent.series } : {}), ...kobcHistory },
    };
    cache = { ...result, expiresAt: Date.now() + 60 * 60 * 1000 };
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '환율 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
