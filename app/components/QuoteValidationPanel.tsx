'use client';

import type { CaseMasterData } from '../lib/types';
import {
  validateQuote,
  SIMILARITY_WEIGHTS,
  SIMILARITY_THRESHOLD,
  TIMING_WINDOW_MONTHS,
  MIN_SAMPLE_SIZE,
  VERDICT_LABEL,
  type QuoteVerdict,
} from '../lib/quoteEngine';
import { historicalQuotes, SERIES, relevantIndicatorsForRoute } from '../lib/marketData';
import { buildCausalAnalysis } from '../lib/causalAnalysis';
import { getRoute } from '../lib/routeData';

const VERDICT_COLOR: Record<QuoteVerdict, string> = {
  appropriate: 'bg-green-50 border-green-300 text-green-800',
  slightly_high: 'bg-amber-50 border-amber-300 text-amber-800',
  high: 'bg-red-50 border-red-300 text-red-800',
  slightly_low: 'bg-amber-50 border-amber-300 text-amber-800',
  low: 'bg-red-50 border-red-300 text-red-800',
  insufficient_data: 'bg-neutral-50 border-neutral-300 text-neutral-600',
};

export function QuoteValidationPanel({ masterData, total }: { masterData: CaseMasterData; total: number }) {
  const result = validateQuote(
    total,
    {
      route: masterData.destination,
      containerType: masterData.containerType,
      cargoType: masterData.cargoType,
      shipmentDate: masterData.shipmentDate,
    },
    historicalQuotes
  );

  const route = getRoute(masterData.destination);
  const relatedAnomalies = route
    ? relevantIndicatorsForRoute(route)
        .map((ind) => buildCausalAnalysis(ind, SERIES[ind]))
        .filter((a) => a.isAnomaly)
    : [];

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${VERDICT_COLOR[result.verdict]}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{VERDICT_LABEL[result.verdict]}</span>
          {result.verdict !== 'insufficient_data' && (
            <span className="text-xs">diffPct {result.diffPct >= 0 ? '+' : ''}{result.diffPct.toFixed(1)}%</span>
          )}
        </div>
        <p className="mt-1 text-sm">{result.narrative}</p>
        {result.verdict !== 'insufficient_data' && (
          <p className="mt-2 text-xs opacity-80">
            비교 기준(중앙값) ${result.baseline.toLocaleString()} · σ {result.sigma.toFixed(1)}%
            {result.usedDefaultSigma ? ' (기본값)' : ''}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">비교 조건</p>
        <ul className="mt-2 space-y-1 text-sm text-neutral-700">
          <li>노선 일치: {Math.round(SIMILARITY_WEIGHTS.route * 100)}%</li>
          <li>컨테이너 타입 일치: {Math.round(SIMILARITY_WEIGHTS.containerType * 100)}%</li>
          <li>운송 시기 유사도: {Math.round(SIMILARITY_WEIGHTS.timing * 100)}%</li>
          <li>화물 특성 유사도: {Math.round(SIMILARITY_WEIGHTS.cargoType * 100)}%</li>
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          유사도 {SIMILARITY_THRESHOLD * 100}% 이상 · 최근 {TIMING_WINDOW_MONTHS}개월 이내만 채택 · 표본{' '}
          {MIN_SAMPLE_SIZE}건 미만이면 σ 기본값({result.sampleSize}건 매칭됨)
        </p>
        <p className="mt-2 rounded bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
          위 가중치·임계값은 코레일 실거래 이력으로 검증된 값이 아닌 MVP 초기 휴리스틱입니다. 실 서비스 전환 시 재검증이 필요합니다.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">관련 시황 인과분석</p>
        {relatedAnomalies.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">이 노선과 관련해 현재 이상탐지된 시황 신호가 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {relatedAnomalies.map((a) => (
              <li key={a.indicator} className="text-sm text-neutral-700">
                {a.narrative}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
