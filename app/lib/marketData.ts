// 시황 지표(목업, 결정론적) — 기능_상세_스펙.md A-2, A-8
// 값은 seed 고정 의사난수로 생성한다: 매 렌더링마다 결과가 바뀌면 데모 중 판정이 들쭉날쭉해진다
// (마스터 컨텍스트 비타협 원칙 8 — 결정론적 시뮬레이션 우선).

export interface MarketPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export type IndicatorKey =
  | 'usdKrw'
  | 'cnyKrw'
  | 'brent'
  | 'usdKzt'
  | 'usdUzs'
  | 'usdKgs'
  | 'kcci'
  | 'kci';

export const INDICATOR_LABEL: Record<IndicatorKey, string> = {
  usdKrw: 'USD/KRW',
  cnyKrw: 'CNY/KRW',
  brent: 'Brent 유가',
  usdKzt: 'USD/KZT',
  usdUzs: 'USD/UZS',
  usdKgs: 'USD/KGS',
  kcci: 'KCCI(종합)',
  kci: 'KCI(한중항로)',
};

/** KZT/UZS/KGS는 "1 USD = 몇 현지통화" 방향이다 — 값이 오르면 그 통화가 달러 대비 약세라는 뜻(A-8) */
export const IS_INVERTED_VS_KRW: Record<IndicatorKey, boolean> = {
  usdKrw: false,
  cnyKrw: false,
  brent: false,
  usdKzt: true,
  usdUzs: true,
  usdKgs: true,
  kcci: false,
  kci: false,
};

// mulberry32 — 결정론적 의사난수 생성기 (seed 고정)
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 30;
const TODAY = new Date('2026-08-13T00:00:00+09:00');

function dateNDaysAgo(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function generateSeries(seed: number, base: number, dailyVolatility: number, drift = 0): MarketPoint[] {
  const rand = mulberry32(seed);
  const points: MarketPoint[] = [];
  let value = base;
  for (let i = DAYS - 1; i >= 0; i--) {
    const shock = (rand() - 0.5) * 2 * dailyVolatility;
    value = value * (1 + drift) + shock;
    points.push({ date: dateNDaysAgo(i), value: Math.round(value * 10000) / 10000 });
  }
  // 마지막 값(오늘)에 약한 상방 충격을 주어 이상탐지 데모가 항상 밋밋하지 않게 한다.
  return points;
}

export const SERIES: Record<IndicatorKey, MarketPoint[]> = {
  usdKrw: generateSeries(1001, 1385, 4.5),
  cnyKrw: generateSeries(1002, 191, 0.9),
  brent: generateSeries(1003, 82, 0.9),
  usdKzt: generateSeries(1004, 478, 2.2),
  usdUzs: generateSeries(1005, 12750, 60),
  usdKgs: generateSeries(1006, 87.5, 0.4),
  kcci: generateSeries(1007, 1620, 14),
  kci: generateSeries(1008, 980, 11),
};

// 데모에서 이상탐지 카드가 항상 빈 화면으로 보이지 않도록, 오늘 시점 값에 의도적인 급변을 하나 심어둔다
// (결정론적 — 매 렌더링 동일). Brent가 지정학 뉴스와 함께 급등한 시나리오.
{
  const brent = SERIES.brent;
  brent[brent.length - 1] = { ...brent[brent.length - 1], value: Math.round(brent[brent.length - 2].value * 1.11 * 100) / 100 };
}

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  changePct: number;
  mean: number;
  stdDev: number;
  latest: number;
}

