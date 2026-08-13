// 정산 도우미(구 이의제기 챗봇)의 규칙 기반 폴백 — LLM 호출(app/api/dispute-chat)이 실패했을 때만 쓰인다.
// 키워드 매칭으로 이미 계산된 판정 근거를 인용해 답한다 (B-8). causalAnalysis.ts와 같은 "결정론적 템플릿" 철학이다.

import type { InvoiceSummary } from './settlementEngine';
import type { NewsArticle } from './newsData';

export interface DisputeContext {
  quoteVerdictNarrative: string;
  causalNarratives: string[];
  invoiceSummary: InvoiceSummary;
  delayRelatedNews: NewsArticle[];
}

export interface DisputeAnswer {
  text: string;
  evidence: string[];
}

const FALLBACK: DisputeAnswer = { text: '정확한 답변을 드리기 어렵습니다. 담당자에게 문의해주세요.', evidence: [] };

export function answerDispute(question: string, ctx: DisputeContext): DisputeAnswer {
  const q = question.trim();

  if (/비싸|높|이상/.test(q)) {
    const parts = [ctx.quoteVerdictNarrative, ...ctx.causalNarratives];
    return { text: parts.join(' '), evidence: ['견적 적정성 판정(σ)', ...(ctx.causalNarratives.length > 0 ? ['시황 인과분석'] : [])] };
  }

  if (/차액|얼마|왜\s*달라|다르/.test(q)) {
    const newItems = ctx.invoiceSummary.comparison.filter((r) => r.category === 'new_item').map((r) => r.description).filter(Boolean);
    const diffText =
      ctx.invoiceSummary.totalDiff === 0
        ? 'Invoice 총액과 계약 총액이 일치합니다.'
        : `Invoice 총액이 계약 총액 대비 $${Math.abs(ctx.invoiceSummary.totalDiff).toLocaleString()} ${ctx.invoiceSummary.totalDiff > 0 ? '많습니다' : '적습니다'}.`;
    const newItemText = newItems.length > 0 ? ` 계약에 없던 신규 항목: ${newItems.join(', ')}.` : '';
    return { text: diffText + newItemText, evidence: ['Invoice-계약 항목별 대조 결과'] };
  }

  if (/늦|지연/.test(q)) {
    if (ctx.delayRelatedNews.length === 0) return FALLBACK;
    const text = ctx.delayRelatedNews.map((n) => n.title).join(' / ');
    return { text, evidence: ['관련 노선 뉴스(TCR·연운항)'] };
  }

  return FALLBACK;
}
