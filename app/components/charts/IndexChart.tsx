'use client';

import type { CompositeIndexPoint } from '../../lib/marketData';

const toneColor = (tone: string) => (tone === 'green' ? '#1f8a5b' : tone === 'amber' ? '#d78516' : '#d93d42');

export interface TodayPoint {
  id: string;
  z: number;
  tone: string;
}

/** 과거 시계열(±1σ 밴드)과 오늘 스냅샷을 같은 σ 단위로, 구간을 나눠 분리 표시한다 (A-5) */
export function IndexChart({ monthly, todayPoints }: { monthly: CompositeIndexPoint[]; todayPoints: TodayPoint[] }) {
  const W = 560;
  const H = 150;
  const pad = 14;
  const allZ = [...monthly.map((m) => m.index), ...todayPoints.map((p) => p.z), 1, -1];
  const maxAbs = Math.max(...allZ.map(Math.abs), 1.5);
  const y = (z: number) => H / 2 - (z / maxAbs) * (H / 2 - pad);
  const histW = W * 0.6;
  const todayW = W - histW - 24;
  const xOf = (i: number) => (monthly.length > 1 ? (i / (monthly.length - 1)) * (histW - 20) + 10 : histW / 2);
  const linePts = monthly.map((m, i) => `${xOf(i).toFixed(1)},${y(m.index).toFixed(1)}`).join(' ');
  const areaPts = monthly.length ? `${xOf(0).toFixed(1)},${y(0).toFixed(1)} ${linePts} ${xOf(monthly.length - 1).toFixed(1)},${y(0).toFixed(1)}` : '';
  const todayX = (i: number) => histW + 24 + (todayPoints.length > 1 ? (i / (todayPoints.length - 1)) * (todayW - 20) : todayW / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="index-chart">
      <rect x={0} y={y(1)} width={W} height={Math.max(y(-1) - y(1), 1)} fill="#eef4fd" opacity={0.6} />
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#dde3ea" strokeDasharray="3 3" />
      <line x1={histW + 10} x2={histW + 10} y1={pad} y2={H - pad} stroke="#e5eaf1" />
      {monthly.length > 0 && <polygon points={areaPts} fill="#c7d9f5" opacity={0.5} />}
      {monthly.length > 0 && <polyline points={linePts} fill="none" stroke="#2c4870" strokeWidth={2} />}
      {monthly.map((m, i) => (
        <circle key={m.month} cx={xOf(i)} cy={y(m.index)} r={3} fill="#2c4870" />
      ))}
      {todayPoints.map((p, i) => (
        <circle key={p.id} cx={todayX(i)} cy={y(p.z)} r={4.5} fill={toneColor(p.tone)} stroke="white" strokeWidth={1.5} />
      ))}
      {monthly.map((m, i) => (
        <text key={m.month} x={xOf(i)} y={H + 13} textAnchor="middle" className="index-x-label">
          {Number(m.month.slice(5))}월
        </text>
      ))}
      <text x={histW + 24 + todayW / 2} y={H + 13} textAnchor="middle" className="index-x-label index-today-label">
        오늘
      </text>
    </svg>
  );
}
