-- 점수입력판 2차 — 점수판 먼저, [결과 등록]에서 대기열 또는 반 명단에서 직접 고르기. (docs/PLAN-student-input.md)
-- 2026-10-02_score_input_queue.sql(30분 쉰 수업 대기열) 내용도 여기 들어 있다 — 이 파일만 실행해도 된다.
--
-- 1) matches.input_source: 'student' = 점수입력판으로 들어온 경기. 비어 있으면(null) 지금까지와 같다.
-- 2) record_match_by_key: p_scheduled_id 가 null 이면 직접 고른 경기 — 이 리그 학생인지만 확인.
--    같은 학생이 1분 안에 학생 입력으로 또 등록되면 거절(장난 방지).
-- 3) get_score_input_view: 열쇠가 살아 있으면 대기열을 늘 보여 주고, 직접 고르기용 명단(roster)을 더한다.
begin;

alter table public.matches add column if not exists input_source text;

create or replace function public.get_score_input_view(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_s    public.assignment_sessions;
  v_view jsonb;
begin
  v_s := public.score_input_session(p_key);
  if v_s.id is null then return jsonb_build_object('state', 'closed'); end if;
  v_view := public.get_class_view_public(v_s.league_id, v_s.owner_id, null, null);

  -- 교실 화면은 30분 조용하면 대기열을 비운다. 교사가 오늘 연 점수입력판은 그와 상관없이 보여 준다.
  if coalesce(v_view->>'state', '') <> 'session' then
    v_view := v_view || jsonb_build_object(
      'state', 'session',
      'queue', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'seq', m.seq, 'court', m.court,
                 'team_a', (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                              from unnest(array_remove(array[m.player_a_id, m.player_a2_id], null)) x),
                 'team_b', (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                              from unnest(array_remove(array[m.player_b_id, m.player_b2_id], null)) x),
                 'pool',   (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                              from unnest(m.player_ids) x)
               ) order by m.seq), '[]'::jsonb)
          from public.scheduled_matches m
         where m.session_id = v_s.id and m.status in ('waiting', 'called')
      )
    );
  end if;

  return jsonb_build_object(
    'state', 'open',
    'view', v_view,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'seq', m.seq) order by m.seq), '[]'::jsonb)
               from public.scheduled_matches m
              where m.session_id = v_s.id and m.status in ('waiting', 'called')
                and m.player_a_id is not null and m.player_b_id is not null),
    -- 직접 고르기: 부르는 이름(대기열과 같은 실명)과 학년·반·번호. 오늘 교사가 연 열쇠로만 보인다.
    'roster', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name', public.player_call_name(p.id),
                 'grade', p.grade, 'class_num', p.class_num, 'student_no', p.student_no
               ) order by p.grade nulls last, p.class_num nulls last, p.student_no nulls last, p.name), '[]'::jsonb)
                 from public.players p
                where p.league_id = v_s.league_id and coalesce(p.is_deleted, false) = false)
  );
end $$;
grant execute on function public.get_score_input_view(text) to anon, authenticated;

create or replace function public.record_match_by_key(
  p_key text, p_scheduled_id uuid, p_match_id uuid,
  p_winner_id uuid, p_loser_id uuid, p_winner2_id uuid, p_loser2_id uuid,
  p_winner_score int, p_loser_score int,
  p_rp_delta_winner int, p_rp_delta_loser int, p_rp_delta_winner2 int, p_rp_delta_loser2 int
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s   public.assignment_sessions;
  v_row record;
  v_ids uuid[];
  v_new uuid[] := array_remove(array[p_winner_id, p_winner2_id, p_loser_id, p_loser2_id], null);
begin
  v_s := public.score_input_session(p_key);
  if v_s.id is null then raise exception '입력이 닫혔어요.'; end if;

  -- 같은 사람이 두 번 들어가면 안 된다.
  if (select count(distinct x) from unnest(v_new) x) <> array_length(v_new, 1) then
    raise exception '같은 학생이 두 번 들어갔어요.';
  end if;
  -- 모두 이 리그의 (삭제 안 된) 학생이어야 한다.
  if (select count(*) from public.players p
       where p.id = any(v_new) and p.league_id = v_s.league_id and coalesce(p.is_deleted, false) = false)
     <> array_length(v_new, 1) then
    raise exception '이 리그 학생이 아니에요.';
  end if;

  if p_scheduled_id is not null then
    select * into v_row from public.scheduled_matches where id = p_scheduled_id for update;
    if not found or v_row.session_id is distinct from v_s.id then raise exception '이 경기를 찾을 수 없어요.'; end if;
    if v_row.status not in ('waiting', 'called') then raise exception '이미 기록된 경기예요.'; end if;
    v_ids := array_remove(array[v_row.player_a_id, v_row.player_a2_id, v_row.player_b_id, v_row.player_b2_id], null);
    if not (v_new @> v_ids and v_ids @> v_new) then raise exception '선수가 줄과 달라요.'; end if;
  end if;

  -- 장난 방지: 같은 학생이 1분 안에 학생 입력으로 또 등록되면 거절.
  -- 리그 행을 잠가 동시에 들어온 두 요청이 서로를 못 보는 일을 막는다.
  perform 1 from public.leagues where id = v_s.league_id for update;
  if exists (select 1 from public.matches m
              where m.league_id = v_s.league_id and m.input_source = 'student'
                and m.created_at > now() - interval '1 minute'
                and array_remove(array[m.winner_id, m.winner2_id, m.loser_id, m.loser2_id], null) && v_new) then
    raise exception '방금 기록한 학생이 있어요. 1분 뒤에 다시 눌러 주세요.';
  end if;

  if greatest(abs(coalesce(p_rp_delta_winner,0)), abs(coalesce(p_rp_delta_loser,0)),
              abs(coalesce(p_rp_delta_winner2,0)), abs(coalesce(p_rp_delta_loser2,0))) > 200 then
    raise exception 'RP 변화가 비정상이에요.';
  end if;

  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score,
     rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at, input_source)
  values
    (p_match_id, v_s.league_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score,
     p_rp_delta_winner, p_rp_delta_loser, p_rp_delta_winner2, p_rp_delta_loser2, now(), 'student');
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner, 0)), win_count = win_count + 1
   where id = p_winner_id and league_id = v_s.league_id;
  update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser, 0)), lose_count = lose_count + 1
   where id = p_loser_id and league_id = v_s.league_id;
  if p_winner2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_winner2, 0)), win_count = win_count + 1
     where id = p_winner2_id and league_id = v_s.league_id;
  end if;
  if p_loser2_id is not null then
    update public.players set rp = greatest(0, rp + coalesce(p_rp_delta_loser2, 0)), lose_count = lose_count + 1
     where id = p_loser2_id and league_id = v_s.league_id;
  end if;

  if p_scheduled_id is not null then
    update public.scheduled_matches set status = 'done', result_match_id = p_match_id where id = p_scheduled_id;
  end if;
end $$;
revoke execute on function public.record_match_by_key(text, uuid, uuid, uuid, uuid, uuid, uuid, int, int, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.record_match_by_key(text, uuid, uuid, uuid, uuid, uuid, uuid, int, int, int, int, int, int)
  to service_role;

commit;
