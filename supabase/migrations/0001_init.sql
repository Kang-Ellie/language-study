-- ─────────────────────────────────────────────────────────────────────────
-- My Study Duolingo — 스터디 공유 스키마 (0001)
--
-- 설계 원칙 세 가지. 클라이언트 코드와 같은 원칙을 서버에서도 지킨다.
--
--  1) 교재(book)는 JSONB 문서 한 줄이다.
--     클라이언트의 Unit/Lesson/Section/Word/Sentence 를 테이블 5개로 펼치면
--     정규화 이득은 있지만, 이 앱에서 교재는 "가끔 한 사람이 통째로 고치는"
--     문서다. 문장 하나만 동시에 고치는 상황이 없다. 반대로 동기화는 문서 한 줄
--     통째 업서트가 압도적으로 단순하고, 클라이언트 타입과 1:1로 붙는다.
--     (PRD §1.2의 완전 정규화 Prisma 안에서 의도적으로 벗어난 지점 —
--      docs/RESTRUCTURE.md §14 에 근거를 적어 둔다.)
--
--  2) 사람별 데이터(srs_card / chapter_progress / study_log)는 관계형 행이다.
--     여기는 반대다. 여러 명이 각자 자주 쓰고, "오늘 누가 인증했나" 처럼
--     사람을 가로질러 세는 질의가 핵심이다. 문서로 뭉치면 둘 다 못 한다.
--
--  3) 파생값은 저장하지 않는다.
--     진도·인증 여부·스트릭은 전부 기록에서 계산한다. 클라이언트의
--     lib/progress.ts · lib/checkin.ts 와 같은 규칙을 뷰/함수로 옮겨 적었다.
--     저장해 두면 규칙을 바꾼 순간 과거 데이터가 거짓말을 하기 시작한다.
--
-- 항목 id(item_id) · 챕터 id(chapter_id) · 교재 id(book_id)는 클라이언트가 만든
-- 경로형 문자열이다 (예: zh-mccs-l1-conv/c1/s1/w3). 서버는 이 값을 해석하지 않고
-- 그대로 키로 쓴다. id 생성 규칙은 src/lib/normalize.ts 한 곳에만 있다.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- 정책 헬퍼용 스키마. public 이 아니므로 PostgREST 로 노출되지 않는다.
create schema if not exists app;

-- ── 스터디 ────────────────────────────────────────────────────────────────

