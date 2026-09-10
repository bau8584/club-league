-- 대진 고유번호 — 줄 번호를 배열 인덱스에서 고정 번호로.
--
-- 지금 줄 번호는 화면에 그린 순서다. 1번이 끝나면 아래가 전부 밀려 올라가므로 번호를
-- 기억하는 것이 무의미하다 — "너희 5번째야"라고 알려줘도 몇 분 뒤엔 3번째다. 아이는 매번
-- 처음부터 훑어야 하고, 교사가 "7번!" 하고 부르는 것도 불가능하다.
--
-- 고정 번호는 코트 수를 몰라도 되는 게 핵심이다. 아이가 "우리 7번"을 기억하면 그만이고,
-- 2코트든 4코트든 상관없다.
--
-- 발급은 반드시 서버에서 원자적으로 한다. 클라이언트에서 읽고-더하고-쓰면 폰과 태블릿이
-- 같은 값을 읽어 #7 이 두 개 생긴다. 번호가 아이들이 부르는 이름이 된 뒤에 고치려면
-- 이미 나간 번호를 어떻게 할지 곤란해진다.
begin;

drop function if exists public.alloc_match_seq(uuid, int);

-- p_n 개를 한 번에 발급하고 그 첫 번호를 돌려준다. n 개를 뽑는 배정이 한 번만 호출한다.
create or replace function public.alloc_match_seq(p_session_id uuid, p_n int)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  v_start  int;
  v_league uuid;
begin
  if p_n is null or p_n < 1 then
    raise exception '발급 개수는 1 이상이어야 합니다.';
  end if;

  select league_id into v_league from public.assignment_sessions where id = p_session_id;
  if v_league is null then
    raise exception '세션을 찾을 수 없습니다.';
  end if;

  -- security definer 라 RLS 를 우회한다. 권한 검사를 직접 한다 —
  -- 번호를 건너뛰게 만드는 것도 남의 수업을 어지럽히는 일이다.
  if not public.is_class_teacher(v_league) then
    raise exception '권한이 없습니다.';
  end if;

  -- UPDATE 가 행을 잠그므로 동시에 들어온 두 요청은 줄을 서서 서로 다른 번호를 받는다.
  update public.assignment_sessions
     set next_seq = next_seq + p_n,
         updated_at = now()
   where id = p_session_id
  returning next_seq - p_n into v_start;

  return v_start;
end $$;

grant execute on function public.alloc_match_seq(uuid, int) to authenticated;

commit;
