-- 2026-07-22: 경기별 RP 변동값(델타) 저장 — 롤백/편집이 "실제 적용된 값"을 정확히 되돌리도록.
--
-- 배경: 기존 record_match_transaction 은 각 선수의 "최종 RP"만 저장하고, 경기로 인한
--   변동량(델타: 티어 기준점 + 보너스/패널티 전부 합산된 값)을 저장하지 않았다.
--   그래서 새로고침(재로드) 후 롤백하면 deleteMatch 가 델타를 몰라 평면 프리셋
--   (winDelta/loseDelta) fallback 으로 엉뚱한 양을 되돌려 점수가 꼬였다.
--   → 경기별 델타를 승자/패자 기준으로 박제해, 롤백/편집이 정확히 역산하도록 한다.
--
-- 과거 경기(이 마이그레이션 이전 기록)는 델타가 NULL 로 남는다.
--   deleteMatch 는 델타가 있으면 그것으로, 없으면 종전 fallback 으로 동작하므로
--   과거 경기의 롤백 동작은 변하지 않는다(=남들 점수 건드리지 않음).

-- ── 1) matches 에 델타 컬럼 추가 (nullable) ─────────────────────
alter table public.matches
  add column if not exists rp_delta_winner  int,
  add column if not exists rp_delta_loser   int,
  add column if not exists rp_delta_winner2 int,   -- 복식 승리팀 파트너
  add column if not exists rp_delta_loser2  int;   -- 복식 패배팀 파트너

-- ── 2) record_match_transaction: 델타 4개 파라미터 추가 ──────────
--   기존 시그니처(9-arg)를 제거하고 13-arg 로 재정의. 프론트는 항상 13개 named-arg 로 호출.
drop function if exists public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int);
drop function if exists public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb);

create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score int default null, p_loser_score int default null,
  p_rp_delta_winner  int default null, p_rp_delta_loser   int default null,
  p_rp_delta_winner2 int default null, p_rp_delta_loser2  int default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not public.is_class_recorder(p_class_id) then raise exception '권한이 없습니다.'; end if;
  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score,
     rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at)
  values
    (p_match_id, p_class_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score,
     p_rp_delta_winner, p_rp_delta_loser, p_rp_delta_winner2, p_rp_delta_loser2, now());
  for r in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int) loop
    update public.players set rp = r.rp where id = r.id and league_id = p_class_id;
  end loop;
end; $$;

grant execute on function public.record_match_transaction(
  uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int, int, int, int, int
) to authenticated;