/** zScore = (최신값−30일평균)/표준편차, |zScore|≥2.0 OR |전일대비변동률|≥8%면 이상탐지 (A-2) */
export function detectAnomaly(series: MarketPoint[]): AnomalyResult {
  const values = series.map((p) => p.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const latest = values[values.length - 1];
  const prev = values[values.length - 2] ?? latest;
  const zScore = stdDev === 0 ? 0 : (latest - mean) / stdDev;
  const changePct = prev === 0 ? 0 : ((latest - prev) / prev) * 100;
  return {
    isAnomaly: Math.abs(zScore) >= 2.0 || Math.abs(changePct) >= 8,
    zScore,
    changePct,
    mean,
    stdDev,
    latest,
  };
}

/** 최근 구간 변화율 — A-7 해상-철도 대체수요 서술에서 재사용 */
export function windowChangePct(series: MarketPoint[], windowDays: number): number {
  if (series.length < windowDays + 1) windowDays = series.length - 1;
  const from = series[series.length - 1 - windowDays].value;
  const to = series[series.length - 1].value;
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

// --- 과거 유사 견적 풀 (A-1, A-3의 σ 판정·유사도 매칭 기준 데이터) -----------------
// 코레일 실거래 이력이 없는 cold start 상태이므로 목업으로 구성했다(노선·컨테이너·화물 조합 다양화).

export interface HistoricalQuote {
  id: string;
  route: string; // routeData.ts의 destination과 매칭
  containerType: string;
  cargoType: string;
  contractDate: string; // YYYY-MM-DD
  amount: number;
  currency: 'USD';
}

const HQ_ROUTES: { route: string; containerType: string; base: number }[] = [
  { route: '알마티', containerType: '40FT HC', base: 3220 },
  { route: '알마티', containerType: '20FT', base: 1980 },
  { route: '아스타나', containerType: '40FT HC', base: 3450 },
  { route: '타슈켄트', containerType: '20FT', base: 2680 },
  { route: '타슈켄트', containerType: '40FT HC', base: 3980 },
  { route: '비슈케크', containerType: '20FT', base: 2540 },
  { route: '시안', containerType: '40FT', base: 1450 },
  { route: '시안', containerType: '20FT', base: 980 },
  { route: '상하이', containerType: '40FT', base: 1080 },
];

const CARGO_TYPES = ['건설중장비 부품', '전자부품', '방직 원단', '자동차 부품', '생활용품', '화학원료'];

function buildHistoricalQuotes(): HistoricalQuote[] {
  const rand = mulberry32(2024);
  const quotes: HistoricalQuote[] = [];
  let idx = 0;
  for (let m = 0; m < 6; m++) {
    for (const spec of HQ_ROUTES) {
      // 6개월 x 9개 조합 = 54건 중 임의로 걸러 약 33건 수준으로 맞춘다
      if (rand() < 0.4) continue;
      idx += 1;
      const d = new Date(TODAY);
      d.setMonth(d.getMonth() - m, 1 + Math.floor(rand() * 26));
      const noise = (rand() - 0.5) * 0.16; // ±8%
      quotes.push({
        id: `hq-${idx}`,
        route: spec.route,
        containerType: spec.containerType,
        cargoType: CARGO_TYPES[Math.floor(rand() * CARGO_TYPES.length)],
        contractDate: d.toISOString().slice(0, 10),
        amount: Math.round(spec.base * (1 + noise)),
        currency: 'USD',
      });
    }
  }
  return quotes;
}

export const historicalQuotes: HistoricalQuote[] = buildHistoricalQuotes();

/**
 * Case 상세("현재 시장정보" 카드)에 노출할 지표를 노선 특성으로 필터링한다 (A-4, A-8).
 * 목적지 통화 하나만, KCI는 연운항 경유 노선에만, KCCI(종합)는 대시보드 전용이라 여기 포함하지 않는다.
 */
export function relevantIndicatorsForRoute(route: {
  currencyPair: CurrencyPairLike | null;
  hasSeaLeg: boolean;
}): IndicatorKey[] {
  const list: IndicatorKey[] = ['usdKrw', 'cnyKrw', 'brent'];
  if (route.currencyPair) list.push(CURRENCY_TO_INDICATOR[route.currencyPair]);
  if (route.hasSeaLeg) list.push('kci');
  return list;
}

type CurrencyPairLike = 'USD/KZT' | 'USD/UZS' | 'USD/KGS';
const CURRENCY_TO_INDICATOR: Record<CurrencyPairLike, IndicatorKey> = {
  'USD/KZT': 'usdKzt',
  'USD/UZS': 'usdUzs',
  'USD/KGS': 'usdKgs',
};

// --- "KORAIL LINK 종합 지수" (A-5) ------------------------------------------
// 목업/자체 산출 지수다 — 외부 공식 지수(SCFI/CCFI/KCCI 등)가 아니다. 화면에서 반드시
// "자체 종합 지수"로 라벨링한다(마스터 컨텍스트 비타협 원칙 7).

export interface CompositeIndexPoint {
  month: string; // YYYY-MM
  index: number; // 노선·컨테이너 버킷별 z-score 표준화 후 월평균
}

export function buildCompositeIndex(): CompositeIndexPoint[] {
  const buckets = new Map<string, HistoricalQuote[]>();
  for (const q of historicalQuotes) {
    const key = `${q.route}|${q.containerType}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(q);
  }

  const zByQuoteId = new Map<string, number>();
  for (const quotes of buckets.values()) {
    const amounts = quotes.map((q) => q.amount);
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length) || 1;
    for (const q of quotes) zByQuoteId.set(q.id, (q.amount - mean) / std);
  }

  const monthly = new Map<string, number[]>();
  for (const q of historicalQuotes) {
    const month = q.contractDate.slice(0, 7);
    if (!monthly.has(month)) monthly.set(month, []);
    monthly.get(month)!.push(zByQuoteId.get(q.id)!);
  }

  return [...monthly.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, zs]) => ({ month, index: zs.reduce((s, v) => s + v, 0) / zs.length }));
}
