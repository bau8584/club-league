-- ─────────────────────────────────────────────────────────────
-- season_standings 중복 스냅샷 정리 + 유니크 제약
--   과거 시즌 "복귀" 버그로 같은 (league, season, player) 스냅샷이 여러 번
--   쌓여 시즌 요약/검색에 동일 인물이 중복 표시되는 문제 해결.
--   각 (league, season, player) 당 RP가 가장 높은 1행만 남긴다.
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
delete from public.season_standings a
using public.season_standings b
where a.league_id = b.league_id
  and a.season    = b.season
  and a.player_id = b.player_id
  and (a.rp < b.rp or (a.rp = b.rp and a.ctid < b.ctid));

create unique index if not exists uq_season_standings_player
  on public.season_standings (league_id, season, player_id);
