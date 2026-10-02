-- 자동 채우기 — 두 기기가 같은 경기를 두 번 넣는 문제(2026-10-02 13:36, 18·19번 똑같은 줄).
--
-- 옛 표(auto_round_mark)는 "같은 번호에서 한 번만"이었다. 그런데 A 기기가 붙이면 번호가 바뀌어
-- 표가 풀리고, 아직 A의 줄을 못 받은 B 기기가 곧바로 허락을 받아 옛 줄로 같은 경기를 또 짰다.
-- 이제 기기는 "내가 본 줄의 마지막 번호"를 같이 보낸다. 서버의 마지막 번호와 다르면
-- 그 기기 화면이 낡은 것이므로 거절한다(새 줄이 도착하면 다시 묻는다).
--
-- p_seen_seq 를 안 보내는 옛 화면은 지금처럼 동작한다.
begin;

drop function if exists public.claim_auto_round(uuid);

create or replace function public.claim_auto_round(p_session_id uuid, p_seen_seq int default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s    record;
  v_rows int;
  v_max  int;
begin
  select league_id, auto_round, court_count, next_seq, auto_round_mark
    into v_s
    from public.assignment_sessions where id = p_session_id
     for update;
  if not found then return false; end if;
  if not public.is_class_teacher(v_s.league_id) then return false; end if;
  if v_s.auto_round is not true or coalesce(v_s.court_count, 0) <= 0 then return false; end if;
  if v_s.auto_round_mark is not distinct from v_s.next_seq then return false; end if;

  select count(*), max(seq) into v_rows, v_max from public.scheduled_matches
   where session_id = p_session_id and status in ('waiting', 'called');
  if greatest(v_rows - v_s.court_count, 0) > v_s.court_count - 1 then return false; end if;
  -- 화면이 낡았으면(남이 방금 붙인 줄을 아직 못 봤으면) 거절.
  if p_seen_seq is not null and v_max is distinct from nullif(p_seen_seq, 0) then return false; end if;

  update public.assignment_sessions set auto_round_mark = v_s.next_seq where id = p_session_id;
  return true;
end $$;

grant execute on function public.claim_auto_round(uuid, int) to authenticated;

commit;
