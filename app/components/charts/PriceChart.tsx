'use client';

export function PriceChart({ current, values, baseline }: { current: number; values: number[]; baseline: number }) {
  const all = [...values, current, baseline];
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  const pad = Math.max((dataMax - dataMin) * 0.2, 100);
  const lo = Math.floor((dataMin - pad) / 100) * 100;
  const hi = Math.ceil((dataMax + pad) / 100) * 100;
  const pos = (n: number) => Math.max(4, Math.min(96, ((n - lo) / (hi - lo)) * 100));
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(lo + ((hi - lo) / 5) * i));
  const rangeMin = values.length ? Math.min(...values) : current;
  const rangeMax = values.length ? Math.max(...values) : current;

  return (
    <div className="chart">
      <div className="current-label" style={{ left: `${pos(current)}%` }}>
        <b>${current.toLocaleString()}</b>
        <span>현재</span>
      </div>
      <div className="axis">
        <i className="range" />
        <span className="median" style={{ left: `${pos(baseline)}%` }} />
        <span className="current-mark" style={{ left: `${pos(current)}%` }}>
          ▲
        </span>
        {values.map((v, i) => (
          <span className="history-dot" key={i} style={{ left: `${pos(v)}%`, top: `${i % 2 ? 43 : 35}px` }} title={`$${v.toLocaleString()}`} />
        ))}
      </div>
      <div className="ticks">
        {ticks.map((t, i) => (
          <span key={i}>${t.toLocaleString()}</span>
        ))}
      </div>
      <div className="distribution">
        <span style={{ left: `${pos(rangeMin)}%`, width: `${pos(rangeMax) - pos(rangeMin)}%`, whiteSpace: 'nowrap' }}>
          {rangeMin === rangeMax ? `유사 견적 $${rangeMin.toLocaleString()} (1건)` : `유사 견적 범위 $${rangeMin.toLocaleString()} – $${rangeMax.toLocaleString()}`}
        </span>
      </div>
    </div>
  );
}
