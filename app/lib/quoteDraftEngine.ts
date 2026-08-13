// 견적서 자동생성 — 구간별 원가 합산 (기능_상세_스펙.md A-9)
// 업로드된 원가 문서의 실제 내용은 읽지 않는다(B-9) — Case Master Data를 바탕으로
// routeData의 구간 구성마다 결정론적으로 금액을 산출한다. 같은 Case면 어떤 파일을
// 올려도(또는 몇 번을 다시 만들어도) 결과가 같다.

import type { CaseMasterData, CostLedgerLine } from './types';
import { getRoute, type RouteStage } from './routeData';

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Case Master Data만으로 결정되는 seed — 업로드 파일과 무관해야 한다(B-9). */
function seedFromMasterData(m: CaseMasterData): number {
  const str = `${m.destination}|${m.containerType}|${m.containerCount}|${m.totalWeightTon}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

const BASE_RATE_PER_CONTAINER: Record<string, number> = {
  국내철도: 125,
  해상운임: 310,
  TCR철도: 940,
  환적료: 205,
  중국내륙철도: 690,
};

function stageAmount(stage: RouteStage, masterData: CaseMasterData, rand: () => number): number {
  const base = BASE_RATE_PER_CONTAINER[stage.mode] ?? 200;
  const weightFactor = 1 + Math.max(0, masterData.totalWeightTon - 25) * 0.004; // 25t 초과분 소폭 가산
  const variance = 1 + (rand() - 0.5) * 0.12; // ±6%
  return Math.round(base * masterData.containerCount * weightFactor * variance);
}

export interface QuoteDraft {
  lines: CostLedgerLine[];
  total: number;
}

export function buildQuoteDraft(masterData: CaseMasterData, source = '원가 문서 업로드'): QuoteDraft {
  const route = getRoute(masterData.destination);
  if (!route) {
    return { lines: [], total: 0 };
  }

  const rand = mulberry32(seedFromMasterData(masterData));
  const lines: CostLedgerLine[] = route.stages.map((stage) => {
    const amount = stageAmount(stage, masterData, rand);
    return {
      stageId: stage.id,
      stageName: stage.name,
      mode: stage.mode,
      quotedAmount: amount,
      contractAmount: amount,
      currency: 'USD',
      source,
    };
  });

  return { lines, total: lines.reduce((sum, l) => sum + l.quotedAmount, 0) };
}
