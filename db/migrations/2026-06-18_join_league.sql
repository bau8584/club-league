-- ─────────────────────────────────────────────────────────────
-- 로비에서 "리그 코드"로 참여 (기록원/관리 교사 등록)
--   · classes 직접 update 는 RLS(소유자 전용)에 막히므로, 안전한 RPC로 본인만 추가.
--   · 리그 코드 = 리그 ID(UUID). 추측 불가한 값이라 사실상 비밀키 역할.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;

create or replace function public.join_league(p_class_id uuid)
returns table(id uuid, class_name text, is_owner boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_keepers uuid[];
begin
  select c.owner_uid, coalesce(c.scorekeeper_uids, '{}'::uuid[])
    into v_owner, v_keepers
  from public.classes c
  where c.id = p_class_id and coalesce(c.is_deleted, false) = false;

  if v_owner is null then
    raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.';
  end if;

  -- 소유자/공동관리자는 이미 멤버 → 추가 없이 통과
  if v_owner <> auth.uid()
     and not (auth.uid() = any(v_keepers)) then
    update public.classes c
       set scorekeeper_uids = array_append(v_keepers, auth.uid())
     where c.id = p_class_id;
  end if;

  return query
    select c.id, c.class_name, (c.owner_uid = auth.uid()) as is_owner
    from public.classes c
    where c.id = p_class_id;
end;
$$;

grant execute on function public.join_league(uuid) to authenticated;

commit;
