// 2단계(견적 검증 고도화)용 목업 데이터.
// 실 서비스 전환 시 historicalQuotes는 코레일 내부 계약 이력으로,
// marketSeries는 환율·유가·운임지수 API 연동으로 교체한다.
// (아이디어 문서 3장 "구체화: 판정 기준" 참고)

export type HistoricalQuote = {
  id: string;
  origin: string;
  destination: string;
  containerType: string;
  cargoCategory: string;
  /** YYYY-MM, 운송(선적) 예정월 */
  transportMonth: string;
  price: number;
  /** YYYY-MM-DD, 계약 체결일 — 6개월 이내 필터링 기준 */
  contractDate: string;
};

// 오봉 → 알마티 · 40FT 노선의 과거 유사 견적(핵심 매칭 대상).
// 화물 특성을 섞어 "화물 특성 유사도" 가중치가 실제로 매칭 점수를 갈라놓는지 보여준다.
const almatyRoute40FT: HistoricalQuote[] = [
  { id: "H-241", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-03", price: 3120, contractDate: "2026-03-02" },
  { id: "H-242", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-04", price: 3250, contractDate: "2026-04-10" },
  { id: "H-243", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "전자부품", transportMonth: "2026-04", price: 3180, contractDate: "2026-04-22" },
  { id: "H-244", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-05", price: 3310, contractDate: "2026-05-15" },
  { id: "H-245", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "산업 소재", transportMonth: "2026-05", price: 3220, contractDate: "2026-05-28" },
  { id: "H-246", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-06", price: 3160, contractDate: "2026-06-04" },
  { id: "H-247", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-06", price: 3280, contractDate: "2026-06-19" },
  { id: "H-248", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "소비재", transportMonth: "2026-07", price: 3240, contractDate: "2026-07-03" },
  { id: "H-249", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-07", price: 3300, contractDate: "2026-07-21" },
  { id: "H-250", origin: "오봉", destination: "알마티", containerType: "40FT", cargoCategory: "자동차부품", transportMonth: "2026-08", price: 3350, contractDate: "2026-08-05" },
];

// 같은 노선이지만 컨테이너·화물이 달라 유사도 임계값(0.7) 아래로 걸러져야 하는 사례.
const almatyRouteOther: HistoricalQuote[] = [
  { id: "H-251", origin: "오봉", destination: "알마티", containerType: "20FT", cargoCategory: "전자부품", transportMonth: "2026-07", price: 1850, contractDate: "2026-07-12" },
];

// 부산 → 시안 · 20FT · 철강 코일 — KORAIL-2026-003과 같은 조합으로, "유사 견적 1건"이 아니라
// 실제 분포(σ)를 보여줄 수 있도록 여러 달치를 채운다.
const xianRoute20FT: HistoricalQuote[] = [
  { id: "H-260", origin: "부산", destination: "시안", containerType: "20FT", cargoCategory: "철강 코일", transportMonth: "2026-07", price: 2240, contractDate: "2026-07-08" },
  { id: "H-264", origin: "부산", destination: "시안", containerType: "20FT", cargoCategory: "철강 코일", transportMonth: "2026-04", price: 2110, contractDate: "2026-04-11" },
  { id: "H-265", origin: "부산", destination: "시안", containerType: "20FT", cargoCategory: "철강 코일", transportMonth: "2026-05", price: 2150, contractDate: "2026-05-14" },
  { id: "H-266", origin: "부산", destination: "시안", containerType: "20FT", cargoCategory: "철강 코일", transportMonth: "2026-06", price: 2190, contractDate: "2026-06-09" },
  { id: "H-267", origin: "부산", destination: "시안", containerType: "20FT", cargoCategory: "철강 코일", transportMonth: "2026-07", price: 2260, contractDate: "2026-07-26" },
];

// 의왕 → 비슈케크 · 40FT · 산업 소재 — KORAIL-2026-004과 같은 조합.
const bishkekRoute40FT: HistoricalQuote[] = [
  { id: "H-261", origin: "의왕", destination: "비슈케크", containerType: "40FT", cargoCategory: "산업 소재", transportMonth: "2026-06", price: 3650, contractDate: "2026-06-06" },
  { id: "H-271", origin: "의왕", destination: "비슈케크", containerType: "40FT", cargoCategory: "산업 소재", transportMonth: "2026-04", price: 3520, contractDate: "2026-04-18" },
  { id: "H-272", origin: "의왕", destination: "비슈케크", containerType: "40FT", cargoCategory: "산업 소재", transportMonth: "2026-05", price: 3580, contractDate: "2026-05-20" },
  { id: "H-273", origin: "의왕", destination: "비슈케크", containerType: "40FT", cargoCategory: "산업 소재", transportMonth: "2026-07", price: 3710, contractDate: "2026-07-15" },
];

// 오봉 → 타슈켄트 · 40FT · 전자부품 — KORAIL-2026-002와 같은 조합.
const tashkentRoute40FT: HistoricalQuote[] = [
  { id: "H-262", origin: "오봉", destination: "타슈켄트", containerType: "40FT", cargoCategory: "전자부품", transportMonth: "2026-07", price: 2980, contractDate: "2026-07-09" },
  { id: "H-268", origin: "오봉", destination: "타슈켄트", containerType: "40FT", cargoCategory: "전자부품", transportMonth: "2026-05", price: 2860, contractDate: "2026-05-11" },
  { id: "H-269", origin: "오봉", destination: "타슈켄트", containerType: "40FT", cargoCategory: "전자부품", transportMonth: "2026-06", price: 2910, contractDate: "2026-06-16" },
  { id: "H-270", origin: "오봉", destination: "타슈켄트", containerType: "40FT", cargoCategory: "전자부품", transportMonth: "2026-07", price: 3040, contractDate: "2026-07-24" },
];

// 오봉 → 아스타나 · 40FT · 소비재 — KORAIL-2026-005와 같은 조합.
const astanaRoute40FT: HistoricalQuote[] = [
  { id: "H-263", origin: "오봉", destination: "아스타나", containerType: "40FT", cargoCategory: "소비재", transportMonth: "2026-06", price: 4120, contractDate: "2026-06-03" },
  { id: "H-274", origin: "오봉", destination: "아스타나", containerType: "40FT", cargoCategory: "소비재", transportMonth: "2026-05", price: 3960, contractDate: "2026-05-09" },
  { id: "H-275", origin: "오봉", destination: "아스타나", containerType: "40FT", cargoCategory: "소비재", transportMonth: "2026-06", price: 4050, contractDate: "2026-06-27" },
  { id: "H-276", origin: "오봉", destination: "아스타나", containerType: "40FT", cargoCategory: "소비재", transportMonth: "2026-07", price: 4190, contractDate: "2026-07-19" },
];

// 매칭 대상은 아니지만 "정보 검색"의 과거 견적 목록을 채워 검색 화면이 실제 서비스처럼
// 보이도록 하는 추가 노선들 — 유사도 매칭 로직이 이들을 엉뚱하게 끌어오지 않는지도 함께 검증한다.
const decoyRoutes: HistoricalQuote[] = [
  { id: "H-280", origin: "부산", destination: "칭다오", containerType: "20FT", cargoCategory: "생활용품", transportMonth: "2026-07", price: 1380, contractDate: "2026-07-05" },
  { id: "H-281", origin: "오봉", destination: "비슈케크", containerType: "20FT", cargoCategory: "의류", transportMonth: "2026-06", price: 2870, contractDate: "2026-06-14" },
  { id: "H-282", origin: "의왕", destination: "타슈켄트", containerType: "40FT", cargoCategory: "식품", transportMonth: "2026-07", price: 3110, contractDate: "2026-07-02" },
  { id: "H-283", origin: "부산", destination: "톈진", containerType: "40FT", cargoCategory: "기계부품", transportMonth: "2026-05", price: 1960, contractDate: "2026-05-23" },
  { id: "H-284", origin: "오봉", destination: "알마티", containerType: "40FT HC", cargoCategory: "자동차부품", transportMonth: "2026-08", price: 3480, contractDate: "2026-08-01" },
];

/**
 * 데모용 상세 계약 이력. 같은 노선·컨테이너라도 운송월, 품목, 계약일, 단가가
 * 달라지는 실제 운영 데이터 형태를 재현한다. 화면의 유사도/중앙값/분산 판정은
 * 이 풀을 사용하며 외부 고객·계약 정보는 포함하지 않는다.
 */
const detailedDemoQuotes: HistoricalQuote[] = Array.from({ length: 72 }, (_, index) => {
  const base = almatyRoute40FT[index % almatyRoute40FT.length];
  const month = 3 + (index % 6);
  const day = String(2 + ((index * 7) % 25)).padStart(2, '0');
  const cargos = [base.cargoCategory, '전자부품', '건설장비 부품', '산업용 자재'];
  return {
    ...base,
    id: `DEMO-${String(index + 1).padStart(3, '0')}`,
    cargoCategory: cargos[index % cargos.length],
    transportMonth: `2026-${String(month).padStart(2, '0')}`,
    contractDate: `2026-${String(month).padStart(2, '0')}-${day}`,
    // 계절/연료비/선복 상황을 반영한 ±6% 범위의 상세 목업 단가
    price: Math.round(base.price * (0.94 + ((index * 17) % 121) / 1000)),
  };
});

export const historicalQuotes: HistoricalQuote[] = [
  ...almatyRoute40FT,
  ...almatyRouteOther,
  ...xianRoute20FT,
  ...bishkekRoute40FT,
  ...tashkentRoute40FT,
  ...astanaRoute40FT,
  ...decoyRoutes,
  ...detailedDemoQuotes,
];

export type MarketPoint = { date: string; value: number };

/** 결정론적 의사난수 시계열 생성기 — 매 렌더마다 값이 바뀌지 않도록 seed 고정 */
// decimals: 반올림 자리수(기본 2). 값의 스케일이 극단적으로 작거나(예: 0.1 미만) 크면(예: 만 단위
// 이상) 기본 2자리가 안 맞을 수 있다 — 너무 작으면 값이 뭉개져 detectAnomaly의 z-score가
// 비정상적으로 폭발하고, 너무 크면 소수점 자체가 무의미해진다. 그래서 지표별로 자리수를
// 지정할 수 있게 했다(예: UZS/USD는 decimals: 0).
function generateSeries(opts: { start: number; days: number; drift: number; volatility: number; seed: number; endDate: string; decimals?: number }): MarketPoint[] {
  const { start, days, drift, volatility, seed, endDate, decimals = 2 } = opts;
  const scale = 10 ** decimals;
  let value = start;
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  };
  const points: MarketPoint[] = [];
  const end = new Date(endDate + "T00:00:00");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    value = value + drift + rand() * volatility;
    points.push({ date: d.toISOString().slice(0, 10), value: Math.round(value * scale) / scale });
  }
  return points;
}

const TODAY = "2026-08-10";

// USD/KRW: 안정적인 흐름 뒤 마지막 값을 통계적 이상치 수준으로 밀어올려
// z-score 이상탐지가 실제로 "탐지"를 보여주도록 구성.
const usdKrwBase = generateSeries({ start: 1332, days: 29, drift: 0.15, volatility: 10, seed: 11, endDate: "2026-08-09" });
export const usdKrwSeries: MarketPoint[] = [...usdKrwBase, { date: TODAY, value: 1385.2 }];

// Brent 유가: 완만한 하락 추세 — 이상탐지 임계값은 넘지 않는 "정상 범위 내 변동" 예시.
export const brentSeries: MarketPoint[] = generateSeries({ start: 76.5, days: 30, drift: -0.14, volatility: 0.6, seed: 23, endDate: TODAY }).map((p, i, arr) =>
  i === arr.length - 1 ? { ...p, value: 72.4 } : p
);

// CNY/KRW: TCR 구간이 중국 통과 구간이라 위안화가 USD보다 오히려 더 직접적인 관련
// 변수다(USD는 인보이스 표시통화·CAF 문제인 반면, CNY는 노선이 실제로 지나는 국가의
// 통화). 그래서 이 지표도 USD/KRW처럼 마지막 값을 통계적 이상치 수준으로 만들어
// z-score 이상탐지가 실제로 걸리도록 구성한다(중국 제조업 PMI 부진 뉴스와 짝을 맞춤).
const cnyKrwBase = generateSeries({ start: 194, days: 29, drift: -0.07, volatility: 0.5, seed: 17, endDate: "2026-08-09" });
export const cnyKrwSeries: MarketPoint[] = [...cnyKrwBase, { date: TODAY, value: 190.9 }];

// USD/KZT, USD/UZS, USD/KGS: 카자흐스탄(텡게)·우즈베키스탄(솜)·키르기스스탄(솜) 목적지 통화.
// KRW 기준("1 현지통화 = 몇 KRW") 대신 USD 기준("1 USD = 몇 현지통화")으로 표기한다 — 실제
// 외환시장에서 이 통화들은 KRW보다 USD 대비로 훨씬 널리 고시되고, 운임 결제 통화도 USD이므로
// "결제 통화 대비 목적지 통화가 얼마나 움직였는가"가 실무적으로 더 바로 참고할 수 있는 형태다.
// 주의(방향 반전): 값이 오르면 그 통화가 달러 대비 "약세"라는 뜻이다(기존 KZT/KRW 등과는
// 오르내림의 의미가 반대다). 세 나라 모두 변동폭이 작은 "안정적인 지표" 예시로 구성한다
// (2026-08 시점 실거래 수준을 참고했다: USD/KZT 478~500대, USD/UZS 12,100~12,300대,
// USD/KGS 87 안팎 — 실시간 API 연동은 아니며 이 스케일이 현실적이라는 참고용이다).
const kztUsdBase = generateSeries({ start: 486, days: 29, drift: 0.08, volatility: 1.4, seed: 31, endDate: "2026-08-09" });
export const kztUsdSeries: MarketPoint[] = [...kztUsdBase, { date: TODAY, value: 489.4 }];

// UZS는 단위가 커서(1만 이상) 소수점 관리가 무의미하다 — decimals: 0(정수 솜 단위)으로 반올림한다.
const uzsUsdBase = generateSeries({ start: 12180, days: 29, drift: 1.6, volatility: 22, seed: 41, endDate: "2026-08-09", decimals: 0 });
export const uzsUsdSeries: MarketPoint[] = [...uzsUsdBase, { date: TODAY, value: 12233 }];

const kgsUsdBase = generateSeries({ start: 87.25, days: 29, drift: 0.012, volatility: 0.18, seed: 47, endDate: "2026-08-09" });
export const kgsUsdSeries: MarketPoint[] = [...kgsUsdBase, { date: TODAY, value: 87.58 }];

// KCCI(한국형 컨테이너운임지수, 종합)·KCI(그 중 한중항로 서브지수) — 부산→중국 항만(연운항 등)
// 구간과 정확히 맞는 실제 지수는 KCI(한중항로) 쪽이지만, 대시보드에서는 시장 전체 맥락을 보여주는
// KCCI(종합)도 함께 노출해 "이 노선만의 특수한 변동인지, 전체 해상운임 시장이 같이 움직이는
// 것인지"를 구분해서 볼 수 있게 한다(배경 조사 문서 5장 참고). 실시간 연동은 하지 않는 자체 산출
// 시계열이며, 서로 독립적으로 이상탐지를 적용하는 동등한 신호로 다룬다. 실제 KCCI/KCI는 기준
// 시점을 1000으로 하는 지수라 목업 시작값도 1000 안팎으로 잡았다.
// ※ SCFI/CCFI로 바꾸는 방안도 검토했으나, 두 지수 모두 부산–연운항 근해항로를 커버하지 않는다는
// 기존 조사 결론(배경 조사 문서 5장)에 따라 KCCI/KCI 벤치마킹 방식을 그대로 유지한다.
// KCI(한중항로)는 근해항로 개별수급(A-7)·해상-철도 대체수요 서술에 계속 쓰인다 — 이 두 로직은
// "부산-연운항 구간"에 특정된 것이라, 노선 특정성이 없는 KCCI(종합)보다 KCI가 더 정확히 맞는다.
// KCI 쪽 마지막 구간을 상승 추세로 만들어 대체수요 서술이 실제로 상승 방향 메시지를 내는 모습을
// 보여준다. KCCI(종합)는 상대적으로 안정적인 지표 예시로 구성한다.
const kcciBase = generateSeries({ start: 1035, days: 29, drift: 0.35, volatility: 9, seed: 61, endDate: "2026-08-09" });
export const kcciSeries: MarketPoint[] = [...kcciBase, { date: TODAY, value: 1046 }];

const kciBase = generateSeries({ start: 890, days: 29, drift: 3.6, volatility: 14, seed: 67, endDate: "2026-08-09" });
export const kciSeries: MarketPoint[] = [...kciBase, { date: TODAY, value: 1042 }];

// ※ "연운항 환적 이슈"·"TCR 운송" 팩터는 가격 시계열이 아니라 뉴스 건수 기반 신호라
// z-score 이상탐지 대상이 아니다(1단계 뉴스 큐레이션 범위). 여기서는 다루지 않는다.
export const marketSeries = {
  usdKrw: usdKrwSeries,
  brent: brentSeries,
  cnyKrw: cnyKrwSeries,
  kztUsd: kztUsdSeries,
  uzsUsd: uzsUsdSeries,
  kgsUsd: kgsUsdSeries,
  kcci: kcciSeries,
  kci: kciSeries,
} as const;
