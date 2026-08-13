'use client';

import { SparkLine } from './charts/SparkLine';
import { detectAnomaly, INDICATOR_LABEL, SERIES, type IndicatorKey } from '../lib/marketData';

function formatValue(indicator: IndicatorKey, value: number): string {
  if (indicator === 'usdUzs') return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  if (indicator === 'brent') return `$${value.toFixed(2)}`;
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MarketCard({ indicator, onClick }: { indicator: IndicatorKey; onClick?: (indicator: IndicatorKey) => void }) {
  const series = SERIES[indicator];
  const anomaly = detectAnomaly(series);

  return (
    <button type="button" className="market" onClick={() => onClick?.(indicator)}>
      <span>{INDICATOR_LABEL[indicator]}</span>
      <b>{formatValue(indicator, anomaly.latest)}</b>
      <em className={anomaly.changePct >= 0 ? 'up' : 'down'}>
        {anomaly.changePct >= 0 ? '+' : '−'}
        {Math.abs(anomaly.changePct).toFixed(1)}%
      </em>
      <SparkLine series={series} isAnomaly={anomaly.isAnomaly} />
    </button>
  );
}
