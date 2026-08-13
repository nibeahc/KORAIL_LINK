// 이상탐지 결과와 뉴스를 엮어 "인과분석" 문단을 만든다.
// 실제 LLM 호출 없이 결정론적 템플릿으로 생성하지만, 문구 구조는 HAERO의
// detect-and-analyze 함수가 Claude에게 요구했던 출력 형식(설명·감성방향·강도·근거뉴스 유무)을
// 그대로 따른다 — 근거 뉴스가 있으면 사실 기반 설명, 없으면 "[추정]"을 붙여 일반론으로 낮춘다.

import type { AnomalyResult } from "./quoteEngine";
import type { NewsArticle } from "./newsData";

export type SentimentDirection = "up_pressure" | "down_pressure" | "neutral";
export type SentimentStrength = "weak" | "medium" | "strong";
export type Confidence = "news_based" | "estimated" | "none";

export type CausalAnalysis = {
  confidence: Confidence;
  explanation: string;
  matchedNews: NewsArticle[];
  sentimentDirection: SentimentDirection;
  sentimentStrength: SentimentStrength;
};

export function matchNewsForIndicator(indicator: "usdKrw" | "brent" | "cnyKrw" | "kztUsd" | "uzsUsd" | "kgsUsd" | "kcci" | "kci", articles: NewsArticle[], limit = 3): NewsArticle[] {
  return articles
    .filter((a) => a.indicator === indicator)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function buildCausalAnalysis(name: string, indicator: "usdKrw" | "brent" | "cnyKrw" | "kztUsd" | "uzsUsd" | "kgsUsd" | "kcci" | "kci", anomaly: AnomalyResult | null, articles: NewsArticle[]): CausalAnalysis {
  const matched = matchNewsForIndicator(indicator, articles);

  if (!anomaly) {
    return { confidence: "none", explanation: `${name} 데이터가 충분하지 않아 분석할 수 없습니다.`, matchedNews: [], sentimentDirection: "neutral", sentimentStrength: "weak" };
  }

  const changeLabel = `${anomaly.changePct >= 0 ? "+" : ""}${anomaly.changePct.toFixed(1)}%`;

  if (!anomaly.isAnomaly) {
    return {
      confidence: "estimated",
      explanation: `${name}은(는) 최근 평균 대비 정상 범위(z=${anomaly.z.toFixed(1)}) 내에서 움직이고 있습니다. 전일 대비 ${changeLabel} 변동으로, 특별히 주목할 이슈는 확인되지 않았습니다.`,
      matchedNews: matched,
      sentimentDirection: "neutral",
      sentimentStrength: "weak",
    };
  }

  const direction: SentimentDirection = anomaly.z >= 0 ? "up_pressure" : "down_pressure";
  const strength: SentimentStrength = Math.abs(anomaly.z) >= 3 ? "strong" : Math.abs(anomaly.z) >= 2 ? "medium" : "weak";
  const directionLabel = direction === "up_pressure" ? "상승" : "하락";

  if (matched.length > 0) {
    return {
      confidence: "news_based",
      explanation: `${name}이(가) 최근 평균 대비 통계적으로 유의미하게 ${directionLabel}했습니다(z=${anomaly.z.toFixed(1)}, 전일 대비 ${changeLabel}). 같은 기간 "${matched[0].title}" 등의 이슈가 확인되어, 이 변동과 관련이 있을 수 있는 요인으로 참고할 수 있습니다.`,
      matchedNews: matched,
      sentimentDirection: direction,
      sentimentStrength: strength,
    };
  }

  return {
    confidence: "estimated",
    explanation: `[추정] ${name}이(가) 최근 평균 대비 ${directionLabel}했습니다(z=${anomaly.z.toFixed(1)}, 전일 대비 ${changeLabel}). 직접적으로 연결되는 뉴스가 확인되지 않아, 일반적 시장 요인에 따른 변동으로 추정됩니다.`,
    matchedNews: [],
    sentimentDirection: direction,
    sentimentStrength: strength,
  };
}

// ── 견적 자체의 상승/하락 압력 인과분석 ──────────────────────────────────
// buildCausalAnalysis가 지표 하나(USD/KRW 등)를 설명한다면, 이건 "이 견적이 왜
// 과거 대비 높거나 낮은가"를 노선 관련 지표들을 종합해 설명한다. 방향이 견적의
// 변동 방향과 일치하는 이상탐지 지표만 원인 후보로 채택한다(무관한 지표를 끌어다
// 붙이지 않기 위함).

export type IndicatorInput = { key: "usdKrw" | "brent" | "cnyKrw" | "kztUsd"; label: string; anomaly: AnomalyResult | null };

export type QuotePressureAnalysis = {
  direction: SentimentDirection;
  explanation: string;
  drivers: { label: string; z: number }[];
  matchedNews: NewsArticle[];
};

const FLAT_THRESHOLD_PCT = 0.5;

export function buildQuotePressureAnalysis(diffPct: number, indicators: IndicatorInput[], articles: NewsArticle[]): QuotePressureAnalysis {
  if (Math.abs(diffPct) < FLAT_THRESHOLD_PCT) {
    return {
      direction: "neutral",
      explanation: `현재 견적은 과거 유사 사례 대비 뚜렷한 상승·하락 없이 안정적인 수준입니다.`,
      drivers: [],
      matchedNews: [],
    };
  }

  const direction: SentimentDirection = diffPct > 0 ? "up_pressure" : "down_pressure";
  const directionLabel = direction === "up_pressure" ? "상승" : "하락";

  // 견적의 변동 방향과 같은 방향으로 움직인 이상탐지 지표만 원인 후보로 채택한다.
  const drivers = indicators.filter((i) => i.anomaly?.isAnomaly && (direction === "up_pressure") === (i.anomaly.z >= 0));

  if (drivers.length === 0) {
    return {
      direction,
      explanation: `현재 견적은 과거 유사 사례 대비 ${directionLabel}한 수준이지만, 이 방향과 뚜렷하게 연결되는 시장 변동 요인은 확인되지 않았습니다. 포워더의 개별 정책이나 협상 조건 차이일 가능성이 있습니다.`,
      drivers: [],
      matchedNews: [],
    };
  }

  const matchedNews = drivers.flatMap((d) => matchNewsForIndicator(d.key, articles, 1));
  const driverLabels = drivers.map((d) => d.label).join(", ");
  const newsPart = matchedNews.length > 0 ? ` 같은 기간 "${matchedNews[0].title}" 등의 이슈도 함께 확인됩니다.` : "";

  return {
    direction,
    explanation: `현재 견적은 과거 유사 사례 대비 ${directionLabel}한 수준으로 확인되며, 같은 기간 ${driverLabels} 변동이 함께 관찰되어 이 요인 때문에 ${directionLabel}했을 가능성이 있습니다.${newsPart}`,
    drivers: drivers.map((d) => ({ label: d.label, z: d.anomaly!.z })),
    matchedNews,
  };
}

// 해상–철도 대체수요(배경 조사 4장 요인 6) — 해상운임 지수 추세와 현재 견적의 σ 판정 방향을
// 함께 보고, 대체재 관계에서 오는 압력 방향을 서술한다. 별도 지표를 새로 만들지 않고
// marketData.ts의 KCI(한중항로) 추세(windowChangePct)를 그대로 재사용한다 — 근해항로
// 개별수급(요인 8)과 대체수요(요인 6)가 결국 같은 구간의 수급 상황에서 파생되기 때문이다.
// KCCI(종합)가 아니라 KCI를 쓰는 이유: KCCI는 부산발 13개 항로를 종합한 지수라 중국행
// 항로 하나에 특정된 흐름을 보기엔 노선 특정성이 없다. KCI(한중항로 서브지수)는 부산–중국
// 항로 전반의 참고 벤치마크이며, 연운항 단일 항만의 개별 수급을 직접 나타내는 것은 아니다
// (2026-08-12, 팀 피드백 반영 — KOBC 공식 설명 기준).
export function buildSubstitutionSignal(kciWindowPct: number, quoteDiffPct: number): string {
  if (kciWindowPct >= 3) {
    return quoteDiffPct > 0
      ? "해상운임 지수가 최근 상승 추세라, 해상 대비 철도 이용 수요가 늘며 철도 운임에도 상승 압력이 있을 수 있습니다."
      : "해상운임 지수는 상승 추세이나 이 견적은 아직 그 압력이 반영되지 않은 수준입니다.";
  }
  if (kciWindowPct <= -3) {
    return "해상운임 지수가 최근 하락 추세라, 철도 대비 해상 가격 매력이 커지며 철도 운임에는 하방 압력이 있을 수 있습니다.";
  }
  return "해상운임 지수는 최근 뚜렷한 추세 없이 안정적입니다.";
}
