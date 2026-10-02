-- 승패·RP 어긋남 맞추기 (2026-10-01 초안) — 실행은 소유자가 Supabase SQL 편집기에서.
-- ✅ 2026-10-02 실행 완료(25명 맞춤, 다시 세면 0명). 다시 실행할 필요 없음.
-- 대상: 현재 시즌에서 "저장된 승패 ≠ 경기 기록"인 선수만 (지금 25명, 리그 3곳).
-- RP 기준 = 서버의 recompute_league_rp와 같은 식(1000 + 현 시즌 경기 델타 합 − 휴면 감점 합).
-- 델타 빈 경기가 낀 선수는 건너뜀. 승패가 맞는 선수는 RP도 건드리지 않음(수동 RP 조정 보호).

-- ① 미리 보기 (아무것도 안 바뀜) ------------------------------------------
with t as (
  select p.id, p.league_id, p.name, p.win_count, p.lose_count, p.rp,
    (select count(*) from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and p.id in (m.winner_id, m.winner2_id)) as w_real,
    (select count(*) from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and p.id in (m.loser_id, m.loser2_id)) as l_real,
    greatest(0, 1000
      + coalesce((select sum(case when m.winner_id=p.id then m.rp_delta_winner else 0 end
                           + case when m.loser_id=p.id then m.rp_delta_loser else 0 end
                           + case when m.winner2_id=p.id then m.rp_delta_winner2 else 0 end
                           + case when m.loser2_id=p.id then m.rp_delta_loser2 else 0 end)
                  from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
                    and p.id in (m.winner_id, m.loser_id, m.winner2_id, m.loser2_id)), 0)
      - coalesce((select sum(d.decay_rp) from decay_log d
                  where d.player_id=p.id and d.season=public.current_season_of(p.league_id)), 0)) as rp_real,
    exists(select 1 from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and ((m.winner_id=p.id and m.rp_delta_winner is null) or (m.loser_id=p.id and m.rp_delta_loser is null)
         or (m.winner2_id=p.id and m.rp_delta_winner2 is null) or (m.loser2_id=p.id and m.rp_delta_loser2 is null))) as null_delta
  from players p
  where not coalesce(p.is_deleted, false)
)
select left(league_id::text, 8) as 리그, name,
       win_count||'→'||w_real as 승, lose_count||'→'||l_real as 패,
       rp||'→'||case when null_delta then rp else rp_real end as rp
from t
where win_count <> w_real or lose_count <> l_real
order by 1, 2;
-- 기대: 25행 (706e98ed 18 · 700a198d 6 · 7d0e3fbf 1). 다르면 실행하지 말고 알려 주세요.

-- ② 실행 (한 덩어리로) -----------------------------------------------------
begin;
with t as ( /* ①의 t와 같은 식 */
  select p.id,
    (select count(*) from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and p.id in (m.winner_id, m.winner2_id)) as w_real,
    (select count(*) from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and p.id in (m.loser_id, m.loser2_id)) as l_real,
    greatest(0, 1000
      + coalesce((select sum(case when m.winner_id=p.id then m.rp_delta_winner else 0 end
                           + case when m.loser_id=p.id then m.rp_delta_loser else 0 end
                           + case when m.winner2_id=p.id then m.rp_delta_winner2 else 0 end
                           + case when m.loser2_id=p.id then m.rp_delta_loser2 else 0 end)
                  from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
                    and p.id in (m.winner_id, m.loser_id, m.winner2_id, m.loser2_id)), 0)
      - coalesce((select sum(d.decay_rp) from decay_log d
                  where d.player_id=p.id and d.season=public.current_season_of(p.league_id)), 0)) as rp_real,
    exists(select 1 from matches m where m.league_id=p.league_id and m.season=public.current_season_of(p.league_id)
       and ((m.winner_id=p.id and m.rp_delta_winner is null) or (m.loser_id=p.id and m.rp_delta_loser is null)
         or (m.winner2_id=p.id and m.rp_delta_winner2 is null) or (m.loser2_id=p.id and m.rp_delta_loser2 is null))) as null_delta
  from players p
  where not coalesce(p.is_deleted, false)
)
update players p
   set win_count = t.w_real,
       lose_count = t.l_real,
       rp = case when t.null_delta then p.rp else t.rp_real end
  from t
 where p.id = t.id
   and (p.win_count <> t.w_real or p.lose_count <> t.l_real);
-- "UPDATE 25"가 나오면 commit; 아니면 rollback;
-- commit;
