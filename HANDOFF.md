# KORAIL LINK — 핸드오프 (Phase 0~5 완료 시점, 2026-08-13)

> 대상 독자: 이어서 백엔드 실연동(Phase 6)·통합 QA·데모 준비(Phase 7)를 진행할 사람.
> 빌드 순서와 각 Phase의 판정 로직·완료조건은 `프롬프트/` 폴더, 기능 스펙은 `docs/KORAIL_LINK_기능_상세_스펙.md`, 백엔드 연동 현황은 `docs/KORAIL_LINK_백엔드_연동.md` 참고.

## 지금 상태 한 줄 요약

**견적 생성부터 정산까지 Case 하나가 끝까지 이어지는 파이프라인이 프런트엔드에서 전부 동작한다.** 판정 로직(σ 검증, 유사도 매칭, z-score 이상탐지, 문서 대조, Invoice 라인매칭)은 전부 실제 계산이고, "AI가 문서를 읽는다"·"실제 전자서명·홈택스·LLM 챗봇" 부분만 결정론적 시뮬레이션이다(설계상 의도된 목업 — 아래 "실제 계산 vs 목업" 참고).

## 실행 방법

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 채우기
npm run dev                  # vinext dev, 기본 포트 3000
npx tsc --noEmit              # 타입체크 (현재 에러 0건)
```

- Supabase 프로젝트는 이미 생성되어 있다(`supabase/migrations/`에 마이그레이션 4개, 전부 적용 완료 — `profiles` + 9개 테이블 + RLS + storage 버킷).
- **테스트 계정은 아직 수동으로 만들어야 한다**: Supabase 대시보드 `Authentication → Users`에서 `admin@gmail.com` 계정을 만들고, `profiles.role`을 `admin`으로 바꾼다. (Admin API로 자동 생성을 시도했으나 샌드박스 권한상 막혀서 수동 절차로 남겼다 — 실제로는 스펙 자체가 이 단계를 수동 작업으로 정의하고 있다.)
- **로그인 없이 바로 둘러보려면** `/login` 화면 우측 상단 "로그인 없이 시작하기 →"를 클릭하면 게스트 모드로 홈 화면에 들어간다(세션스토리지 플래그, Supabase 실제 세션은 아님 — 로그아웃하면 해제).

## 코드 구조

```
app/
  layout.tsx            루트 레이아웃, CasesProvider로 전체를 감쌈
  login/page.tsx         이메일 로그인/회원가입 + 게스트 모드 진입 링크
  (app)/                 로그인 필요 라우트 그룹 (레이아웃에서 인증 가드 + Sidebar)
    layout.tsx            인증 가드(비로그인·비게스트면 /login으로)
    page.tsx               홈 — Case 도넛, 종합 지수, KPI, 시황 카드, 주간 브리핑
    market/page.tsx         시황 — 8개 지표 전체
    search/page.tsx         정보 검색 — 뉴스 검색 + 주간 브리핑
    quotes/new/page.tsx      견적 생성 — 화물정보 입력 → 원가문서 업로드(시뮬) → 견적초안 → 검증 → 확정
    cases/page.tsx           화물 운송 Case 목록
    cases/[id]/page.tsx       Case 개요 — Cost Ledger, 노선 기반 "현재 시장정보" 필터링
    cases/[id]/validation/     견적 검증 탭 (기존 대기/검토 상태 Case를 확정)
    cases/[id]/contract/       계약 — 특약 근거→검토→초안→전자서명 시뮬레이션
    cases/[id]/documents/      문서 — 업로드/AI초안 → 대조 → 담당자 승인 반영
    cases/[id]/settlement/     정산 — Invoice 대조, 세금계산서, 이의제기 챗봇
  components/             Sidebar, EvidenceDrawer, MarketCard, QuoteValidationPanel, charts/(SVG 직접 구현, 외부 차트 라이브러리 없음)
  lib/
    types.ts               CaseItem/CaseMasterData/CostLedgerLine/ContractInfo/CaseDocument/InvoiceLineItem/TaxInvoice 등 전체 타입
    supabase.ts             Supabase 클라이언트 + 전 테이블 CRUD (env 없으면 즉시 예외)
    state.tsx                CasesProvider/useCases — 로컬 우선 + best-effort DB 동기화
    mockCases.ts              DB 빈 상태/로그인 전 폴백 목업 Case 3건(TCR 2 · 비TCR 1)
    routeData.ts               노선별 구간 구성(usesTCR/hasSeaLeg 플래그)
    marketData.ts               8개 시황 지표(seed 고정) + z-score 이상탐지 + 과거유사견적 풀 + 자체 종합지수
    newsData.ts / causalAnalysis.ts   뉴스 30건 + 결정론적 인과분석 문장
    seasonality.ts               캘린더 기반 성수기 신호
    quoteEngine.ts                A-3 유사도 매칭 + A-1 σ 대칭 판정
    quoteDraftEngine.ts            A-9 구간별 원가 결정론적 산출
    contractEngine.ts               SMGS 참조 데이터 + 특약 추천(TCR 7개/비TCR 4개)
    documentEngine.ts                4종 문서 추출 시뮬레이션 + 대조(허용오차/정규화)
    settlementEngine.ts               Invoice↔Cost Ledger 5종 판정
    taxInvoiceEngine.ts                세금계산서(영세율 기본)
    disputeChatEngine.ts                이의제기 챗봇(키워드 매칭)
