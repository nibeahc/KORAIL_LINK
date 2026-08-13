// 시황 인과분석 — 이상탐지 결과 + 뉴스를 엮어 결정론적 템플릿으로 문장을 생성한다.
// 실제 LLM 호출이 아니다 (마스터 컨텍스트 비타협 원칙 8). Phase 5의 이의제기 챗봇이 이 함수를 재사용한다.

import { detectAnomaly, windowChangePct, INDICATOR_LABEL, type IndicatorKey, type MarketPoint } from './marketData';
import { matchNewsForIndicator, type NewsArticle } from './newsData';

export interface CausalAnalysis {
  indicator: IndicatorKey;
  label: string;
  isAnomaly: boolean;
  zScore: number;
  changePct: number;
  relatedNews: NewsArticle[];
  narrative: string;
}

export function buildCausalAnalysis(indicator: IndicatorKey, series: MarketPoint[]): CausalAnalysis {
  const anomaly = detectAnomaly(series);
  const relatedNews = matchNewsForIndicator(indicator, 3);
  const label = INDICATOR_LABEL[indicator];
  const direction = anomaly.zScore >= 0 ? '상승' : '하락';

  let narrative: string;
  if (anomaly.isAnomaly && relatedNews.length > 0) {
    narrative = `${label}이(가) 최근 30일 평균 대비 ${direction} 흐름을 보이고 있습니다(z-score ${anomaly.zScore.toFixed(2)}). 관련 뉴스: "${relatedNews[0].title}".`;
  } else if (anomaly.isAnomaly) {
    narrative = `${label}이(가) 최근 30일 평균 대비 ${direction} 흐름을 보이고 있습니다(z-score ${anomaly.zScore.toFixed(2)}). 직접 연관된 뉴스는 아직 확인되지 않았습니다.`;
  } else {
    narrative = `${label}은(는) 최근 30일 평균 대비 안정적인 범위 안에 있습니다.`;
  }

  return {
    indicator,
    label,
    isAnomaly: anomaly.isAnomaly,
    zScore: anomaly.zScore,
    changePct: anomaly.changePct,
    relatedNews,
    narrative,
  };
}

export interface SubstitutionSignal {
  trendDirection: '상승' | '하락' | '보합';
  windowChangePct: number;
  narrative: string;
}

/**
 * 해상-철도 대체수요 서술 (A-7, 요인 6) — KCI(한중항로) 추세만으로 1차 서술을 만든다.
 * Phase 2에서 Case의 σ 판정 방향(diffPct)을 함께 넘기면 더 구체적인 문장으로 확장할 수 있다.
 */
export function buildSubstitutionSignal(kciSeries: MarketPoint[], diffPctDirection?: 'up' | 'down'): SubstitutionSignal {
  const change = windowChangePct(kciSeries, 14);
  const trendDirection = change > 1 ? '상승' : change < -1 ? '하락' : '보합';

  let narrative: string;
  if (trendDirection === '상승') {
    narrative = 'KCI(한중항로) 해상운임이 최근 상승 추세입니다. 해상운임 상승으로 철도 대체수요가 늘며 철도 운임에도 상승 압력이 있을 수 있습니다.';
  } else if (trendDirection === '하락') {
    narrative = 'KCI(한중항로) 해상운임이 최근 하락 추세입니다. 해상 대비 철도의 가격 매력이 커지는 국면일 수 있습니다.';
  } else {
    narrative = 'KCI(한중항로) 해상운임이 최근 뚜렷한 추세 없이 보합권입니다.';
  }
  if (diffPctDirection === 'up' && trendDirection === '상승') {
    narrative += ' 현재 견적도 과거 대비 높은 쪽으로 판정되어 같은 방향의 신호입니다.';
  }

  return { trendDirection, windowChangePct: change, narrative };
}
