# KORAIL LINK

코레일 국제복합운송(유라시아 철도) 업무 지원 데모 플랫폼. 운임 인텔리전스(AI 견적 검증)와 Single Data Entry(견적 → 계약 → 문서 → 정산 데이터 연결)를 하나로 통합한다.

각 기능의 판정 공식·데이터 로직은 [`docs/KORAIL_LINK_기능_상세_스펙.md`](./docs/KORAIL_LINK_기능_상세_스펙.md), 외부 연동 현황은 [`docs/KORAIL_LINK_백엔드_연동.md`](./docs/KORAIL_LINK_백엔드_연동.md) 참고.

## 기술 스택

- [vinext](https://github.com/cloudflare/vinext) — Cloudflare Workers 위 Next.js App Router (Vite 기반)
- React 19, TypeScript, Tailwind CSS
- Supabase — Auth, Postgres, Storage

## 로컬 개발 환경 설정

1. 의존성 설치
   ```bash
   npm install
   ```

2. `.env.example`을 `.env.local`로 복사하고 Supabase 프로젝트 URL/anon key를 채운다.
   ```bash
   cp .env.example .env.local
   ```
   `.env.local`이 없으면 `app/lib/supabase.ts`가 클라이언트 생성 시점에 즉시 예외를 던진다.

3. Supabase 마이그레이션 적용 (`supabase/migrations/`)
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

4. **테스트 계정 생성 (수동)** — Supabase 대시보드 `Authentication → Users`에서:
   - 이메일 `admin@gmail.com`, 비밀번호로 계정을 하나 만든다.
   - Table Editor에서 `profiles` 테이블을 열어 방금 만든 계정의 `role` 값을 `admin`으로 바꾼다.

5. 개발 서버 실행
   ```bash
   npm run dev
   ```
   `/login`에서 로그인/회원가입, 로그인 후 `/`에서 Case 목록을 확인할 수 있다. DB가 비어 있거나 로그인 전이면 목업 Case 3건이 자동으로 보인다.

## 타입 체크

```bash
npx tsc --noEmit
```
