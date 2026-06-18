-- ─────────────────────────────────────────────────────────────
-- class_secrets RLS: 리그 관리자 코드(admin_code) 읽기/쓰기 권한
--   · SELECT  = 권한자(소유자/공동관리자/기록원) — 화면 잠금 해제에 코드가 필요하므로
--   · INSERT/UPDATE = 소유자 전용 — 코드 생성·변경은 로비 "리그 설정/수정"에서 소유자만
--
-- 이 정책이 있어야 로비에서 코드 upsert(생성/변경)와 잠금 해제용 코드 조회가 동작합니다.
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- (is_class_recorder 함수는 2026-06-18_manager_role.sql 에서 생성됨)
-- ─────────────────────────────────────────────────────────────
begin;

alter table public.class_secrets enable row level security;

-- 소유자 판별 헬퍼
create or replace function public.is_class_owner(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.owner_uid = auth.uid()
  );
$$;
grant execute on function public.is_class_owner(uuid) to authenticated;

-- 조회: 권한자(소유자/공동관리자/기록원) — 잠금 해제용 코드 읽기
drop policy if exists "recorders read class secret" on public.class_secrets;
create policy "recorders read class secret"
  on public.class_secrets for select to authenticated
  using (public.is_class_recorder(class_id));

-- 생성: 소유자 전용 (코드 row 신규 생성 — 구버전 리그 포함)
drop policy if exists "owner insert class secret" on public.class_secrets;
create policy "owner insert class secret"
  on public.class_secrets for insert to authenticated
  with check (public.is_class_owner(class_id));

-- 변경: 소유자 전용 (코드 변경)
drop policy if exists "owner update class secret" on public.class_secrets;
create policy "owner update class secret"
  on public.class_secrets for update to authenticated
  using (public.is_class_owner(class_id))
  with check (public.is_class_owner(class_id));

commit;
