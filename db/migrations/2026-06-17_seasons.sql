-- ─────────────────────────────────────────────────────────────
-- 시즌제(Season) 구현
--   · 설계: "학생 명단 유지 + RP/전적 초기화 + 과거 시즌 보관"
--   · matches 에 season 컬럼을 두고, INSERT 시 트리거가 현재 시즌을 자동 도장
--     → 기존 경기 기록 RPC(record_match_transaction) 등은 수정 불필요
--   · 새 시즌 시작 시 현재 순위를 season_standings 에 스냅샷 후 학생을 리셋
--   · 현재 시즌 라벨은 기존과 동일하게 classes.settings->>'season' 사용
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- 전체가 BEGIN/COMMIT 으로 묶여 있어 오류 시 자동 롤백됩니다.
-- ─────────────────────────────────────────────────────────────
begin;

-- 0) 현재 시즌 라벨을 구하는 헬퍼 (settings 없으면 '시즌 1')
create or replace function public.current_season_of(p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim((c.settings->>'season')), ''), '시즌 1')
  from public.classes c
  where c.id = p_class_id;
$$;

-- 1) matches.season 컬럼 추가
alter table public.matches
  add column if not exists season text;

-- 2) 기존 경기들을 각 반의 현재 시즌으로 백필 (season 이 비어있는 행만)
update public.matches m
   set season = public.current_season_of(m.class_id)
 where m.season is null;

-- 3) 조회 성능용 인덱스
create index if not exists idx_matches_class_season
  on public.matches (class_id, season);

-- 4) INSERT 시 season 자동 도장 트리거
--    클라이언트나 기존 RPC가 season 을 안 넣어도 현재 시즌으로 채워진다.
create or replace function public.stamp_match_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.season is null then
    new.season := public.current_season_of(new.class_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_match_season on public.matches;
create trigger trg_stamp_match_season
  before insert on public.matches
  for each row execute function public.stamp_match_season();

-- 5) 과거 시즌 최종 순위 보관 테이블
create table if not exists public.season_standings (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  season       text not null,
  student_id   uuid not null,                 -- 참조만 (학생 삭제돼도 기록 유지 위해 FK 없음)
  real_name    text,
  nickname     text,
  display_name text,
  grade        int,
  class_number int,
  student_no   int,
  gender       text,
  rp           int,
  win_count    int,
  lose_count   int,
  archived_at  timestamptz not null default now()
);

create index if not exists idx_season_standings_class_season
  on public.season_standings (class_id, season);

alter table public.season_standings enable row level security;

-- 교사(소유자/공동관리자)만 과거 순위 조회 가능
drop policy if exists "teachers read season standings" on public.season_standings;
create policy "teachers read season standings"
  on public.season_standings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = season_standings.class_id
        and (c.owner_uid = auth.uid()
             or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[])))
    )
  );

-- 6) 새 시즌 시작 (소유자/공동관리자만)
--    한 트랜잭션에서: 현재 순위 스냅샷 → 학생 RP/전적 초기화 → 시즌 라벨 변경
create or replace function public.start_new_season(p_class_id uuid, p_new_season text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_season text;
  v_new        text := nullif(btrim(coalesce(p_new_season, '')), '');
begin
  -- 권한 확인
  if not exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and (c.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[])))
  ) then
    raise exception '권한이 없습니다.';
  end if;

  if v_new is null then
    raise exception '새 시즌 이름을 입력해 주세요.';
  end if;

  v_old_season := public.current_season_of(p_class_id);

  if v_new = v_old_season then
    raise exception '현재 시즌과 다른 이름을 입력해 주세요.';
  end if;

  -- (1) 현재(=종료될) 시즌 최종 순위 스냅샷
  insert into public.season_standings
    (class_id, season, student_id, real_name, nickname, display_name,
     grade, class_number, student_no, gender, rp, win_count, lose_count)
  select s.class_id, v_old_season, s.id, s.real_name, s.nickname, s.display_name,
         s.grade, s.class_number, s.student_no, s.gender, s.rp, s.win_count, s.lose_count
  from public.students s
  where s.class_id = p_class_id
    and coalesce(s.is_deleted, false) = false;

  -- (2) 학생 RP/전적 초기화 (명단·별명·코드·실명은 유지)
  update public.students
     set rp = 1000,
         win_count = 0,
         lose_count = 0
   where class_id = p_class_id
     and coalesce(is_deleted, false) = false;

  -- (3) 현재 시즌 라벨 변경 (이후 새 경기는 트리거가 새 시즌으로 도장)
  update public.classes
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('season', v_new)
   where id = p_class_id;

  return v_new;
end;
$$;

-- 7) 시즌 목록 (과거 스냅샷 + 현재 시즌). 최신이 위로.
create or replace function public.list_class_seasons(p_class_id uuid)
returns table(season text, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  with cur as (select public.current_season_of(p_class_id) as s)
  select x.season, (x.season = (select s from cur)) as is_current
  from (
    select distinct season from public.season_standings where class_id = p_class_id
    union
    select (select s from cur)
  ) x
  where x.season is not null
  order by (x.season = (select s from cur)) desc, x.season desc;
$$;

-- 8) 실행 권한 (교사 = authenticated)
grant execute on function public.current_season_of(uuid)         to authenticated, anon;
grant execute on function public.start_new_season(uuid, text)    to authenticated;
grant execute on function public.list_class_seasons(uuid)        to authenticated;

commit;
