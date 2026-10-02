-- 점수입력판 — 학생이 QR(열쇠 링크)로 로그인 없이 대기열 경기 결과를 넣는다. (docs/PLAN-student-input.md)
--
-- 열쇠(input_key)는 수업(assignment_sessions)에 붙는다. 비어 있으면(null) 지금과 똑같다 — 입력 링크 없음.
-- 그날(한국 시간)만 유효하다. 교사가 끄거나 새로 만들면 옛 열쇠는 바로 무효.
-- RP 계산은 서버 함수(supabase/functions/score-input)가 교사 태블릿과 같은 코드로 하고,
-- 저장은 record_match_by_key 가 한 번에 한다. 이 함수는 서버 함수(service_role)만 부를 수 있다.
begin;

alter table public.assignment_sessions
  add column if not exists input_key text,
  add column if not exists input_key_day date;
create unique index if not exists uq_session_input_key
  on public.assignment_sessions (input_key) where input_key is not null;

create or replace function public.seoul_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 교사: 점수입력판 열기(또는 새 QR). 새 열쇠를 돌려준다 — 옛 열쇠는 이 순간 무효.
create or replace function public.open_score_input(p_session_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_league uuid;
  v_key    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  select league_id into v_league from public.assignment_sessions where id = p_session_id;
  if v_league is null then raise exception '수업을 찾을 수 없습니다.'; end if;
  if not public.is_class_teacher(v_league) then raise exception '권한이 없습니다.'; end if;
  update public.assignment_sessions
     set input_key = v_key, input_key_day = public.seoul_today()
   where id = p_session_id;
  return v_key;
end $$;

-- 교사: 점수입력판 닫기.
create or replace function public.close_score_input(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_league uuid;
begin
  select league_id into v_league from public.assignment_sessions where id = p_session_id;
  if v_league is null then return; end if;
  if not public.is_class_teacher(v_league) then raise exception '권한이 없습니다.'; end if;
  update public.assignment_sessions set input_key = null, input_key_day = null where id = p_session_id;
end $$;

-- 열쇠 → 살아 있는 수업. 없거나 날짜가 지났으면 null.
create or replace function public.score_input_session(p_key text)
returns public.assignment_sessions language sql stable security definer set search_path = public, extensions as $$
  select s.* from public.assignment_sessions s
   where p_key is not null and length(p_key) >= 12
     and s.input_key = p_key and s.input_key_day = public.seoul_today()
   limit 1
$$;
revoke execute on function public.score_input_session(text) from public, anon, authenticated;

-- 학생 화면: 교실 화면(get_class_view_public)에 '넣을 수 있는 줄'의 id 를 더해 돌려준다.
-- 열 때·새로고침·입력 직후에만 부른다(실시간 연결 없음 — 동시 접속 한도).
create or replace function public.get_score_input_view(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_s    public.assignment_sessions;
  v_view jsonb;
begin
  v_s := public.score_input_session(p_key);
  if v_s.id is null then return jsonb_build_object('state', 'closed'); end if;
  v_view := public.get_class_view_public(v_s.league_id, v_s.owner_id, null, null);
  return jsonb_build_object(
    'state', 'open',
    'view', v_view,
    -- 팀이 정해진 줄만 입력 가능(인원 소집 줄은 팀이 없어 뺀다). seq 로 교실 화면 줄과 맞춘다.
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'seq', m.seq) order by m.seq), '[]'::jsonb)
               from public.scheduled_matches m
              where m.session_id = v_s.id and m.status in ('waiting', 'called')
                and m.player_a_id is not null and m.player_b_id is not null)
  );
end $$;
grant execute on function public.get_score_input_view(text) to anon, authenticated;

-- 서버 함수 전용 저장. 열쇠·날짜·줄 상태를 다시 확인하고, 줄을 잠가 같은 경기가 두 번 들어가지 않게 한다.
-- 경기 삽입·RP 증감·줄 완료가 한 트랜잭션 — record_match_transaction 과 같은 증감 규칙.
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
begin
  v_s := public.score_input_session(p_key);
  if v_s.id is null then raise exception '입력이 닫혔어요.'; end if;

  select * into v_row from public.scheduled_matches where id = p_scheduled_id for update;
  if not found or v_row.session_id is distinct from v_s.id then raise exception '이 경기를 찾을 수 없어요.'; end if;
  if v_row.status not in ('waiting', 'called') then raise exception '이미 기록된 경기예요.'; end if;

  -- 넣는 네 사람이 줄의 네 사람과 같아야 한다(팀 순서는 무관).
  v_ids := array_remove(array[v_row.player_a_id, v_row.player_a2_id, v_row.player_b_id, v_row.player_b2_id], null);
  if not (array_remove(array[p_winner_id, p_winner2_id, p_loser_id, p_loser2_id], null) @> v_ids
          and v_ids @> array_remove(array[p_winner_id, p_winner2_id, p_loser_id, p_loser2_id], null)) then
    raise exception '선수가 줄과 달라요.';
  end if;
  -- 장난 방지 바깥 울타리: 한 경기 RP 변화는 ±200 을 넘지 않는다(계산은 서버 함수가 했으므로 정상이면 걸리지 않는다).
  if greatest(abs(coalesce(p_rp_delta_winner,0)), abs(coalesce(p_rp_delta_loser,0)),
              abs(coalesce(p_rp_delta_winner2,0)), abs(coalesce(p_rp_delta_loser2,0))) > 200 then
    raise exception 'RP 변화가 비정상이에요.';
  end if;

  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score,
     rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at)
  values
    (p_match_id, v_s.league_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score,
     p_rp_delta_winner, p_rp_delta_loser, p_rp_delta_winner2, p_rp_delta_loser2, now());
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

  update public.scheduled_matches set status = 'done', result_match_id = p_match_id where id = p_scheduled_id;
end $$;
revoke execute on function public.record_match_by_key(text, uuid, uuid, uuid, uuid, uuid, uuid, int, int, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.record_match_by_key(text, uuid, uuid, uuid, uuid, uuid, uuid, int, int, int, int, int, int)
  to service_role;

grant execute on function public.open_score_input(uuid)  to authenticated;
grant execute on function public.close_score_input(uuid) to authenticated;

commit;
