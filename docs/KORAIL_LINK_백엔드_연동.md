# KORAIL LINK 백엔드 연동 현황

> 최종 업데이트: 2026-08-13 (프론트엔드 전면 교체 반영)
>
> 기준: 현재 저장소 코드와 Supabase 프로젝트에 적용한 마이그레이션

## 요약 — 2026-08-13 프론트엔드 전면 교체로 연동 상태가 크게 바뀌었다

이 날짜에 프론트엔드 전체(`app/page.tsx` 및 `app/lib/*.ts`)를 별도로 공유받은 Figma 데모 코드로 통째로 교체했다. 화면 구조·라우팅 방식·데이터 모델이 이전과 달라지면서, **이전에 "완료"로 표시했던 백엔드 연동 상당수가 현재 프론트엔드에서는 호출되지 않는 상태(연결 끊김)가 됐다.** Supabase 스키마·마이그레이션·API 라우트 파일 자체는 삭제하지 않고 그대로 남겨뒀으므로, 프론트엔드 쪽에서 다시 이어붙이는 작업이 필요하다.

**가장 중요한 변화: 로그인 기능이 없다.** `app/login/page.tsx`와 인증 관련 코드(로그인/로그아웃, 세션 조회, 프로필 조회)를 전부 제거했다. 지금 프론트는 비로그인 상태로 로컬 state(`useState`)만으로 동작한다. 기존 RLS 정책이 `auth.uid()` 기준으로 쓰기를 제한하는 테이블이 있다면, 지금 프론트에서 시도하는 Supabase 쓰기(아래 참고)는 인증 세션이 없어 실패할 가능성이 높다.

## 현재 아키텍처

```text
브라우저 (단일 파일 SPA — app/page.tsx)
 ├─ 화면 전환은 history.pushState + pathname 문자열 매칭으로 직접 구현
 │   (Next.js App Router의 파일 기반 라우팅을 쓰지 않음. app/[...slug]/page.tsx가
 │   모든 하위 경로를 같은 컴포넌트로 받아 새로고침에도 동일 화면을 그린다)
 ├─ app/lib/*.ts — 견적 검증·문서 추출·계약 특약·정산 대조 로직은 전부
 │   로컬 시뮬레이션(하드코딩 목업 계산)이며 이전 버전과 함수 시그니처가 다르다
 ├─ Supabase 호출 (인증 없이 시도) — app/lib/supabase.ts
 │   ├─ listCases / createCase / updateCaseStatus
 │   ├─ uploadCaseDocument / saveDocumentRecord
 │   ├─ saveContract / saveTaxInvoice / saveDisputeMessage
 │   └─ (로그인·세션 조회 함수 없음)
 └─ app/api/* Route Handler — 파일은 존재하지만 현재 프론트가 호출하지 않음
     ├─ /api/dispute-chat (Anthropic Claude)
     ├─ /api/documents/extract, /api/documents/draft
     ├─ /api/market, /api/news
```

Cloudflare Worker, D1, Drizzle, `backend/` 폴더는 여전히 현재 앱의 실행 경로가 아니다.

## 구현 상태 (2026-08-13 교체 이후 기준)

