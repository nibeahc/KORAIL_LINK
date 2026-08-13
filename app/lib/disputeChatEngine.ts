// TASK 06(계약-운임-정산 AX) 대응 — 이의제기 챗봇 시뮬레이션.
// 실제 LLM 호출이 아니라, 이미 계산되어 있는 판정 근거(quoteEngine의 σ 판정,
// causalAnalysis의 인과분석, documentEngine의 Invoice 차액)를 키워드 매칭으로 불러와
// 답한다 — causalAnalysis.ts의 "결정론적 문장 생성" 철학을 그대로 따른다.
// 매칭 실패 시 없는 답을 지어내지 않고 담당자 문의를 안내한다.

import type { CaseItem } from "./types";
import type { InvoiceComparison } from "./documentEngine";
import type { Verdict } from "./quoteEngine";
import type { QuotePressureAnalysis } from "./causalAnalysis";

export type ChatMessage = { role: "user" | "bot"; text: string };

const PRICE_KEYWORDS = ["비싸", "높", "이상", "왜 이렇게", "적정"];
const DIFF_KEYWORDS = ["차액", "얼마", "달라", "차이"];
const DELAY_KEYWORDS = ["늦", "지연", "언제"];

export function answerDispute(
  question: string,
  item: CaseItem,
  verdict: Verdict,
  pressure: QuotePressureAnalysis,
  invoice: InvoiceComparison
): string {
  const q = question.toLowerCase();

  if (PRICE_KEYWORDS.some((k) => q.includes(k))) {
    const diffLabel = `${verdict.diffPct >= 0 ? "+" : ""}${verdict.diffPct.toFixed(1)}%`;
    return `${item.id} 견적은 코레일 내부 유사 견적 중앙값 대비 ${diffLabel} 수준입니다(σ=${verdict.sigma.toFixed(1)}%). ${pressure.explanation}`;
  }

  if (DIFF_KEYWORDS.some((k) => q.includes(k))) {
    if (!invoice.isMismatch) return `계약금액과 Invoice 총액이 일치합니다(${invoice.contractAmount.toLocaleString()} USD). 차액이 없습니다.`;
    const newItems = invoice.lineItems.filter((l) => l.isNew).map((l) => l.label).join(", ");
    return `Invoice 총액이 계약금액 대비 ${invoice.diff >= 0 ? "+" : ""}${invoice.diff.toLocaleString()} USD 차이가 있습니다. 신규 항목: ${newItems || "없음"}.`;
  }

  if (DELAY_KEYWORDS.some((k) => q.includes(k))) {
    return pressure.matchedNews.length > 0
      ? `관련 이슈: ${pressure.matchedNews.map((n) => n.title).join(" · ")}`
      : "현재 이 노선과 관련해 확인된 지연 이슈가 없습니다.";
  }

  return "정확한 답변을 드리기 어렵습니다. 담당자에게 문의해주세요.";
}
