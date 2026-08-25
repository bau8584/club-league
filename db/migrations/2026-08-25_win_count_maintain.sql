-- ============================================================
-- players.win_count / lose_count 를 서버가 유지하도록 한다.
--
-- 배경: 두 컬럼은 처음부터 있었지만 어디서도 증감하지 않아 계속 0이었다.
--   그 결과 (1) 대시보드는 승/패를 매번 "시즌 전체 경기"를 받아 직접 세야 했고,
--          (2) 비로그인 공개 순위표는 matches 를 읽을 권한이 없어 전적이
--              항상 "0승 0패"로 표시됐다.
--
-- 이 마이그레이션이 건드리는 것: players.win_count, players.lose_count 뿐.
--   rp / matches / rp_delta_* / 티어 / 호칭 / 시즌 스냅샷은 일절 손대지 않는다.
--   따라서 RP·순위·경기 기록에는 영향이 없다.
--
-- 실행 전 2026-08-25_win_count_preview.sql 로 채워질 값을 먼저 확인할 것.
-- ============================================================

begin;

-- ── 1) 경기 저장 시 승/패도 함께 증가 ─────────────────────────
--   기존 본문(경기 insert + rp 델타 증감)은 그대로 두고 집계 갱신만 덧붙인다.
create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score int default null, p_loser_score int default null,
  p_rp_delta_winner  int default null, p_rp_delta_loser   int default null,
  p_rp_delta_winner2 int default null, p_rp_delta_loser2  int default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_recorder(p_class_id) then raise exception '권한이 없습니다.'; end if;
  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score,
     rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at)
  values
    (p_match_id, p_class_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score,
     p_rp_delta_winner, p_rp_delta_loser, p_rp_delta_winner2, p_rp_delta_loser2, now());
  -- 동시 입력 안전: 절대값(p_player_updates) 대신 델타로 서버에서 원자적 증감.
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner, 0)),
                            win_count = win_count + 1
    where id = p_winner_id and league_id = p_class_id;
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser, 0)),
                            lose_count = lose_count + 1
    where id = p_loser_id and league_id = p_class_id;
  if p_winner2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner2, 0)),
                              win_count = win_count + 1
      where id = p_winner2_id and league_id = p_class_id;
  end if;
  if p_loser2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser2, 0)),
                              lose_count = lose_count + 1
      where id = p_loser2_id and league_id = p_class_id;
  end if;
end; $$;

-- ── 2) 경기 롤백 시 승/패도 함께 감소 ─────────────────────────
--   rp 는 기존대로 저장된 델타로 역산하고, 집계는 1씩 되돌린다.
--   rp_delta 가 null 인 과거 경기라도 승/패 카운트는 되돌려야 하므로
--   집계 감소는 델타 존재 여부와 무관하게 수행한다. (0 미만으로는 안 내려감)
create or replace function public.rollback_match(p_class_id uuid, p_match_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.matches%rowtype;
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  select * into m from public.matches where id = p_match_id and league_id = p_class_id;
  if not found then return; end if;
  if m.rp_delta_winner is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_winner) where id = m.winner_id and league_id = p_class_id;
  end if;
  if m.rp_delta_loser is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_loser) where id = m.loser_id and league_id = p_class_id;
  end if;
  if m.winner2_id is not null and m.rp_delta_winner2 is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_winner2) where id = m.winner2_id and league_id = p_class_id;
  end if;
  if m.loser2_id is not null and m.rp_delta_loser2 is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_loser2) where id = m.loser2_id and league_id = p_class_id;
  end if;
  -- 승/패 집계 되돌리기
  update public.players set win_count  = greatest(0, win_count  - 1) where id = m.winner_id  and league_id = p_class_id;
  update public.players set lose_count = greatest(0, lose_count - 1) where id = m.loser_id   and league_id = p_class_id;
  if m.winner2_id is not null then
    update public.players set win_count  = greatest(0, win_count  - 1) where id = m.winner2_id and league_id = p_class_id;
  end if;
  if m.loser2_id is not null then
    update public.players set lose_count = greatest(0, lose_count - 1) where id = m.loser2_id and league_id = p_class_id;
  end if;
  delete from public.matches where id = p_match_id and league_id = p_class_id;
end; $$;

-- ── 3) 기존 데이터 백필 ───────────────────────────────────────
--   win_count 는 새 시즌 시작 시 0으로 초기화되는 값이므로,
--   "현재 시즌" 경기만 센다. 복식 파트너(winner2/loser2)도 포함.
--   미리보기 SQL 의 '백필될_승/패' 와 같은 계산식이다.
update public.players p
set win_count = (
      select count(*) from public.matches m
       where m.league_id = p.league_id
         and m.season = public.current_season_of(p.league_id)
         and (m.winner_id = p.id or m.winner2_id = p.id)
    ),
    lose_count = (
      select count(*) from public.matches m
       where m.league_id = p.league_id
         and m.season = public.current_season_of(p.league_id)
         and (m.loser_id = p.id or m.loser2_id = p.id)
    );

commit;
