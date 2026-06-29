-- 공동방장(co-owner): 원조 방장 1명(owner_uid)은 유지하되, 방장 권한을 함께 행사하는
-- 공동방장을 여러 명 둘 수 있다. 공동방장도 글로벌 설정·시즌·휴면·관리자 승격 등 '방장 권한'을
-- 행사하지만, 아래는 원조 방장(primary)만 가능: 리그 삭제 · 소유권 위임 · 공동방장 지정/해제.

alter table public.leagues add column if not exists co_owner_uids uuid[] not null default '{}';

-- 원조 방장 전용 판정 (소유권 위임·공동방장 관리·리그 삭제)
create or replace function public.is_class_primary_owner(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.leagues l where l.id = p_class_id and l.owner_uid = auth.uid());
$$;

-- 방장 권한 = 원조 방장 + 공동방장
create or replace function public.is_class_owner(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.co_owner_uids, '{}'::uuid[])))
  );
$$;

-- 관리 권한 = 방장(원조/공동) + 공동관리자
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.co_owner_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[])))
  );
$$;

-- 기록 권한 = 방장(원조/공동) + 공동관리자 + 일반회원
create or replace function public.is_class_recorder(p_class_id uuid)
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

grant execute on function public.is_class_primary_owner(uuid) to authenticated;

-- 공동방장 지정/해제 (원조 방장 전용)
--  지정: admin/member 목록에서 제거하고 co_owner_uids 에 추가
--  해제: co_owner_uids 에서 제거하고 member_uids 로 환원(접근 유지)
create or replace function public.set_co_owner(p_class_id uuid, p_uid uuid, p_make boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_primary_owner(p_class_id) then raise exception '권한이 없습니다 (원조 방장 전용).'; end if;
  if p_uid = (select owner_uid from public.leagues where id = p_class_id) then
    raise exception '원조 방장은 공동방장으로 지정할 수 없습니다.';
  end if;
  if p_make then
    update public.leagues
       set co_owner_uids = (select array(select distinct e from unnest(coalesce(co_owner_uids,'{}'::uuid[]) || array[p_uid]) e)),
           admin_uids    = array_remove(coalesce(admin_uids,'{}'::uuid[]),  p_uid),
           member_uids   = array_remove(coalesce(member_uids,'{}'::uuid[]), p_uid)
     where id = p_class_id;
  else
    update public.leagues
       set co_owner_uids = array_remove(coalesce(co_owner_uids,'{}'::uuid[]), p_uid),
           member_uids   = (select array(select distinct e from unnest(coalesce(member_uids,'{}'::uuid[]) || array[p_uid]) e))
     where id = p_class_id;
  end if;
end; $$;

grant execute on function public.set_co_owner(uuid, uuid, boolean) to authenticated;

-- 소유권 위임: 원조 방장 전용으로 강화 + 이전 방장은 공동방장으로 환원(방장 권한 유지)
create or replace function public.transfer_ownership(p_class_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_old uuid;
begin
  if not public.is_class_primary_owner(p_class_id) then raise exception '권한이 없습니다 (원조 방장 전용).'; end if;
  v_old := auth.uid();
  if p_new_owner = v_old then raise exception '이미 원조 방장입니다.'; end if;
  update public.leagues
     set owner_uid     = p_new_owner,
         -- 새 방장은 모든 하위 목록에서 제거, 이전 방장은 공동방장으로 환원
         co_owner_uids = (select array(select distinct e
                            from unnest(array_remove(coalesce(co_owner_uids,'{}'::uuid[]), p_new_owner) || array[v_old]) e)),
         admin_uids    = array_remove(coalesce(admin_uids,'{}'::uuid[]),  p_new_owner),
         member_uids   = array_remove(coalesce(member_uids,'{}'::uuid[]), p_new_owner)
   where id = p_class_id;
end; $$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
