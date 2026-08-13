// 견적 검증 계산 엔진 — 아이디어 문서 3장 "구체화: 판정 기준"(A/B/C)을 그대로 구현한다.
// 목업 데이터(marketData.ts) 위에서 동작하는 순수 함수들로, UI(page.tsx)가 이 값을 소비한다.

import type { HistoricalQuote, MarketPoint } from "./marketData";

export function calcStats(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

export type MarketIndexPoint = { month: string; avgZ: number };

// 대시보드 "KORAIL LINK 종합 지수" 차트용 — 노선(오봉→알마티/타슈켄트/아스타나 등)마다
// 가격 스케일이 달라 과거 견적 금액을 그대로 평균 내면 의미가 없다(코레일 공식 자료 기준
// 노선별 편도 6,044~7,123km로 완만하게 갈리는 trunk-and-branch 구조 — 몸통 구간은 공유하고
// 목적지 라스트마일만 증분되는 형태). 그래서 노선·컨테이너 타입 버킷 안에서 표준화(z-score)한
// 뒤 월별로 평균 내 "자체 종합 지수"를 만든다. 외부 지수(SCFI/CCFI/KCCI 등)를 그대로 쓰지
// 않는 이유는, TCR 구간을 대표하는 공식 지수가 아직 없기 때문이다(해상 구간만 다루는 KCCI의
// KCI 서브지수로는 노선 전체를 대표할 수 없음) — 그래서 자체 산출 지수로 명확히 라벨링한다.
export function buildMarketIndexSeries(pool: HistoricalQuote[]): MarketIndexPoint[] {
  const buckets = new Map<string, HistoricalQuote[]>();
  for (const q of pool) {
    const key = `${q.origin}|${q.destination}|${q.containerType}`;
    const list = buckets.get(key) ?? [];
    list.push(q);
    buckets.set(key, list);
  }
  const zByMonth = new Map<string, number[]>();
  for (const list of buckets.values()) {
    const { mean, std } = calcStats(list.map((q) => q.price));
    for (const q of list) {
      const z = std === 0 ? 0 : (q.price - mean) / std;
      const arr = zByMonth.get(q.transportMonth) ?? [];
      arr.push(z);
      zByMonth.set(q.transportMonth, arr);
    }
  }
  return Array.from(zByMonth.entries())
    .map(([month, zs]) => ({ month, avgZ: zs.reduce((a, b) => a + b, 0) / zs.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return Math.abs((ay - by) * 12 + (am - bm));
}

// ── C. 유사 견적 매칭 기준 — 가중치 기반 유사도 ──────────────────────────────
export const SIMILARITY_WEIGHTS = { route: 0.4, container: 0.25, timing: 0.2, cargo: 0.15 } as const;
export const SIMILARITY_MIN_SCORE = 0.7;
export const SIMILARITY_WINDOW_MONTHS = 6;

export type QuoteQuery = {
  origin: string;
  destination: string;
  containerType: string;
  cargoCategory: string;
  transportMonth: string;
};

export type SimilarityBreakdown = { routeMatch: boolean; containerMatch: boolean; cargoMatch: boolean; timingScore: number };

export function similarityBreakdown(target: QuoteQuery, candidate: HistoricalQuote): SimilarityBreakdown {
  const routeMatch = target.origin === candidate.origin && target.destination === candidate.destination;
  const containerMatch = target.containerType === candidate.containerType;
  const cargoMatch = target.cargoCategory === candidate.cargoCategory;
  const monthsDiff = monthsBetween(target.transportMonth, candidate.transportMonth);
  const timingScore = Math.max(0, 1 - monthsDiff / SIMILARITY_WINDOW_MONTHS);
  return { routeMatch, containerMatch, cargoMatch, timingScore };
}

export function similarityScore(target: QuoteQuery, candidate: HistoricalQuote): number {
  const b = similarityBreakdown(target, candidate);
  return (
    (b.routeMatch ? SIMILARITY_WEIGHTS.route : 0) +
    (b.containerMatch ? SIMILARITY_WEIGHTS.container : 0) +
    b.timingScore * SIMILARITY_WEIGHTS.timing +
    (b.cargoMatch ? SIMILARITY_WEIGHTS.cargo : 0)
  );
}

export type SimilarMatch = { quote: HistoricalQuote; score: number; breakdown: SimilarityBreakdown };

export function matchSimilarQuotes(target: QuoteQuery, pool: HistoricalQuote[]): SimilarMatch[] {
  return pool
    .map((quote) => ({ quote, score: similarityScore(target, quote), breakdown: similarityBreakdown(target, quote) }))
    .filter((m) => m.score >= SIMILARITY_MIN_SCORE && monthsBetween(target.transportMonth, m.quote.transportMonth) <= SIMILARITY_WINDOW_MONTHS)
    .sort((a, b) => b.score - a.score);
}

// ── A. 견적 적정성 판정 — 동적 변동성(σ) 기반 ────────────────────────────────
const SIGMA_FALLBACK = 5;
const SIGMA_FLOOR = 1.5;
const SIGMA_MIN_SAMPLES = 4;

// diffPct("현재 견적이 중앙값 대비 몇 % 떨어져 있는가")와 같은 성격의 통계량으로 맞추기 위해,
// 유사 견적들을 시간 순으로 이어붙인 "변동률"의 표준편차가 아니라, 유사 견적들의 가격 "수준"이
// 중앙값(baseline) 대비 얼마나 흩어져 있는지(수준편차, %)의 표준편차를 σ로 쓴다. 이렇게 해야
// diffPct(수준편차)를 σ의 배수로 나누는 게 통계적으로 말이 된다(2026-08-12, 팀 피드백 반영 —
// 기존 버전은 "가격 변동률의 변동성"과 "가격 수준의 편차"라는 서로 다른 통계량을 비교하고 있었다).
export function sigmaFromMatches(matches: SimilarMatch[], baseline: number): number {
  if (matches.length < SIGMA_MIN_SAMPLES || baseline === 0) return SIGMA_FALLBACK;
  const pctDeviations = matches.map((m) => ((m.quote.price - baseline) / baseline) * 100);
  const { std } = calcStats(pctDeviations);
  return Math.max(std, SIGMA_FLOOR);
}

export type VerdictTone = "green" | "amber" | "red";
export type Verdict = { label: string; tone: VerdictTone; diffPct: number; sigma: number; baseline: number };

/** 최근 시황 변동을 과거 유사 견적 중앙값에 적용하는 보정값(%)이다. */
export function liveMarketAdjustmentPct(series: Partial<Record<'usdKrw' | 'cnyKrw' | 'brent' | 'kcci' | 'kci', MarketPoint[]>>) {
  const change = (key: keyof typeof series) => {
    const values = series[key];
    if (!values || values.length < 2 || values[0].value === 0) return 0;
    return ((values.at(-1)!.value - values[0].value) / values[0].value) * 100;
  };
  // 환율 35%, 유가 25%, 해상운임 지수 25%, 중국 구간 지수 15%.
  return change('usdKrw') * 0.35 + change('cnyKrw') * 0.05 + change('brent') * 0.25 + change('kcci') * 0.20 + change('kci') * 0.15;
}

export function verdictWithLiveMarket(price: number, matches: SimilarMatch[], series: Partial<Record<'usdKrw' | 'cnyKrw' | 'brent' | 'kcci' | 'kci', MarketPoint[]>>) {
  const base = verdictFromQuote(price, matches);
  const adjustmentPct = liveMarketAdjustmentPct(series);
  const baseline = base.baseline * (1 + adjustmentPct / 100);
  const diffPct = baseline === 0 ? 0 : ((price - baseline) / baseline) * 100;
  const absDiff = Math.abs(diffPct);
  const tone: VerdictTone = absDiff <= 0.5 * base.sigma ? 'green' : absDiff <= 1.5 * base.sigma ? 'amber' : 'red';
  const label = tone === 'green' ? '적정 수준' : tone === 'amber' ? (diffPct >= 0 ? '다소 높음' : '다소 낮음') : '확인 필요';
  return { ...base, baseline, diffPct, tone, label, adjustmentPct };
}

// 절대값(|diffPct|) 기준으로 등급을 매겨서, 시장가 대비 지나치게 낮은 견적도 이상치로 잡는다
// (2026-08-12, 팀 피드백 반영 — 기존 버전은 diffPct<=0이면 무조건 "유리한 견적"으로 판정해서,
// 원가 항목 누락 가능성이 있는 지나치게 낮은 견적을 놓쳤다).
export function verdictFromQuote(price: number, matches: SimilarMatch[]): Verdict {
  const baseline = median(matches.map((m) => m.quote.price));
  const diffPct = baseline === 0 ? 0 : ((price - baseline) / baseline) * 100;
  const sigma = sigmaFromMatches(matches, baseline);
  const absDiff = Math.abs(diffPct);
  let label: string;
  let tone: VerdictTone;
  if (absDiff <= 0.5 * sigma) {
    label = "적정 수준";
    tone = "green";
  } else if (absDiff <= 1.5 * sigma) {
    label = diffPct > 0 ? "다소 높음 — 과거 대비 다소 높은 수준" : "다소 낮음 — 비용 항목 확인 필요";
    tone = "amber";
  } else {
    label = diffPct > 0 ? "높음 — 과거 대비 높은 수준" : "낮음 — 비용 항목 누락 가능성, 확인 필요";
    tone = "red";
  }
  return { label, tone, diffPct, sigma, baseline };
}

// ── B. 시황 지표 이상탐지 — z-score + 급변 조건 ──────────────────────────────
const Z_SCORE_THRESHOLD = 2.0;
const CHANGE_PCT_THRESHOLD = 8;

export type AnomalyResult = {
  z: number;
  changePct: number;
  isAnomaly: boolean;
  direction: "up" | "down";
  latestValue: number;
};

export function detectAnomaly(series: MarketPoint[]): AnomalyResult | null {
  if (series.length < 10) return null;
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const history = series.slice(0, -1).map((p) => p.value);
  const { mean, std } = calcStats(history);
  const z = std === 0 ? 0 : (latest.value - mean) / std;
  const changePct = prev.value === 0 ? 0 : ((latest.value - prev.value) / prev.value) * 100;
  const isAnomaly = Math.abs(z) >= Z_SCORE_THRESHOLD || Math.abs(changePct) >= CHANGE_PCT_THRESHOLD;
  return { z, changePct, isAnomaly, direction: z >= 0 ? "up" : "down", latestValue: latest.value };
}

/** 시계열의 첫 값 대비 최신값 변화율 — Factor 카드의 "최근 30일" 표기용 */
export function windowChangePct(series: MarketPoint[]): number {
  if (series.length < 2) return 0;
  const first = series[0].value;
  const latest = series[series.length - 1].value;
  return first === 0 ? 0 : ((latest - first) / first) * 100;
}

// ── 보조: CaseItem의 문자열 필드(route/container)를 매칭용 구조로 분해 ──────────
export function parseRoute(route: string): { origin: string; destination: string } {
  const [origin, destination] = route.split("→").map((s) => s.trim());
  return { origin: origin ?? "", destination: destination ?? "" };
}

export function parseContainerType(container: string): string {
  // "40FT × 3" → "40FT"
  return container.split("×")[0]?.trim() ?? container;
}

/** "2026.08.10" 또는 "2026-08-24" 형식을 "YYYY-MM"으로 정규화 */
export function toTransportMonth(dateLike: string): string {
  return dateLike.replaceAll(".", "-").slice(0, 7);
}
