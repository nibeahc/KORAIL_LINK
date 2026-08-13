// 시황 요인 7번(계절성/성수기, 배경 조사 문서 4장) — 공개 지표가 없어 캘린더 규칙으로 모델링한다.
// 중국 춘절 전후(1~2월)와 연말 성수기(11~12월)에 물량이 몰리는 일반적인 물류 계절성 패턴을
// 그대로 적용했다. 노선(TCR 경유 여부)과 무관하게 모든 Case에 적용한다.

export type SeasonalityLevel = "high" | "normal";
export type SeasonalitySignal = { level: SeasonalityLevel; label: string; reason: string };

/** month: 1~12 */
export function seasonalityForMonth(month: number): SeasonalitySignal {
  if (month === 1 || month === 2) {
    return { level: "high", label: "춘절 성수기", reason: "중국 춘절(1~2월) 전후로 물량이 몰려 화차·선복 확보가 어려워지고 운임이 오르는 경향이 있습니다." };
  }
  if (month === 11 || month === 12) {
    return { level: "high", label: "연말 성수기", reason: "연말(11~12월) 성수기 물량 쏠림으로 화차·선복 확보가 어려워지고 운임이 오르는 경향이 있습니다." };
  }
  return { level: "normal", label: "평시", reason: "특별한 계절적 물량 쏠림 시기가 아닙니다." };
}

/** item.departure(YYYY-MM-DD)에서 월을 뽑아 계절성 신호를 계산하는 헬퍼. */
export function seasonalityForDate(dateLike: string): SeasonalitySignal {
  return seasonalityForMonth(Number(dateLike.slice(5, 7)));
}
