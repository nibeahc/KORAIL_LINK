// 견적 적정성 판정 — 동적 분산(σ) 기반, 대칭 판정 (기능_상세_스펙.md A-1)
// 유사 견적 매칭 — 가중치 기반 유사도 (A-3)

import type { HistoricalQuote } from './marketData';

export const SIMILARITY_WEIGHTS = {
  route: 0.4,
  containerType: 0.25,
  timing: 0.2,
  cargoType: 0.15,
};

export const SIMILARITY_THRESHOLD = 0.7;
export const TIMING_WINDOW_MONTHS = 6;
export const MIN_SAMPLE_SIZE = 4;
export const DEFAULT_SIGMA_PCT = 5;
export const MIN_SIGMA_PCT = 1.5;

export interface QuoteTarget {
  route: string;
  containerType: string;
  cargoType: string;
  shipmentDate: string; // YYYY-MM-DD
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs((da.getFullYear() - db.getFullYear()) * 12 + (da.getMonth() - db.getMonth()));
}

function containerTypeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const sizeA = a.match(/\d+/)?.[0];
  const sizeB = b.match(/\d+/)?.[0];
  if (sizeA && sizeA === sizeB) return 0.6; // 같은 규격(FT), HC 등 옵션만 다름
  return 0;
}

export function computeSimilarity(target: QuoteTarget, candidate: HistoricalQuote): number {
  const routeScore = target.route === candidate.route ? 1 : 0;
  const containerScore = containerTypeSimilarity(target.containerType, candidate.containerType);
  const monthsDiff = monthsBetween(target.shipmentDate, candidate.contractDate);
  const timingScore = monthsDiff > TIMING_WINDOW_MONTHS ? 0 : 1 - monthsDiff / TIMING_WINDOW_MONTHS;
  const cargoScore = target.cargoType === candidate.cargoType ? 1 : 0;

  return (
    routeScore * SIMILARITY_WEIGHTS.route +
    containerScore * SIMILARITY_WEIGHTS.containerType +
    timingScore * SIMILARITY_WEIGHTS.timing +
    cargoScore * SIMILARITY_WEIGHTS.cargoType
  );
}

export interface SimilarQuoteMatch {
  quote: HistoricalQuote;
  similarity: number;
}

/** 유사도 70% 이상 & 최근 6개월 이내 사례만 채택 (A-3) */
export function findSimilarQuotes(target: QuoteTarget, pool: HistoricalQuote[]): SimilarQuoteMatch[] {
  return pool
    .map((quote) => ({ quote, similarity: computeSimilarity(target, quote) }))
    .filter((m) => m.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type QuoteVerdict = 'appropriate' | 'slightly_high' | 'high' | 'slightly_low' | 'low' | 'insufficient_data';

export const VERDICT_LABEL: Record<QuoteVerdict, string> = {
  appropriate: '적정 수준',
  slightly_high: '다소 높음',
  high: '높음',
  slightly_low: '다소 낮음 — 비용 확인 필요',
  low: '낮음 — 비용 누락 가능성',
  insufficient_data: '비교할 과거 데이터 부족',
};

export interface QuoteValidationResult {
  baseline: number;
  sigma: number;
  diffPct: number;
  verdict: QuoteVerdict;
  sampleSize: number;
  usedDefaultSigma: boolean;
  narrative: string;
  matches: SimilarQuoteMatch[];
}

/**
 * σ 기반 견적 적정성 판정 (A-1). diffPct가 음수라고 무조건 "유리한 견적"으로 판정하지 않는다 —
 * |diffPct| 기준 대칭 판정이라 지나치게 낮은 견적도 "확인 필요"로 잡힌다.
 */
export function validateQuote(currentTotal: number, target: QuoteTarget, pool: HistoricalQuote[]): QuoteValidationResult {
  let matches = findSimilarQuotes(target, pool);

  // 유사도 기준 표본이 아예 없으면(신규 노선 등) 같은 노선의 과거 데이터로 최후 폴백한다.
  if (matches.length === 0) {
    const sameRoute = pool.filter((q) => q.route === target.route);
    if (sameRoute.length === 0) {
      return {
        baseline: 0,
        sigma: 0,
        diffPct: 0,
        verdict: 'insufficient_data',
        sampleSize: 0,
        usedDefaultSigma: true,
        narrative: '이 노선의 과거 비교 데이터가 없어 적정성을 판정할 수 없습니다. 담당자 확인이 필요합니다.',
        matches: [],
      };
    }
    matches = sameRoute.map((quote) => ({ quote, similarity: computeSimilarity(target, quote) }));
  }

  const amounts = matches.map((m) => m.quote.amount);
  const baseline = median(amounts);
  const useDefault = matches.length < MIN_SAMPLE_SIZE || baseline === 0;

  let sigma: number;
  if (useDefault) {
    sigma = DEFAULT_SIGMA_PCT;
  } else {
    const deviations = amounts.map((a) => ((a - baseline) / baseline) * 100);
    const mean = deviations.reduce((s, v) => s + v, 0) / deviations.length;
    const variance = deviations.reduce((s, v) => s + (v - mean) ** 2, 0) / deviations.length;
    sigma = Math.max(Math.sqrt(variance), MIN_SIGMA_PCT);
  }

  const diffPct = baseline === 0 ? 0 : ((currentTotal - baseline) / baseline) * 100;
  const absDiff = Math.abs(diffPct);
  const halfSigma = 0.5 * sigma;
  const oneHalfSigma = 1.5 * sigma;

  let verdict: QuoteVerdict;
  if (absDiff <= halfSigma) verdict = 'appropriate';
  else if (absDiff <= oneHalfSigma) verdict = diffPct > 0 ? 'slightly_high' : 'slightly_low';
  else verdict = diffPct > 0 ? 'high' : 'low';

  const narrative = buildNarrative(verdict);

  return { baseline, sigma, diffPct, verdict, sampleSize: matches.length, usedDefaultSigma: useDefault, narrative, matches };
}

function buildNarrative(verdict: QuoteVerdict): string {
  switch (verdict) {
    case 'appropriate':
      return '과거 유사 견적 대비 적정한 수준입니다.';
    case 'slightly_high':
      return '과거에 비해 다소 높은 견적입니다.';
    case 'high':
      return '과거에 비해 높은 견적입니다.';
    case 'slightly_low':
      return '과거에 비해 다소 낮은 견적입니다 — 비용 항목을 확인해 주세요.';
    case 'low':
      return '과거에 비해 낮은 견적입니다 — 비용 항목 누락 가능성이 있어 확인이 필요합니다.';
    case 'insufficient_data':
      return '비교할 과거 데이터가 부족합니다.';
  }
}
