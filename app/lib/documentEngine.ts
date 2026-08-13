// 3단계(문서·정산 연결) 계산 엔진 — 아이디어 문서 7장 스펙을 구현한다.
// 실제 파일 파싱·AI 추출 API는 붙어 있지 않다(ANTHROPIC_API_KEY 등 백엔드 연동 필요, 별도 과제).
// 대신 업로드된 문서 유형에 대해 "AI가 추출했다면 이런 필드가 나왔을 것"이라는
// 결정론적 목업 추출 결과를 만들어, 완전일치 대조·SMGS 협약 준수 검증·정산 차액 로직이
// 실제로 동작하는 모습을 보여준다. Case 데이터를 기반으로 계산되므로 Case가 바뀌면
// 결과도 함께 바뀐다(파일 내용 자체를 읽는 것은 아님).
//
// 문서 구성은 외부 조사로 검증한 실제 노선(코레일 KORAIL International Cargo Express,
// 2024년 시범사업: 오봉→부산항[해상]→연운항[TCR 환적]→TCR→카자흐스탄/우즈베키스탄)을
// 기준으로 한다. 이 노선은 목적지가 카자흐스탄·우즈베키스탄이라 전 구간 SMGS 단독
// 적용권이며, CIM/SMGS 공통운송장은 해당하지 않는다(3장 "노선 시나리오 검증" 참고).

import type { CaseItem } from "./types";
import type { RoutePath } from "./routeData";
import { parseContainerType, parseRoute } from "./quoteEngine";

export type DocumentType = "계약서" | "Packing List" | "화물운송장" | "B/L" | "Invoice";
export const DOCUMENT_TYPES: DocumentType[] = ["계약서", "Packing List", "화물운송장", "B/L", "Invoice"];

// 문서 탭 업로드 카드에 쓰는 설명 — 업로드 전에도 어떤 문서가 왜 필요하고
// 어떤 항목을 추출하는지 미리 보여줘서, 국제복합운송 실무자가 봤을 때
// "이 시스템이 뭘 하는지" 바로 이해할 수 있도록 한다.
export const DOCUMENT_INFO: Record<Exclude<DocumentType, "Invoice">, { icon: string; description: string; expectedFields: string[]; formats: string[] }> = {
  계약서: {
    icon: "contract",
    description: "확정된 운송조건과 특약사항이 담긴 계약서를 업로드하세요.",
    expectedFields: ["확정 금액", "운송조건", "특약사항"],
    formats: ["PDF", "JPG", "PNG"],
  },
  "Packing List": {
    icon: "case",
    description: "포장·중량·수량 명세가 담긴 Packing List를 업로드하세요.",
    expectedFields: ["화주명", "품목", "출발지/도착지", "컨테이너 타입·수량", "총중량"],
    formats: ["PDF", "JPG", "PNG"],
  },
  화물운송장: {
    icon: "waybill",
    description: "SMGS 협약이 적용되는 국제철도화물운송장을 업로드하세요. 필수기재사항 준수 여부도 함께 확인합니다.",
    expectedFields: ["화주명", "출발지/도착지", "컨테이너 타입", "총중량"],
    formats: ["PDF", "JPG", "PNG"],
  },
  "B/L": {
    icon: "bl",
    description: "부산항에서 시작되는 해상 구간의 선하증권(B/L) 또는 이에 준하는 운송서류를 업로드하세요.",
    expectedFields: ["화주명", "출발지/도착지(해상 구간)", "컨테이너 타입"],
    formats: ["PDF", "JPG", "PNG"],
  },
};

export type DocStatus = "idle" | "loading" | "done";
export type DocState = {
  status: DocStatus;
  fileName?: string;
  /** 실제 OCR/LLM API 결과. 없을 때만 기존 예시 결과를 표시한다. */
  snapshot?: Record<string, string | null>;
  mode?: "ocr" | "llm";
  error?: string;
  invoiceLineItems?: Array<{ label: string; amount: number; currency: 'USD'; isNew: boolean }>;
};

function parseContainerQty(container: string): number {
  const n = parseInt(container.split("×")[1] ?? "", 10);
  return Number.isNaN(n) ? 0 : n;
}

export type FieldStatus = "match" | "mismatch" | "unknown";
export type FieldComparison = { label: string; baseline: string; extracted: string; status: FieldStatus };

