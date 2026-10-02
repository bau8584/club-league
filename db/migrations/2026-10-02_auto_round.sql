-- 한 바퀴 자동 — 코트를 쓰는 수업에서 대기 줄이 "코트 수 − 1"이 되면 [한 바퀴]를 저절로 붙인다.
--
-- 스위치(auto_round)는 선택이다. 비어 있으면(null) 지금과 똑같다 — 아무것도 저절로 붙지 않는다.
-- 계산은 화면이 기존 [한 바퀴] 그대로 한다. 서버는 "이번 차례에 붙일 기기가 누구냐"만 정한다.
-- 선생님 폰과 교실 태블릿이 같은 순간 둘 다 붙이면 두 바퀴가 되기 때문이다.
--
-- 표(auto_round_mark): 마지막으로 자동 붙이기를 허락한 순간의 next_seq.
-- 붙이면 번호가 발급돼 next_seq 가 바뀌므로, 같은 next_seq 에서는 한 번만 허락된다.
begin;

alter table public.assignment_sessions
  add column if not exists auto_round boolean,
  add column if not exists auto_round_mark int;

create or replace function public.claim_auto_round(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s    record;
  v_rows int;
begin
  -- 행을 잠근다. 동시에 들어온 두 요청은 줄을 서고, 뒤엣것은 바뀐 표를 본다.
  select league_id, auto_round, court_count, next_seq, auto_round_mark
    into v_s
    from public.assignment_sessions where id = p_session_id
     for update;
  if not found then return false; end if;
  if not public.is_class_teacher(v_s.league_id) then return false; end if;
  if v_s.auto_round is not true or coalesce(v_s.court_count, 0) <= 0 then return false; end if;
  if v_s.auto_round_mark is not distinct from v_s.next_seq then return false; end if;

  select count(*) into v_rows from public.scheduled_matches
   where session_id = p_session_id and status in ('waiting', 'called');
  -- 대기 줄 = 코트에 들어가지 못한 줄.
  if greatest(v_rows - v_s.court_count, 0) > v_s.court_count - 1 then return false; end if;

  update public.assignment_sessions set auto_round_mark = v_s.next_seq where id = p_session_id;
  return true;
end $$;

grant execute on function public.claim_auto_round(uuid) to authenticated;

commit;
