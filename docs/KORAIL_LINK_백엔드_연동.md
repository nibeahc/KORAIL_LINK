# KORAIL LINK — 백엔드 연동

> 작성일: 2026-08-12 (백엔드 구축 필요 목록) + 2026-08-12 (Supabase 연동 현황) → 2026-08-13 두 문서를 하나로 통합
> 대상 독자: 이 해커톤 데모를 실 서비스로 전환할 때 백엔드 작업을 맡는 사람.
> 전제: 원래(2026-08-11 이전)는 **백엔드가 전혀 없었다.** `db/schema.ts`는 빈 파일이었고, `worker/index.ts`는 이미지 최적화 라우트 하나뿐이었으며, 모든 데이터는 `app/lib/*.ts`에 하드코딩된 배열이고 Case 상태는 React `useState`뿐이라 새로고침하면 사라졌다. **2026-08-12에 Supabase(Auth/Postgres/Storage)가 실제로 연결되면서 이 중 일부(주로 9번 데이터베이스, 11번 인증, 부분적으로 8번·10번)의 상태가 바뀌었다** — 정확히 어디까지 바뀌었는지는 아래 "연동 현황 요약"과 항목별 상세를 참고. 나머지(1~7번, 9번 중 실데이터 부분)는 여전히 목업/미착수다.
> 범위: 세금계산서 **발행**(국세청 홈택스 연동, 사업자등록번호 검증 등)은 코레일 측 회계/세무 시스템이 처리할 업무라 우리 쪽에서 만들 영역이 아니다. 다만 화면에서 생성한 세금계산서 데이터를 **저장하는 DB 작업**은 다른 Case 데이터와 마찬가지로 우리 쪽 몫이라 8번에 남겨뒀다.
> 관련 문서: 이 문서가 다루는 각 기능의 판정 로직·현재 어떤 계산이 실제로 도는지는 [KORAIL_LINK_기능_상세_스펙.md](./KORAIL_LINK_기능_상세_스펙.md)(특히 부록 B "구현 현황: 실제 계산 vs 목업")와 부록 C(기술 스택) 참고. 서비스 배경은 [KORAIL_LINK_서비스_개요.md](./KORAIL_LINK_서비스_개요.md) 참고.

## 어떻게 읽나

각 항목은 **현재 상태(어느 파일의 어느 목업인지, Supabase 연동으로 뭐가 바뀌었는지) → 필요한 작업 → 후보 연동 대상 → 연결 지점**으로 정리했다. 코드를 열지 않고도 이 표만 보고 "뭘 해야 하는지" 파악할 수 있게 하는 게 목적이다.

---

## 연동 현황 요약 (2026-08-12, Supabase)

### Supabase 연결 완료

- `profiles`: Supabase Auth 사용자, 이름, 회사명, 역할 저장
- `cases`: Case 등록·조회·상태 변경 저장. DB가 비어 있으면 기존 목업 Case 표시
- `case_status_history`, `historical_quotes`: 상태 이력·과거 견적 저장 구조
- `documents`: 업로드 파일 메타데이터와 AI 추출 상태 저장
- `contracts`: 계약 조건·서명 상태 저장 함수 연결
- `tax_invoices`: 세금계산서 미리보기·발행 이력 저장
- `dispute_chat_messages`: 분쟁 채팅 질문·답변 저장
- `market_data`, `news_articles`: 외부 데이터 저장 테이블 준비
- Supabase Storage `case-documents`: Case 파일 업로드 및 `documents` 메타데이터 저장

> 위 목록은 "테이블/저장 구조가 준비되고 CRUD가 연결됐다"는 뜻이지, 그 안에 들어가는 데이터 자체가 실제 외부 API·실제 코레일 이력이라는 뜻은 아니다. `market_data`·`news_articles`·`historical_quotes`는 저장 그릇만 준비된 상태고, 지금 화면에 보이는 값은 여전히 `app/lib/marketData.ts`·`newsData.ts`의 하드코딩 배열이다(아래 1~4번, 9번 참고).

