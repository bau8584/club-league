-- ─────────────────────────────────────────────────────────────
-- 리그 멤버 관리: 탈퇴(leave) / 멤버 조회(개설자) / 멤버 추방(개설자)
--   · classes 직접 update 는 RLS 제약이 있어 안전한 RPC로 처리.
--   · 멤버 조회는 auth.users 의 이메일을 보여주기 위해 security definer 사용(개설자만).
--
-- 적용: Supabase SQL Editor 에 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;

-- 1) 리그 탈퇴 (참여자 본인). 개설자는 탈퇴 불가(삭제를 사용).
create or replace function public.leave_league(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.classes c where c.id = p_class_id and c.owner_uid = auth.uid()) then
    raise exception '개설자는 탈퇴할 수 없습니다. (리그 삭제를 사용하세요)';
  end if;
  update public.classes c
     set scorekeeper_uids = array_remove(coalesce(c.scorekeeper_uids, '{}'::uuid[]), auth.uid()),
         co_admin_uids    = array_remove(coalesce(c.co_admin_uids, '{}'::uuid[]), auth.uid())
   where c.id = p_class_id;
end;
$$;

-- 2) 리그 멤버 목록 (개설자 전용) — uid + 이메일 + 역할
create or replace function public.get_league_members(p_class_id uuid)
returns table(uid uuid, email text, role text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.owner_uid = auth.uid()) then
    raise exception '권한이 없습니다. (개설자 전용)';
  end if;
  return query
  with members as (
    select unnest(coalesce(c.co_admin_uids, '{}'::uuid[])) as uid, '공동관리자' as role
      from public.classes c where c.id = p_class_id
    union
    select unnest(coalesce(c.scorekeeper_uids, '{}'::uuid[])) as uid, '기록원' as role
      from public.classes c where c.id = p_class_id
  )
  select m.uid, u.email::text, m.role
    from members m
    left join auth.users u on u.id = m.uid;
end;
$$;

-- 3) 멤버 추방 (개설자 전용)
create or replace function public.remove_league_member(p_class_id uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.owner_uid = auth.uid()) then
    raise exception '권한이 없습니다. (개설자 전용)';
  end if;
  update public.classes c
     set scorekeeper_uids = array_remove(coalesce(c.scorekeeper_uids, '{}'::uuid[]), p_member),
         co_admin_uids    = array_remove(coalesce(c.co_admin_uids, '{}'::uuid[]), p_member)
   where c.id = p_class_id;
end;
$$;

grant execute on function public.leave_league(uuid)                 to authenticated;
grant execute on function public.get_league_members(uuid)           to authenticated;
grant execute on function public.remove_league_member(uuid, uuid)   to authenticated;

commit;
