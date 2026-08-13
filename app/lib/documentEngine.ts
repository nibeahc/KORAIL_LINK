// 문서 업로드/AI 추출 시뮬레이션 + Case Master Data 대조 (기능_상세_스펙.md B-1~B-4)
// 실제 업로드 파일 내용은 읽지 않는다 — Case Master Data를 바탕으로 결정론적 결과를 만든다(B-9).

import type { CaseMasterData, DocumentType } from './types';
import { getRoute } from './routeData';
import { SMGS_REFERENCE } from './contractEngine';

export type FieldVerdict = 'match' | 'mismatch' | 'confirm_needed';

export const VERDICT_LABEL: Record<FieldVerdict, string> = {
  match: '일치',
  mismatch: '불일치',
  confirm_needed: '확인 필요',
};

export const WEIGHT_TOLERANCE_TON = 0.3;

const CORP_SUFFIXES = ['주식회사', '(주)', '㈜'];

function normalizeValue(field: string, value: string): string {
  let v = value.trim().toLowerCase();
  if (field === 'shipperName') {
    for (const suffix of CORP_SUFFIXES) v = v.replaceAll(suffix.toLowerCase(), '');
    v = v.replace(/\s+/g, '');
  } else if (field === 'containerType') {
    v = v.replace(/\s+/g, '').replace('feet', 'ft').replace('피트', 'ft').replace('하이큐브', 'hc');
  } else if (field === 'origin' || field === 'destination') {
    v = v.replace(/항$/, ''); // "부산항" ~ "부산" 같은 지명 별칭
  } else {
    v = v.replace(/\s+/g, '');
  }
  return v;
}

export function compareField(field: string, caseValue: string | null, extractedValue: string | null): FieldVerdict {
  if (extractedValue === null) return 'confirm_needed';
  if (caseValue === null) return 'confirm_needed';

  if (field === 'totalWeightTon') {
    const a = parseFloat(caseValue);
    const b = parseFloat(extractedValue);
    if (Number.isNaN(a) || Number.isNaN(b)) return 'confirm_needed';
    return Math.abs(a - b) <= WEIGHT_TOLERANCE_TON ? 'match' : 'mismatch';
  }

  return normalizeValue(field, caseValue) === normalizeValue(field, extractedValue) ? 'match' : 'mismatch';
}

export interface FieldDefinition {
  field: string;
  label: string;
}

export const CASE_FIELD_DEFS: FieldDefinition[] = [
  { field: 'shipperName', label: '화주명' },
  { field: 'cargoType', label: '품목' },
  { field: 'origin', label: '출발지' },
  { field: 'destination', label: '도착지' },
  { field: 'containerType', label: '컨테이너 타입' },
  { field: 'containerCount', label: '컨테이너 수량' },
  { field: 'totalWeightTon', label: '총중량(t)' },
];

/** 문서유형별로 실제 추출을 시도하는 필드 — 확장 시 이 표만 늘리면 된다 */
export const EXTRACTABLE_FIELDS_BY_TYPE: Record<DocumentType, string[]> = {
  contract: ['shipperName', 'destination', 'containerType'],
  packing_list: ['shipperName', 'cargoType', 'origin', 'destination', 'containerType', 'containerCount', 'totalWeightTon'],
  waybill: ['shipperName', 'cargoType', 'destination', 'containerType', 'containerCount', 'totalWeightTon', 'consignee'],
  bl: ['shipperName', 'containerType', 'seaLegOrigin', 'seaLegDestination'],
};

function caseFieldValue(masterData: CaseMasterData, field: string): string | null {
  switch (field) {
    case 'shipperName':
      return masterData.shipperName;
    case 'cargoType':
      return masterData.cargoType;
    case 'origin':
      return masterData.origin;
    case 'destination':
      return masterData.destination;
    case 'containerType':
      return masterData.containerType;
    case 'containerCount':
      return String(masterData.containerCount);
    case 'totalWeightTon':
      return String(masterData.totalWeightTon);
    default:
      return null;
  }
}

/**
 * 업로드/생성 시점에 한 번만 호출해 스냅샷을 만든다(같은 Case면 파일명이 달라도 결과가 같다).
 * 이후 이 값을 CaseDocument.extractedSnapshot에 그대로 저장하고, 비교는 항상 "현재" Case
 * Master Data 대비로 수행한다 — 그래야 업로드 이후 Case 값이 바뀌었을 때 실제로 갈린다.
 */
