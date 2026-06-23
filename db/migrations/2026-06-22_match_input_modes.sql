-- ─────────────────────────────────────────────────────────────
-- 경기 입력 권한을 리그 설정(matchInputMode) 기준으로 분기
--   · 관리자(is_class_recorder) → 항상 허용
--   · 아니면 leagues.settings->>'matchInputMode' 에 따라:
--       'free-all'  → 가입 멤버면 아무 경기나 입력 허용
--       'free'(기본) → 본인이 참여한 경기(4인 중 user_id=auth.uid())만
--       'admin-only' → 거부
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score int default null, p_loser_score int default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_participant boolean; v_mode text;
begin
  if not public.is_class_recorder(p_class_id) then
    select coalesce(nullif(btrim(l.settings->>'matchInputMode'), ''), 'admin-only')
      into v_mode from public.leagues l where l.id = p_class_id;

    if v_mode = 'admin-only' then
      raise exception '이 리그는 관리자만 경기를 입력할 수 있습니다.';
    elsif v_mode = 'free-all' then
      if not public.is_class_member(p_class_id) then
        raise exception '리그에 참여한 멤버만 경기를 입력할 수 있습니다.';
      end if;
    else
      -- 'free'(자율) 및 기타: 본인 참여 경기만
      select exists(
        select 1 from public.players p
        where p.user_id = auth.uid() and p.league_id = p_class_id
          and p.id in (p_winner_id, p_loser_id,
                       coalesce(p_winner2_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       coalesce(p_loser2_id,  '00000000-0000-0000-0000-000000000000'::uuid))
      ) into v_participant;
      if not v_participant then
        raise exception '권한이 없습니다. 본인이 참여한 경기만 기록할 수 있습니다.';
      end if;
    end if;
  end if;

  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score, created_at)
  values
    (p_match_id, p_class_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score, now());
  for r in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int) loop
    update public.players set rp = r.rp where id = r.id and league_id = p_class_id;
  end loop;
end; $$;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int) to authenticated;
