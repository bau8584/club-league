-- is_class_member 에 공동방장(co_owner_uids) 포함 — 공동방장도 선수 연동(claim_player) 가능하도록.
-- (원조 방장/공동관리자/일반회원은 기존대로 포함)
create or replace function public.is_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.co_owner_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(l.member_uids, '{}'::uuid[])))
  );
$$;
grant execute on function public.is_class_member(uuid) to authenticated;
