// 운임 인텔리전스용 뉴스 목업 데이터.
// 실 서비스 전환 시 뉴스 검색 API(네이버 뉴스, 물류 전문지 RSS 등) 연동으로 교체한다.
// indicator가 있는 기사는 marketData.ts의 시계열과 연결되어 causalAnalysis.ts가
// z-score 이상탐지 결과와 매칭할 때 사용한다(HAERO의 뉴스-이상탐지 매칭 패턴 참고).
//
// [카테고리 우선순위 — 외부 조사 결과, 아이디어 문서 3장 "시황 요인 우선순위" 참고]
// 유가·환율(정량 지표)보다 중국 철도 보조금 정책·화차/컨테이너 공급·지정학 리스크가
// 실제로는 더 직접적으로 운임을 흔드는 것으로 조사됐다. 이 셋은 시계열이 아니라
// 뉴스/공지 기반 이벤트라 "규제"(정책)·"TCR"(화차공급)·"지정학"(신규) 카테고리로 다룬다.
export type NewsCategory = "TCR" | "연운항" | "환율" | "유가" | "통관" | "규제" | "지정학";

export type NewsArticle = {
  id: string;
  category: NewsCategory;
  indicator?: "usdKrw" | "brent" | "cnyKrw" | "kztUsd";
  title: string;
  summary: string;
  source: string;
  /** YYYY-MM-DD */
  date: string;
};

