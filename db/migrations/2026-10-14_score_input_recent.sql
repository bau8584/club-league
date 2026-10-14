-- 점수입력판: 오늘 이 수업 경기 최근 20개(recent)를 함께 내준다. 나머지는 그대로.
CREATE OR REPLACE FUNCTION public.get_score_input_view(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    -- 오늘 이 수업 경기 — 수업 시작 뒤, 오늘 참석자가 낀 경기만. 최근 20개. 다른 반 이름은 안 나간다.
    'recent', (select coalesce(jsonb_agg(r order by r_at desc), '[]'::jsonb) from (
                 select x.created_at as r_at, jsonb_build_object(
                   'id', x.id, 'at', x.created_at,
                   'win', (select coalesce(jsonb_agg(public.player_call_name(y)), '[]'::jsonb)
                             from unnest(array_remove(array[x.winner_id, x.winner2_id], null)) y),
                   'lose', (select coalesce(jsonb_agg(public.player_call_name(y)), '[]'::jsonb)
                              from unnest(array_remove(array[x.loser_id, x.loser2_id], null)) y),
                   'ws', x.winner_score, 'ls', x.loser_score,
                   'receipt', x.rp_breakdown) as r
                   from public.matches x
                  where x.league_id = v_s.league_id
                    and x.created_at >= greatest(coalesce(v_s.started_at, now()), date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
                    and (x.winner_id = any(v_s.player_ids) or x.loser_id = any(v_s.player_ids))
                  order by x.created_at desc limit 20) t),
    -- 직접 고르기: 부르는 이름(대기열과 같은 실명)과 학년·반·번호. 오늘 교사가 연 열쇠로만 보인다.
    'roster', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name', public.player_call_name(p.id),
                 'grade', p.grade, 'class_num', p.class_num, 'student_no', p.student_no
               ) order by p.grade nulls last, p.class_num nulls last, p.student_no nulls last, p.name), '[]'::jsonb)
                 from public.players p
                where p.league_id = v_s.league_id and coalesce(p.is_deleted, false) = false)
  );
end $function$
;
