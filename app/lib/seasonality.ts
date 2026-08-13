// 계절성 신호 (A-6) — 캘린더 규칙, 시계열 아님. 노선과 무관하게 모든 Case에 적용한다.

export interface SeasonalSignal {
  season: 'peak' | 'normal';
  label: string;
  reason: string;
}

export function getSeasonalSignal(shipmentDateIso: string): SeasonalSignal {
  const month = new Date(shipmentDateIso).getMonth() + 1; // 1-12
  const isPeak = month === 1 || month === 2 || month === 11 || month === 12;

  if (isPeak) {
    return {
      season: 'peak',
      label: '성수기',
      reason: month <= 2 ? '중국 춘절 전후 성수기 구간입니다.' : '연말 성수기 구간입니다.',
    };
  }
  return {
    season: 'normal',
    label: '평시',
    reason: '춘절·연말 성수기에 해당하지 않는 평시 구간입니다.',
  };
}
