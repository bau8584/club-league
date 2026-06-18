-- ─────────────────────────────────────────────────────────────
-- 교사용 과거 시즌 관리: 복귀(restore) / 이름변경(rename) / 삭제(delete) / 명예의 전당
--   · 모두 소유자/공동관리자만 (security definer 안에서 권한 검증)
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- begin/commit 으로 묶여 있어 오류 시 자동 롤백됩니다.
-- ─────────────────────────────────────────────────────────────
begin;

-- 권한 확인 헬퍼 (소유자/공동관리자)
create or replace function public.is_class_teacher(p_class_id uuid)
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
           or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[])))
  );
$$;

-- 1) 과거 시즌으로 복귀 ("이어서 진행")
--    ① 현재 진행분을 현재 시즌 라벨로 스냅샷 보관 → ② 학생을 대상 시즌 값으로 복원
--    (대상 시즌에 없던 전학생은 1000 RP·0승0패로 시작) → ③ 대상 시즌을 활성 시즌으로
create or replace function public.restore_season(p_class_id uuid, p_target_season text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception '권한이 없습니다.';
  end if;

  v_current := public.current_season_of(p_class_id);

  if p_target_season is null or btrim(p_target_season) = '' then
    raise exception '복귀할 시즌을 지정해 주세요.';
  end if;
  if p_target_season = v_current then
    raise exception '이미 현재 시즌입니다.';
  end if;
  if not exists (select 1 from public.season_standings
                 where class_id = p_class_id and season = p_target_season) then
    raise exception '해당 시즌의 보관 기록이 없습니다.';
  end if;

  -- ① 현재 진행분 스냅샷 (현재 라벨로 기존 스냅샷 있으면 교체)
  delete from public.season_standings where class_id = p_class_id and season = v_current;
  insert into public.season_standings
    (class_id, season, student_id, real_name, nickname, display_name,
     grade, class_number, student_no, gender, rp, win_count, lose_count)
  select s.class_id, v_current, s.id, s.real_name, s.nickname, s.display_name,
         s.grade, s.class_number, s.student_no, s.gender, s.rp, s.win_count, s.lose_count
  from public.students s
  where s.class_id = p_class_id and coalesce(s.is_deleted, false) = false;

  -- ②-a 대상 시즌에 있던 학생: 그 시즌 값으로 복원
  update public.students s
     set rp = ss.rp, win_count = ss.win_count, lose_count = ss.lose_count
    from public.season_standings ss
   where ss.class_id = p_class_id and ss.season = p_target_season and ss.student_id = s.id
     and s.class_id = p_class_id and coalesce(s.is_deleted, false) = false;

  -- ②-b 전학생(대상 시즌에 없던 학생): 기본값으로 시작
  update public.students s
     set rp = 1000, win_count = 0, lose_count = 0
   where s.class_id = p_class_id and coalesce(s.is_deleted, false) = false
     and not exists (
       select 1 from public.season_standings ss
       where ss.class_id = p_class_id and ss.season = p_target_season and ss.student_id = s.id
     );

  -- ③ 대상 시즌을 활성으로 승격 (보관 스냅샷 제거 + 라벨 변경)
  delete from public.season_standings where class_id = p_class_id and season = p_target_season;
  update public.classes
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('season', p_target_season)
   where id = p_class_id;

  return p_target_season;
end;
$$;

-- 2) 시즌 이름 변경 (현재 시즌 포함 가능)
create or replace function public.rename_season(p_class_id uuid, p_old text, p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := nullif(btrim(coalesce(p_new, '')), '');
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception '권한이 없습니다.';
  end if;
  if v_new is null then
    raise exception '새 시즌 이름을 입력해 주세요.';
  end if;

  update public.matches          set season = v_new where class_id = p_class_id and season = p_old;
  update public.season_standings set season = v_new where class_id = p_class_id and season = p_old;
  if public.current_season_of(p_class_id) = p_old then
    update public.classes
       set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('season', v_new)
     where id = p_class_id;
  end if;
  return v_new;
end;
$$;

-- 3) 과거 시즌 삭제 (현재 시즌은 삭제 불가). p_delete_matches=true 면 그 시즌 경기 원본까지 삭제(용량 절감)
create or replace function public.delete_season(p_class_id uuid, p_season text, p_delete_matches boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception '권한이 없습니다.';
  end if;
  if p_season = public.current_season_of(p_class_id) then
    raise exception '현재 진행 중인 시즌은 삭제할 수 없습니다.';
  end if;

  delete from public.season_standings where class_id = p_class_id and season = p_season;
  if p_delete_matches then
    delete from public.matches where class_id = p_class_id and season = p_season;
  end if;
  return p_season;
end;
$$;

-- 4) 명예의 전당: 시즌별 우승자(최고 RP) 목록 (교사 전용 — 실명 포함)
create or replace function public.get_season_champions(p_class_id uuid)
returns table (season text, student_id uuid, champion_name text, rp int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception '권한이 없습니다.';
  end if;
  return query
    select distinct on (ss.season)
           ss.season,
           ss.student_id,
           coalesce(nullif(btrim(ss.real_name), ''), ss.display_name, ss.nickname, '학생') as champion_name,
           ss.rp
    from public.season_standings ss
    where ss.class_id = p_class_id
    order by ss.season desc, ss.rp desc;
end;
$$;

-- 실행 권한 (교사 = authenticated)
grant execute on function public.is_class_teacher(uuid)                       to authenticated;
grant execute on function public.restore_season(uuid, text)                   to authenticated;
grant execute on function public.rename_season(uuid, text, text)              to authenticated;
grant execute on function public.delete_season(uuid, text, boolean)           to authenticated;
grant execute on function public.get_season_champions(uuid)                   to authenticated;

commit;
