-- ============================================================
-- [읽기 전용] 승/패 집계 백필 "미리보기"
--   아무것도 바꾸지 않는다. 백필을 실행하면 각 선수의 win_count/lose_count가
--   어떤 값으로 채워질지 먼저 눈으로 확인하기 위한 조회문.
--   Supabase SQL Editor 에 붙여넣고 Run → 결과를 실제 전적과 대조.
-- ============================================================

select
  l.name                         as 리그,
  coalesce(nullif(btrim(l.settings->>'season'), ''), '시즌 1') as 시즌,
  coalesce(p.nickname, p.name, p.display_name, '(이름없음)')   as 선수,
  p.rp                           as 현재_RP,
  p.win_count                    as 현재_승,
  p.lose_count                   as 현재_패,
  -- 현재 시즌 경기에서 실제로 센 값 (복식 파트너 포함)
  (select count(*) from public.matches m
     where m.league_id = p.league_id
       and m.season = coalesce(nullif(btrim(l.settings->>'season'), ''), '시즌 1')
       and (m.winner_id = p.id or m.winner2_id = p.id)) as 백필될_승,
  (select count(*) from public.matches m
     where m.league_id = p.league_id
       and m.season = coalesce(nullif(btrim(l.settings->>'season'), ''), '시즌 1')
       and (m.loser_id = p.id or m.loser2_id = p.id))  as 백필될_패
from public.players p
join public.leagues l on l.id = p.league_id
where coalesce(p.is_deleted, false) = false
  and coalesce(l.is_deleted, false) = false
order by l.name, p.rp desc;
