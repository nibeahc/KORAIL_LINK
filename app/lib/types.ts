// Case Master Data + Cost Ledger 타입 정의 (기능_상세_스펙.md B-0, A-9 기준)

/** 검증 대기 / 검토 필요 / 견적 확정 / 계약 / 정산 — "포워더 확인" 상태는 의도적으로 없음 (A-1) */
export type CaseStatus =
  | 'pending_validation'
  | 'needs_review'
  | 'quote_confirmed'
  | 'contracted'
  | 'settlement';

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  pending_validation: '검증 대기',
  needs_review: '검토 필요',
  quote_confirmed: '견적 확정',
  contracted: '계약',
  settlement: '정산',
};

/** 문서 값을 Case Master Data에 반영했을 때 남기는 변경이력 (B-4) */
export interface FieldChange {
  id: string;
  field: string;
  documentType: string;
  fileName: string;
  previousValue: string;
  newValue: string;
  changedAt: string;
  changedBy?: string;
}

/** 한 운송 건의 현재 기준정보 (B-0, B-1) */
export interface CaseMasterData {
  shipperName: string;
  cargoType: string;
  origin: string;
  destination: string;
  containerType: string;
  containerCount: number;
  totalWeightTon: number;
  shipmentDate: string;
  incoterms: string;
  contractAmount?: number;
  changeHistory: FieldChange[];
}

/** 견적 단계에서 확보한 구간별 원가·운임 구성내역 (A-9) */
export interface CostLedgerLine {
  stageId: string;
  stageName: string;
  mode: string;
  quotedAmount: number;
  contractAmount: number;
  currency: 'USD';
  source: string;
}

/**
 * 불변식: costLedger.length > 0이면
 *   price === costLedger.reduce((sum, l) => sum + l.quotedAmount, 0)
 * 항상 성립해야 한다 (B-0). costLedger가 비어있는 레거시/목업 Case만 price를 독립값으로 허용한다.
 */
export interface CaseItem {
  id: string;
  caseNumber: string;
  shipperName: string;
  cargoType: string;
  route: string;
  containerType: string;
  price: number;
  status: CaseStatus;
  createdAt: string;
  masterData: CaseMasterData;
  costLedger: CostLedgerLine[];
}
