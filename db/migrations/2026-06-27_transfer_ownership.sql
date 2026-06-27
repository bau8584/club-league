-- 최고관리자(방장) 위임: owner_uid는 단일 컬럼이므로 '승격' = 소유권 이전.
-- 새 방장으로 지정하고, 기존 방장은 공동관리자(admin_uids)로 강등해 관리 접근을 유지한다.
create or replace function public.transfer_ownership(p_class_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_old uuid;
begin
  if not public.is_class_owner(p_class_id) then raise exception '권한이 없습니다 (방장 전용).'; end if;
  v_old := auth.uid();
  if p_new_owner = v_old then raise exception '이미 최고관리자입니다.'; end if;

  update public.leagues
     set owner_uid   = p_new_owner,
         -- 새 방장은 admin/member 목록에서 제거, 이전 방장은 공동관리자로 추가(중복 제거 후 1회)
         admin_uids  = array_remove(array_remove(coalesce(admin_uids,'{}'::uuid[]), p_new_owner), v_old)
                         || array[v_old],
         member_uids = array_remove(coalesce(member_uids,'{}'::uuid[]), p_new_owner)
   where id = p_class_id;
end; $$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
