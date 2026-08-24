-- school 리그(학교 리그) 지원: leagues.league_type + players 학년/반/번호 컬럼 추가.
-- 기존 club 리그 데이터는 영향 없음(전부 nullable / 기본값 'club').

-- 1) leagues.league_type : 'club' | 'school' (기본값 'club' — 기존 리그는 전부 club으로 취급)
alter table public.leagues
  add column if not exists league_type text not null default 'club';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leagues_league_type_check'
  ) then
    alter table public.leagues
      add constraint leagues_league_type_check check (league_type in ('club', 'school'));
  end if;
end $$;

-- 2) players : school 전용 축(학년/반/번호). club 리그에서는 항상 null.
alter table public.players
  add column if not exists grade      int,
  add column if not exists class_num  int,
  add column if not exists student_no int;

-- 3) players_public 뷰(무인증 공개 순위표에 재사용)도 school 필드를 노출하도록 갱신.
create or replace view public.players_public as
  select id, league_id, rp, tier, win_count, lose_count, nickname,
         group_label, gender, is_deleted, recent_matches, display_name, user_id,
         equipped_title, grade, class_num, student_no
  from public.players;

grant select on public.players_public to anon, authenticated;