| 기능 | 상태 | 비고 |
| --- | --- | --- |
| 로그인·회원가입·로그아웃 | **제거됨** | 요청에 따라 프론트에서 완전히 제거. `profiles` 테이블·RLS는 남아있지만 호출부가 없다 |
| Case 조회·생성·상태변경 | 프론트에서 호출은 함 (인증 없이) | `app/lib/supabase.ts`의 `listCases`/`createCase`/`updateCaseStatus`. RLS가 `auth.uid()`를 요구하면 실패할 수 있음 — 확인 필요 |
| 계약 승인/결재 이력, 전자서명 데이터 저장 | **연결 끊김** | `contract_approvals` 테이블(마이그레이션 6번)과 이전 `listContractApprovals`/`createContractApproval`/`decideContractApproval` 함수가 새 `supabase.ts`에 없음. 전자서명은 현재 화면 안에서만 상태가 도는 시뮬레이션(새로고침 시 소실) |
| 계약 확정 시 Cost Ledger 확정 저장 | **연결 끊김** | 이전 `replaceCostLedger`/`listCostLedger`가 새 `supabase.ts`에 없음. 계약 별첨 금액은 화면에서만 계산 |
| 문서 업로드(파일) | 프론트에서 호출은 함 | `uploadCaseDocument`/`saveDocumentRecord`로 Storage 업로드 + 메타데이터 저장 시도 |
| 문서 AI/OCR 추출 결과 저장, 필드 변경 이력 | **연결 끊김** | 이전 `updateDocumentExtractionResult`/`decideCaseFieldChange`(→ `case_field_change_history`)가 새 `supabase.ts`에 없음. 추출 결과는 화면 시뮬레이션이고 저장되지 않음 |
| Invoice 대조 결과 저장 | **연결 끊김** | 이전 `saveInvoiceComparison`(→ `invoice_line_items`/`invoice_ledger_matches`)이 새 `supabase.ts`에 없음 |
| 세금계산서 저장 | 프론트에서 호출은 함, 필드 단순화 | `saveTaxInvoice`. 이전 `insert TaxInvoice`보다 저장 필드가 줄었을 수 있어 스키마 대조 필요 |
| 분쟁(이의제기) 챗봇 메시지 저장 | 프론트에서 호출은 함 | `saveDisputeMessage`. 다만 정산 탭 챗봇과 "개별 챗봇"(앱 전체 플로팅 챗봇) 두 개로 나눴던 구조가 이번 교체로 하나(정산 탭 안 이의제기 챗봇만)로 되돌아갔다 — 필요하면 다시 분리 |
| 분쟁 챗봇 API 호출 | **연결 끊김** | `/api/dispute-chat` 라우트는 있지만 새 프론트가 호출하지 않음. 이의제기 챗봇은 화면 안 규칙 기반 응답(`disputeChatEngine.ts`)만 사용 |
| 문서 AI 추출/초안 API 호출 | **연결 끊김** | `/api/documents/extract`, `/api/documents/draft` 라우트는 있지만 새 프론트가 호출하지 않음 |
| 환율·유가·뉴스 실시간 데이터 | **연결 끊김** | `/api/market`, `/api/news` 라우트는 있지만 새 프론트가 호출하지 않음. 화면 데이터는 전부 하드코딩 목업 |
| 전자서명(실제 SDK) | 미완료 | 화면 상태 전환 시뮬레이션만 있음 (이전과 동일) |
| 전자세금계산서 실제 발행 | 미완료 | 발행 대행 API 미연결 (이전과 동일) |

## 데이터 모델 불일치 — 재연동 전 먼저 확인할 것

새 프론트의 `CaseItem` 타입(`app/lib/types.ts`)은 `route`(문자열), `price`(총액 하나) 같은 단순 필드 구조다. 이전에는 `masterData`(운송 기준정보 객체) · `costLedger[]`(구간별 원가/운임 배열) · `invoiceLines[]` · `contract` · `documents[]` 등으로 세분화되어 있었고, Supabase 스키마(`cost_ledger_items`, `invoice_line_items`, `case_field_change_history`, `contract_approvals` 등)도 그 세분화된 구조에 맞춰 설계했다.

즉 **DB 스키마는 예전 세분화된 구조를 그대로 유지하고 있는데, 프론트 데이터 모델은 단순화됐다.** 재연동 시 다음 중 하나를 선택해야 한다.

1. 프론트의 `CaseItem`을 다시 세분화된 구조로 확장하고, 화면 컴포넌트(계약/문서/정산 탭)에서 그 구조를 직접 다루도록 수정
2. 프론트는 단순 구조를 유지하고, Supabase 저장/조회 시 세분화된 테이블과 매핑하는 어댑터 레이어를 `app/lib/supabase.ts`에 추가

## Supabase 마이그레이션

아래 파일은 Supabase SQL Editor에서 날짜 순서로 적용한다. 현재 프로젝트에는 1~7번을 적용했다.

1. `supabase/migrations/20260813000000_initial_schema.sql`
2. `supabase/migrations/20260813000001_storage.sql`
3. `supabase/migrations/20260813000002_contracts_unique_case.sql`
4. `supabase/migrations/20260813000003_case_data_connection.sql`
5. `supabase/migrations/20260813000004_storage_read_policy.sql`
6. `supabase/migrations/20260813000005_cases_legacy_compatibility.sql`
7. `supabase/migrations/20260813000006_internal_contract_approvals.sql` — `contract_approvals` 테이블(결재자·승인/반려·서명 이미지). 현재 프론트에서 쓰는 곳 없음(위 표 참고)

6번은 기존 `cases` 테이블에 누락된 `container_type` 등 컬럼을 추가하는 호환 마이그레이션이다. 기존 테이블이 있을 때 `CREATE TABLE IF NOT EXISTS`가 컬럼을 추가하지 않는 문제를 보완한다.

