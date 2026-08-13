'use client';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, size = 140 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e5e5e5" strokeWidth={16} />
        {total > 0 &&
          segments.map((seg) => {
            if (seg.value === 0) return null;
            const fraction = seg.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={seg.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={16}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
            offset += dash;
            return circle;
          })}
        <text x={center} y={center - 2} textAnchor="middle" className="fill-neutral-900 text-lg font-semibold">
          {total}
        </text>
        <text x={center} y={center + 16} textAnchor="middle" className="fill-neutral-400 text-[10px]">
          건
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-neutral-600">{seg.label}</span>
            <span className="font-medium text-neutral-900">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
