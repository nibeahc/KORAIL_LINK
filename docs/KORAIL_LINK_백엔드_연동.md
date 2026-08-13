# KORAIL LINK 백엔드 연동 현황

> 최종 업데이트: 2026-08-13
>
> 기준: 현재 저장소 코드와 Supabase 프로젝트에 적용한 마이그레이션

## 요약

KORAIL LINK의 업무 데이터는 Supabase Auth, PostgreSQL, Storage를 사용한다. 분쟁 챗봇은 Next.js API Route `POST /api/dispute-chat`에서 OpenRouter를 호출한다.

Supabase의 기본 스키마와 비용·Invoice·문서 이력 테이블, Storage 정책은 SQL Editor에 적용했다. 현재 앱은 Case, 계약, 세금계산서 초안, 분쟁 챗봇 이력, 문서 파일 및 메타데이터를 Supabase에 저장한다.

외부 시세·뉴스, 실제 OCR/문서 AI 추출, 전자서명, 전자세금계산서 실제 발행은 아직 연동하지 않았다.

## 현재 아키텍처

```text
브라우저 (Next.js)
 ├─ Supabase Auth / Postgres / Storage
 │   ├─ profiles, cases, documents, contracts
 │   ├─ cost_ledger_items, invoice_line_items, invoice_ledger_matches
 │   ├─ case_status_history, case_field_change_history
 │   ├─ tax_invoices, dispute_chat_messages
 │   └─ Storage bucket: case-documents
 └─ POST /api/dispute-chat (Next.js Route Handler)
     └─ OpenRouter Chat Completions API
```

Cloudflare Worker, D1, Drizzle, `backend/` 폴더는 현재 앱의 실행 경로가 아니다.

## 구현 상태

| 기능 | 상태 | 구현 위치 / 비고 |
| --- | --- | --- |
| 이메일 회원가입·로그인·로그아웃 | 완료 | `app/login/page.tsx`, `app/lib/supabase.ts` |
| 사용자 프로필과 역할 | 완료 | `profiles`, RLS 정책 |
| Case 조회·저장·상태 이력 | 완료 | `cases`, `case_status_history` |
| 계약 정보 저장 | 완료 | `contracts` |
| 계약 비용 원장 저장 | 완료 | 계약 확정 시 `cost_ledger_items` 저장 |
| Invoice 비교 저장 | 완료 | `invoice_line_items`, `invoice_ledger_matches` 저장 |
| 세금계산서 초안 저장 | 완료 | `tax_invoices`; 실제 국세청 발행은 제외 |
| 분쟁 챗봇 이력 저장 | 완료 | `dispute_chat_messages` |
| 분쟁 챗봇 API | 완료 | `app/api/dispute-chat/route.ts`, OpenRouter 키 필요 |
| 문서 파일 업로드 | 완료 | `case-documents` Storage 업로드 및 `documents` 메타데이터 저장 |
| 문서 필드 변경 이력 | 완료 | `case_field_change_history`, 문서 추출 결과 저장 |
| 문서 AI/OCR 추출 | 미완료 | 현재 추출 결과는 화면 시뮬레이션 |
| 환율·Brent·KCCI/KCI·뉴스 | 미완료 | 화면 데이터는 목업, 외부 API 미연결 |
| 전자서명 | 미완료 | UI 상태 전환만 존재, SDK/Webhook 미연결 |
| 전자세금계산서 실제 발행 | 미완료 | 발행 대행 API 미연결 |
| 운영 모니터링·감사 로그·통합 테스트 | 미완료 | 별도 구축 필요 |

## Supabase 마이그레이션

아래 파일은 Supabase SQL Editor에서 날짜 순서로 적용한다. 현재 프로젝트에는 1~6번을 적용했다.

1. `supabase/migrations/20260813000000_initial_schema.sql`
2. `supabase/migrations/20260813000001_storage.sql`
3. `supabase/migrations/20260813000002_contracts_unique_case.sql`
4. `supabase/migrations/20260813000003_case_data_connection.sql`
5. `supabase/migrations/20260813000004_storage_read_policy.sql`
6. `supabase/migrations/20260813000005_cases_legacy_compatibility.sql`

6번은 기존 `cases` 테이블에 누락된 `container_type` 등 현재 코드가 사용하는 컬럼을 추가하는 호환 마이그레이션이다. 기존 테이블이 있을 때 `CREATE TABLE IF NOT EXISTS`가 컬럼을 추가하지 않는 문제를 보완한다.

## Storage 규칙

- 버킷명: `case-documents`
- 업로드 경로: `{auth.uid}/{caseId}/{uuid}-{fileName}`
- 업로드·조회·삭제는 업로더 본인의 첫 번째 경로 폴더로 제한한다.
- 문서 원본은 Storage, 파일명·유형·추출 결과·경로는 `documents` 테이블에 저장한다.

## 환경 변수

`.env.local`에 다음 값을 설정한다. 비밀값은 Git에 커밋하지 않는다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=google/gemma-3-27b-it:free
OPENROUTER_SITE_URL=http://localhost:3000
```

`OPENROUTER_API_KEY`는 브라우저 코드가 아닌 서버 Route Handler에서만 사용한다.

## 운영 전 확인 절차

1. Supabase에서 마이그레이션 적용 여부 확인
2. 사용자 가입 후 `profiles` 행 생성 확인
3. 로그인한 사용자의 `cases.owner_id`를 해당 사용자 UUID로 설정
4. Case 문서 화면에서 파일 업로드 후 Storage와 `documents` 행 확인
5. 계약 확정 후 `contracts`, `cost_ledger_items` 행 확인
6. 정산 화면에서 Invoice를 수정한 뒤 `invoice_line_items`, `invoice_ledger_matches`, `tax_invoices` 행 확인
7. OpenRouter 환경 변수를 설정한 뒤 분쟁 챗봇 호출 확인
8. `npm run lint`, `npm run build` 통과 및 배포 환경 변수 등록

## 외부 연동을 완료하려면 필요한 정보

| 연동 | 필요한 정보 |
| --- | --- |
| 환율·유가·뉴스 | 사용할 데이터 제공사, API 키, 갱신 주기 |
| KCCI/KCI | 공식 데이터 제공 방식 또는 사용 허가된 데이터 소스 |
| 문서 AI/OCR | 공급사 선택, API 키, PDF/이미지 처리 정책 |
| 전자서명 | Modusign 등 공급사 계정, API 키, Webhook URL/Secret |
| 전자세금계산서 | 발행 대행사 계약, API 인증 정보, 사업자 검증·발행 절차 |