## Storage 규칙

- 버킷명: `case-documents`
- 업로드 경로: `{auth.uid}/{caseId}/{uuid}-{fileName}`
- 업로드·조회·삭제는 업로더 본인의 첫 번째 경로 폴더로 제한한다.
- **로그인이 없어졌으므로 `auth.uid()`가 없는 상태에서 업로드를 시도하면 이 정책 때문에 막힐 가능성이 높다.** 로그인을 다시 붙이거나, 비로그인 업로드를 허용하도록 정책을 바꿔야 한다.

## 환경 변수

`.env.local`에 다음 값을 설정한다. 비밀값은 Git에 커밋하지 않는다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
NAVER_CLIENT_ID=YOUR_NAVER_CLIENT_ID
NAVER_CLIENT_SECRET=YOUR_NAVER_CLIENT_SECRET
```

`ANTHROPIC_API_KEY`, `NAVER_CLIENT_ID/SECRET`는 브라우저 코드가 아닌 서버 Route Handler(`/api/dispute-chat`, `/api/news`)에서만 쓴다. 다만 위 표에서 보듯 지금 프론트는 이 라우트들을 호출하지 않는다.

## 재연동 체크리스트

1. **로그인을 다시 붙일지 결정.** 붙인다면 `app/page.tsx`에 이전의 인증 상태(`authEmail`/`authName`/`authRole`)·프로필 조회·로그인 화면을 다시 추가하고, RLS 정책과 맞춰야 한다. 계속 없앤 채로 간다면 관련 테이블의 RLS를 익명 쓰기 허용으로 조정해야 한다.
2. **계약 승인/전자서명 데이터 저장**을 `contract_approvals` 테이블에 다시 연결 (`Contract` 컴포넌트, `app/page.tsx`).
3. **계약 확정 시 Cost Ledger를 `cost_ledger_items`에 저장**하도록 재연결.
4. **문서 AI 추출 결과·필드 변경 이력**을 `documents`/`case_field_change_history`에 저장하도록 재연결, 또는 `/api/documents/extract`·`/api/documents/draft` 라우트를 다시 호출하도록 프론트 수정.
5. **Invoice 대조 결과**를 `invoice_line_items`/`invoice_ledger_matches`에 저장하도록 재연결.
6. **이의제기 챗봇**을 `/api/dispute-chat`(Anthropic Claude) 호출로 재연결. 이 김에 "정산 도우미"(정산 탭 전용)와 "개별 챗봇"(앱 전체 플로팅) 분리 구조를 다시 넣을지 결정.
7. **환율·유가·뉴스**를 `/api/market`·`/api/news` 호출로 재연결(현재는 하드코딩 목업).
8. 데이터 모델 불일치(위 섹션) 해결 방식을 먼저 정하고 나서 위 항목들을 순서대로 진행하는 것을 권장 — 안 그러면 매 항목마다 매핑 방식을 다시 고민하게 된다.

## 운영 전 확인 절차 (재연동 완료 후)

1. Supabase에서 마이그레이션 1~7번 적용 여부 확인
2. 로그인을 다시 붙였다면: 가입 후 `profiles` 행 생성 확인, `cases.owner_id` 설정 확인
3. Case 문서 화면에서 파일 업로드 후 Storage와 `documents` 행 확인
4. 계약 확정 후 `contracts`, `cost_ledger_items`, `contract_approvals` 행 확인
5. 정산 화면에서 Invoice를 수정한 뒤 `invoice_line_items`, `invoice_ledger_matches`, `tax_invoices` 행 확인
6. Anthropic/Naver 환경 변수를 설정한 뒤 이의제기 챗봇·뉴스 호출 확인
7. `npm run lint`, `npm run build` 통과 및 배포 환경 변수 등록

## 외부 연동을 완료하려면 필요한 정보

| 연동 | 필요한 정보 |
| --- | --- |
| 환율·유가·뉴스 | 사용할 데이터 제공사, API 키, 갱신 주기 |
| KCCI/KCI | 공식 데이터 제공 방식 또는 사용 허가된 데이터 소스 |
| 문서 AI/OCR | 공급사 선택, API 키, PDF/이미지 처리 정책 |
| 전자서명 | 공급사 계정, API 키, Webhook URL/Secret |
| 전자세금계산서 | 발행 대행사 계약, API 인증 정보, 사업자 검증·발행 절차 |