create table public.study (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  -- 초대코드. 사람이 카톡으로 불러 주는 값이라 헷갈리는 글자(O/0/I/1)를 뺐다.
  invite_code   text not null unique check (invite_code ~ '^[A-Z2-9]{6}$'),
  -- 하루에 무엇을 남겨야 '인증 완료'인가. 클라이언트 CheckInRule 과 같은 값.
  check_in_rule text not null default 'either' check (check_in_rule in ('either', 'recording', 'both')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.study.check_in_rule is
  'either=녹음 또는 쓰기 / recording=녹음 필수 / both=둘 다. day_check 뷰가 이 값으로 판정한다.';

-- ── 구성원 ────────────────────────────────────────────────────────────────
--
-- 한 사람이 여러 스터디에 들어갈 수 있고, 스터디마다 다른 이름을 쓸 수 있다.
-- 그래서 표시 이름은 auth.users 가 아니라 여기에 붙는다.

create table public.member (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references public.study (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (study_id, user_id),
  -- 아래 테이블들이 (study_id, member_id) 복합 외래키로 참조한다.
  -- 남의 스터디 member_id 를 내 스터디 행에 박아 넣는 걸 DB가 막아 준다.
  unique (id, study_id)
);

create index member_user_idx on public.member (user_id);

-- ── 교재 ──────────────────────────────────────────────────────────────────
--
-- 기본키가 (study_id, book_id) 인 이유: 내장 교재 zh-mccs-l1-conv 를 두 스터디가
-- 각자 고칠 수 있어야 한다. book_id 는 전역 유일이 아니라 스터디 안에서만 유일하다.

create table public.book (
  study_id   uuid not null references public.study (id) on delete cascade,
  book_id    text not null check (btrim(book_id) <> ''),
  doc        jsonb not null,
  -- 책장 목록을 그리려고 문서 전체를 내려받을 필요는 없다. 자주 쓰는 두 필드만 뽑아 둔다.
  lang       text generated always as (doc ->> 'lang') stored,
  title      text generated always as (doc ->> 'title') stored,
  -- 낙관적 동기화용. 클라이언트가 마지막으로 본 rev 를 들고 와서 갱신한다.
  rev        bigint not null default 1,
  -- 삭제도 동기화되어야 한다. 행을 지우면 다른 기기는 "아직 못 받은 책"과 구분할 수 없다.
  deleted_at timestamptz,
  updated_by uuid references public.member (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (study_id, book_id),
  constraint book_doc_is_object check (jsonb_typeof(doc) = 'object'),
  constraint book_doc_id_matches check (doc ->> 'id' = book_id)
);

create index book_updated_idx on public.book (study_id, updated_at desc);

-- ── 사람별 학습 상태 ──────────────────────────────────────────────────────

create table public.srs_card (
  study_id   uuid not null,
  member_id  uuid not null,
  item_id    text not null,
  level      smallint not null default 0 check (level between 0 and 5),
  next_at    date,
  seen       integer not null default 0 check (seen >= 0),
  wrong      integer not null default 0 check (wrong >= 0),
  last_seen  date,
  last_wrong date,
  updated_at timestamptz not null default now(),
  primary key (member_id, item_id),
  foreign key (member_id, study_id) references public.member (id, study_id) on delete cascade
);

create index srs_due_idx on public.srs_card (member_id, next_at);

create table public.chapter_progress (
  study_id     uuid not null,
  member_id    uuid not null,
  chapter_id   text not null,
  marked_done  boolean not null default false,
  marked_at    date,
  quiz_runs    integer not null default 0 check (quiz_runs >= 0),
  last_quiz_at date,
  updated_at   timestamptz not null default now(),
  primary key (member_id, chapter_id),
  foreign key (member_id, study_id) references public.member (id, study_id) on delete cascade
);

-- ── 학습 기록 (인증의 근거) ───────────────────────────────────────────────
--
-- 클라이언트의 LogEntry 와 같은 모양. 다만 id 는 uuid 다 —
-- 로컬 id 는 `${Date.now()}` 라서 두 사람이 같은 밀리초에 저장하면 충돌한다.
-- 대신 local_id 를 남겨 두어 같은 기록을 두 번 올려도 한 줄로 합쳐지게 한다.

create table public.study_log (
  id            uuid primary key default gen_random_uuid(),
  study_id      uuid not null,
  member_id     uuid not null,
  chapter_id    text not null,
  book_id       text,
  date          date not null,
  writing       text,
  note          text,
  -- Storage 오브젝트 경로. 버킷 안 경로는 `<study_id>/<member_id>/<파일명>`.
  audio_paths   text[] not null default '{}',
  image_paths   text[] not null default '{}',
  -- 인증 판정 재료. 클라이언트 checkin.ts 와 같은 규칙을 그대로 옮겼다:
  -- 사진·메모만 남긴 날은 인증이 아니고, 공백뿐인 쓰기는 쓰기로 치지 않는다.
  has_recording boolean generated always as (coalesce(array_length(audio_paths, 1), 0) > 0) stored,
  has_writing   boolean generated always as (btrim(coalesce(writing, '')) <> '') stored,
  local_id      text,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (member_id, study_id) references public.member (id, study_id) on delete cascade,
  unique (member_id, local_id)
);

create index study_log_board_idx on public.study_log (study_id, date desc);
create index study_log_chapter_idx on public.study_log (chapter_id, date desc);
create index study_log_member_idx on public.study_log (member_id, date desc);

-- ── updated_at 자동 갱신 ──────────────────────────────────────────────────

create function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger study_touch before update on public.study
  for each row execute function app.touch_updated_at();
create trigger book_touch before update on public.book
  for each row execute function app.touch_updated_at();
create trigger srs_touch before update on public.srs_card
  for each row execute function app.touch_updated_at();
create trigger progress_touch before update on public.chapter_progress
  for each row execute function app.touch_updated_at();
create trigger log_touch before update on public.study_log
  for each row execute function app.touch_updated_at();

-- 교재를 고칠 때마다 rev 를 올린다. 클라이언트가 직접 세면 어긋난다.
create function app.bump_rev() returns trigger
language plpgsql as $$
begin
  if new.doc is distinct from old.doc or new.deleted_at is distinct from old.deleted_at then
    new.rev := old.rev + 1;
  end if;
  return new;
end;
$$;

create trigger book_bump_rev before update on public.book
  for each row execute function app.bump_rev();

-- ── 권한 헬퍼 ─────────────────────────────────────────────────────────────
--
-- security definer 인 이유는 두 가지다.
--  · member 테이블의 RLS 정책이 member 테이블을 다시 읽으면 무한 재귀가 난다.
--  · 초대코드 조회를 정책 밖으로 빼야 코드를 하나씩 찔러 보는 게 불가능해진다.
-- security definer 함수는 search_path 를 고정하지 않으면 위험하다. 반드시 고정한다.

create function app.is_member_of(p_study uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.member m
    where m.study_id = p_study and m.user_id = auth.uid()
  );
$$;

create function app.owns_member(p_member uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.member m
    where m.id = p_member and m.user_id = auth.uid()
  );
$$;

create function app.is_owner_of(p_study uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.member m
    where m.study_id = p_study and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- 읽기 범위가 테이블마다 다르다는 게 핵심이다.
--  · study_log 는 같은 스터디원이 서로 본다. 그게 '인증'의 뜻이다.
--  · srs_card / chapter_progress 는 본인만 본다. 남의 오답률까지 공개할 이유는 없다.

alter table public.study            enable row level security;
alter table public.member           enable row level security;
alter table public.book             enable row level security;
alter table public.srs_card         enable row level security;
alter table public.chapter_progress enable row level security;
alter table public.study_log        enable row level security;

-- study: 내가 속한 스터디만 보인다. 만들기·들어가기는 아래 RPC 로만 한다.
create policy study_read on public.study
  for select using (app.is_member_of(id));
create policy study_update on public.study
  for update using (app.is_owner_of(id)) with check (app.is_owner_of(id));
create policy study_delete on public.study
  for delete using (app.is_owner_of(id));

-- member: 같은 스터디원끼리는 서로의 이름을 본다(인증 현황판에 필요).
create policy member_read on public.member
  for select using (app.is_member_of(study_id));
-- 이름 바꾸기는 본인만. 방장은 내보내기(삭제)만 할 수 있다.
create policy member_update_self on public.member
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy member_delete on public.member
  for delete using (user_id = auth.uid() or app.is_owner_of(study_id));

-- book: 같은 교재를 함께 쓰는 게 목적이므로 스터디원 누구나 고칠 수 있다.
create policy book_read on public.book
  for select using (app.is_member_of(study_id));
create policy book_write on public.book
  for insert with check (app.is_member_of(study_id));
create policy book_update on public.book
  for update using (app.is_member_of(study_id)) with check (app.is_member_of(study_id));
create policy book_delete on public.book
  for delete using (app.is_owner_of(study_id));

-- srs_card / chapter_progress: 본인 것만. 읽기도 본인만.
create policy srs_own on public.srs_card
  for all using (app.owns_member(member_id)) with check (app.owns_member(member_id));
create policy progress_own on public.chapter_progress
  for all using (app.owns_member(member_id)) with check (app.owns_member(member_id));

-- study_log: 읽기는 스터디 전체, 쓰기·지우기는 본인 것만.
create policy log_read on public.study_log
  for select using (app.is_member_of(study_id));
create policy log_insert on public.study_log
  for insert with check (app.owns_member(member_id));
create policy log_update on public.study_log
  for update using (app.owns_member(member_id)) with check (app.owns_member(member_id));
create policy log_delete on public.study_log
  for delete using (app.owns_member(member_id));

-- ── 인증 판정 ─────────────────────────────────────────────────────────────
--
-- 클라이언트 lib/checkin.ts 의 dayChecks() 와 같은 규칙.
-- 하루치 기록을 합쳐서 본다 — 아침에 녹음만, 저녁에 쓰기만 올려도 그날은 둘 다 한 것.
--
-- security_invoker: 뷰를 만든 사람이 아니라 조회하는 사람의 권한으로 읽는다.
-- 이걸 빼면 뷰가 RLS 를 통째로 우회한다.

create view public.day_check with (security_invoker = true) as
select
  l.study_id,
  l.member_id,
  l.date,
  bool_or(l.has_recording)              as has_recording,
  bool_or(l.has_writing)                as has_writing,
  count(*)::int                         as entries,
  case s.check_in_rule
    when 'recording' then bool_or(l.has_recording)
    when 'both'      then bool_or(l.has_recording) and bool_or(l.has_writing)
    else                  bool_or(l.has_recording) or bool_or(l.has_writing)
  end                                   as done
from public.study_log l
join public.study s on s.id = l.study_id
where l.deleted_at is null
group by l.study_id, l.member_id, l.date, s.check_in_rule;

comment on view public.day_check is
  '하루 단위 인증 판정. 저장하지 않고 study_log 에서 매번 계산한다.';

-- 연속 인증일. 오늘 아직 안 했어도 어제까지 이어졌으면 살아 있다
-- (아침에 열었을 때 0일이 떠서 의욕이 꺾이는 걸 막는다 — 클라이언트와 같은 규칙).
create function public.check_in_streak(p_member uuid, p_date date default current_date)
returns integer
language sql stable as $$
  with done as (
    select date from public.day_check
    where member_id = p_member and done and date <= p_date
  ),
  anchor as (
    select case
      when exists (select 1 from done where date = p_date) then p_date
      else p_date - 1
    end as d
  ),
  run as (
    select date, row_number() over (order by date desc) as rn
    from done, anchor
    where date <= anchor.d
  )
  -- 날짜가 하루씩 정확히 내려가는 동안만 센다. 한 번 끊기면 이후로는 영영 안 맞는다.
  select count(*)::int from run, anchor where run.date = anchor.d - (run.rn - 1)::int;
$$;

-- 현황판: "오늘 누가 인증했나". 아직 아무 기록도 없는 사람도 미완으로 한 줄 나온다.
create function public.study_board(p_study uuid, p_date date default current_date)
returns table (
  member_id     uuid,
  display_name  text,
  has_recording boolean,
  has_writing   boolean,
  entries       integer,
  done          boolean,
  streak        integer
)
language sql stable as $$
  select
    m.id,
    m.display_name,
    coalesce(d.has_recording, false),
    coalesce(d.has_writing, false),
    coalesce(d.entries, 0),
    coalesce(d.done, false),
    public.check_in_streak(m.id, p_date)
  from public.member m
  left join public.day_check d
    on d.member_id = m.id and d.date = p_date
  where m.study_id = p_study
  order by coalesce(d.done, false) desc, m.display_name;
$$;

-- ── 가입 / 생성 RPC ───────────────────────────────────────────────────────
--
-- 초대코드는 정책이 아니라 함수로만 통과시킨다. select 로 study 를 뒤져
-- 코드를 맞혀 보는 경로 자체가 없어야 하기 때문이다.

create function app.new_invite_code() returns text
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- I,O,0,1 제외
  code text;
begin
  loop
    code := '';
    for _i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.study where invite_code = code);
  end loop;
  return code;
end;
$$;

create function public.create_study(p_name text, p_display_name text, p_rule text default 'either')
returns public.study
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.study;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  insert into public.study (name, invite_code, check_in_rule, created_by)
  values (btrim(p_name), app.new_invite_code(), p_rule, auth.uid())
  returning * into s;

  insert into public.member (study_id, user_id, display_name, role)
  values (s.id, auth.uid(), btrim(p_display_name), 'owner');

  return s;
end;
$$;

-- 초대코드 + 이름으로 들어간다. 같은 사람이 다시 넣으면 이름만 바뀌고 새로 안 들어간다
-- (기록이 두 사람으로 쪼개지면 안 된다).
create function public.join_study(p_code text, p_display_name text)
returns public.member
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s_id uuid;
  m public.member;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception '이름을 입력해 주세요' using errcode = '22023';
  end if;

  select id into s_id from public.study
  where invite_code = upper(btrim(p_code));

  if s_id is null then
    raise exception '초대코드를 찾을 수 없어요' using errcode = 'P0002';
  end if;

  insert into public.member (study_id, user_id, display_name)
  values (s_id, auth.uid(), btrim(p_display_name))
  on conflict (study_id, user_id)
    do update set display_name = excluded.display_name, last_seen_at = now()
  returning * into m;

  return m;
end;
$$;

-- 코드를 넣기 전에 "그 스터디 맞나"만 확인하는 용도. 이름만 돌려주고 id 는 안 준다.
create function public.peek_study(p_code text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select name from public.study where invite_code = upper(btrim(p_code));
$$;

-- ── 실행 권한 ─────────────────────────────────────────────────────────────
--
-- app 스키마는 PostgREST 로 노출되지 않으니 클라이언트가 RPC 로 부를 수는 없다.
-- 하지만 **정책식은 조회하는 사람의 권한으로 실행된다**. 그래서 authenticated 에게
-- 실행 권한을 안 주면 모든 질의가 "permission denied for function is_member_of" 로
-- 죽는다. PUBLIC 에서는 걷어내고 authenticated 에게만 콕 집어 준다.

revoke all on schema app from public;
revoke all on all functions in schema app from public;

grant usage on schema app to authenticated;
grant execute on function app.is_member_of(uuid) to authenticated;
grant execute on function app.owns_member(uuid) to authenticated;
grant execute on function app.is_owner_of(uuid) to authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.create_study(text, text, text)  to authenticated;
grant execute on function public.join_study(text, text)          to authenticated;
grant execute on function public.peek_study(text)                to authenticated;
grant execute on function public.check_in_streak(uuid, date)     to authenticated;
grant execute on function public.study_board(uuid, date)         to authenticated;

grant select, insert, update, delete on
  public.study, public.member, public.book,
  public.srs_card, public.chapter_progress, public.study_log
  to authenticated;
grant select on public.day_check to authenticated;
