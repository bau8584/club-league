-- 점수입력판: 열쇠가 살아 있으면 대기열을 늘 보여 준다.
--
-- 교실 화면(get_class_view_public)은 30분 움직임이 없으면 수업이 끝난 걸로 보고 대기열을 비운다.
-- 점수입력판은 교사가 오늘 직접 연 것이므로, 그 판정과 상관없이 이 수업의 대기열을 채운다.
-- (등급 목록은 교실 화면 판정을 그대로 따른다.)
begin;

create or replace function public.get_score_input_view(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_s    public.assignment_sessions;
  v_view jsonb;
begin
  v_s := public.score_input_session(p_key);
  if v_s.id is null then return jsonb_build_object('state', 'closed'); end if;
  v_view := public.get_class_view_public(v_s.league_id, v_s.owner_id, null, null);

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
                and m.player_a_id is not null and m.player_b_id is not null)
  );
end $$;
grant execute on function public.get_score_input_view(text) to anon, authenticated;

commit;
