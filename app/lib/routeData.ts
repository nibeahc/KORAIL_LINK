// 코레일 국제복합운송 노선의 실제 구간 구성을 목적지 기준으로 정의한다.
// 중앙아시아행(카자흐스탄·우즈베키스탄·키르기스스탄)은 부산항 해상운송 → 연운항 환적 →
// TCR(중국횡단철도) → 국경통과(아라산커우·도스티크) 궤간환적을 거치는 반면,
// 중국 내 목적지는 TCR 국경환적 구간 없이 중국 내륙철도로 바로 연결된다.
// 이 차이가 "운임 인텔리전스"에서 어떤 시황 지표(연운항·TCR·CNY/KRW 등)가
// 해당 Case와 실제로 관련 있는지를 가른다.
//
// [노선 검증 결과 — 외부 조사 완료, 아이디어 문서 3장 "노선 시나리오 검증 결과" 참고]
// - 중앙아시아행 노선(아래 CENTRAL_ASIA_DESTINATIONS)은 실제 코레일 시범사업
//   "KORAIL International Cargo Express"(2024.06~12, 4회, 알마티·타슈켄트 등)로 검증된 경로다.
//   부산항 해상 구간을 거치는 이유는 남북 분단으로 한반도 철도망이 대륙철도와 물리적으로
//   단절되어 있고 열차페리도 아직 상용화되지 않았기 때문이다. 연운항은 유일한 환적항은
//   아니며(칭다오·르자오·웨이하이 등 대안 존재), 데모에서는 대표 사례로 고정했다.
// - "국경통과(아라산커우·도스티크)" 지점명은 카자흐스탄행 노선에서 정황상 유력한 지점으로
//   추정한 것이며, 코레일 공개자료로 확정된 사실은 아니다(정황상 추정).
// - 중국 내 목적지로 종결되는 노선(아래 fallback 분기)은 위 시범사업으로 확인된 사례가
//   아니라 향후 확장 시나리오로 남겨둔 가정이다. 현재 데모 Case(KORAIL-2026-003 등)는
//   중앙아시아행 노선만 실제 검증된 경로를 기준으로 한다.

export type RouteStage = { name: string; mode: string };
export type MarketFactorKey = "usdKrw" | "cnyKrw" | "brent" | "yeonyungang" | "tcr" | "kztUsd" | "uzsUsd" | "kgsUsd" | "seaFreight";

export type RoutePath = {
  stages: RouteStage[];
  relevantFactors: MarketFactorKey[];
};

const CENTRAL_ASIA_DESTINATIONS = new Set(["알마티", "아스타나", "타슈켄트", "비슈케크"]);

// 목적지별 실제 통화 매핑(A-8, USD 기준) — 카자흐스탄=텡게(KZT), 우즈베키스탄=솜(UZS), 키르기스스탄=솜(KGS).
const DESTINATION_CURRENCY: Record<string, MarketFactorKey> = {
  "알마티": "kztUsd",
  "아스타나": "kztUsd",
  "타슈켄트": "uzsUsd",
  "비슈케크": "kgsUsd",
};

export function buildRoutePath(origin: string, destination: string): RoutePath {
  // 출발지가 이미 부산(부산/부산역/부산항 등 사용자가 자유 입력한 표기 포함)이면
  // 항만 출발이므로 내륙 철도 구간을 별도로 넣지 않는다. 그렇지 않으면 "부산항"이 두 번 나온다.
  const inlandLeg: RouteStage[] = origin.includes("부산") ? [] : [{ name: origin, mode: "코레일 철도" }];

  if (CENTRAL_ASIA_DESTINATIONS.has(destination)) {
    const currencyFactor = DESTINATION_CURRENCY[destination] ?? "kztUsd";
    return {
      stages: [
        ...inlandLeg,
        { name: "부산항", mode: "해상운송" },
        { name: "연운항", mode: "TCR 환적" },
        { name: "국경통과(아라산커우·도스티크)", mode: "궤간 환적" },
        { name: destination, mode: "최종 도착" },
      ],
      // seaFreight(부산–중국 항로 수급·대체수요, A-7)는 이 구간(부산-연운항)을 실제로 지나는
      // 노선에서만 관련 있으므로 여기 포함하고, 중국 내륙 직통 분기(아래 fallback)에는 넣지 않는다.
      relevantFactors: ["usdKrw", "brent", "cnyKrw", "yeonyungang", "tcr", "seaFreight", currencyFactor],
    };
  }
  // 중국 내 목적지(시안 등): TCR 국경환적 구간이 없어 연운항·TCR 이상탐지가 해당 Case와 무관하다.
  return {
    stages: [...inlandLeg, { name: "부산항", mode: "해상운송" }, { name: destination, mode: "중국 내륙철도" }],
    relevantFactors: ["usdKrw", "cnyKrw", "brent"],
  };
}
