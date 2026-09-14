-- ─────────────────────────────────────────────────────────────────────────────
-- 밑줄 — Storage 버킷과 정책
--
-- 적용 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- ⚠️ 여기에 `alter table storage.objects enable row level security;` 를
--    넣으면 안 됩니다. storage.objects 의 소유자가 아니라서
--    "42501: must be owner of table objects" 로 실패합니다.
--    RLS 는 이미 켜져 있으므로 정책만 만들면 됩니다.
--
-- ⚠️ 만약 아래 create policy 조차 권한 오류가 난다면 SQL 로 하지 말고
--    대시보드 > Storage > Policies 화면에서 같은 규칙을 만드세요.
-- ─────────────────────────────────────────────────────────────────────────────

-- 비공개 버킷. 읽기는 서명된 URL 로만 가능하다.
insert into storage.buckets (id, name, public)
values ('page-photos', 'page-photos', false)
on conflict (id) do nothing;

-- 파일은 <user_id>/<...> 경로에 올린다. 첫 폴더가 곧 소유자다.
--
-- ⚠️ foldername() 은 text 를 돌려주므로 uuid 인 auth.uid() 와 직접 비교하면
--    조용히 아무것도 매치되지 않는다. jwt 의 sub(문자열)와 비교한다.
drop policy if exists "page_photos_owner_read"   on storage.objects;
drop policy if exists "page_photos_owner_insert" on storage.objects;
drop policy if exists "page_photos_owner_update" on storage.objects;
drop policy if exists "page_photos_owner_delete" on storage.objects;

create policy "page_photos_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'page-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "page_photos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'page-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "page_photos_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'page-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "page_photos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'page-photos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );
