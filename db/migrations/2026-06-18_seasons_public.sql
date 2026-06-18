-- ─────────────────────────────────────────────────────────────
-- 시즌 공개 열람 (학생/익명용)
--   · 학생 화면(/view)에서도 과거 시즌을 볼 수 있게 하되, 실명(real_name)은 절대 노출하지 않음
--   · season_standings 테이블은 교사 전용 RLS 유지. 학생은 아래 공개 RPC로만 접근.
--   · list_class_seasons 는 anon(학생)도 호출 가능하도록 권한 추가.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- 전체가 begin/commit 으로 묶여 있어 오류 시 자동 롤백됩니다.
-- ─────────────────────────────────────────────────────────────
begin;

-- 1) 공개용 과거 시즌 순위 조회 (실명 제외)
--    students_public 와 같은 철학: display_name/별명/번호/RP/승패만 반환.
create or replace function public.get_season_standings_public(p_class_id uuid, p_season text)
returns table (
  student_id   uuid,
  display_name text,
  nickname     text,
  grade        int,
  class_number int,
  student_no   int,
  gender       text,
  rp           int,
  win_count    int,
  lose_count   int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.student_id, s.display_name, s.nickname, s.grade, s.class_number,
         s.student_no, s.gender, s.rp, s.win_count, s.lose_count
  from public.season_standings s
  where s.class_id = p_class_id
    and s.season = p_season;
$$;

-- 2) 실행 권한: 학생(anon)/교사(authenticated) 모두 호출 가능
grant execute on function public.get_season_standings_public(uuid, text) to anon, authenticated;

-- 3) 시즌 목록도 학생(anon)이 볼 수 있도록 권한 추가
grant execute on function public.list_class_seasons(uuid) to anon;

commit;
