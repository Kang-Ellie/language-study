-- ─────────────────────────────────────────────────────────────────────────
-- 녹음·필기 사진 저장소 (0002)
--
-- 지금은 IndexedDB(audioStore / imageStore)에 blob 을 넣는다. 그 파일들이
-- 여기로 옮겨 온다. 경로 규칙:
--
--     study-media/<study_id>/<member_id>/<파일명>
--
-- 경로 첫 두 칸이 곧 권한이다. 파일명은 클라이언트가 쓰던 이름을 그대로 쓴다
-- (`${로그id}-${순번}.webm`) — member_id 아래로 들어가므로 사람끼리 안 부딪친다.
--
-- 버킷은 비공개다. 공개 URL 대신 createSignedUrl 로 짧게 서명해서 재생한다.
-- 남의 필기 사진이 링크만 알면 열리는 상태가 되면 안 된다.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-media',
  'study-media',
  false,
  20 * 1024 * 1024, -- 20MB. 몇 분짜리 녹음과 폰 사진 한 장에 충분하다
  array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]
)
on conflict (id) do nothing;

-- 읽기: 같은 스터디원이면 서로 듣고 본다. 인증을 서로 확인하는 게 목적이다.
create policy "study media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-media'
    and app.is_member_of(((storage.foldername(name))[1])::uuid)
  );

-- 쓰기/지우기: 두 번째 칸이 내 member_id 인 경로에만. 남의 폴더에 못 넣는다.
create policy "study media write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-media'
    and app.is_member_of(((storage.foldername(name))[1])::uuid)
    and app.owns_member(((storage.foldername(name))[2])::uuid)
  );

create policy "study media update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'study-media'
    and app.owns_member(((storage.foldername(name))[2])::uuid)
  );

create policy "study media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-media'
    and app.owns_member(((storage.foldername(name))[2])::uuid)
  );