export type ChecklistItem = { label: string; pass: boolean; note?: string };

export type DocumentExtraction = {
  type: DocumentType;
  fields: FieldComparison[];
  checklist?: ChecklistItem[];
  note?: string;
};

// 완전일치 대조에서 "표기 차이"와 "실제 값 차이"를 구분하기 위한 정규화.
// 포맷만 다르고 값이 같으면 일치로 처리하되, 값 자체가 다르면(예: 58 vs 59.2) 정규화 이후에도
// 그대로 불일치로 남아야 한다 — 허용오차를 두는 것이 목적이 아니라 표기 차이만 흡수하는 것이다.

// 법인 표기 차이(주식회사/㈜/Co., Ltd. 등)는 정규화하되, 상호명 본체는 그대로 비교해
// 실제로 다른 회사를 같다고 오판하지 않도록 한다 — 알려진 법인 접미사만 제거한다.
const CORPORATE_SUFFIXES: RegExp[] = [
  /\(주\)|㈜|주식회사/g,
  /\bco\.?,?\s*ltd\.?\b/gi,
  /\bltd\.?\b/gi,
  /\bcorp(?:oration)?\.?\b/gi,
  /\binc\.?\b/gi,
  /\bllc\b/gi,
];

// 실제 노선(routeData.ts)에 등장하는 역·항만·도시명의 표기 변형 → 내부 canonical 표기.
// 지금 데모는 baseline·extracted가 항상 같은 parseRoute() 결과라 이 표가 노출되지 않지만,
// 실제 AI 추출을 붙이면 문서마다 "오봉역"/"오봉", "Almaty"/"알마티" 같은 표기 차이가 실제로 생긴다.
// 키는 정규화 파이프라인의 나머지 단계(소문자화 등)를 통과한 뒤의 값과 비교하므로 전부 소문자다.
// 고정 사전 방식이라 여기 없는 표기는 못 잡는다 — 새 노선이 추가되면 같이 갱신해야 한다.
const PLACE_ALIASES: Record<string, string> = {
  "오봉역": "오봉", "obong": "오봉", "obong station": "오봉",
  "의왕역": "의왕", "uiwang": "의왕", "uiwang station": "의왕",
  "부산역": "부산", "부산항": "부산", "부산항만": "부산", "busan": "부산", "busan station": "부산", "busan port": "부산", "port of busan": "부산",
  "롄윈강": "연운항", "lianyungang": "연운항", "lianyungang port": "연운항",
  "almaty": "알마티",
  "astana": "아스타나", "nur-sultan": "아스타나", "누르술탄": "아스타나",
  "tashkent": "타슈켄트",
  "bishkek": "비슈케크",
  "xian": "시안", "xi'an": "시안", "서안": "시안",
};

