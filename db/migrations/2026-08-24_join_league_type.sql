-- join_league(uuid)가 league_type도 함께 반환하도록 확장.
-- 목적: /join 라우트가 참가 직후 club/school에 맞는 URL(/class/id vs /school/id)로
-- 이동할 수 있게, 추가 조회 없이 이 RPC 응답만으로 판단하기 위함.

drop function if exists public.join_league(uuid);
create or replace function public.join_league(p_class_id uuid)
returns table(id uuid, class_name text, is_owner boolean, league_type text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_members uuid[];
begin
  select l.owner_uid, coalesce(l.member_uids,'{}'::uuid[]) into v_owner, v_members
  from public.leagues l where l.id = p_class_id and coalesce(l.is_deleted,false) = false;
  if v_owner is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;
  if v_owner <> auth.uid() and not (auth.uid() = any(v_members)) then
    update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = p_class_id;
  end if;
  return query select l.id, l.name, (l.owner_uid = auth.uid()), l.league_type from public.leagues l where l.id = p_class_id;
end; $$;
grant execute on function public.join_league(uuid) to authenticated;
