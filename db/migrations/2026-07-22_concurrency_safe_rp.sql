-- 2026-07-22: 동시 입력 안전성 — RP 갱신을 "절대값 덮어쓰기"에서 "서버 원자적 상대 증감"으로.
--
-- 배경: 기존 record/rollback 은 클라이언트가 계산한 rp 절대값을 그대로 덮어썼다(set rp = X).
--   두 명이 거의 동시에 기록하면 둘 다 옛 값(예: 1000)에서 계산해 각자 덮어써서 한쪽 증가분이
--   유실됐다(lost update). 경기 기록(matches)은 유실되지 않지만 players.rp 캐시가 어긋났다.
--   → 이제 경기별 델타(rp_delta_*)가 저장되므로, 서버에서 rp = rp + 델타 로 원자적으로 처리해
--     동시성에도 유실이 생기지 않게 한다. 롤백도 서버 RPC로 이전한다.
--
-- ① record_match_transaction: 절대 덮어쓰기 → 원자적 상대 증감.
-- ② rollback_match(RPC 신규): 저장된 델타로 서버에서 원자적 역산 + 삭제.
-- ③ recompute_league_rp(RPC 신규): 현 시즌 경기 델타·감점으로 rp 정합성 재계산(관리자 안전망).

-- ── ① record: 원자적 상대 증감 ─────────────────────────────────
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
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner, 0))
    where id = p_winner_id and league_id = p_class_id;
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser, 0))
    where id = p_loser_id and league_id = p_class_id;
  if p_winner2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner2, 0))
      where id = p_winner2_id and league_id = p_class_id;
  end if;
  if p_loser2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser2, 0))
      where id = p_loser2_id and league_id = p_class_id;
  end if;
end; $$;

-- ── ② rollback_match: 서버 원자적 역산 + 삭제 ──────────────────
drop function if exists public.rollback_match(uuid, uuid);
create or replace function public.rollback_match(p_class_id uuid, p_match_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.matches%rowtype;
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;

  select * into m from public.matches where id = p_match_id and league_id = p_class_id;
  if not found then return; end if;

  -- 저장된 델타가 있으면 정확히 원자적 역산. 없으면(구 기록) rp는 건드리지 않고 삭제만 한다.
  --  (구 기록 롤백으로 어긋난 rp 는 recompute_league_rp 로 복구)
  if m.rp_delta_winner is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_winner)
      where id = m.winner_id and league_id = p_class_id;
  end if;
  if m.rp_delta_loser is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_loser)
      where id = m.loser_id and league_id = p_class_id;
  end if;
  if m.winner2_id is not null and m.rp_delta_winner2 is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_winner2)
      where id = m.winner2_id and league_id = p_class_id;
  end if;
  if m.loser2_id is not null and m.rp_delta_loser2 is not null then
    update public.players set rp = greatest(0, rp - m.rp_delta_loser2)
      where id = m.loser2_id and league_id = p_class_id;
  end if;

  delete from public.matches where id = p_match_id and league_id = p_class_id;
end; $$;

-- ── ③ recompute_league_rp: 현 시즌 정합성 재계산(관리자 안전망) ──
--   rp = 1000 + Σ(현 시즌 경기 델타) − Σ(현 시즌 감점).
--   현 시즌 경기 중 델타가 없는(구) 경기가 있는 선수는 정확 재계산이 불가하므로 건너뛴다.
--   주의: 관리자가 수동으로 직접 조정한 RP(로그 없음)는 복원되지 않고 이력 기준값으로 덮어써진다.
drop function if exists public.recompute_league_rp(uuid);
create or replace function public.recompute_league_rp(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_season  text;
  v_updated int := 0;
  v_skipped int := 0;
  r         record;
  v_target  int;
  v_has_null_delta boolean;
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  v_season := public.current_season_of(p_class_id);

  for r in
    select id from public.players
    where league_id = p_class_id and coalesce(is_deleted, false) = false
  loop
    -- 현 시즌 경기 중 이 선수가 낀 델타 없는 경기가 있으면 정확 재계산 불가 → 건너뜀
    select exists(
      select 1 from public.matches m
      where m.league_id = p_class_id and m.season = v_season
        and (
          (m.winner_id  = r.id and m.rp_delta_winner  is null) or
          (m.loser_id   = r.id and m.rp_delta_loser   is null) or
          (m.winner2_id = r.id and m.rp_delta_winner2 is null) or
          (m.loser2_id  = r.id and m.rp_delta_loser2  is null)
        )
    ) into v_has_null_delta;

    if v_has_null_delta then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select 1000
      + coalesce((
          select sum(
            case when m.winner_id  = r.id then coalesce(m.rp_delta_winner, 0)  else 0 end +
            case when m.loser_id   = r.id then coalesce(m.rp_delta_loser, 0)   else 0 end +
            case when m.winner2_id = r.id then coalesce(m.rp_delta_winner2, 0) else 0 end +
            case when m.loser2_id  = r.id then coalesce(m.rp_delta_loser2, 0)  else 0 end
          )
          from public.matches m
          where m.league_id = p_class_id and m.season = v_season
            and (m.winner_id = r.id or m.loser_id = r.id or m.winner2_id = r.id or m.loser2_id = r.id)
        ), 0)
      - coalesce((
          select sum(coalesce(d.decay_rp, 0))
          from public.decay_log d
          where d.league_id = p_class_id and d.player_id = r.id and d.season = v_season
        ), 0)
    into v_target;

    v_target := greatest(0, v_target);

    update public.players set rp = v_target
      where id = r.id and rp is distinct from v_target;
    if found then v_updated := v_updated + 1; end if;
  end loop;

  return jsonb_build_object('season', v_season, 'updated', v_updated, 'skipped', v_skipped);
end; $$;

grant execute on function public.record_match_transaction(
  uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int, int, int, int, int
) to authenticated;
grant execute on function public.rollback_match(uuid, uuid)      to authenticated;
grant execute on function public.recompute_league_rp(uuid)       to authenticated;
