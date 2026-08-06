\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

-- 테스트용 유저 3명: A/B는 같은 스터디, C는 남
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003');

create function pg_temp.be(u text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', u, false);
end; $$;

create function pg_temp.anon_off() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
end; $$;

create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end; $$;

-- 실패해야 하는 동작을 감싼다
create function pg_temp.must_fail(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  % (거부됨: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — 막혔어야 하는데 통과함', label;
end; $$;

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

-- ── 스터디 만들기 / 들어가기 ───────────────────────────────────────────
select pg_temp.be(:A);
select id as sid, invite_code as code from public.create_study('중국어 스터디', '엘리') \gset s_

select pg_temp.ok('초대코드는 헷갈리는 글자 없는 6자리',
  (select :'s_code' ~ '^[A-Z2-9]{6}$'));
select pg_temp.ok('만든 사람은 owner',
  (select role = 'owner' from public.member where study_id = :'s_sid'::uuid));

select pg_temp.be(:B);
select pg_temp.ok('코드로 스터디 이름만 미리 확인', public.peek_study(:'s_code') = '중국어 스터디');
select pg_temp.ok('없는 코드는 null', public.peek_study('ZZZZZZ') is null);
select id as mid from public.join_study(:'s_code', '수진') \gset b_
select pg_temp.ok('들어간 사람은 member', (select role from public.member where id = :'b_mid'::uuid) = 'member');

-- 같은 사람이 다시 들어가도 두 명이 되면 안 된다 (기록이 쪼개진다)
select public.join_study(:'s_code', '수진2');
select pg_temp.ok('재가입은 이름만 갱신', (select count(*) from public.member where study_id = :'s_sid'::uuid) = 2);
select pg_temp.ok('바뀐 이름이 반영됨', (select display_name from public.member where id = :'b_mid'::uuid) = '수진2');

select pg_temp.be(:C);
select pg_temp.must_fail('틀린 초대코드', $$ select public.join_study('AB2345', '침입자') $$);
select pg_temp.ok('남의 스터디는 안 보인다', (select count(*) from public.study) = 0);
select pg_temp.ok('남의 스터디원도 안 보인다', (select count(*) from public.member) = 0);

-- ── 교재 ───────────────────────────────────────────────────────────────
select pg_temp.be(:A);
insert into public.book (study_id, book_id, doc) values (
  :'s_sid'::uuid, 'zh-mccs-l1-conv',
  '{"id":"zh-mccs-l1-conv","lang":"zh","title":"맛있는 중국어 1","emoji":"📕","track":"foundation","lessons":[]}'::jsonb
);
select pg_temp.ok('lang/title이 문서에서 뽑힌다',
  (select lang = 'zh' and title = '맛있는 중국어 1' from public.book where book_id = 'zh-mccs-l1-conv'));
select pg_temp.ok('처음 rev는 1', (select rev from public.book where book_id = 'zh-mccs-l1-conv') = 1);

select pg_temp.must_fail('doc.id와 book_id가 다르면 거부',
  format($$ insert into public.book (study_id, book_id, doc)
            values (%L::uuid, 'x', '{"id":"y"}'::jsonb) $$, :'s_sid'));

select pg_temp.be(:B);
select pg_temp.ok('스터디원은 교재를 본다', (select count(*) from public.book) = 1);
update public.book set doc = jsonb_set(doc, '{title}', '"맛있는 중국어 1 (수정)"')
  where book_id = 'zh-mccs-l1-conv';
select pg_temp.ok('같은 교재를 함께 고친다 — rev 자동 증가',
  (select rev from public.book where book_id = 'zh-mccs-l1-conv') = 2);
update public.book set updated_by = :'b_mid'::uuid where book_id = 'zh-mccs-l1-conv';
select pg_temp.ok('내용이 그대로면 rev는 안 오른다',
  (select rev from public.book where book_id = 'zh-mccs-l1-conv') = 2);
-- RLS는 delete/update를 막을 때 에러를 내지 않고 "대상 행이 없는 것으로" 취급한다.
-- 그래서 거부 확인은 예외가 아니라 "행이 그대로 남아 있는가"로 해야 한다.
delete from public.book where book_id = 'zh-mccs-l1-conv';
select pg_temp.ok('방장이 아니면 교재 삭제 불가', (select count(*) from public.book) = 1);

select pg_temp.be(:C);
select pg_temp.ok('남은 교재를 못 본다', (select count(*) from public.book) = 0);

-- 두 스터디가 같은 내장 교재 id를 각자 갖는다
select pg_temp.be(:C);
select id as sid from public.create_study('일본어 스터디', '민호') \gset c_
insert into public.book (study_id, book_id, doc) values (
  :'c_sid'::uuid, 'zh-mccs-l1-conv',
  '{"id":"zh-mccs-l1-conv","lang":"zh","title":"다른 스터디의 같은 교재"}'::jsonb
);
select pg_temp.ok('같은 book_id를 스터디별로 따로 갖는다', (select count(*) from public.book) = 1);

-- ── SRS / 진도는 본인만 ────────────────────────────────────────────────
select pg_temp.be(:A);
select id as mid from public.member where study_id = :'s_sid'::uuid and role = 'owner' \gset a_
insert into public.srs_card (study_id, member_id, item_id, level, seen, wrong)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1/s1/w3', 2, 5, 1);
insert into public.chapter_progress (study_id, member_id, chapter_id, marked_done)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', true);

select pg_temp.be(:B);
select pg_temp.ok('남의 SRS는 안 보인다', (select count(*) from public.srs_card) = 0);
select pg_temp.ok('남의 진도도 안 보인다', (select count(*) from public.chapter_progress) = 0);
select pg_temp.must_fail('남의 이름으로 SRS를 못 쓴다',
  format($$ insert into public.srs_card (study_id, member_id, item_id)
            values (%L::uuid, %L::uuid, 'x') $$, :'s_sid', :'a_mid'));

-- 남의 스터디 member_id를 내 스터디 행에 박는 것도 DB가 막는다
select pg_temp.be(:C);
select id as mid from public.member where study_id = :'c_sid'::uuid \gset cm_
select pg_temp.must_fail('스터디를 가로지르는 member_id는 외래키가 막는다',
  format($$ insert into public.srs_card (study_id, member_id, item_id)
            values (%L::uuid, %L::uuid, 'x') $$, :'s_sid', :'cm_mid'));

-- ── 학습 기록 · 인증 ───────────────────────────────────────────────────
select pg_temp.be(:A);
-- 아침에 녹음만, 저녁에 쓰기만 → 그날은 둘 다 한 것
insert into public.study_log (study_id, member_id, chapter_id, date, audio_paths, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date, array['a.webm'], '1770000000000');
insert into public.study_log (study_id, member_id, chapter_id, date, writing, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date, '你好，我叫엘리。', '1770000000001');
-- 사진·메모만 있는 날은 인증이 아니다
insert into public.study_log (study_id, member_id, chapter_id, date, note, image_paths, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 3, '사진만', array['p.jpg'], '1770000000002');
-- 공백뿐인 쓰기는 쓰기로 안 친다
insert into public.study_log (study_id, member_id, chapter_id, date, writing, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 4, '    ', '1770000000003');

select pg_temp.must_fail('같은 local_id 두 번 올리면 막힌다',
  format($$ insert into public.study_log (study_id, member_id, chapter_id, date, writing, local_id)
            values (%L::uuid, %L::uuid, 'c1', current_date, 'dup', '1770000000000') $$, :'s_sid', :'a_mid'));

select pg_temp.ok('하루치를 합쳐서 본다',
  (select entries = 2 and has_recording and has_writing
     from public.day_check where member_id = :'a_mid'::uuid and date = current_date));
select pg_temp.ok('사진·메모만 남긴 날은 미완',
  (select not done from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 3));
select pg_temp.ok('공백 쓰기는 쓰기가 아니다',
  (select not has_writing from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 4));

-- 규칙을 바꾸면 과거 판정도 같이 바뀐다 (저장이 아니라 계산이라서)
insert into public.study_log (study_id, member_id, chapter_id, date, writing, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 1, '어제 쓴 문장', '1770000000004');
select pg_temp.ok('either: 쓰기만 해도 완료',
  (select done from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 1));

reset role;
update public.study set check_in_rule = 'recording' where id = :'s_sid'::uuid;
select pg_temp.be(:A);
select pg_temp.ok('recording: 쓰기만 한 날은 미완',
  (select not done from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 1));
select pg_temp.ok('recording: 녹음한 오늘은 완료',
  (select done from public.day_check where member_id = :'a_mid'::uuid and date = current_date));

reset role;
update public.study set check_in_rule = 'both' where id = :'s_sid'::uuid;
select pg_temp.be(:A);
select pg_temp.ok('both: 녹음+쓰기 다 한 오늘만 완료',
  (select done from public.day_check where member_id = :'a_mid'::uuid and date = current_date));
select pg_temp.ok('both: 어제는 미완',
  (select not done from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 1));

reset role;
update public.study set check_in_rule = 'either' where id = :'s_sid'::uuid;
select pg_temp.be(:A);

-- 지운 기록은 인증에서 빠진다
insert into public.study_log (study_id, member_id, chapter_id, date, audio_paths, deleted_at, local_id)
  values (:'s_sid'::uuid, :'a_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 6, array['gone.webm'], now(), '1770000000005');
select pg_temp.ok('지운 기록은 인증에 안 들어간다',
  (select count(*) from public.day_check where member_id = :'a_mid'::uuid and date = current_date - 6) = 0);

-- ── 스트릭 ─────────────────────────────────────────────────────────────
select pg_temp.ok('오늘·어제 연속 → 2', public.check_in_streak(:'a_mid'::uuid) = 2);
select pg_temp.ok('3일 전은 미완이라 안 이어진다',
  public.check_in_streak(:'a_mid'::uuid, current_date) = 2);

select pg_temp.be(:B);
insert into public.study_log (study_id, member_id, chapter_id, date, audio_paths, local_id)
  values (:'s_sid'::uuid, :'b_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 1, array['b1.webm'], 'b-1'),
         (:'s_sid'::uuid, :'b_mid'::uuid, 'zh-mccs-l1-conv/c1', current_date - 2, array['b2.webm'], 'b-2');
select pg_temp.ok('오늘 아직 안 했어도 어제까지 이어졌으면 살아 있다',
  public.check_in_streak(:'b_mid'::uuid) = 2);

-- ── 현황판 ─────────────────────────────────────────────────────────────
select pg_temp.ok('스터디원 전원이 한 줄씩 나온다',
  (select count(*) from public.study_board(:'s_sid'::uuid)) = 2);
select pg_temp.ok('오늘 한 사람이 위로 온다',
  (select done from public.study_board(:'s_sid'::uuid) limit 1));
select pg_temp.ok('오늘 안 한 사람도 미완으로 나온다',
  (select not done and streak = 2 from public.study_board(:'s_sid'::uuid) where member_id = :'b_mid'::uuid));

-- ── 기록 공개 범위 ─────────────────────────────────────────────────────
select pg_temp.ok('스터디원은 서로의 기록을 본다 (그게 인증이다)',
  (select count(*) from public.study_log where member_id = :'a_mid'::uuid) > 0);
delete from public.study_log where member_id = :'a_mid'::uuid;
select pg_temp.ok('남의 기록은 못 지운다 (읽기만 된다)',
  (select count(*) from public.study_log where member_id = :'a_mid'::uuid) > 0);

select pg_temp.be(:C);
select pg_temp.ok('남의 스터디 기록은 안 보인다', (select count(*) from public.study_log) = 0);
select pg_temp.ok('남의 스터디 현황판도 비어 있다',
  (select count(*) from public.study_board(:'s_sid'::uuid)) = 0);

-- ── 로그인 안 한 상태 ──────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select pg_temp.ok('익명이면 아무것도 안 보인다',
  (select count(*) from public.study) = 0 and (select count(*) from public.study_log) = 0);
select pg_temp.must_fail('로그인 없이 스터디 생성 불가',
  $$ select public.create_study('무단', '무단') $$);
reset role;

\echo '── 전부 통과 ──'
