# 서버 스키마

여러 명이 같은 교재를 쓰고, 매일 남긴 기록으로 서로 인증을 확인하기 위한 부분.
설계 근거는 [`docs/RESTRUCTURE.md` §14](../docs/RESTRUCTURE.md).

```
migrations/0001_init.sql     테이블 · RLS 정책 · 인증 판정 뷰 · 가입 RPC
migrations/0002_storage.sql  녹음/사진 버킷과 접근 정책
tests/run.sh                 맨 Postgres 위에서 정책을 실제로 두들겨 본다
```

## 올리는 법

Supabase 대시보드 → SQL Editor 에 `0001` → `0002` 순서로 붙여 넣고 실행한다.
(`supabase` CLI 를 쓴다면 `supabase db push`.)

그다음 앱에 필요한 값은 두 개다.

```
VITE_SUPABASE_URL       프로젝트 URL
VITE_SUPABASE_ANON_KEY  anon (public) 키
```

둘 다 브라우저에 노출되는 걸 전제로 만들어진 공개 값이다. 실제 권한은 키가 아니라
RLS 정책이 판정한다. **`service_role` 키는 RLS 를 통째로 무시하므로 이 앱에 넣지 않는다.**

Authentication → Providers 에서 **Anonymous sign-ins** 를 켜야 초대코드 방식이 동작한다.

## 테스트

```sh
npm run test:sql
```

Supabase 를 띄우지 않고 로컬 Postgres 에서 돈다. `auth` 스키마와 `auth.uid()`,
`anon`/`authenticated` 롤만 [`tests/00_stub.sql`](tests/00_stub.sql) 로 흉내낸다.
사용자 세 명(같은 스터디 둘 + 남 하나)을 연기하면서, 남의 기록이 보이는지 · 남의
이름으로 쓸 수 있는지 · 인증 기준을 바꾸면 과거 판정이 따라 바뀌는지를 확인한다.

정책은 문법이 맞아도 뜻이 틀릴 수 있고, 틀리면 남의 기록이 보인다. 고칠 때마다 돌린다.

Storage 정책(`0002`)은 `storage` 스키마가 있어야 해서 이 테스트에 포함되지 않는다.

## 한눈에

```
study ──┬── member ──┬── srs_card          (본인만)
        │            ├── chapter_progress  (본인만)
        │            └── study_log ── day_check 뷰 ── study_board()
        └── book (JSONB 문서, PK = study_id + book_id)
```
