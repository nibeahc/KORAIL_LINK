export type CaseStatus = "검증 대기" | "검토 필요" | "견적 확정" | "계약" | "정산";

export type CaseItem = {
  id: string;
  shipper: string;
  route: string;
  item: string;
  container: string;
  forwarder: string;
  price: number;
  status: CaseStatus;
  date: string;
  /** YYYY-MM-DD, 출발 예정일 — 유사 견적 매칭의 운송 시기 기준 */
  departure: string;
  /** ton, 총 중량 — Packing List/화물운송장 완전일치 대조 기준 */
  weight: number;
};