// 컨테이너 규격("40FT"/"40′"/"40FEET"/"40피트")과 뒤에 붙는 하이큐브 표기("HC"/"H.C"/"하이큐브")를
// 한 정규식으로 함께 처리한다. 공백 없이 붙여 쓴 "40FTHC" 같은 표기도 개별 단어경계(\b)에
// 의존하지 않고 잡아내기 위해 하나의 패턴으로 묶었다(이전 버전은 FT와 HC를 별도 \b 패턴으로
// 처리해서 "40FTHC"처럼 공백이 없으면 못 잡았다).
function normalizeContainerSpec(s: string): string {
  return s.replace(/(\d+)\s*(?:′|'|FT|FEET|피트)\s*(H\.?C\.?|하이큐브)?/gi, (_m, num, hc) => `${num}ft${hc ? "hc" : ""}`);
}

const UNIT_SYNONYMS: [RegExp, string][] = [
  // 중량 단위 — "TON", "MT", "톤", "T" → "ton" (숫자 뒤에 붙는 경우만 대상으로, 다른 단어 오매칭 방지)
  [/(\d+(?:\.\d+)?)\s*(?:TON|MT|톤|T)\b/gi, "$1ton"],
  // 수량 단위 — "대", "EA", "UNIT(S)", "개"는 숫자만 비교하면 되므로 단위를 제거
  [/(\d+)\s*(?:대|EA|UNITS?|개)\b/gi, "$1"],
  // 통화 기호·코드 제거
  [/[$₩¥₸]|USD|KRW|CNY|KZT/gi, ""],
];

// 전각 영숫자·기호(U+FF01–FF5E) → 반각, 전각 공백(U+3000) → 일반 공백.
// 스캔본 OCR 결과에 전각 문자가 섞여 나오는 경우를 대비한다.
function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ");
}

function normalizeValue(s: string): string {
  let v = toHalfWidth(s).trim();
  for (const pattern of CORPORATE_SUFFIXES) v = v.replace(pattern, "");
  v = v.replace(/[,.\s]+$/, "").replace(/^[,.\s]+/, ""); // 법인 접미사 제거 후 남은 앞뒤 구두점 정리
  v = v.replace(/,/g, ""); // 천단위 콤마 제거 — "1,200" → "1200"
  v = normalizeContainerSpec(v);
  for (const [pattern, replacement] of UNIT_SYNONYMS) v = v.replace(pattern, replacement);
  v = v.replace(/(\d+)\.0+(?!\d)/g, "$1"); // 불필요한 소수점 trailing zero 제거 — "58.0" → "58"
  v = v.replace(/\s+/g, " ").trim().toLowerCase();
  return PLACE_ALIASES[v] ?? v;
}

// 필드 성격에 따라 검증 강도를 다르게 가져간다(2026-08-12, 팀 피드백 반영) — 화주명·출발지/
// 도착지·컨테이너 타입·확정 금액처럼 "같은 값이어야만 하는" 식별자·화폐 필드는 완전일치를
// 그대로 유지하고(완전일치를 두는 이유는 위 설명대로 여전히 유효), 중량처럼 계측 지점마다
// 실측 오차가 실제로 존재하는 필드에만 아주 작은 허용오차(tolerance)를 준다. 허용오차를
// 크게 잡지 않는 이유는, 값 자체가 다른 것(원가 누락 등 실제 문제)까지 덮어버리면 안 되기
// 때문이다 — 계측 오차 수준(예: ±0.3톤)만 흡수한다.
function cmp(label: string, baseline: string, extracted: string, tolerance = 0): FieldComparison {
  const a = normalizeValue(baseline);
  const b = normalizeValue(extracted);
  if (tolerance > 0) {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return { label, baseline, extracted, status: Math.abs(na - nb) <= tolerance ? "match" : "mismatch" };
    }
  }
  return { label, baseline, extracted, status: a === b ? "match" : "mismatch" };
}

/** routePath.stages에서 "해상운송"으로 출발하는 구간(부산항 → 다음 기항지)을 찾는다. B/L은 전체 노선이 아니라 이 해상 구간만 커버한다. */
function findSeaLeg(routePath: RoutePath): { origin: string; destination: string } | null {
  const idx = routePath.stages.findIndex((s) => s.mode.includes("해상"));
  if (idx === -1 || idx + 1 >= routePath.stages.length) return null;
  return { origin: routePath.stages[idx].name, destination: routePath.stages[idx + 1].name };
}

// B/L 원본 문서는 "40FT" 대신 피트 기호(′) 표기를 쓰는 경우가 흔하다 — 표기 정규화가 실제로
// 동작하는 모습을 데모에서 보여주기 위해, 추출값에는 의도적으로 다른(그러나 같은 값의) 표기를 쓴다.
function toApostropheNotation(containerType: string): string {
  return containerType.replace(/(\d+)FT/gi, "$1′");
}

