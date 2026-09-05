-- 버그: 공동방장으로 승격되면 리그가 안 보이고 "Cannot coerce the result to a single JSON object" 오류.
--
-- 원인: leagues 의 SELECT 정책("members read leagues")이 owner_uid / admin_uids / member_uids 만 확인하고
--       co_owner_uids 를 빠뜨렸다. set_co_owner() 는 승격 시 대상 uid 를 admin_uids·member_uids 에서 제거하고
--       co_owner_uids 에만 넣으므로, 승격되는 순간 그 사용자는 leagues 행을 읽을 권한을 잃는다.
--       그 결과 .single() 조회가 0행을 받아 위 오류가 나고 화면 연결이 끊긴 것처럼 보인다.
--
-- 수정: SELECT 정책에 co_owner_uids 를 포함한다.

drop policy if exists "members read leagues" on public.leagues;
create policy "members read leagues" on public.leagues for select to authenticated
  using (owner_uid = auth.uid()
    or auth.uid() = any(coalesce(co_owner_uids, '{}'::uuid[]))
    or auth.uid() = any(coalesce(admin_uids, '{}'::uuid[]))
    or auth.uid() = any(coalesce(member_uids, '{}'::uuid[])));
