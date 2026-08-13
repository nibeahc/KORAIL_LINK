'use client';

import type { CompositeIndexPoint } from '../../lib/marketData';

/** 과거 시계열(±1σ 밴드) + 오늘 스냅샷을 같은 σ 단위로 점만 찍는다 — 시계열과 오늘 구간은 선으로 잇지 않는다 (A-5) */
export function IndexChart({
  points,
  todayValue,
  width = 640,
  height = 220,
}: {
  points: CompositeIndexPoint[];
  todayValue?: { value: number; color: string } | null;
  width?: number;
  height?: number;
}) {
  const padding = { top: 16, right: 56, bottom: 24, left: 16 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.index).concat(todayValue ? [todayValue.value] : []);
  const maxAbs = Math.max(1.5, ...values.map((v) => Math.abs(v)));
  const yScale = (v: number) => padding.top + innerH / 2 - (v / maxAbs) * (innerH / 2);
  const xStepCount = points.length + (todayValue ? 1 : 0) - 1 || 1;
  const xScale = (i: number) => padding.left + (i / xStepCount) * innerW;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.index)}`).join(' ');
  const bandTop = yScale(1);
  const bandBottom = yScale(-1);

  const todayX = xScale(points.length); // 시계열 다음 슬롯, 별도 구간

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* ±1σ 정상 범위 밴드 */}
      <rect x={padding.left} y={bandTop} width={innerW} height={bandBottom - bandTop} fill="#f0f0f0" />
      <line x1={padding.left} y1={yScale(0)} x2={width - padding.right} y2={yScale(0)} stroke="#d4d4d4" strokeDasharray="4 4" />

      <path d={linePath} fill="none" stroke="#171717" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={p.month} cx={xScale(i)} cy={yScale(p.index)} r={2.5} fill="#171717" />
      ))}

      {todayValue && (
        <>
          <line x1={xScale(points.length - 1)} y1={0} x2={xScale(points.length - 1)} y2={height} stroke="#e5e5e5" />
          <circle cx={todayX} cy={yScale(todayValue.value)} r={5} fill={todayValue.color} stroke="white" strokeWidth={1.5} />
          <text x={todayX} y={height - 6} textAnchor="middle" className="fill-neutral-500 text-[10px]">
            오늘
          </text>
        </>
      )}

      <text x={width - padding.right + 6} y={bandTop + 4} className="fill-neutral-400 text-[10px]">
        +1σ
      </text>
      <text x={width - padding.right + 6} y={bandBottom + 4} className="fill-neutral-400 text-[10px]">
        −1σ
      </text>
    </svg>
  );
}
