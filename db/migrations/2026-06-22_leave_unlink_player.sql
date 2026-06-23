-- ─────────────────────────────────────────────────────────────
-- 탈퇴(leave_league) 시 계정↔선수 연동 해제
--   · 명단/기록 행은 그대로 보존 (삭제는 관리자 전용)
--   · user_id 만 NULL 로 → 재참가하면 프로필 선택(온보딩)이 다시 뜨고,
--     같은 닉네임을 다시 연동(claim)할 수 있다.
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
create or replace function public.leave_league(p_class_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.leagues
     set member_uids = array_remove(coalesce(member_uids,'{}'::uuid[]), auth.uid()),
         admin_uids  = array_remove(coalesce(admin_uids,'{}'::uuid[]),  auth.uid())
   where id = p_class_id;
  update public.players
     set user_id = null
   where league_id = p_class_id and user_id = auth.uid();
end; $$;
grant execute on function public.leave_league(uuid) to authenticated;
