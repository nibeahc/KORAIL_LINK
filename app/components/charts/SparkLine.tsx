'use client';

import type { MarketPoint } from '../../lib/marketData';

export function SparkLine({ series, isAnomaly, width = 160, height = 44 }: { series: MarketPoint[]; isAnomaly?: boolean; width?: number; height?: number }) {
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - ((v - min) / range) * height}`).join(' ');
  const lastX = (values.length - 1) * step;
  const lastY = height - ((values[values.length - 1] - min) / range) * height;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke={isAnomaly ? '#dc2626' : '#525252'} strokeWidth={1.75} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={isAnomaly ? '#dc2626' : '#525252'} />
    </svg>
  );
}
