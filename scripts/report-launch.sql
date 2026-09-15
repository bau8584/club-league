-- 인디스쿨 배포(2026-09-14) 이후 새 리그 현황. 실행: node scripts/db-query.mjs scripts/report-launch.sql
-- 기준 시각은 UTC. 09-14 05:00 UTC = 한국 14:00.
with nl as (select id, name, league_type, owner_uid, created_at from leagues where created_at >= '2026-09-14 05:00' and is_deleted is not true)
select nl.name, nl.league_type as type,
  to_char(nl.created_at at time zone 'Asia/Seoul','MM-DD HH24:MI') as created,
  (select count(*) from players p where p.league_id=nl.id) as players,
  (select count(*) filter (where p.gender='U') from players p where p.league_id=nl.id) as no_gender,
  (select count(*) filter (where p.name !~ '^[가-힣]{2,4}$') from players p where p.league_id=nl.id) as odd_names,
  (select count(*) from matches m where m.league_id=nl.id) as matches,
  (select to_char(max(m.created_at) at time zone 'Asia/Seoul','MM-DD HH24:MI') from matches m where m.league_id=nl.id) as last_match
from nl order by nl.created_at;
