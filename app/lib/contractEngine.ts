// 계약 특약 초안 생성 — 노선·화주·포워더·금액 등 실제 Case 데이터를 반영한다.
// routePath에 따라 TCR/연운항 관련 조항이 실제로 그 노선을 지나는 경우에만 등장한다
// (routeData.ts의 노선별 구분을 계약서 조항에도 그대로 반영).
//
// 국제물류 어디에나 들어갈 법한 일반 보일러플레이트(환율변동/Demurrage만 있던 상태)에서,
// 코레일 국제복합운송의 실제 운영 조건(SMGS 협약, 궤간환적, 목적지별 통화, 정책 리스크)을
// 반영한 조항으로 고도화했다 — 배경 조사 문서 3장(서류)·4장(시황요인 우선순위)의 조사
// 결과를 그대로 인용한다. TCR 경유 노선(중앙아시아행)에만 해당하는 조항은 조건부로 추가되고,
// 중국 내륙 직통 노선(예: 시안)에는 기본 4개 조항만 적용된다.

import type { CaseItem } from "./types";
import type { RoutePath } from "./routeData";
import { parseRoute } from "./quoteEngine";

export type ContractClause = { title: string; body: string };

// 목적지별 최종 도착지 통화 — "중앙아시아 통화 USD 기준 전환"(routeData.ts의
// 목적지별 통화 분리, KZT/UZS/KGS)이 이미 반영되어 있다면 그 매핑을 import해서 재사용할 것.
// 아직 반영 전이거나 이 계약서 텍스트 용도로 최소한만 필요하다면 아래 로컬 매핑을 쓴다.
const DESTINATION_CURRENCY_NAME: Record<string, string> = {
  "알마티": "KZT(카자흐스탄 텡게)",
  "아스타나": "KZT(카자흐스탄 텡게)",
  "타슈켄트": "UZS(우즈베키스탄 솜)",
  "비슈케크": "KGS(키르기스스탄 솜)",
};