supabase/migrations/        마이그레이션 4개(스키마, storage, contracts unique 제약)
```

## 실제 계산 vs 목업 (지금 시점 기준)

**실제로 계산되는 것** (Case/시장 데이터가 바뀌면 결과도 바뀜, 하드코딩 아님):

- σ 기반 견적 적정성 판정, 가중 유사도 매칭, z-score 시황 이상탐지, 인과분석 문장 생성
- 구간별 원가 산출·합산 → Cost Ledger 저장 → 계약 별첨·정산 기준선까지 동일 데이터로 이어짐(재분배 없음)
- 계약 특약 추천(TCR/비TCR 분기), 전자서명 상태 전환
- 문서 필드 대조(정규화 완전일치 vs 총중량 ±0.3t 허용오차), 승인 반영 시 변경이력 기록
- Invoice-Cost Ledger 항목별 매칭(5종 판정), 세금계산서(Invoice 총액과 동일 소스)
- 이의제기 챗봇의 근거 인용(σ 판정·인과분석·Invoice 차액을 실제로 재사용)
- Supabase Auth 로그인, best-effort DB 동기화(로그인 전/DB 빈 상태는 자동으로 목업 폴백)

**목업/시뮬레이션인 것** (Phase 6 대상):

- 문서·Invoice는 실제 업로드 파일을 읽지 않는다 — Case 데이터 기반 결정론적 추출만 시뮬레이션
- 시황 지표(환율·유가·KCCI/KCI)·뉴스·과거 유사 견적은 seed 고정 하드코딩(외부 API 연동 없음)
- 전자서명은 상태 전환만(모두싸인 등 실제 SDK 연동 없음)
- 세금계산서는 홈택스 연동이 아닌 미리보기(사업자번호도 상호명 해시 목업)
- 이의제기 챗봇은 키워드 매칭 규칙 기반(실제 LLM 호출 없음)

## 알려진 제약 / 다음 사람이 바로 부딪힐 것들

- **best-effort DB 저장은 실제 로그인 세션이 있어야 검증된다.** 이 세션에서는 Supabase Admin API로 테스트 계정을 만들 권한이 막혀 있었고, 셀프 회원가입은 이메일 확인이 필요해 즉시 세션이 생기지 않는다 — 그래서 UI 동작 검증은 `(app)/layout.tsx`의 인증 가드를 임시로 무력화한 뒤 Playwright로 직접 클릭해서 확인하고 원복하는 방식으로 진행했다. **실제 로그인 계정으로 새로고침/재방문 시에도 데이터가 유지되는지는 아직 검증되지 않았다** — Phase 6/7에서 테스트 계정을 실제로 만든 뒤 가장 먼저 확인해야 한다.
- `historical_quotes`/`market_data`/`news_articles` 테이블은 스키마만 있고 시드 데이터가 없다 — 지금은 전부 `app/lib/*.ts`의 하드코딩 배열로 동작한다. 실 데이터로 옮기려면 이 배열들을 해당 테이블에 시드하고 조회 함수를 DB 기반으로 바꿔야 한다.
- 문서 추출 스냅샷은 CaseItem에 로컬 상태로만 존재한다(`documents`/`invoiceLines`/`taxInvoices`/`disputeMessages` 필드) — DB 저장 함수(`insertTaxInvoice` 등)는 이미 붙여놨지만, `listCases()`가 이 하위 데이터까지 온전히 복원하는지는 실 세션에서 재확인이 필요하다.
- LLM 벤더는 미확정 상태다(`docs/KORAIL_LINK_백엔드_연동.md`의 "LLM 벤더 선정 관련 메모" 참고).

## 남은 작업

- **Phase 6 — 백엔드 실연동**: `프롬프트/07_Phase6_백엔드_실연동.md` 참고. 외부 API(환율·유가·KCCI/KCI·뉴스), LLM 기반 실제 문서 추출·이의제기 응답, 전자서명 SDK 연동 등. 백엔드 담당자가 별도 진행하기로 함.
- **Phase 7 — 통합 QA·데모 준비**: `프롬프트/08_Phase7_통합QA_데모준비.md` 참고. Phase 6 작업과 함께 진행 예정.
