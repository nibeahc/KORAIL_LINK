// 세금계산서 자동 생성 (기능_상세_스펙.md B-7) — Invoice 정산 대조 결과를 그대로 활용한다.
// 실제 국세청 홈택스 연동이 아니라 미리보기 시뮬레이션이다.

import type { TaxInvoice } from './types';

function hashBusinessNumber(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const digits = Math.abs(hash).toString().padStart(9, '0').slice(0, 9);
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

const SUPPLIER_NAME = '한국철도공사';

/**
 * 과세유형 기본값은 영세율(세액 0원)이다 — 국외공급·외국항행용역(국제복합운송)은 영세율 대상이라
 * 공급가액의 10%를 기계적으로 계산하지 않는다. 공급가액은 정산 화면의 Invoice 총액과 항상 같은
 * 소스(invoiceTotal 인자)를 그대로 쓴다 — 별도 데이터소스를 두지 않는다.
 */
export function buildTaxInvoice(shipperName: string, invoiceTotal: number): TaxInvoice {
  return {
    id: crypto.randomUUID(),
    issuedDate: new Date().toISOString().slice(0, 10),
    supplierBusinessNumber: hashBusinessNumber(SUPPLIER_NAME),
    customerBusinessNumber: hashBusinessNumber(shipperName),
    item: '국제운송용역',
    taxType: 'zero_rated',
    supplyAmount: invoiceTotal,
    vatAmount: 0,
    totalAmount: invoiceTotal,
    createdAt: new Date().toISOString(),
  };
}