### 연결 방식

- `app/lib/supabase.ts`: Supabase 클라이언트, CRUD, Storage, 계약·정산·채팅 저장 함수
- `app/page.tsx`: 기존 화면을 유지하며 DB 조회·등록·상태 변경·파일 업로드 연결
- `app/login/page.tsx`: 이메일 회원가입·로그인·로그아웃과 Supabase Auth 연결
- RLS: 로그인 사용자 본인 Case와 관리자·운영자 접근 제한
- `.env.local`: Supabase URL과 publishable/anon key 사용

### 사용자 작업 (Supabase 세팅)

- 테스트 로그인 계정: `admin@gmail.com` / `admin@`
- 위 계정은 Supabase `Authentication → Users`에 생성되어 있어야 하며, 로그인 화면은 `/login`에서 사용한다.
- 테스트 계정의 관리자 권한은 `profiles.role = 'admin'`으로 설정한다.
- `supabase/migrations/20260812000002_profile_company.sql`을 Supabase SQL Editor에서 실행
- 외부 API 키는 `.env.local`에 직접 등록
- API 키와 Supabase service role key는 채팅이나 Git에 올리지 않기

### 아직 미완료 (전체 총정리)

- 환율·Brent 유가·KCCI/KCI·물류 뉴스 외부 API (1~4번)
- LLM 기반 실제 문서 추출과 실제 AI 분쟁 채팅 (5·6번 — 어떤 LLM 벤더를 쓸지는 문서마다 표현이 다르다. 아래 "LLM 벤더 선정 관련 메모" 참고)
- 전자서명 SDK와 Webhook (7번)
- 전자세금계산서 사업자를 통한 실제 국세청 발행 (8번, 애초에 우리 범위 밖)
- 관리자·운영자·일반 사용자·읽기 전용별 세밀한 UI 권한 (11번 인증은 됐으나 역할별 화면 권한 세분화는 미완료)
- 목업 시장·뉴스·과거 견적의 실제 API/DB 데이터 완전 교체 (1~4번, 9번의 `historical_quotes` 실데이터)
- 운영 환경 통합 테스트·재시도·감사 로그 (신규 항목 — 특정 번호에 매핑되지 않는 운영 전반 과제)

### LLM 벤더 선정 관련 메모 (문서 간 표현 불일치)

실제 착수된 사항이 아니라 아직 벤더가 확정되지 않았다는 뜻으로, 세 원본 문서가 서로 다르게 표현하고 있다는 점을 그대로 남겨둔다 — 실제 착수 시 담당자가 다시 확정해야 한다.

- `HANDOFF.md`(구 문서)는 "Anthropic API 키 발급(console.anthropic.com)", `ANTHROPIC_API_KEY` 환경변수 등 **Claude API를 구체적으로 가정**하고 연동 절차를 적었다.
- 이 문서의 5번 항목(백엔드 요구사항 원본)은 벤더를 특정하지 않고 "정확도·비용·데이터 보관 정책 등을 고려해 담당자가 직접 결정"으로 **열어뒀다.**
- 백엔드 연동 현황 문서(2026-08-12)는 미완료 항목을 나열하며 **"OpenAI 문서 추출"**이라는 표현을 썼다.

---

## 요약 표

