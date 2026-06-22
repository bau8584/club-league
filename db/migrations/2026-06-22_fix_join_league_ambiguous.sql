-- ─────────────────────────────────────────────────────────────
-- join_league: "column reference id is ambiguous" 해결
--   RETURNS TABLE(id ...) 가 출력변수 id 를 만들어, 함수 내부
--   UPDATE ... WHERE id = p_class_id 의 id 가 모호해짐.
--   → leagues.id 로 한정.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;

create or replace function public.join_league(p_class_id uuid)
returns table(id uuid, class_name text, is_owner boolean) language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_members uuid[];
begin
  select l.owner_uid, coalesce(l.member_uids,'{}'::uuid[]) into v_owner, v_members
  from public.leagues l where l.id = p_class_id and coalesce(l.is_deleted,false) = false;
  if v_owner is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;
  if v_owner <> auth.uid() and not (auth.uid() = any(v_members)) then
    update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = p_class_id;
  end if;
  return query select l.id, l.name, (l.owner_uid = auth.uid()) from public.leagues l where l.id = p_class_id;
end; $$;

grant execute on function public.join_league(uuid) to authenticated;

commit;
