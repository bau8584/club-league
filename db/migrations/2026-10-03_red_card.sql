-- 레드카드 — 관리자가 학생 한 명에게 감점을 준다(10-03).
--
-- 휴면 감점 기록(decay_log)에 같이 적는다. RP 재계산(recompute_league_rp)이 이 기록의 합을 이미
-- 빼 주므로, 따로 고치지 않아도 재계산 뒤에도 감점이 남는다. 열은 추가만(기존 행 = 'decay').
-- 취소 = 기록을 지우고 깎았던 만큼 되돌린다.
begin;

alter table public.decay_log add column if not exists kind text not null default 'decay';  -- decay | redcard
alter table public.decay_log add column if not exists note text;                            -- 레드카드 사유(관리자만 봄)

create or replace function public.give_red_card(p_player_id uuid, p_amount int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_league uuid;
  v_name   text;
  v_before int;
  v_after  int;
  v_amount int := least(1000, greatest(1, coalesce(p_amount, 50)));
  v_id     uuid;
begin
  select league_id, name, rp into v_league, v_name, v_before
    from public.players where id = p_player_id and coalesce(is_deleted, false) = false
    for update;
  if not found then raise exception '선수를 찾을 수 없습니다.'; end if;
  if not public.is_class_teacher(v_league) then raise exception '권한이 없습니다.'; end if;

  v_after := greatest(0, coalesce(v_before, 1000) - v_amount);
  update public.players set rp = v_after where id = p_player_id;

  insert into public.decay_log(league_id, batch_id, player_id, player_name, rp_before, rp_after, decay_rp, season, kind, note)
  values (v_league, gen_random_uuid(), p_player_id, v_name, v_before, v_after, v_before - v_after,
          public.current_season_of(v_league), 'redcard', nullif(left(trim(coalesce(p_note, '')), 100), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'rp', v_after, 'amount', v_before - v_after);
end; $$;

create or replace function public.cancel_red_card(p_log_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r     public.decay_log%rowtype;
  v_rp  int;
begin
  select * into r from public.decay_log where id = p_log_id and kind = 'redcard';
  if not found then raise exception '레드카드 기록을 찾을 수 없습니다.'; end if;
  if not public.is_class_teacher(r.league_id) then raise exception '권한이 없습니다.'; end if;
  -- 지난 시즌 카드는 그 시즌 RP와 함께 끝났다 — 지금 RP에 되돌려 주면 안 된다.
  if r.season is distinct from public.current_season_of(r.league_id) then
    raise exception '지난 시즌 레드카드는 취소할 수 없습니다.';
  end if;

  delete from public.decay_log where id = p_log_id;
  update public.players set rp = coalesce(rp, 0) + coalesce(r.decay_rp, 0)
    where id = r.player_id returning rp into v_rp;

  return jsonb_build_object('player_id', r.player_id, 'rp', v_rp);
end; $$;

grant execute on function public.give_red_card(uuid, int, text) to authenticated;
grant execute on function public.cancel_red_card(uuid)          to authenticated;

commit;