export function buildDocumentExtraction(type: DocumentType, item: CaseItem, routePath: RoutePath): DocumentExtraction {
  const { origin, destination } = parseRoute(item.route);
  const containerType = parseContainerType(item.container);
  const containerQty = parseContainerQty(item.container);

  if (type === "Packing List") {
    return {
      type,
      fields: [
        cmp("화주명", item.shipper, item.shipper),
        cmp("품목", item.item, item.item),
        cmp("출발지", origin, origin),
        cmp("도착지", destination, destination),
        cmp("컨테이너 타입", containerType, containerType),
        cmp("컨테이너 수량", `${containerQty}대`, `${containerQty}대`),
        cmp("총중량", `${item.weight}ton`, `${item.weight}ton`, 0.3),
      ],
      note: "Case 최초 등록 정보와 완전일치 — 누락·불일치 없음",
    };
  }

  if (type === "화물운송장") {
    // 총중량만 의도적으로 다르게 만들어 "완전일치 원칙"에서 불일치가 실제로 잡히는 모습을 보여준다.
    const extractedWeight = Math.round((item.weight + 1.2) * 10) / 10;
    return {
      type,
      fields: [
        cmp("화주명", item.shipper, item.shipper),
        cmp("출발지", origin, origin),
        cmp("도착지", destination, destination),
        cmp("컨테이너 타입", containerType, containerType),
        cmp("총중량", `${item.weight}ton`, `${extractedWeight}ton`, 0.3),
      ],
      checklist: [
        { label: "발송인·수취인 정보 기재", pass: true },
        { label: "화물 명세(품목·중량·수량) 기재", pass: true },
        { label: "Container List 첨부 여부", pass: false, note: "SMGS 협정상 화물운송장의 부속서류로 요구되나 운송장에서 첨부가 확인되지 않음" },
        { label: "운임 지급조건(선불/착불) 기재", pass: true },
        { label: "Duplicate Invoice(정산용 사본) 포함 여부", pass: true, note: "SMGS 협정 Art. 7.2/7.7 — 운송장 세트에 포함되는 정산용 사본이며, 정산 탭에서 다루는 포워더 상업 Invoice와는 별개 문서다" },
      ],
      note: "체크리스트는 SMGS 협정 원문 기준이며, 현재 노선(카자흐스탄·우즈베키스탄 종착)은 전 구간 SMGS 단독 적용권이라 CIM/SMGS 공통운송장 요건은 해당하지 않는다.",
    };
  }

  if (type === "B/L") {
    const seaLeg = findSeaLeg(routePath);
    return {
      type,
      fields: [
        cmp("화주명", item.shipper, item.shipper),
        cmp("출발지(해상 구간)", seaLeg?.origin ?? "—", seaLeg?.origin ?? "—"),
        cmp("도착지(해상 구간)", seaLeg?.destination ?? "—", seaLeg?.destination ?? "—"),
        cmp("컨테이너 타입", containerType, toApostropheNotation(containerType)),
      ],
      note: "B/L은 전체 노선이 아니라 해상 구간(부산항→연운항 등)만 커버한다. 남북 분단으로 한반도 철도망이 대륙철도와 연결되어 있지 않아, 이 구간은 컨테이너 단위로 선박→철도 환적한다.",
    };
  }

  if (type === "계약서") {
    return {
      type,
      fields: [
        cmp("확정 금액", money(item.price), money(item.price)),
        { label: "운송조건", baseline: "—", extracted: "FOB, 오봉역 인도", status: "unknown" },
        { label: "특약사항", baseline: "—", extracted: "TCR 환적 지연 시 통지 의무", status: "unknown" },
      ],
      note: "확정 금액 외 항목은 Case에 저장된 대조 기준이 없어 참고용으로만 표시한다.",
    };
  }

  // Invoice는 필드 대조가 아니라 정산 차액 로직(buildInvoiceComparison)으로 별도 처리한다.
  return { type, fields: [], note: "Invoice는 정산 탭의 금액 대조 로직을 사용한다." };
}

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

export type InvoiceLineItem = { category: "운임" | "BAF" | "THC" | "서류비" | "기타"; label: string; amount: number; currency: "USD"; isNew: boolean };
export type InvoiceComparison = {
  lineItems: InvoiceLineItem[];
  invoiceTotal: number;
  contractAmount: number;
  diff: number;
  isMismatch: boolean;
};

// Case에는 항목별 계약 내역이 없고 확정 총액(item.price)만 있으므로,
// "운임" 한 줄만 계약 baseline과 대응하고 그 외 라인아이템은 전부 "신규 항목"으로 판정한다.
export function buildInvoiceComparison(item: CaseItem): InvoiceComparison {
  const lineItems: InvoiceLineItem[] = [
    { category: "운임", label: "국제운송료(포워더)", amount: item.price, currency: "USD", isNew: false },
    { category: "BAF", label: "유류할증료", amount: 180, currency: "USD", isNew: true },
    { category: "서류비", label: "서류발급비", amount: 50, currency: "USD", isNew: true },
  ];
  const invoiceTotal = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const contractAmount = item.price;
  const diff = invoiceTotal - contractAmount;
  return { lineItems, invoiceTotal, contractAmount, diff, isMismatch: diff !== 0 };
}
