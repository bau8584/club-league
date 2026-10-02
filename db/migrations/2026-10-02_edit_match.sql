-- ============================================================
-- 경기 수정을 서버에서 한 번에 (덮어쓰기 버그 수정, docs/PLAN-bug-audit.md)
--
-- 배경: 경기 수정 때 화면이 선수 rp·win_count·lose_count를 "자기가 알던 값"으로
--   통째 저장해, 그사이 다른 기기에서 입력한 경기의 승패·RP가 사라졌다(3곳 25명).
-- 고침: 옛 결과의 델타·승패를 빼고 새 결과의 델타·승패를 더한다. 입력(record_match_transaction)·
--   삭제(rollback_match)와 같은 "더하고 빼기" 방식이라 동시 입력에도 안전하다.
--
-- 이 마이그레이션은 함수 하나만 추가한다. 표·열·기존 데이터는 건드리지 않는다.
-- ============================================================

create or replace function public.edit_match(
  p_class_id uuid, p_match_id uuid,
  p_winner_id uuid, p_loser_id uuid,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score integer default null, p_loser_score integer default null,
  p_rp_delta_winner integer default null, p_rp_delta_loser integer default null,
  p_rp_delta_winner2 integer default null, p_rp_delta_loser2 integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare m public.matches%rowtype;
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  -- 같은 경기를 두 기기가 동시에 고쳐도 차례로 처리되게 잠근다.
  select * into m from public.matches where id = p_match_id and league_id = p_class_id for update;
  if not found then raise exception '경기를 찾을 수 없습니다.'; end if;

  -- 1) 옛 결과 빼기 (rollback_match와 같은 식)
  update public.players set rp = greatest(0, rp - coalesce(m.rp_delta_winner, 0)),
                            win_count = greatest(0, win_count - 1)
    where id = m.winner_id and league_id = p_class_id;
  update public.players set rp = greatest(0, rp - coalesce(m.rp_delta_loser, 0)),
                            lose_count = greatest(0, lose_count - 1)
    where id = m.loser_id and league_id = p_class_id;
  if m.winner2_id is not null then
    update public.players set rp = greatest(0, rp - coalesce(m.rp_delta_winner2, 0)),
                              win_count = greatest(0, win_count - 1)
      where id = m.winner2_id and league_id = p_class_id;
  end if;
  if m.loser2_id is not null then
    update public.players set rp = greatest(0, rp - coalesce(m.rp_delta_loser2, 0)),
                              lose_count = greatest(0, lose_count - 1)
      where id = m.loser2_id and league_id = p_class_id;
  end if;

  -- 2) 경기 행 고치기 (영수증은 입력 당시 계산이라 비운다 — 화면이 델타로 다시 구성)
  update public.matches set
    winner_id = p_winner_id, loser_id = p_loser_id,
    winner2_id = p_winner2_id, loser2_id = p_loser2_id,
    winner_score = p_winner_score, loser_score = p_loser_score,
    rp_delta_winner = p_rp_delta_winner, rp_delta_loser = p_rp_delta_loser,
    rp_delta_winner2 = p_rp_delta_winner2, rp_delta_loser2 = p_rp_delta_loser2,
    rp_breakdown = null
  where id = p_match_id and league_id = p_class_id;

  -- 3) 새 결과 더하기 (record_match_transaction과 같은 식)
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
end; $function$;

revoke all on function public.edit_match(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.edit_match(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, integer) to authenticated;
