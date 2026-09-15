-- 성별 사용 여부(settings.genderEnabled)를 공개 순위표에도 알려준다.
--
-- 명단 붙여넣기엔 성별 칸이 없어 학교 리그 새 학생의 37%가 '미지정'이고, 경기 입력에서
-- 그 학생을 고르면 성별 팝업이 뜨며 안 고르면 선택이 취소됐다. 성별이 쓰이는 곳은 순위표
-- 남/여 필터뿐이라 리그 설정으로 끌 수 있게 한다. 값이 없으면 학교 리그는 끔, 동호회는 켬.
--
-- leagues 는 RLS 로 멤버만 읽으므로 공개 순위표는 get_league_public 으로만 설정을 본다.
-- 반환 열이 늘어나 drop 후 재생성한다 (열 추가만 — 옛 화면은 새 열을 무시한다).

begin;

drop function if exists public.get_league_public(uuid);
create or replace function public.get_league_public(p_class_id uuid)
returns table(
  id uuid,
  name text,
  league_type text,
  season text,
  tier_thresholds jsonb,
  placement jsonb,
  gender_enabled boolean
)
language sql stable security definer set search_path = public, extensions as $$
  select
    l.id,
    l.name,
    l.league_type,
    coalesce(nullif(btrim(l.settings->>'season'), ''), '시즌 1'),
    l.settings->'tierThresholds',
    l.settings->'placement',
    coalesce((l.settings->>'genderEnabled')::boolean, l.league_type <> 'school')
  from public.leagues l
  where l.id = p_class_id and coalesce(l.is_deleted, false) = false;
$$;

grant execute on function public.get_league_public(uuid) to anon, authenticated;

commit;