| # | 항목 | 최초 상태 (2026-08-11 이전) | 2026-08-12 이후 현재 상태 |
|---|---|---|---|
| 1 | 환율 API (USD/CNY/KZT/UZS/KGS) | 하드코딩 시계열 | 변경 없음(저장 테이블만 `market_data`로 준비) |
| 2 | 유가 API (Brent) | 하드코딩 시계열 | 변경 없음(저장 테이블만 `market_data`로 준비) |
| 3 | 해상운임 지수 API (KCCI·KCI) | 하드코딩 시계열 | 변경 없음(저장 테이블만 `market_data`로 준비) |
| 4 | 물류·시황 뉴스 API | 하드코딩 배열(30건) | 변경 없음(저장 테이블만 `news_articles`로 준비) |
| 5 | AI 문서 추출(파싱) | 결정론적 목업 추출 | 변경 없음(추출 자체는 목업, `documents` 테이블에 추출 상태 저장 구조만 준비) |
| 6 | 이의제기 챗봇 | 키워드 매칭 규칙 | 변경 없음(응답 로직은 목업, `dispute_chat_messages`에 대화 저장 구조만 준비) |
| 7 | 전자서명 SDK | 상태 전환만 시뮬레이션 | 변경 없음(상태 저장은 `contracts`에 연결, 실제 SDK·웹훅 미연동) |
| 8 | 세금계산서 — 발행 이력 저장(DB만) | 화면 미리보기뿐, 저장 안 됨 | **완료** — `tax_invoices` 테이블 연결 |
| 9 | 데이터베이스(Case·과거 견적 등) | React useState, 새로고침 시 소실 | **대부분 완료** — Supabase Postgres로 구현(당초 후보였던 Cloudflare D1/Drizzle 대신). 다만 `historical_quotes`·`market_data`·`news_articles`는 저장 구조만 있고 실데이터는 여전히 목업 |
| 10 | 파일 저장소(업로드 문서) | 파일을 아예 읽지 않음 | **저장은 완료** — Supabase Storage(`case-documents`) 연결. 저장된 파일을 5번이 실제로 읽어 LLM에 전달하는 연결은 미착수 |
| 11 | 인증/사용자 관리 | 없음(단일 하드코딩 사용자) | **완료** — Supabase Auth(`/login`, RLS)로 로그인·회원가입·역할 저장까지 구현. 역할별 세밀한 UI 권한은 미완료 |

---

## 1. 환율 API — USD/KRW, CNY/KRW, USD/KZT, USD/UZS, USD/KGS

**현재 상태**: `app/lib/marketData.ts`의 `generateSeries()`가 seed 고정 의사난수로 30일 시계열을 만든다(`usdKrwSeries`, `cnyKrwSeries`, `kztUsdSeries`, `uzsUsdSeries`, `kgsUsdSeries`). 실 API 연동이 전혀 없다. *(2026-08-12 갱신: Supabase에 `market_data` 저장 테이블은 준비됐지만, 실제로 이 테이블에 채워 넣을 외부 API 연동 자체는 아직 없다.)*

**필요한 작업**:
- 5개 통화쌍의 일별(또는 실시간) 시세를 가져오는 백엔드 라우트 추가
- `MarketPoint[]` 형식(`{ date, value }`)으로 정규화해 프런트에 내려주기
- 카자흐스탄(KZT)·우즈베키스탄(UZS)·키르기스스탄(KGS)은 국내 은행 API가 커버하지 않는 경우가 많아, 별도 소스가 필요할 수 있음

**후보 연동 대상**:
- 한국수출입은행 환율 API, 한국은행 ECOS API (USD/KRW, CNY/KRW)
- exchangerate.host, Open Exchange Rates 등 해외 API (USD/KZT·UZS·KGS — 원화 미지원 통화쌍 보완용)

**연결 지점**: `marketData.ts`의 `usdKrwSeries`/`cnyKrwSeries`/`kztUsdSeries`/`uzsUsdSeries`/`kgsUsdSeries`를 API 호출 결과로 교체. `detectAnomaly()`(z-score 이상탐지)·`windowChangePct()`는 `MarketPoint[]`만 받으면 그대로 동작하므로 계산 로직은 안 건드려도 됨.

## 2. 유가 API — Brent

**현재 상태**: `marketData.ts`의 `brentSeries`, 마찬가지로 하드코딩.

**필요한 작업**: Brent 유가 일별 종가 시계열 연동.

**후보 연동 대상**: EIA(美 에너지정보청) API, 오일프라이스 API, 또는 원자재 시세 제공 업체(Bloomberg/Refinitiv 등 유료 데이터피드).