export function simulateExtraction(documentType: DocumentType, masterData: CaseMasterData): Record<string, string | null> {
  const fields = EXTRACTABLE_FIELDS_BY_TYPE[documentType];
  const snapshot: Record<string, string | null> = {};

  for (const field of fields) {
    if (field === 'consignee') {
      // Case Master Data에 수취인 필드 자체가 없다 — 실제 추출 실패 상황을 모사한다(빈 값이 아니라 "확인 필요").
      snapshot[field] = null;
      continue;
    }
    if (field === 'seaLegOrigin' || field === 'seaLegDestination') {
      const route = getRoute(masterData.destination);
      const seaStage = route?.stages.find((s) => s.mode === '해상운임');
      const [from, to] = seaStage?.name.split('→') ?? [null, null];
      snapshot[field] = (field === 'seaLegOrigin' ? from : to) ?? null;
      continue;
    }

    const base = caseFieldValue(masterData, field);
    if (base === null) {
      snapshot[field] = null;
      continue;
    }
    // 화물운송장 총중량은 계측 지점 차이를 모사해 고정 오프셋(+1.2t)을 둔다 — 문서 정합성 화면의
    // 대표 사례(기능_상세_스펙.md B-3 예시: Case 58.0t vs 화물운송장 59.2t)와 같은 패턴.
    if (documentType === 'waybill' && field === 'totalWeightTon') {
      snapshot[field] = String(Math.round((parseFloat(base) + 1.2) * 10) / 10);
      continue;
    }
    snapshot[field] = base;
  }

  return snapshot;
}

export interface ComparisonRow extends FieldDefinition {
  caseValue: string | null;
  extractedValue: string | null;
  verdict: FieldVerdict;
}

/** B/L의 출발지/도착지는 routePath의 해상구간만 대조한다 — Case 전체 출발지/도착지와 다르다 */
const FIELD_LABEL_OVERRIDE: Partial<Record<string, string>> = {
  seaLegOrigin: '출발지(해상구간)',
  seaLegDestination: '도착지(해상구간)',
  consignee: '수취인',
};

export function buildComparison(
  documentType: DocumentType,
  masterData: CaseMasterData,
  extractedSnapshot: Record<string, string | null>
): ComparisonRow[] {
  const fields = EXTRACTABLE_FIELDS_BY_TYPE[documentType];
  return fields.map((field) => {
    const label = FIELD_LABEL_OVERRIDE[field] ?? CASE_FIELD_DEFS.find((d) => d.field === field)?.label ?? field;
    const extractedValue = extractedSnapshot[field] ?? null;

    let caseValue: string | null;
    if (field === 'seaLegOrigin' || field === 'seaLegDestination') {
      const route = getRoute(masterData.destination);
      const seaStage = route?.stages.find((s) => s.mode === '해상운임');
      const [from, to] = seaStage?.name.split('→') ?? [null, null];
      caseValue = field === 'seaLegOrigin' ? (from ?? null) : (to ?? null);
    } else if (field === 'consignee') {
      caseValue = null; // Case Master Data에 없는 필드 — 항상 확인 필요
    } else {
      caseValue = caseFieldValue(masterData, field);
    }

    return {
      field,
      label,
      caseValue,
      extractedValue,
      verdict: field === 'consignee' ? 'confirm_needed' : compareField(field, caseValue, extractedValue),
    };
  });
}

export interface WaybillDraftField {
  label: string;
  value: string | null; // null이면 "추가 입력 필요"
}

export interface WaybillDraft {
  fields: WaybillDraftField[];
  checklist: { title: string; description: string }[];
}

/** Case Master Data에서 자동으로 채우고, 없는 필드는 임의 생성 없이 "추가 입력 필요"로 남긴다 (B-3) */
export function buildWaybillDraft(masterData: CaseMasterData): WaybillDraft {
  const fields: WaybillDraftField[] = [
    { label: '화주(송하인)', value: masterData.shipperName },
    { label: '수취인', value: null },
    { label: '품목', value: masterData.cargoType },
    { label: '출발지', value: masterData.origin },
    { label: '도착지', value: masterData.destination },
    { label: '컨테이너', value: `${masterData.containerType} x ${masterData.containerCount}` },
    { label: '총중량', value: `${masterData.totalWeightTon}t` },
    { label: '운송조건', value: masterData.incoterms },
  ];

  return {
    fields,
    checklist: SMGS_REFERENCE.map((r) => ({ title: `${r.title} (${r.article})`, description: r.description })),
  };
}
