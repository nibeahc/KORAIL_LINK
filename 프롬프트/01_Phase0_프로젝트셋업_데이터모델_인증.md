# KORAIL LINK 빌드 프롬프트 세트 — Phase 0. 프로젝트 셋업 · 데이터 모델 · 인증

> 전제: Part 0(마스터 컨텍스트)을 이미 읽었다. `docs/KORAIL_LINK_기능_상세_스펙.md`의 B-0(Case 중심 데이터 구조), A-9(Cost Ledger 필드), 부록 C(기술 스택)와 `docs/KORAIL_LINK_백엔드_연동.md`의 9번(데이터베이스)·11번(인증)을 지금 열어서 같이 읽는다.

## 목표

이후 모든 Phase가 그 위에서 작업할 **기반**을 만든다. 화면은 거의 없다 — 프로젝트 스캐폴딩, 타입, DB 스키마, 인증, 상태 관리 패턴이 이 Phase의 산출물이다.

## 4-1. 프로젝트 스캐폴딩

1. vinext로 새 프로젝트를 만든다(Part 0의 기술 스택 참고). React 19 + TypeScript + Tailwind 설정.
2. 폴더 구조는 아래를 기본으로 하되, 각 Phase를 진행하며 자연스럽게 채운다.

```
app/
  page.tsx                 (또는 라우트별로 분리 — 이전 프로토타입은 단일 파일이라 유지보수가 어려웠다. 이번엔 화면 단위로 컴포넌트 파일을 분리할 것)
  login/page.tsx
  layout.tsx
  globals.css
  lib/
    types.ts               Case Master Data, Cost Ledger, CaseItem 등 공용 타입
    supabase.ts             Supabase 클라이언트 + CRUD
    state.ts                로컬 상태 + best-effort DB 동기화 래퍼 (아래 4-4 참고)
    quoteEngine.ts           (Phase 2)
    quoteDraftEngine.ts       (Phase 2)
    marketData.ts            (Phase 1)
    newsData.ts               (Phase 1)
    causalAnalysis.ts         (Phase 1)
    routeData.ts              (Phase 1, 다른 여러 Phase에서 참조)
    seasonality.ts             (Phase 1)
    contractEngine.ts          (Phase 3)
    documentEngine.ts           (Phase 4)
    taxInvoiceEngine.ts          (Phase 5)
    disputeChatEngine.ts          (Phase 5)
supabase/
  migrations/                이 Phase에서 SQL 마이그레이션 작성
docs/
  KORAIL_LINK_서비스_개요.md
  KORAIL_LINK_기능_상세_스펙.md
  KORAIL_LINK_백엔드_연동.md
```

3. `.env.example`을 만들고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 등록한다. `app/lib/supabase.ts`는 이 값이 없으면 클라이언트 생성 시점에 즉시 예외를 던지도록 한다(이전 프로토타입과 동일 패턴 — 설정 누락을 조용히 넘기지 않는다).

## 4-2. 데이터 모델 — Case Master Data + Cost Ledger

`기능_상세_스펙.md` B-0을 그대로 타입으로 옮긴다. 정확히 다음 두 가지를 분리해서 설계한다 — 섞지 않는다.

**Case Master Data** — 화주, 품목, 출발지/도착지, 컨테이너 타입·수량, 총중량, 운송 일정, 운송조건, 계약 확정 정보. 그리고 **필드별 변경이력**을 남길 수 있는 구조가 필요하다 — Phase 4(문서 대조)에서 "문서 값으로 반영"을 선택했을 때 문서유형·파일명·변경전값·변경후값·처리시점을 기록한다(B-4 참고). `changeHistory: FieldChange[]` 같은 배열을 Case Master Data 옆에 둔다.

**Cost Ledger** — 견적 생성 단계에서 확보한 구간별 원가·운임 구성내역. A-9에 정의된 필드를 그대로 쓴다:

```ts
interface CostLedgerLine {
  stageId: string;
  stageName: string;       // 예: "오봉→부산항", "부산항→연운항", "연운항→알마티", "환적"
  mode: string;             // 예: "국내철도", "해상운임", "TCR철도", "환적료"
  quotedAmount: number;      // 원가 문서에서 추출해 견적에 반영한 금액
  contractAmount: number;     // 계약 확정 시 기준 금액(초기값=quotedAmount, 담당자 수정 가능)
  currency: 'USD';             // MVP는 USD 고정
  source: string;                // 업로드 원가 문서명 또는 "수기 입력"
}
```

`CaseItem`은 기존 필드(id, 화주, 품목, 노선, 컨테이너, 총액 price, status 등) + `masterData: CaseMasterData` + `costLedger: CostLedgerLine[]`를 갖는다. **주의**: `price`(총액)는 Cost Ledger가 생기고 나면 `costLedger.reduce((sum, l) => sum + l.quotedAmount, 0)`로 항상 재계산 가능해야 한다 — 총액과 구간별 합이 따로 놀면 안 된다(B-0의 핵심 원칙).

`CaseStatus`는 검증 대기 / 검토 필요 / 견적 확정 / 계약 / 정산 5단계로 정의한다(이전 프로토타입엔 있었던 "포워더 확인" 상태는 만들지 않는다 — A-1 참고, 견적서 자동생성이 그 자리를 대체한다).