**연결 지점**: `marketData.ts`의 `brentSeries`.

## 3. 해상운임 지수 API — KCCI(종합)·KCI(한중항로)

**현재 상태**: `marketData.ts`의 `kcciSeries`/`kciSeries`, 하드코딩. 실제 KCCI/KCI는 한국해양진흥공사(KOBC)가 발표하는 지수다.

**필요한 작업**: KCCI 종합지수와 그 서브지수인 KCI(한중항로) 두 시계열을 가져오는 연동. 공식 API가 없다면 정기 공표 데이터(주간 발표)를 스크래핑하거나 수작업 업로드 파이프라인이 필요할 수 있음 — 사전 확인 필요.

**후보 연동 대상**: 한국해양진흥공사(KOBC) KCCI 공표 자료. 공개 API 유무는 확인되지 않았으므로 담당자가 직접 문의해야 함.

**연결 지점**: `marketData.ts`의 `kcciSeries`/`kciSeries`. 이 두 지표는 대시보드 카드뿐 아니라 `causalAnalysis.ts`의 `buildSubstitutionSignal()`(해상-철도 대체수요 서술), `Validation` 탭의 "근해항로(부산–연운항) 수급" 카드에서도 쓰인다.

## 4. 물류·시황 뉴스 API

**현재 상태**: `app/lib/newsData.ts`의 `newsArticles` 배열(30건), 전부 하드코딩. 카테고리는 TCR/연운항/환율/유가/통관/규제/지정학 7종.

**필요한 작업**:
- 뉴스 검색/수집 API 연동 후 위 7개 카테고리로 분류(자동 분류 or 태깅 규칙)
- 일부 기사는 `indicator` 필드로 특정 환율·유가 지표와 연결되어 있어(`causalAnalysis.ts`의 인과분석 매칭에 사용), 수집한 뉴스도 관련 지표와 매칭하는 로직이 필요

**후보 연동 대상**: 네이버 뉴스 검색 API, 물류신문·카고프레스 등 업계지 RSS, Global Rail News 등 해외 철도 전문지.

**연결 지점**: `newsData.ts`의 `newsArticles`. `causalAnalysis.ts`의 `matchNewsForIndicator()`가 `indicator` 필드로 뉴스-지표를 매칭하므로, 수집 파이프라인에서 이 필드를 함께 채워야 인과분석 문장이 계속 의미 있게 나온다.

## 5. AI 문서 추출(파싱) — LLM API 연동

**현재 상태**: `app/lib/documentEngine.ts`의 `buildDocumentExtraction()`/`buildInvoiceComparison()`이 업로드된 파일을 전혀 읽지 않고, Case 데이터 기반으로 "AI가 추출했다면 이랬을 것"이라는 결정론적 결과만 생성한다. *(2026-08-12 갱신: Supabase `documents` 테이블에 "AI 추출 상태"를 저장하는 구조는 준비됐다 — 즉 추출 결과를 어디에 기록할지는 정해졌지만, 실제 추출 로직 자체는 아직 목업이다.)*

**필요한 작업**:
1. 사용할 LLM API 선정 및 키 발급, 서버 쪽에만 저장 — 어떤 제공업체를 쓸지는 정확도·비용·데이터 보관 정책 등을 고려해 담당자가 직접 결정해야 한다(위 "LLM 벤더 선정 관련 메모" 참고 — 과거 메모에는 Anthropic Claude API를 구체적으로 가정한 절차가, 최신 현황 메모에는 "OpenAI"라는 표현이 남아 있어 실제로는 미확정 상태다)
2. Cloudflare Workers 라우트 추가(`worker/index.ts`) — 업로드 파일을 선정한 API로 전달하고 JSON 반환
3. 프런트엔드 로컬 함수 호출을 `fetch` 호출로 교체, 로딩/에러 상태 추가
4. 환경변수 설정 — 로컬(`.dev.vars`)·배포(`wrangler secret put`)에 선택한 API 키 등록(Claude를 쓴다면 `ANTHROPIC_API_KEY` 이름을 썼던 과거 메모 참고)
5. 프롬프트/출력 스키마 설계 — `documentEngine.ts`에 이미 정의된 필드를 그대로 재사용 가능

