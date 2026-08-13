'use client';

import { SparkLine } from './charts/SparkLine';
import { detectAnomaly, INDICATOR_LABEL, IS_INVERTED_VS_KRW, SERIES, type IndicatorKey } from '../lib/marketData';

function formatValue(indicator: IndicatorKey, value: number): string {
  if (indicator === 'usdUzs') return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function MarketCard({ indicator, onClick }: { indicator: IndicatorKey; onClick?: (indicator: IndicatorKey) => void }) {
  const series = SERIES[indicator];
  const anomaly = detectAnomaly(series);
  const inverted = IS_INVERTED_VS_KRW[indicator];

  return (
    <button
      type="button"
      onClick={() => onClick?.(indicator)}
      className={`w-full rounded-lg border p-4 text-left transition ${
        anomaly.isAnomaly ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-white hover:border-neutral-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500">{INDICATOR_LABEL[indicator]}</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatValue(indicator, anomaly.latest)}</p>
        </div>
        {anomaly.isAnomaly && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">이상탐지</span>
        )}
      </div>
      <div className="mt-2">
        <SparkLine series={series} isAnomaly={anomaly.isAnomaly} />
      </div>
      <p className={`mt-1 text-xs ${anomaly.changePct >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
        전일 대비 {anomaly.changePct >= 0 ? '+' : ''}
        {anomaly.changePct.toFixed(2)}%
      </p>
      {inverted && <p className="mt-1 text-[10px] text-neutral-400">1 USD = 몇 현지통화 기준 · 값 상승 = 현지통화 약세</p>}
    </button>
  );
}