export const newsArticles: NewsArticle[] = [
  { id: "N-1", category: "TCR", title: "중국–중앙아시아 철도 물동량 증가, 일부 구간 운송 지연", summary: "연운항 → 알마티 구간의 최근 물동량과 운송 일정 변화를 다룬 시장 브리핑입니다.", source: "Global Rail News", date: "2026-08-10" },
  { id: "N-2", category: "연운항", title: "연운항 환적 처리시간 증가 관련 업계 동향", summary: "성수기 물량 집중으로 환적 처리시간이 평시 대비 늘어난 것으로 확인됩니다.", source: "Port Logistics Daily", date: "2026-08-10" },
  { id: "N-3", category: "환율", indicator: "usdKrw", title: "원/달러 환율 1,380원대 진입, 변동성 확대", summary: "달러 결제 운송구간의 견적 유효기간과 환율 적용일 확인이 권장됩니다.", source: "외환시장 동향", date: "2026-08-09" },
  { id: "N-4", category: "환율", indicator: "usdKrw", title: "미 연준 발언 이후 원화 약세 압력 확대", summary: "단기 달러 강세 요인이 부각되며 원/달러 환율 상단이 높아지는 분위기입니다.", source: "외환시장 동향", date: "2026-08-08" },
  { id: "N-5", category: "유가", indicator: "brent", title: "Brent 유가 완만한 조정 국면 지속", summary: "해상운송 BAF 산정 시점과 포함 여부를 함께 확인할 수 있습니다.", source: "Energy Monitor", date: "2026-08-09" },
  { id: "N-6", category: "통관", title: "카자흐스탄 통관 서류 요건 일부 개정 안내", summary: "원산지증명서 제출 방식이 일부 변경되어 통관 지연 가능성이 있습니다.", source: "Customs Watch", date: "2026-08-06" },
  { id: "N-7", category: "환율", indicator: "cnyKrw", title: "위안화 약세 지속, TCR 구간 통과비용 변수로 부각", summary: "중국 경기 둔화 우려로 위안화가 완만한 약세를 이어가며, TCR 통과 구간의 원화 환산 비용에 영향을 줄 수 있습니다.", source: "외환시장 동향", date: "2026-08-08" },
  { id: "N-8", category: "TCR", title: "TCR 화물열차 배차 간격 단축 발표", summary: "중국철도공사가 8월부터 TCR 주요 구간의 배차 간격을 단축한다고 밝혔습니다.", source: "Global Rail News", date: "2026-08-07" },
  { id: "N-9", category: "TCR", title: "중국철도, TCR 노선 화물 우선순위 조정 검토", summary: "컨테이너 화물과 벌크 화물 간 선로 배정 우선순위 조정이 논의되고 있습니다.", source: "물류신문", date: "2026-08-03" },
  { id: "N-10", category: "TCR", title: "TCR 환적 대기시간 통계 공개", summary: "최근 3개월간 연운항 TCR 환적 평균 대기시간이 소폭 늘어난 것으로 집계됐습니다.", source: "Port Logistics Daily", date: "2026-07-29" },
  { id: "N-11", category: "연운항", title: "연운항 신규 크레인 가동, 처리능력 확대", summary: "신규 갠트리 크레인 3기가 가동을 시작하며 환적 처리능력이 확대될 전망입니다.", source: "Port Logistics Daily", date: "2026-08-05" },
  { id: "N-12", category: "연운항", title: "연운항 항만 노조 부분파업 예고", summary: "임금 협상 지연으로 일부 하역 인력의 부분파업이 예고되어 일정 확인이 필요합니다.", source: "Global Rail News", date: "2026-08-01" },
  { id: "N-13", category: "연운항", title: "연운항–알마티 구간 정기 컨테이너 열차 증편", summary: "주 3회이던 정기 열차가 주 4회로 증편되어 운송 리드타임 단축이 기대됩니다.", source: "Global Rail News", date: "2026-07-28" },
  { id: "N-14", category: "환율", indicator: "usdKrw", title: "한국은행, 환율 변동성 확대에 구두개입 시사", summary: "최근 원/달러 환율 급등에 대해 당국이 시장 안정 의지를 밝혔습니다.", source: "외환시장 동향", date: "2026-08-07" },
  { id: "N-15", category: "환율", indicator: "usdKrw", title: "달러 인덱스 강세, 원화 약세 압력 지속", summary: "미국 고용지표 호조로 달러 강세가 이어지며 원/달러 상단이 높아지고 있습니다.", source: "외환시장 동향", date: "2026-08-05" },
  { id: "N-16", category: "환율", indicator: "cnyKrw", title: "중국 8월 제조업 PMI 부진, 위안화 약세", summary: "예상치를 밑돈 제조업 지표로 위안화 약세 압력이 커지고 있습니다.", source: "외환시장 동향", date: "2026-08-06" },
  { id: "N-17", category: "환율", indicator: "cnyKrw", title: "인민은행, 위안화 기준환율 소폭 절하 고시", summary: "중국 인민은행이 위안화 기준환율을 전일 대비 소폭 절하 고시했습니다.", source: "외환시장 동향", date: "2026-08-02" },
  { id: "N-18", category: "유가", indicator: "brent", title: "OPEC+ 증산 합의, Brent 하락 압력", summary: "OPEC+ 산유국들의 증산 합의 소식에 Brent 유가가 하락 압력을 받고 있습니다.", source: "Energy Monitor", date: "2026-08-04" },
  { id: "N-19", category: "유가", indicator: "brent", title: "홍해 항로 리스크 완화, 해상운임 안정", summary: "홍해 항로 안전 우려가 다소 완화되며 해상운임 지수가 안정세를 보이고 있습니다.", source: "Energy Monitor", date: "2026-07-30" },
  { id: "N-20", category: "통관", title: "우즈베키스탄 통관 전자신고 시스템 전면 도입", summary: "8월부터 통관 신고가 전자시스템으로 일원화되어 서류 준비 방식 확인이 필요합니다.", source: "Customs Watch", date: "2026-08-06" },
  { id: "N-21", category: "통관", title: "카자흐스탄, 위험물 컨테이너 통관 절차 강화", summary: "위험물 신고서(DG Declaration) 사전 제출 요건이 강화되었습니다.", source: "Customs Watch", date: "2026-07-31" },
  { id: "N-22", category: "규제", title: "OSJD, SMGS 화물운송장 전자화 로드맵 발표", summary: "OSJD가 SMGS 화물운송장의 단계적 전자문서화 계획을 발표했습니다.", source: "OSJD Bulletin", date: "2026-08-08" },
  { id: "N-23", category: "규제", title: "중국 국경통과 화물 컨테이너 봉인 규정 개정", summary: "국경통과역 컨테이너 봉인(seal) 확인 절차가 일부 강화됩니다.", source: "물류신문", date: "2026-07-27" },
  { id: "N-24", category: "규제", title: "카자흐스탄–우즈베키스탄 국경통과 협정 갱신", summary: "양국 간 철도 국경통과 협정이 갱신되어 통과 절차가 일부 간소화될 전망입니다.", source: "OSJD Bulletin", date: "2026-08-09" },
  // ① 중국 정부의 철도 보조금 정책 — 조사 결과 가장 직접적인 변수로 확인됨.
  // SOC(자국 소유) 컨테이너 보조금이 축소되면 COC(선사 소유) 컨테이너 공급이 줄며 운임이
  // 급등하는 패턴이 실제로 관측됐다(2021년 연운항 루트: 약 4천 달러 → 7,500~8,000달러).
  { id: "N-25", category: "규제", title: "중국, TCR SOC 컨테이너 보조금 축소 검토", summary: "중국철도공사가 자국 소유(SOC) 컨테이너 보조금 축소를 검토 중인 것으로 확인됩니다. 2021년에도 유사한 조치 이후 연운항 루트 운임이 약 4천 달러에서 7,500~8,000달러까지 급등한 전례가 있어 주시가 필요합니다.", source: "물류신문", date: "2026-08-09" },
  { id: "N-26", category: "규제", title: "중국철도, COC 컨테이너 공급 축소 조짐", summary: "선사 소유(COC) 컨테이너 공급이 줄어들며 일부 구간에서 컨테이너 확보 경쟁이 발생하고 있습니다.", source: "Global Rail News", date: "2026-08-02" },
  // ② 화차·컨테이너 공급 상황 — 중국-카자흐스탄 국경(아라산커우 등)에서 왜건 부족과
  // 컨테이너 적체가 겹치면 대기일수가 10일→45~50일까지 늘어난 사례가 확인됨.
  { id: "N-27", category: "TCR", title: "아라산커우 국경, 화차 부족으로 대기일수 급증", summary: "중국–카자흐스탄 국경 아라산커우에서 화차(왜건) 부족과 컨테이너 적체가 겹치며 평균 대기일수가 10일에서 최대 45~50일까지 늘어난 것으로 집계됐습니다. 대기일수는 체화료·운임 상승으로 직결됩니다.", source: "카고프레스", date: "2026-08-05" },
  { id: "N-28", category: "TCR", title: "도스티크 국경통과역, 궤간 환적 적체 심화", summary: "1435mm–1520mm 궤간 환적 처리량이 물동량 증가를 따라가지 못해 적체가 심화되고 있습니다.", source: "카고프레스", date: "2026-07-30" },
  // ③ 지정학 리스크 — 러시아-우크라이나 전쟁 이후 TSR 이용이 제재·보험 부보 제한 등으로
  // 위축되며 물량이 TCR(중국 경유)로 쏠리는 현상이 확인됨. TCR 운임에도 간접 영향.
  { id: "N-29", category: "지정학", title: "TSR 제재 여파 지속, 화주들 TCR로 전환 가속", summary: "러시아-우크라이나 전쟁 이후 TSR(시베리아횡단철도) 이용에 대한 제재·보험 부보 제한이 이어지며, 유럽행 화주들이 TCR(중국횡단철도) 경유로 전환하는 흐름이 지속되고 있습니다. 이는 TCR 구간의 물동량 압박과 운임 상승 요인으로 작용할 수 있습니다.", source: "물류신문", date: "2026-08-06" },
  { id: "N-30", category: "지정학", title: "러시아 관련 해상보험 부보 제한 연장", summary: "일부 보험사가 러시아 경유 화물에 대한 부보 제한을 연장하며 TSR 대체 수요가 이어지고 있습니다.", source: "물류신문", date: "2026-07-29" },
];
