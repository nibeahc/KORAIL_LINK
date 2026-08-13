// 견적서 자동생성 — 구간별 원가 문서를 업로드하면 AI가 "각 구간에서 추출한 금액을 합산"해서
// 견적서 초안을 만든다. 실제 파일은 읽지 않고(documentEngine.ts와 동일한 결정론적 시뮬레이션
// 원칙), Case 식별 정보(노선·구간·컨테이너 수량)로 구간별 금액을 결정론적으로 생성한 뒤 그대로
// 합산한다 — 과거 유사 견적(historicalQuotes)은 이 합계를 "만드는 데" 쓰지 않고, A-1과 같은
// σ 판정으로 합계가 과거 대비 적정한 수준인지 "검증하는 데"만 쓴다(2026-08-12, 팀 피드백 반영
// — 이전 버전은 과거 중앙값을 구간별 비중으로 나눈 뒤 다시 합산하는 방식이라 인과관계가
// 거꾸로였다). 코레일은 경쟁하는 여러 포워더가 아니라 노선의 실제 구간마다 원가가 발생하는
// 단일 운영사 구조이므로, "여러 업체 견적을 비교"하는 게 아니라 "구간별 원가를 합산"한다는
// 점은 그대로 유지한다.

import type { HistoricalQuote } from "./marketData";
import { matchSimilarQuotes, verdictFromQuote, type QuoteQuery, type Verdict } from "./quoteEngine";
import type { RoutePath, RouteStage } from "./routeData";

export type QuoteDraftLine = { label: string; mode: string; amount: number };
export type QuoteDraft = { lines: QuoteDraftLine[]; total: number; matchCount: number; hasEnoughSamples: boolean; verdict: Verdict | null };

// 구간 종류(mode)별 기준 원가(컨테이너 1대 기준, USD) — 실제 통계가 아니라 "TCR 철도 구간이
// 가장 비싸고, 해상·환적·국내철도가 그 뒤를 따른다"는 정성적 감각을 반영한 값이다.
const STAGE_BASE_COST: Record<string, number> = {
  "코레일 철도": 260,
  "해상운송": 640,
  "TCR 환적": 1450,
  "궤간 환적": 420,
  "중국 내륙철도": 1900,
};

// 계약금액(item.price)을 구간별 비중으로 나눌 때 쓰는 정성적 가중치 — 계약 탭 별첨(B-6)·
// 정산 탭 정산 내역서(B-5)처럼 "이미 확정된 총액 하나"를 구간별로 표시만 해야 하는 화면에서
// 쓴다. 견적서 자동생성(아래 buildQuoteDraft)은 이 표를 쓰지 않는다 — 총액을 나누는 게 아니라
// 구간별로 먼저 만든 값을 더하는 방향이기 때문이다.
const STAGE_COST_WEIGHT: Record<string, number> = {
  "코레일 철도": 0.15,
  "해상운송": 0.25,
  "TCR 환적": 0.45,
  "궤간 환적": 0.15,
  "중국 내륙철도": 0.60,
};

// "최종 도착"은 비용이 발생하는 구간이 아니라 도착 지점을 표시하는 마커라서 원가 항목에서 뺀다.
export function costBearingStages(stages: RouteStage[]): RouteStage[] {
  return stages.filter((s) => s.mode !== "최종 도착");
}

// 문자열을 결정론적 0~1 값으로 바꾸는 간단한 해시 — 같은 노선·구간·컨테이너 수량이면 항상
// 같은 결과가 나오게 해서(seed 기반), marketData.ts의 시계열 생성과 같은 "결정론적 시뮬레이션"
// 원칙을 따른다. 실제 난수를 쓰지 않는다.
function seededFraction(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

// 구간 하나의 "AI 추출 금액" 시뮬레이션 — 컨테이너 수량에 비례하고, 노선·구간 조합으로
// 결정되는 ±10% 편차를 더한다(같은 노선·구간이면 항상 같은 값).
export function extractStageCost(stage: RouteStage, containerQty: number): number {
  const base = STAGE_BASE_COST[stage.mode] ?? 500;
  const jitter = 0.9 + seededFraction(`${stage.name}|${stage.mode}|${containerQty}`) * 0.2;
  return Math.round(base * Math.max(containerQty, 1) * jitter);
}

// 정해진 총액(total)을 구간별 비중(STAGE_COST_WEIGHT)에 맞춰 나눈다 — 계약 별첨·정산 내역서
// 전용. buildQuoteDraft는 쓰지 않는다(위 설명 참고).
export function splitCostByStages(total: number, stages: RouteStage[]): QuoteDraftLine[] {
  const weights = stages.map((s) => STAGE_COST_WEIGHT[s.mode] ?? 0.2);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  let running = 0;
  return stages.map((s, i) => {
    // 마지막 항목은 반올림 오차를 흡수해서 합계가 total과 정확히 같아지게 한다.
    const isLast = i === stages.length - 1;
    const amount = isLast ? total - running : Math.round((total * weights[i]) / weightSum);
    running += amount;
    return { label: s.name, mode: s.mode, amount };
  });
}

// 구간별로 먼저 금액을 만들고(extractStageCost) 그대로 합산한다. 과거 유사 견적은 총액을
// "만드는" 데 쓰지 않고, A-1과 같은 σ 판정(verdictFromQuote)으로 이 합계가 과거 대비 적정한
// 수준인지 "검증"하는 데만 쓴다 — 유사 견적이 없는 신규 노선이어도 합계 자체는 항상 계산할 수
// 있고, 다만 검증(verdict)은 못 붙인다.
export function buildQuoteDraft(query: QuoteQuery, containerQty: number, pool: HistoricalQuote[], routePath: RoutePath): QuoteDraft {
  const stages = costBearingStages(routePath.stages);
  const lines = stages.map((s) => ({ label: s.name, mode: s.mode, amount: extractStageCost(s, containerQty) }));
  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  const matches = matchSimilarQuotes(query, pool);
  const hasEnoughSamples = matches.length > 0;
  const verdict = hasEnoughSamples ? verdictFromQuote(total, matches) : null;

  return { lines, total, matchCount: matches.length, hasEnoughSamples, verdict };
}
