-- ─────────────────────────────────────────────────────────────
-- 기록원(scorekeeper)을 "관리 교사"로 승격
--   · 권한자(is_class_recorder) = 소유자 / 공동관리자 / 기록원
--   · 학생 CRUD, 경기 기록·삭제, 개인 코드 초기화 = 권한자 모두 허용 (리그 전체 범위)
--   · 리그 글로벌 설정, 시즌 관리, 데이터 복원 = 여전히 소유자/공동관리자(또는 소유자) 전용 (변경 없음)
--
-- 이 파일 하나로 #2(기록원) + 관리교사 승격이 모두 적용됩니다. (recorder_rls.sql 포함·대체)
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;

-- 권한자: 소유자 / 공동관리자 / 기록원
create or replace function public.is_class_recorder(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and (c.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(c.scorekeeper_uids, '{}'::uuid[])))
  );
$$;
grant execute on function public.is_class_recorder(uuid) to authenticated;

-- 경기 기록 트랜잭션: 멤버십 검증 + 자기 반 학생만 갱신 (SECURITY DEFINER)
create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare player_record record;
begin
  if not public.is_class_recorder(p_class_id) then
    raise exception '권한이 없습니다. 이 반의 경기 기록 권한이 없습니다.';
  end if;
  insert into public.matches (id, class_id, winner_id, loser_id, created_at)
  values (p_match_id, p_class_id, p_winner_id, p_loser_id, now());
  for player_record in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int)
  loop
    update public.students set rp = player_record.rp
     where id = player_record.id and class_id = p_class_id;
  end loop;
end;
$$;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb) to authenticated;

-- ── RLS 정책: 학생/경기/개인코드 관리 권한을 is_class_recorder 로 확대 ──

-- 경기: 기록/수정/삭제 (권한자 전체)
drop policy if exists "Allow modify matches for teachers" on public.matches;
create policy "Allow modify matches for teachers"
  on public.matches for all to authenticated
  using (public.is_class_recorder(class_id))
  with check (public.is_class_recorder(class_id));

-- 학생: 수정/삭제/삽입 (권한자 전체)
drop policy if exists "Allow all actions for class teachers on students" on public.students;
create policy "Allow all actions for class teachers on students"
  on public.students for all to authenticated
  using (public.is_class_recorder(class_id))
  with check (public.is_class_recorder(class_id));

-- 학생: 실명 직접 조회 (권한자 전체 — 관리하려면 실명이 보여야 함)
drop policy if exists "Restrict direct table select to authenticated teachers" on public.students;
create policy "Restrict direct table select to authenticated teachers"
  on public.students for select to authenticated
  using (public.is_class_recorder(class_id));

-- 개인 코드(student_secrets): 초기화 등 관리 (권한자 전체)
drop policy if exists "teachers manage student secrets" on public.student_secrets;
create policy "teachers manage student secrets"
  on public.student_secrets for all to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = student_secrets.student_id
        and public.is_class_recorder(s.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_secrets.student_id
        and public.is_class_recorder(s.class_id)
    )
  );

commit;