**연결 지점**: `documentEngine.ts`의 `buildDocumentExtraction`/`buildInvoiceComparison`, `worker/index.ts`에 새 라우트(예: `/api/extract-document`) 추가, 완료 후 `documents` 테이블의 추출 상태 필드에 결과 반영.

프런트엔드 로직 조정과는 성격이 다른 별도 백엔드 작업이라 담당자 배정 후 진행하는 것으로 남겨뒀다.

## 6. 이의제기 챗봇 — LLM API 연동

**현재 상태**: `app/lib/disputeChatEngine.ts`의 `answerDispute()`가 키워드 매칭(`비싸`/`차액`/`지연` 등)으로만 답한다. 실시간 LLM 호출이 아니다. *(2026-08-12 갱신: Supabase `dispute_chat_messages` 테이블에 질문·답변을 저장하는 구조는 준비됐다 — 대화 이력 저장 자체는 가능하지만, 답변을 만드는 로직은 여전히 규칙 기반이다.)*

**필요한 작업**:
- 5번과 마찬가지로 서버 라우트(예: `/api/dispute-chat`) 추가, 선정한 LLM API 호출
- 프롬프트에 σ 판정 근거(`Verdict`)·인과분석(`QuotePressureAnalysis`)·Invoice 차액(`InvoiceComparison`)을 컨텍스트로 주입 — 지금 `answerDispute()`가 받는 인자와 동일한 데이터를 프롬프트에 넣으면 됨
- 대화 이력은 이미 `dispute_chat_messages` 테이블(9번)에 저장 구조가 있으므로, 실제 저장 연결만 완성하면 됨

**연결 지점**: `disputeChatEngine.ts`의 `answerDispute()`, `page.tsx`의 `DisputeChat` 컴포넌트, `dispute_chat_messages` 테이블.

## 7. 전자서명 SDK

**현재 상태**: `page.tsx`의 `Contract` 컴포넌트, `signStatus` state(`none`→`pending`→`signed`)를 `setTimeout`으로만 흉내낸다. 실제 서명 SDK 연동이 아니다. *(2026-08-12 갱신: Supabase `contracts` 테이블에 계약 조건·서명 상태를 저장하는 함수는 연결됐다 — 즉 상태 전환 자체를 DB에 기록하는 것은 가능해졌지만, 실제 전자서명 SDK·웹훅 연동은 여전히 없다.)*

**필요한 작업**:
- 전자서명 SDK 연동(문서 생성 → 서명 요청 → 서명 완료 웹훅 수신)
- 서명 완료 상태를 프런트에 실시간 반영(웹훅 → DB 업데이트 → 폴링 or 웹소켓)

**후보 연동 대상**: 모두싸인, DocuSign, Adobe Sign 등 국내외 전자서명 SDK.

**연결 지점**: `page.tsx`의 `Contract` 컴포넌트 내 `requestSign()` 함수를 실제 API 호출로 교체, `contracts` 테이블의 서명 상태 필드와 연동.

## 8. 세금계산서 — 발행 이력 저장(DB)

