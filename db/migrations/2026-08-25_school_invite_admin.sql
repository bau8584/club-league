-- ============================================================
-- school 리그: 초대로 참가하면 '공동 관리자(admin_uids)'로 넣는다.
--
-- 배경: school 은 matchInputMode 가 admin-only 로 고정돼 있어
--   canRecord = isClassManager || matchInputMode !== 'admin-only'
--   기록원으로 초대받은 동료 교사는 member_uids 에만 들어가 관리자가 아니므로
--   경기를 기록할 수 없었다. 즉 school 에서 초대 기능이 사실상 동작하지 않았다.
--
-- 부여 등급: admin_uids (공동 관리자) — 선수·경기는 다루되
--   리그 글로벌 설정 / 시즌 관리 / 휴면 감점 / 데이터 관리 / 리그 삭제는 못 한다.
--   그것들은 방장(owner_uid, co_owner_uids) 전용이다.
--
-- club 리그는 기존과 동일하게 member_uids 로 들어간다. 동작 변화 없음.
--
-- ⚠️ 링크를 가진 사람은 누구나 school 리그의 공동 관리자가 된다.
--   초대 링크 관리에 유의할 것. (방장 권한까지 넘어가지는 않는다)
-- ============================================================

begin;

-- ── 1) UUID(초대 링크)로 참가 ─────────────────────────────────
drop function if exists public.join_league(uuid);
create or replace function public.join_league(p_class_id uuid)
returns table(id uuid, class_name text, is_owner boolean, league_type text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_members uuid[]; v_admins uuid[]; v_co uuid[]; v_type text;
begin
  select l.owner_uid,
         coalesce(l.member_uids,'{}'::uuid[]),
         coalesce(l.admin_uids,'{}'::uuid[]),
         coalesce(l.co_owner_uids,'{}'::uuid[]),
         l.league_type
    into v_owner, v_members, v_admins, v_co, v_type
  from public.leagues l where l.id = p_class_id and coalesce(l.is_deleted,false) = false;
  if v_owner is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;

  -- 이미 어떤 등급이든 갖고 있으면 건드리지 않는다(등급 강등 방지).
  if v_owner <> auth.uid()
     and not (auth.uid() = any(v_co))
     and not (auth.uid() = any(v_admins))
     and not (auth.uid() = any(v_members)) then
    if v_type = 'school' then
      -- 학교: 초대받는 사람은 교사다. 기록할 수 있어야 하므로 공동 관리자.
      update public.leagues set admin_uids = array_append(v_admins, auth.uid())
        where leagues.id = p_class_id;
    else
      update public.leagues set member_uids = array_append(v_members, auth.uid())
        where leagues.id = p_class_id;
    end if;
  end if;

  return query select l.id, l.name, (l.owner_uid = auth.uid()), l.league_type
    from public.leagues l where l.id = p_class_id;
end; $$;
grant execute on function public.join_league(uuid) to authenticated;

-- ── 2) 6자리 코드로 참가 ──────────────────────────────────────
drop function if exists public.join_league_by_code(text);
create or replace function public.join_league_by_code(p_code text)
returns table(id uuid, class_name text, is_owner boolean, league_type text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_owner uuid; v_members uuid[]; v_admins uuid[]; v_co uuid[]; v_type text;
begin
  select l.id, l.owner_uid,
         coalesce(l.member_uids,'{}'::uuid[]),
         coalesce(l.admin_uids,'{}'::uuid[]),
         coalesce(l.co_owner_uids,'{}'::uuid[]),
         l.league_type
    into v_id, v_owner, v_members, v_admins, v_co, v_type
  from public.leagues l
  where upper(btrim(l.join_code)) = upper(btrim(p_code))
    and coalesce(l.is_deleted, false) = false;
  if v_id is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;

  if v_owner <> auth.uid()
     and not (auth.uid() = any(v_co))
     and not (auth.uid() = any(v_admins))
     and not (auth.uid() = any(v_members)) then
    if v_type = 'school' then
      update public.leagues set admin_uids = array_append(v_admins, auth.uid()) where leagues.id = v_id;
    else
      update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = v_id;
    end if;
  end if;

  return query select l.id, l.name, (l.owner_uid = auth.uid()), l.league_type
    from public.leagues l where l.id = v_id;
end; $$;
grant execute on function public.join_league_by_code(text) to authenticated;

commit;
