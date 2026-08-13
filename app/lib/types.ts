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

/** Badge 컴포넌트 tone에 매핑 */
export const CASE_STATUS_TONE: Record<CaseStatus, 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'neutral'> = {
  pending_validation: 'neutral',
  needs_review: 'amber',
  quote_confirmed: 'blue',
  contracted: 'violet',
  settlement: 'green',
};

/** Case 상태별 분포 도넛 차트 전용 — Badge보다 더 다양한 5색을 쓴다 */
export const CASE_STATUS_DONUT_COLOR: Record<CaseStatus, string> = {
  pending_validation: '#8b95a4',
  needs_review: '#bd7217',
  quote_confirmed: '#2865ba',
  contracted: '#6a4fb0',
  settlement: '#207c56',
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

/** 특약 근거 유형 — 출처 없는 항목을 국제규정처럼 표현하지 않는다 (B-6, 비타협 원칙 5) */
export type ClauseBasisType = '협약' | '계약조건' | '내부기준' | 'AI 리스크 권고';
export type ClauseStatus = 'accepted' | 'excluded' | 'modified';

export interface ContractClause {
  id: string;
  title: string;
  reason: string;
  basisType: ClauseBasisType;
  /** 실제 지식베이스에 저장된 출처가 있을 때만 채운다 */
  basisSource?: string;
  text: string;
  status: ClauseStatus;
}

export type SignStatus = 'none' | 'pending' | 'signed';

export interface ContractInfo {
  clauses: ContractClause[];
  signStatus: SignStatus;
  signedAt?: string;
}

/** 1차 파싱 대상 4종 (B-1, B-2). 문서유형 enum에 추가하기 쉬운 형태로 — 2차 확장(Container List 등) 대비 */
export type DocumentType = 'contract' | 'packing_list' | 'waybill' | 'bl';

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  contract: '계약서',
  packing_list: 'Packing List',
  waybill: '화물운송장(SMGS)',
  bl: 'B/L(해상 구간)',
};

/**
 * 업로드/생성된 문서 1건. extractedSnapshot은 업로드 시점에 한 번만 고정한다 —
 * 이후 Case Master Data가 바뀌어도 이 스냅샷 자체는 바뀌지 않아야, 그 시점 이후의
 * Case 편집과 비교했을 때 실제 불일치가 드러난다(B-9 결정론성 + B-4 대조 로직).
 */
export interface CaseDocument {
  id: string;
  documentType: DocumentType;
  fileName: string;
  uploadedAt: string;
  extractedSnapshot: Record<string, string | null>;
  /** 필드별 담당자 처리 결과 — 대조에서 확인 필요/불일치로 뜬 필드만 채워진다 */
  resolutions: Record<string, 'keep_current' | 'apply_document' | 'confirm_later'>;
}

/** Invoice 라인아이템 — Cost Ledger와 항목별로 대조한다 (B-5) */
export interface InvoiceLineItem {
  id: string;
  description: string;
  amount: number;
  /** Cost Ledger의 어느 구간과 매칭되는지 — 없으면 신규 항목 또는 매칭 불확실 항목 */
  matchedStageId?: string;
  /** matchedStageId가 없을 때: true면 자동 매칭이 불확실한 항목(매칭 확인 필요), false/undefined면 계약 미등록 신규 항목 */
  uncertain?: boolean;
}

export interface TaxInvoice {
  id: string;
  issuedDate: string;
  supplierBusinessNumber: string;
  customerBusinessNumber: string;
  item: string;
  taxType: 'zero_rated' | 'standard';
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  createdAt: string;
}

export interface DisputeChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  evidence: string[];
  createdAt: string;
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
  contract?: ContractInfo;
  documents?: CaseDocument[];
  invoiceLines?: InvoiceLineItem[];
  taxInvoices?: TaxInvoice[];
  disputeMessages?: DisputeChatMessage[];
}
