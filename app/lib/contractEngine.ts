// 계약 — 협약 규칙 참조 데이터 + 특약 추천 (기능_상세_스펙.md B-2, B-6)

import type { CaseMasterData, ContractClause } from './types';
import { getRoute } from './routeData';

/**
 * SMGS 협약(OSJD 발간) 참조 데이터 — Case와 무관하게 시스템에 한 번만 적재하는 고정 지식베이스다.
 * 이 노선(SMGS 단독 적용권 — 카자흐스탄·우즈베키스탄 종착)에 실제로 적용되는 조항만 구조화했다.
 * Phase 4의 화물운송장 체크리스트도 이 데이터를 그대로 재사용한다.
 */
export interface SmgsReferenceItem {
  article: string;
  title: string;
  description: string;
}

export const SMGS_REFERENCE: SmgsReferenceItem[] = [
  {
    article: 'Art. 7.2, 7.7',
    title: '화물운송장 구성',
    description: '원본·화물수령증·도착통지서 등 6매 + Duplicate Invoice로 구성되어야 한다.',
  },
  {
    article: 'Art. 22',
    title: '첨부서류 요건',
    description: '원산지증명서 등 필수 첨부서류가 화물운송장에 함께 제출되어야 한다.',
  },
];

function baseClauses(masterData: CaseMasterData): ContractClause[] {
  return [
    {
      id: 'clause-incoterms',
      title: '운송조건(인코텀즈) 확인 조항',
      reason: `본 건의 운송조건(${masterData.incoterms})에 따른 위험·비용 분기점을 계약서에 명시한다.`,
      basisType: '계약조건',
      text: `본 계약의 운송조건은 ${masterData.incoterms}(으)로 하며, 위험 및 비용의 이전 시점은 관련 조건의 정의를 따른다.`,
      status: 'accepted',
    },
    {
      id: 'clause-delay',
      title: '지연배상 조항',
      reason: '국제복합운송 특성상 다수 구간을 경유해 지연 리스크가 있어 배상 기준을 명시한다.',
      basisType: '내부기준',
      text: '운송 지연이 발생할 경우 지연 사유·기간에 따라 별도 협의된 기준에 따라 배상한다.',
      status: 'accepted',
    },
    {
      id: 'clause-force-majeure',
      title: '불가항력 조항',
      reason: '천재지변·국경통과 제한 등 통제 불가능한 사유에 대한 면책 범위를 명시한다.',
      basisType: '계약조건',
      text: '천재지변, 전쟁, 국경통과 제한 등 당사자가 통제할 수 없는 사유로 인한 지연·손해는 면책한다.',
      status: 'accepted',
    },
    {
      id: 'clause-damage',
      title: '컨테이너·화물 손상 책임 조항',
      reason: '다구간 환적이 포함된 복합운송이라 구간별 책임 소재를 명확히 할 필요가 있다.',
      basisType: '내부기준',
      text: '컨테이너 또는 화물의 손상이 발생한 경우, 손상이 확인된 구간의 운송 주체가 책임을 부담한다.',
      status: 'accepted',
    },
  ];
}

function tcrClauses(): ContractClause[] {
  const smgsRef = SMGS_REFERENCE[0];
  return [
    {
      id: 'clause-smgs',
      title: 'SMGS 화물운송장 준수 조항',
      reason: 'TCR 경유 구간은 SMGS 협약 적용 대상이라 화물운송장 형식·첨부서류 요건을 계약서에 명시해야 한다.',
      basisType: '협약',
      basisSource: `SMGS 협약(OSJD) ${smgsRef.article} — ${smgsRef.title}`,
      text: '본 운송의 화물운송장은 SMGS 협약이 정한 구성(원본·화물수령증·도착통지서 등 6매 + Duplicate Invoice)과 첨부서류 요건을 충족해야 한다.',
      status: 'accepted',
    },
    {
      id: 'clause-transload',
      title: '궤간환적 지연 리스크 조항',
      reason: '중국-카자흐스탄 접속구간(아라산커우/도스티크)에서 궤간환적이 발생해 처리 지연 리스크가 있다.',
      basisType: 'AI 리스크 권고',
      text: '궤간환적 구간에서의 처리 지연으로 인한 리드타임 변동 가능성을 화주에게 사전 고지한다.',
      status: 'accepted',
    },
    {
      id: 'clause-policy',
      title: '정책변동 리스크 조항',
      reason: '국경통과협정·통관 규정 변경 등 정책 변동이 운임·일정에 영향을 줄 수 있다.',
      basisType: 'AI 리스크 권고',
      text: '관련국의 국경통과협정·통관 규정 변경 등 정책 변동이 발생할 경우 양 당사자가 협의하여 조건을 재검토한다.',
      status: 'accepted',
    },
  ];
}

/** TCR 경유 노선은 SMGS 준수·궤간환적·정책변동 특약이 추가로 붙는다(총 7개), 비TCR은 기본 4개만 (B-6, 7-2) */
export function recommendClauses(masterData: CaseMasterData): ContractClause[] {
  const route = getRoute(masterData.destination);
  const clauses = baseClauses(masterData);
  if (route?.usesTCR) clauses.push(...tcrClauses());
  return clauses;
}
