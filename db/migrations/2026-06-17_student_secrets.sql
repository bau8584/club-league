-- ─────────────────────────────────────────────────────────────
-- 학생 개인 코드(PIN) + 별명 자가 설정 기능
--   · 코드는 별도 테이블(student_secrets)에 해시 저장 → 학생 화면으로 절대 내려가지 않음
--   · 모든 쓰기는 아래 RPC(서버 함수)를 거쳐 코드 검증 후에만 수행
--   · 보기(대시보드)는 잠그지 않음. "편집"만 코드로 보호.
--   · 코드는 학생이 최초 1회 설정. 교사(클래스 소유/공동관리자)는 초기화 가능.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- 전체가 BEGIN/COMMIT 트랜잭션으로 묶여 있어 오류 시 자동 롤백됩니다.
-- ─────────────────────────────────────────────────────────────
begin;

-- pgcrypto: 코드 해시(crypt/gen_salt)용. 이미 있으면 무시됩니다.
create extension if not exists pgcrypto with schema extensions;

-- 1) 개인 코드 격리 테이블
create table if not exists public.student_secrets (
  student_id  uuid primary key references public.students(id) on delete cascade,
  access_code text not null,                 -- pgcrypto 해시 (평문 아님)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.student_secrets enable row level security;

-- 학생(anon)은 이 테이블에 직접 접근 불가. 모든 접근은 아래 RPC로만.
-- 교사(클래스 소유자/공동관리자)는 초기화를 위해 직접 접근 허용.
drop policy if exists "teachers manage student secrets" on public.student_secrets;
create policy "teachers manage student secrets"
  on public.student_secrets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.students s
      join public.classes  c on c.id = s.class_id
      where s.id = student_secrets.student_id
        and (c.owner_uid = auth.uid()
             or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[])))
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      join public.classes  c on c.id = s.class_id
      where s.id = student_secrets.student_id
        and (c.owner_uid = auth.uid()
             or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[])))
    )
  );

-- 2) 코드 존재 여부만 알려줌 (코드 자체는 절대 노출하지 않음)
create or replace function public.student_has_code(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(select 1 from public.student_secrets where student_id = p_student_id);
$$;

-- 3) 코드 검증 (true/false만 반환)
create or replace function public.verify_student_code(p_student_id uuid, p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists(
    select 1 from public.student_secrets
    where student_id = p_student_id
      and access_code = crypt(p_code, access_code)
  );
$$;

-- 4) 최초 등록(아직 코드 없을 때만): 코드 설정 + 선택적 별명
create or replace function public.claim_student(p_student_id uuid, p_code text, p_nickname text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nick text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if p_code is null or length(btrim(p_code)) < 4 then
    raise exception '코드는 4자리 이상이어야 합니다.';
  end if;
  if exists(select 1 from public.student_secrets where student_id = p_student_id) then
    raise exception '이미 코드가 설정된 카드입니다.';
  end if;
  if not exists(select 1 from public.students where id = p_student_id and coalesce(is_deleted, false) = false) then
    raise exception '존재하지 않는 학생입니다.';
  end if;

  insert into public.student_secrets(student_id, access_code)
    values (p_student_id, crypt(p_code, gen_salt('bf')));

  if v_nick is not null then
    update public.students set nickname = left(v_nick, 20) where id = p_student_id;
  end if;
  return true;
end;
$$;

-- 5) 별명 변경 (코드 검증 후). 빈 별명이면 별명 해제(학번 표시로 복귀)
create or replace function public.update_student_nickname(p_student_id uuid, p_code text, p_nickname text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nick text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if not public.verify_student_code(p_student_id, p_code) then
    raise exception '코드가 올바르지 않습니다.';
  end if;
  update public.students
    set nickname = case when v_nick is null then null else left(v_nick, 20) end
    where id = p_student_id;
  return true;
end;
$$;

-- 6) 코드 변경 (기존 코드 검증 후)
create or replace function public.change_student_code(p_student_id uuid, p_old_code text, p_new_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_student_code(p_student_id, p_old_code) then
    raise exception '기존 코드가 올바르지 않습니다.';
  end if;
  if p_new_code is null or length(btrim(p_new_code)) < 4 then
    raise exception '새 코드는 4자리 이상이어야 합니다.';
  end if;
  update public.student_secrets
    set access_code = crypt(p_new_code, gen_salt('bf')), updated_at = now()
    where student_id = p_student_id;
  return true;
end;
$$;

-- 7) 실행 권한: 학생(anon)/교사(authenticated)가 RPC 호출 가능.
--    테이블 직접 접근은 위 RLS로 여전히 차단되어 코드는 노출되지 않습니다.
grant execute on function public.student_has_code(uuid)               to anon, authenticated;
grant execute on function public.verify_student_code(uuid, text)      to anon, authenticated;
grant execute on function public.claim_student(uuid, text, text)      to anon, authenticated;
grant execute on function public.update_student_nickname(uuid, text, text) to anon, authenticated;
grant execute on function public.change_student_code(uuid, text, text) to anon, authenticated;

commit;
