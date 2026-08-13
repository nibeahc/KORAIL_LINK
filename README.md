# KORAIL LINK

> **AI 기반 국제철도 복합운송 업무 인텔리전스 플랫폼**

KORAIL LINK는 견적 검증부터 계약, 운송 문서, 정산까지 흩어진 국제철도 복합운송 업무를 하나의 Case 단위로 연결합니다. 담당자는 AI가 제시한 근거를 확인하고, 최종 데이터 반영 여부를 직접 결정합니다.

## 문제 정의

국제철도 복합운송 업무에서는 견적, 계약서, Packing List, SMGS, B/L, Invoice가 서로 다른 파일과 시스템에 분산됩니다. 이 과정에서 반복 입력, 금액 차이 원인 파악, 최신 시황 확인에 많은 시간이 소요됩니다.

KORAIL LINK는 이를 **Case Master Data**로 연결해, 업무 흐름 전체에서 같은 기준 정보를 사용하도록 설계했습니다.

## 핵심 기능

### 1. AI 운임 인텔리전스

- 노선 40% · 컨테이너 25% · 운송 시기 20% · 화물 특성 15%의 가중치로 유사 견적 탐색
- 유사 사례 중앙값과 분산을 기준으로 `적정 수준 / 다소 높음 / 다소 낮음 / 확인 필요` 판정
- 환율, Brent 유가, KCCI, KCI 시계열 변화를 견적 보정 근거로 반영
- 뉴스 이슈와 운임 변동 맥락을 한 화면에서 확인

### 2. Case Master Data 기반 문서 자동화

- 계약서, Packing List, SMGS, B/L 문서 업로드
- AI OCR을 통한 문서 필드 추출 및 Case 데이터 대조
- `일치 / 확인 필요 / 불일치` 상태 제시
- AI가 기존 데이터를 임의로 덮어쓰지 않고, 담당자가 **현재 값 유지 / 문서 값 반영 / 확인 필요** 중 선택
- Case 데이터 기반 SMGS 초안 자동 생성

### 3. Cost Ledger 기반 계약·정산 연결

- 계약 단계에서 운송비를 구간·비용 항목별 Cost Ledger로 구조화
- Invoice OCR로 비용 항목과 금액을 추출
- Ledger와 비교해 `일치 / 금액 차이 / 계약 미등록 신규 항목 / 미청구·누락 / 매칭 확인 필요` 표시
- 총액 차이뿐 아니라 차액이 발생한 비용 항목을 확인

### 4. 국제물류 브리핑

- RSS 및 뉴스 검색 기반 국제물류 뉴스 수집
- 한국어 제목·요약 변환 및 원문 링크 제공
- TCR, 운항, 지정학 등 물류 영향 카테고리 분류

## 사용자 흐름

```text
Case 생성
  → 유사 견적 + 시황 기반 AI 검증
  → 계약 조건 및 Cost Ledger 확정
  → 운송 문서 OCR·대조·담당자 승인
  → Invoice 항목 자동 비교·정산 검토
```

## 기술 구성

| 영역 | 사용 기술 |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS |
| Runtime / API | Vinext 기반 Next.js App Router, Cloudflare Workers 호환 구조 |
| Database / Storage / Auth | Supabase PostgreSQL, Storage, Anonymous Auth |
| 문서 AI | Anthropic Claude Vision 기반 문서 필드 추출 |
| 시황 데이터 | Frankfurter 환율 API, FRED Brent 시계열, KOBC KCCI/KCI, 뉴스 RSS·Naver 검색 |
| 배포 | Vercel 또는 Cloudflare Workers 환경 |

## 주요 API

| 경로 | 역할 |
| --- | --- |
| `/api/market` | 환율·Brent·KCCI·KCI 최신값 및 시계열 조회 |
| `/api/news` | 국제물류 뉴스 수집·번역·원문 링크 제공 |
| `/api/documents/extract` | 계약서·Packing List·SMGS·B/L OCR 추출 |
| `/api/invoices/extract` | Invoice 비용 항목·금액 OCR 추출 |
| `/api/quotes/import` | 과거 견적 CSV 적재 |
| `/api/persist` | 로그인 없는 Case 저장 보조 API |

## 실행 방법

### 1. 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env.local`을 생성합니다.

```bash
Copy-Item .env.example .env.local
```

필수 환경변수는 다음과 같습니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Naver Secret은 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않으며, Git에 커밋하지 않습니다. 배포 시에는 Vercel 또는 Cloudflare의 환경변수 설정에 동일하게 등록합니다.

Supabase Dashboard에서는 **Anonymous Sign-Ins**를 활성화해야 로그인 화면 없이 사용자별 저장 기능이 동작합니다.

### 3. Supabase 스키마 적용

```bash
supabase link --project-ref <project-ref>
supabase db push
```

마이그레이션 파일은 [`supabase/migrations`](./supabase/migrations)에 있습니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

### 5. 검증 및 빌드

```bash
npx tsc --noEmit
npm run build
```

## 공모전 시연 포인트

1. Case를 열고 AI 견적 검증에서 유사 사례와 시황 근거를 확인합니다.
2. 계약에서 구간별 비용을 Cost Ledger로 확정합니다.
3. Packing List 또는 Invoice를 업로드해 OCR 결과와 기존 Case 데이터를 비교합니다.
4. 담당자가 반영 여부를 선택하고 정산 탭에서 비용 차이 원인을 확인합니다.
5. 라이브 브리핑에서 물류 이슈와 원문 뉴스를 확인합니다.

## 구현 범위 안내

실제 API 연결이 된 기능은 환경변수가 설정된 배포 환경에서 외부 데이터를 조회합니다. 반면 공모전 데모의 일관된 시연을 위해 과거 유사 견적 사례와 일부 계약·정산 시나리오는 상세 목업 데이터도 함께 제공합니다.

전자서명, 전자세금계산서 실제 발행, 운영 알림·모니터링은 현재 범위에서 제외했습니다.

---

KORAIL LINK — *From fragmented logistics data to one connected operational decision.*
