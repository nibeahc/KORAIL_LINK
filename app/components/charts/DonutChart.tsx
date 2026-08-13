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
  let offset = 0;

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const dash = (s.value / arcTotal) * c;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })}
        </g>
      </svg>
      <div className="donut-center">
        <b>{total}</b>
        <span>전체 건</span>
      </div>
    </div>
  );
}