export function buildContractClauses(item: CaseItem, routePath: RoutePath): ContractClause[] {
  const { destination } = parseRoute(item.route);
  const stageNames = routePath.stages.map((s) => s.name).join(" → ");
  const throughTCR = routePath.relevantFactors.includes("tcr");
  const priceLabel = `$${item.price.toLocaleString()}`;
  const destinationCurrency = DESTINATION_CURRENCY_NAME[destination];

  const transitClause: ContractClause = throughTCR
    ? {
        title: "TCR 환적 지연",
        body: `연운항 및 TCR 구간에서 불가피한 환적 지연이 발생할 경우, ${item.forwarder}는 즉시 예상 지연시간과 대체 운송계획을 화주 ${item.shipper}에 통지해야 한다.`,
      }
    : {
        title: "중국 내륙철도 운송 지연",
        body: `중국 내륙철도 구간에서 불가피한 지연이 발생할 경우, ${item.forwarder}는 즉시 예상 지연시간과 대체 운송계획을 화주 ${item.shipper}에 통지해야 한다.`,
      };

  const clauses: ContractClause[] = [
    {
      title: "구간별 운송책임",
      body: `${stageNames} 구간의 운송책임 범위는 별첨 운송계획에 따르며, 각 구간 인계 시점을 기준으로 구분한다. 화주 ${item.shipper}의 ${item.item}(${item.container})에 대해 ${item.forwarder}가 ${destination}까지의 국제운송 구간을 책임진다.`,
    },
    transitClause,
    {
      title: "통화 및 결제",
      body: `운임 결제 통화는 USD이며, 확정 견적금액은 ${priceLabel}이다. 견적 유효기간 내 적용 환율은 견적 수신일(${item.date}) 고시환율을 기준으로 한다.${
        throughTCR
          ? ` 중국 통과 구간 비용 환산은 CNY/KRW, 최종 도착지(${destination}) 관련 비용 환산은 ${destinationCurrency ?? "현지 통화"}/USD(결제 통화 기준)를 참고 기준으로 하며, 환율 변동 시 상호 협의 후 조정한다.`
          : " 환율 변동 시 상호 협의 후 조정한다."
      }`,
    },
    {
      title: "Demurrage / Detention",
      body: `${item.container} 컨테이너 기준 무료 사용기간과 초과 사용료의 기준을 사전에 고지하며, 귀책 사유에 따라 부담 주체를 구분한다.${
        throughTCR
          ? " 부산항–연운항 해상구간과 TCR 철도구간은 운영주체(선사/CR)가 달라 무료 사용기간 기준이 구간별로 다를 수 있으므로, 각 구간 기준을 구분해 명시한다."
          : ""
      }`,
    },
  ];

  // TCR 경유(중앙아시아행) 노선에만 해당하는 조항 — 배경 조사 문서 3장(SMGS 협약)·
  // 4장(요인 1: 중국 정부 철도 보조금 정책, 가장 영향력 큰 요인으로 확인됨)을 그대로 반영한다.
  if (throughTCR) {
    clauses.push(
      {
        title: "SMGS 협약 준수",
        body: `본 운송은 국제철도화물운송협정(SMGS)의 적용을 받는다. 화물운송장은 SMGS 협정이 정한 필수기재사항(발송인·수취인 정보, 화물 명세, 운임 지급조건, Duplicate Invoice 포함 여부 등)을 충족해야 하며, ${item.forwarder}는 필수기재사항 누락이 확인될 경우 이를 화주 ${item.shipper}에 통지하고 보완을 요청한다.`,
      },
      {
        title: "궤간환적 책임",
        body: `중국(1435mm 표준궤)과 카자흐스탄(1520mm 광궤)의 궤간 차이로 인해 국경통과 구간에서 발생하는 대차교환·환적 작업 중의 손상·지연에 대한 책임은 해당 작업을 실제로 수행한 주체의 귀책사유에 따라 정한다.`,
      },
      {
        title: "정책 변동에 따른 운임 조정",
        body: `중국 정부의 철도 보조금 정책 변경 등 정책적 요인으로 컨테이너 공급·운임에 중대한 변동이 발생하는 경우, ${item.forwarder}와 화주 ${item.shipper}는 상호 협의하여 운임 조정 여부를 결정한다.`,
      }
    );
  }

  return clauses;
}

export type SMGSReferenceItem = { requirement: string; article: string; note?: string };

// SMGS 협약 원문에서 확인한 핵심 준수사항 — documentEngine.ts의 화물운송장 체크리스트와
// 같은 근거(배경 조사 문서 3장)를 쓰되, 여기서는 판정(pass/fail)이 아니라 "무엇을 준수해야
// 하는지"를 계약 단계에서 미리 보여주는 참고용 목록이다. 조항번호가 확인되지 않은 항목은
// "조항번호 미확인"이라고 정직하게 표기한다 — 이 프로젝트의 확신도 구분 원칙을 그대로 따른다.
export const SMGS_REFERENCE_ITEMS: SMGSReferenceItem[] = [
  { requirement: "발송인·수취인 정보, 화물 명세(품목·중량·수량) 기재", article: "SMGS 협정 원문(조항번호 미확인)" },
  { requirement: "Container List 부속서류 첨부", article: "SMGS 협정 원문(조항번호 미확인)", note: "화물운송장의 부속서류로 요구됨" },
  { requirement: "운임 지급조건(선불/착불) 기재", article: "SMGS 협정 원문(조항번호 미확인)" },
  { requirement: "Duplicate Invoice(정산용 사본) 포함", article: "SMGS 협정 Art. 7.2, 7.7", note: "화물운송장은 원본·화물수령증·도착통지서 등 6매 + Duplicate Invoice로 구성된 한 세트 — 정산 탭에서 다루는 포워더 상업 Invoice와는 별개 문서다" },
  { requirement: "원산지증명서 등 첨부서류(목적지국 요구 시)", article: "SMGS 협정 Art. 22" },
];
