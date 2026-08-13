// TASK 06(계약-운임-정산 AX) 대응 — 세금계산서 자동 생성 시뮬레이션.
// 실제 국세청 홈택스 연동이 아니라, Invoice 정산 대조 결과(documentEngine.ts의
// buildInvoiceComparison)를 그대로 재사용해 세금계산서 미리보기를 결정론적으로 만든다.
// 별도 데이터소스를 두지 않으므로 정산 화면과 세금계산서 금액이 항상 일치한다.

import type { CaseItem } from "./types";
import type { InvoiceComparison } from "./documentEngine";

export type TaxInvoice = {
  issueDate: string;
  supplierName: string;
  supplierBizNo: string;
  buyerName: string;
  buyerBizNo: string;
  itemDescription: string;
  taxType: "영세율" | "일반과세";
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
};

// Case 관련 문자열(이름)에서 결정론적으로 숫자를 뽑아 목업 사업자번호를 만든다 —
// 매번 같은 이름이면 같은 번호가 나온다(랜덤 아님).
function mockBizNo(seed: string): string {
  const n = seed.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const a = String(100 + (n % 900)).padStart(3, "0");
  const b = String(10 + (n % 90)).padStart(2, "0");
  const c = String(10000 + (n % 90000)).padStart(5, "0");
  return `${a}-${b}-${c}`;
}

// 부가가치세법상 국외공급 용역·외국항행용역 등은 영세율(과세표준 × 0%) 적용 대상이며,
// KORAIL LINK의 핵심 시나리오(국제복합운송)가 여기 해당한다. 그래서 고정 10%를 기계적으로
// 적용하지 않고 기본값을 영세율로 둔다(2026-08-12, 팀 피드백 반영). 실제 과세유형 판단(부수
// 용역 포함 여부·계약조건 등)은 세무 담당자 확인이 필요하다는 점을 화면에 함께 표시한다.
export function buildTaxInvoice(item: CaseItem, invoice: InvoiceComparison): TaxInvoice {
  const supplyAmount = invoice.invoiceTotal;
  const taxType: "영세율" | "일반과세" = "영세율";
  const taxAmount = taxType === "영세율" ? 0 : Math.round(supplyAmount * 0.1);
  return {
    issueDate: item.date,
    supplierName: item.forwarder,
    supplierBizNo: mockBizNo(item.forwarder),
    buyerName: item.shipper,
    buyerBizNo: mockBizNo(item.shipper),
    itemDescription: `국제운송용역 (${item.route})`,
    taxType,
    supplyAmount,
    taxAmount,
    totalAmount: supplyAmount + taxAmount,
  };
}
