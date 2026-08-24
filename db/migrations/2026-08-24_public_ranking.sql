-- 무인증 공개 순위표(B안)용 RPC.
-- leagues 테이블은 RLS로 멤버만 읽을 수 있으므로, 공개 순위표 렌더에 필요한
-- 최소 정보(리그명/유형/티어 기준선/시즌/배치고사)만 노출하는 함수를 따로 둔다.
-- 선수 목록 자체는 기존 players_public 뷰(anon select 허용)를 그대로 쓴다.

drop function if exists public.get_league_public(uuid);
create or replace function public.get_league_public(p_class_id uuid)
returns table(
  id uuid,
  name text,
  league_type text,
  season text,
  tier_thresholds jsonb,
  placement jsonb
)
language sql stable security definer set search_path = public, extensions as $$
  select
    l.id,
    l.name,
    l.league_type,
    coalesce(nullif(btrim(l.settings->>'season'), ''), '시즌 1'),
    l.settings->'tierThresholds',
    l.settings->'placement'
  from public.leagues l
  where l.id = p_class_id and coalesce(l.is_deleted, false) = false;
$$;

grant execute on function public.get_league_public(uuid) to anon, authenticated;
