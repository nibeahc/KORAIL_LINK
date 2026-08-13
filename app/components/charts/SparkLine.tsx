'use client';

import type { MarketPoint } from '../../lib/marketData';

export function SparkLine({ series, isAnomaly, height = 25 }: { series: MarketPoint[]; isAnomaly?: boolean; height?: number }) {
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const W = 300;
  const pts = series.map((p, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(height - ((p.value - min) / (max - min)) * height).toFixed(1)}`).join(' ');
  const lastY = height - ((values[values.length - 1] - min) / (max - min)) * height;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={isAnomaly ? '#d93d42' : '#5a87d4'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={lastY} r="3" fill={isAnomaly ? '#d93d42' : '#5a87d4'} />
    </svg>
  );
}