**현재 상태**: `app/lib/taxInvoiceEngine.ts`의 `buildTaxInvoice()`가 Invoice 총액 기준으로 부가세를 계산해(2026-08-12부로 국제운송용역 기준 영세율 0원이 기본값 — [기능 상세 스펙 B-7](./KORAIL_LINK_기능_상세_스펙.md#b-7-세금계산서-자동-생성-task-06-대응-시뮬레이션) 참고) 화면에 미리보기를 띄운다. **2026-08-12 갱신 — 완료**: `tax_invoices` 테이블이 Supabase에 연결되어, 화면에서 생성한 세금계산서 미리보기·발행 이력이 이제 저장된다. 사업자번호는 여전히 상호명 기반 목업 해시다.

**범위**: 실제 세금계산서 **발행**(국세청 홈택스 API 연동, 사업자등록번호 검증 등)은 코레일 측 회계/세무 시스템이 처리할 업무라 우리 쪽에서 만들 수 없다. 여기서는 **우리 화면에서 생성한 세금계산서 미리보기 데이터를 저장하고 이력으로 조회하는 DB 작업만** 다룬다 — "이 Case에 대해 언제 어떤 금액으로 세금계산서를 만들었는지" 기록을 남기는 정도이며, 실제 국세청 발행 여부와는 무관하다.

**당초 설계했던 테이블 스키마** (`tax_invoices`, 9번 데이터베이스 항목에 포함): Case ID, 작성일자, 공급자/공급받는자, 공급가액, 세액, 합계금액, 생성 시각 등 — 실제 연결된 테이블도 이 필드 구성을 기준으로 한다.

**필요한 작업** (남은 부분):
- `Settlement` 컴포넌트에서 저장된 이력을 조회·재표시하는 화면 로직(테이블 저장 자체는 완료됐으므로 조회 UI 마감이 남은 작업)

**연결 지점**: `taxInvoiceEngine.ts`의 `buildTaxInvoice()`, `page.tsx`의 `Settlement` 컴포넌트, Supabase `tax_invoices` 테이블(연결 완료).

## 9. 데이터베이스 — Case·과거 견적·세금계산서 이력

**현재 상태**: 원래 `db/schema.ts`는 의도적으로 빈 파일이었고 Drizzle은 설정만 돼 있었으며(Cloudflare D1 미사용), `app/page.tsx`의 `useState`가 모든 상태를 들고 있어 새로고침하면 등록한 Case가 전부 사라졌다. **2026-08-12 갱신 — 대부분 완료**: 당초 후보였던 Cloudflare D1 + Drizzle 대신 **Supabase Postgres**로 실제 구현했다. `cases`/`case_status_history`/`historical_quotes`/`documents`/`contracts`/`tax_invoices`/`dispute_chat_messages`/`market_data`/`news_articles` 테이블이 모두 준비되어 있고, `listCases()`로 Case 목록을 DB에서 조회하며 등록·상태변경·문서업로드·계약체결·세금계산서 발행·이의제기 채팅이 Supabase에도 함께 저장된다(다만 저장은 **best-effort** — 실패해도 로컬 UI는 그대로 반영되고 토스트로만 알린다). `app/page.tsx`의 `useState` 기반 상태 관리를 API 호출 기반으로 바꾸는 리팩터링은 이 방식(로컬 상태 우선 + best-effort DB 동기화)으로 사실상 완료된 것으로 볼 수 있다.

**당초 설계했던 최소 테이블 구성**(실제로 아래 성격 그대로 구현됨):
- `cases` — Case 데이터(`CaseItem` 타입 그대로, `app/lib/types.ts` 참고) + 상태 이력
- `historical_quotes` — 코레일 실제 계약 이력(`HistoricalQuote` 타입, `marketData.ts` 참고) — 유사 견적 매칭·σ 판정의 기준 데이터라 정확도에 직접 영향
- `documents` — 업로드된 문서 메타데이터(파일 경로, 추출 결과, 대조 상태)
- `contracts` — 계약 특약 조항, 전자서명 상태
- `tax_invoices` — 화면에서 생성한 세금계산서 미리보기 저장(실제 홈택스 발행 이력 아님, 8번 참고)
- `dispute_chat_messages` — 이의제기 챗봇 대화 이력(당초 설계에서는 선택 항목이었으나 실제로는 구현됨)

**남은 것**: `historical_quotes`(코레일 실제 계약 이력, 지금은 44건 하드코딩 목업)·`market_data`(환율·유가·해상운임)·`news_articles`(물류 뉴스)는 **테이블은 있지만 실제 데이터가 아직 목업이다** — 1~4번 항목의 외부 API 연동이 끝나야 진짜 데이터로 채워진다. 유사 견적 매칭·σ 판정의 기준 데이터라 정확도에 직접 영향을 준다.

**후보 연동 대상(당초, 현재는 Supabase로 대체)**: Cloudflare D1(`db/index.ts`에 바인딩 준비는 되어 있었음, `env.DB` 미설정) + Drizzle ORM(devDependency로 설치됨) — 실제로는 사용하지 않고 Supabase를 선택했다.

**연결 지점**: `app/lib/supabase.ts`의 CRUD 함수, `page.tsx`의 상태 관리 훅(`Home`·`CaseWorkspace` 등 Case 상태를 들고 있던 컴포넌트들이 이 리팩터링의 영향을 가장 크게 받았다), `supabase/migrations/`의 SQL 마이그레이션 3개.

## 10. 파일 저장소 — 업로드 문서 원본

**현재 상태**: 원래 문서 업로드 UI는 있지만 파일을 저장하지도, 읽지도 않았다(파일명만 받고 버림). **2026-08-12 갱신 — 저장은 완료**: Supabase Storage `case-documents` 버킷에 업로드 원본이 저장되고, `documents` 테이블에 메타데이터가 함께 기록된다.

**남은 작업**: 업로드된 원본 파일(계약서/Packing List/화물운송장/B/L/Invoice)의 저장 자체는 완료됐으니, 5번(AI 문서 추출)이 이 저장된 파일을 실제로 읽어 선정한 LLM API에 전달하도록 연결하는 것 — 저장은 됐지만 "읽어서 추출"하는 파이프라인은 아직 없다.

**후보 연동 대상(당초, 현재는 Supabase Storage로 대체)**: Cloudflare R2(버킷 바인딩은 `vite.config.ts`에 옵션으로 준비돼 있었음) — 실제로는 사용하지 않고 Supabase Storage를 선택했다.

**연결 지점**: `page.tsx`의 `uploadDoc()`, `DocumentCard`의 파일 입력 핸들러, Supabase Storage `case-documents` 버킷 + `documents` 테이블.

## 11. 인증/사용자 관리

**현재 상태**: 원래 로그인 화면 자체가 없었다. 사이드바에 "김도윤 · 국제물류사업처"가 하드코딩되어 있고, 모든 사용자가 같은 데이터를 본다는 전제였다. **2026-08-12 갱신 — 완료**: Supabase Auth로 `/login`(이메일 로그인·회원가입)이 실제로 동작한다. 세션이 유지되고, 사이드바 하단 프로필·홈 인사말이 로그인한 사용자의 실제 이름·이메일로 바뀐다. `profiles` 테이블에 이름·회사명·역할을 저장하고, RLS로 "로그인 사용자 본인 Case와 관리자·운영자 접근 제한"까지 구현했다. 테스트 계정은 `admin@gmail.com`/`admin@`, 관리자 권한은 `profiles.role='admin'`.

**남은 작업**: 관리자·운영자·일반 사용자·읽기 전용 등 **역할별로 화면·기능 단위 UI 권한을 세분화**하는 작업 — 지금은 로그인 여부·기본 role 저장까지만 되어 있고, 역할에 따라 어떤 화면·버튼을 보여줄지 나누는 모델은 아직 설계 전이다. 당초 요구사항에는 이 외에도 **사내 SSO 연동**(자연스러운 선택지로 제안됨), **Case별 담당자·조직 구분**, **권한(열람/수정/승인) 모델 설계**가 함께 있었다 — SSO는 Supabase Auth(이메일 로그인)로 대체 구현됐고, Case별 담당자·조직 구분과 열람/수정/승인 단위의 권한 모델은 위 역할별 UI 권한 세분화와 함께 아직 설계 전이다.

**연결 지점**: `app/login/page.tsx`, `app/lib/supabase.ts`의 Auth 함수, `profiles` 테이블, RLS 정책(Supabase 대시보드/SQL). 9번(DB)과 함께 진행됐다.
