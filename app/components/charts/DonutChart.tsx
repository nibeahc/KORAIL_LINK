'use client';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, size = 140, thickness = 20 }: { segments: DonutSegment[]; size?: number; thickness?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const arcTotal = total || 1; // 0으로 나누기 방지용 — 화면 표시값(total)에는 쓰지 않는다
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<Array<DonutSegment & { dash: number; offset: number }>>((acc, s) => {
      const dash = (s.value / arcTotal) * c;
      const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
      return [...acc, { ...s, dash, offset }];
    }, []);

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
      </svg>
      <div className="donut-center">
        <b>{total}</b>
        <span>전체 건</span>
      </div>
    </div>
  );
}