## 4-3. Supabase 스키마

`백엔드_연동.md` 9번 항목의 테이블 목록을 기준으로 마이그레이션을 작성한다. 최소 아래 테이블이 필요하다 — 컬럼은 대응하는 TypeScript 타입을 그대로 반영한다.

- `profiles` — Auth 사용자 id 참조, 이름, 회사명, role(`admin` 등)
- `cases` — CaseItem 전체(Case Master Data·Cost Ledger는 JSONB 컬럼으로 두거나 별도 테이블로 정규화 — 어느 쪽이든 좋으나, 이 Phase에서 결정하고 이후 Phase는 그 결정을 따른다)
- `case_status_history` — case_id, 이전 상태, 이후 상태, 변경 시각, 변경 주체
- `historical_quotes` — 과거 유사 견적 풀(노선/컨테이너/화물특성/계약일/금액). Phase 2의 σ 판정·유사도 매칭이 이 테이블을 조회한다.
- `documents` — case_id, 문서유형, 파일 경로(Storage), 추출 상태, 추출 결과(JSONB)
- `contracts` — case_id, 특약 조항, 계약금액, 서명 상태(`none`/`pending`/`signed`)
- `tax_invoices` — case_id, 작성일자, 공급자/공급받는자, 공급가액, 세액, 합계금액, 생성시각
- `dispute_chat_messages` — case_id, 질문, 답변, 근거 데이터 참조, 생성시각
- `market_data` — 지표명(USD/KRW 등), 날짜, 값 — Phase 1에서 채운다
- `news_articles` — 제목, 카테고리, 관련 indicator, 날짜, 요약

RLS: "로그인 사용자는 본인 Case, admin/운영자는 전체 접근" 정책을 만든다(백엔드 연동 11번 참고). 지금은 role이 `admin` 하나뿐이어도 된다 — 세분화된 권한 모델은 Phase 6 이후 과제로 남긴다(백엔드 연동 11번 "남은 작업" 참고).

Supabase 프로젝트를 만들고 `Authentication → Users`에 테스트 계정 `admin@gmail.com` / `admin@`을 만든 뒤 `profiles.role='admin'`으로 설정하는 절차를 README에 적어둔다.

## 4-4. 상태 관리 패턴 — "로컬 우선 + best-effort DB 동기화"

Part 0의 "지난 프로토타입에서 배운 것"에서 지적한 버그를 처음부터 피한다. `app/lib/state.ts`에 아래 시그니처의 래퍼를 만든다.

```ts
type CasesUpdater = CaseItem[] | ((prev: CaseItem[]) => CaseItem[]);

function setCasesAndPersist(updater: CasesUpdater) {
  // 1) 로컬 React state는 즉시, 동기적으로 갱신한다 (배열/함수 둘 다 받는다)
  // 2) Supabase 저장은 그 뒤에 비동기로 시도한다 — 반드시 .catch()로 감싼다
  // 3) 저장 실패 시 토스트만 띄우고 로컬 상태는 롤백하지 않는다
}
```

이 함수는 Phase 2(견적 확정)·Phase 3(계약 확정)처럼 "확정" 액션이 있는 모든 화면에서 재사용한다 — 각 Phase마다 다시 구현하지 않는다.

Case 목록 조회는 `listCases()`로 DB에서 가져오되, **DB가 비어 있거나 로그인 전(RLS 차단)이면 목업 `initialCases`로 자동 폴백**한다. 목업 Case는 최소 2~3건을 만들어 두어 이후 Phase의 화면이 빈 상태로 시작하지 않게 한다(TCR 경유 노선 1건, 비TCR 노선 1건을 포함해 routeData 분기를 처음부터 검증할 수 있게 한다 — Phase 1에서 routeData.ts를 만들 때 이 목업 Case로 바로 테스트한다).

## 완료 조건 (DoD)

- [ ] `npm run dev`로 로그인 화면(`/login`)이 뜨고, 테스트 계정으로 로그인·로그아웃이 된다.
- [ ] `npx tsc --noEmit`이 `app/` 관련 에러 없이 통과한다.
- [ ] `CaseItem`, `CaseMasterData`, `CostLedgerLine`, `FieldChange` 타입이 `types.ts`에 정의되어 있고, `costLedger`의 `quotedAmount` 합이 `price`와 항상 같다는 불변식을 주석으로 명시했다.
- [ ] Supabase 마이그레이션 SQL이 9개 테이블(+profiles)을 만들고, RLS 정책이 최소 1개 이상(본인 Case 제한) 적용되어 있다.
- [ ] `setCasesAndPersist`가 배열과 업데이터 함수 양쪽 호출 형태를 타입 에러 없이 받는다 — 일부러 `setCasesAndPersist(prev => prev)` 형태로 한 번 호출해보고 컴파일이 되는지 확인한다.
- [ ] DB가 비어 있는 상태에서 앱을 켜도 화면이 깨지지 않고 목업 Case가 보인다(로그인 전/DB 빈 상태 폴백 확인).

통과했으면 `02_Phase1_IA셸_리서치영역.md`로 넘어간다.
