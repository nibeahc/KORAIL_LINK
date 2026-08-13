// Invoice·정산 검증 — Cost Ledger 기준 라인별 대조 (기능_상세_스펙.md B-5)
// 1차 기준은 계약 총액 vs Invoice 총액이 아니라 Cost Ledger(계약 기준 항목) vs Invoice 라인아이템의 항목별 비교다.

import type { CostLedgerLine, InvoiceLineItem } from './types';

export type MatchCategory = 'match' | 'confirm_needed' | 'new_item' | 'missing' | 'uncertain_match';

export const MATCH_CATEGORY_LABEL: Record<MatchCategory, string> = {
  match: '일치',
  confirm_needed: '확인 필요',
  new_item: '계약 미등록 신규 항목',
  missing: '미청구/누락 확인',
  uncertain_match: '매칭 확인 필요',
};

export interface LineMatchResult {
  category: MatchCategory;
  stageName?: string;
  description?: string;
  contractAmount?: number;
  invoiceAmount?: number;
  diff?: number;
}

export function buildInvoiceComparison(costLedger: CostLedgerLine[], invoiceLines: InvoiceLineItem[]): LineMatchResult[] {
  const results: LineMatchResult[] = [];
  const matchedStageIds = new Set<string>();

  for (const inv of invoiceLines) {
    if (inv.matchedStageId) {
      const ledgerLine = costLedger.find((l) => l.stageId === inv.matchedStageId);
      if (!ledgerLine) {
        results.push({ category: 'new_item', description: inv.description, invoiceAmount: inv.amount });
        continue;
      }
      matchedStageIds.add(inv.matchedStageId);
      const diff = inv.amount - ledgerLine.contractAmount;
      results.push({
        category: diff === 0 ? 'match' : 'confirm_needed',
        stageName: ledgerLine.stageName,
        contractAmount: ledgerLine.contractAmount,
        invoiceAmount: inv.amount,
        diff,
      });
    } else if (inv.uncertain) {
      results.push({ category: 'uncertain_match', description: inv.description, invoiceAmount: inv.amount });
    } else {
      results.push({ category: 'new_item', description: inv.description, invoiceAmount: inv.amount });
    }
  }

  for (const line of costLedger) {
    if (!matchedStageIds.has(line.stageId)) {
      results.push({ category: 'missing', stageName: line.stageName, contractAmount: line.contractAmount });
    }
  }

  return results;
}

export interface InvoiceSummary {
  invoiceTotal: number;
  contractTotal: number;
  totalDiff: number;
  diffCount: number;
  newItemCount: number;
  comparison: LineMatchResult[];
}

export function buildInvoiceSummary(costLedger: CostLedgerLine[], invoiceLines: InvoiceLineItem[]): InvoiceSummary {
  const comparison = buildInvoiceComparison(costLedger, invoiceLines);
  const invoiceTotal = invoiceLines.reduce((sum, l) => sum + l.amount, 0);
  const contractTotal = costLedger.reduce((sum, l) => sum + l.contractAmount, 0);
  return {
    invoiceTotal,
    contractTotal,
    totalDiff: invoiceTotal - contractTotal,
    diffCount: comparison.filter((r) => r.category === 'confirm_needed').length,
    newItemCount: comparison.filter((r) => r.category === 'new_item').length,
    comparison,
  };
}

/**
 * Invoice 문서 추출 시뮬레이션(Phase 4와 같은 방식 — 실제 파일 내용은 읽지 않는다) — Cost Ledger를
 * 바탕으로 5가지 판정 케이스(일치/확인필요/신규항목/누락/매칭불확실)가 전부 재현되는 기본 초안을 만든다.
 * 업로드 후에는 편집 가능하므로 테스터가 직접 다른 시나리오를 구성해 재검증할 수도 있다.
 */
export function buildInvoiceDraft(costLedger: CostLedgerLine[]): InvoiceLineItem[] {
  if (costLedger.length === 0) return [];

  const lines: InvoiceLineItem[] = [];
  const transloadIdx = costLedger.findIndex((l) => l.mode === '환적료');
  const perturbIdx = transloadIdx >= 0 ? transloadIdx : Math.min(1, costLedger.length - 1);
  const missingIdx = costLedger.length > 2 ? 0 : -1; // 표본이 너무 작으면 누락 케이스는 생략

  costLedger.forEach((line, idx) => {
    if (idx === missingIdx) return; // 미청구/누락 확인 케이스 — 의도적으로 Invoice에서 빠뜨림
    const amount = idx === perturbIdx ? line.contractAmount + 50 : line.contractAmount;
    lines.push({ id: `inv-${line.stageId}`, description: line.stageName, amount, matchedStageId: line.stageId });
  });

  const total = costLedger.reduce((sum, l) => sum + l.contractAmount, 0);
  lines.push({ id: 'inv-doc-fee', description: '서류비', amount: 30 });
  lines.push({ id: 'inv-misc', description: '기타 운송 관련 비용', amount: Math.round(total * 0.05), uncertain: true });

  return lines;
}
