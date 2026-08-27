-- 공개 순위표는 순위가 있는 사람만 내려준다.
--
-- 화면에서 걸러도 응답에는 남으므로, 경기를 뛰지 않은 사람의 이름·학년·반·번호가
-- 그대로 나가는 것은 그대로다. 공개 화면에 실을 이유가 없는 정보이니 아예 보내지 않는다.
--
-- 판정 규칙은 클라이언트의 isUnranked 와 같다.
--   played = win_count + lose_count
--   played = 0                              → 제외 (한 경기도 안 뜀)
--   placement.enabled 이고 played < games   → 제외 (배치고사 미완료)
-- placement.games 기본값 3 은 앱과 동일하다.

drop function if exists public.get_ranking_public(uuid);
create or replace function public.get_ranking_public(p_class_id uuid)
returns table(
  id uuid,
  rp int,
  display_name text,
  group_label text,
  gender text,
  win_count int,
  lose_count int,
  grade int,
  class_num int,
  student_no int
)
language sql stable security definer set search_path = public, extensions as $$
  select
    p.id,
    p.rp,
    -- 학교 리그: 성만 남긴다. 동호회 리그: 기존처럼 표시이름/닉네임 그대로.
    case
      when l.league_type = 'school'
        then public.mask_person_name(coalesce(nullif(btrim(p.display_name), ''), p.nickname))
      else coalesce(nullif(btrim(p.display_name), ''), p.nickname)
    end,
    p.group_label,
    p.gender::text,
    coalesce(p.win_count, 0),
    coalesce(p.lose_count, 0),
    p.grade,
    p.class_num,
    p.student_no
  from public.players p
  join public.leagues l on l.id = p.league_id
  where p.league_id = p_class_id
    and coalesce(p.is_deleted, false) = false
    and coalesce(l.is_deleted, false) = false
    -- 순위가 없는 사람(경기 없음 / 배치고사 미완료)은 공개 화면에 싣지 않는다.
    and coalesce(p.win_count, 0) + coalesce(p.lose_count, 0) > 0
    and (
      coalesce((l.settings->'placement'->>'enabled')::boolean, false) = false
      or coalesce(p.win_count, 0) + coalesce(p.lose_count, 0)
         >= coalesce((l.settings->'placement'->>'games')::int, 3)
    );
$$;

grant execute on function public.get_ranking_public(uuid) to anon, authenticated;
