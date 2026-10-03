-- 자동 채우기 — 허락을 받았는데 0경기로 끝나면 허락 표시를 되돌린다(10-03 점검).
--
-- claim_auto_round 는 허락할 때 auto_round_mark = next_seq 로 "이 번호에서는 이미 허락함"을 남긴다.
-- 짜기가 0경기면(떨어뜨려 놓을 짝·남녀 따로 인원 부족·저장 실패) 번호가 안 바뀌어 표시가 그대로라,
-- 선생님이 손으로 한 경기를 넣기 전까지 자동 채우기가 조용히 멈췄다.
-- 되돌리기는 그사이 번호가 안 바뀌었을 때만 한다(다른 기기가 그새 붙였으면 건드리지 않는다).
begin;

create or replace function public.release_auto_round(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_league uuid;
begin
  select league_id into v_league from public.assignment_sessions where id = p_session_id;
  if not found or not public.is_class_teacher(v_league) then return; end if;
  update public.assignment_sessions
     set auto_round_mark = null
   where id = p_session_id and auto_round_mark is not distinct from next_seq;
end $$;

grant execute on function public.release_auto_round(uuid) to authenticated;

commit;
