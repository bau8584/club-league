-- 무인증 공개 순위표의 이름 노출 축소.
--
-- 문제: players_public 뷰는 본명(name)만 뺐을 뿐 nickname/display_name 을 anon 에게
-- 그대로 준다. 그런데 학교 리그 명부는 '이름'을 nickname 에 저장하므로, 링크(리그 id)만
-- 알면 로그인 없이 전교생 실명 목록을 그대로 받아갈 수 있었다. 화면에서 가려도
-- 응답 본문에는 남으므로 클라이언트 마스킹으로는 해결되지 않는다.
--
-- 조치:
--   1) 공개 순위표 전용 RPC 를 두고, 학교 리그면 성만 남긴 이름(홍○○)으로 마스킹해 내려준다.
--   2) players_public 의 anon 조회 권한을 회수한다(로그인한 리그 구성원은 계속 사용).

create or replace function public.mask_person_name(p_name text)
returns text
language sql immutable as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    when char_length(btrim(p_name)) = 1 then btrim(p_name)
    else left(btrim(p_name), 1) || repeat('○', char_length(btrim(p_name)) - 1)
  end;
$$;

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
    and coalesce(l.is_deleted, false) = false;
$$;

grant execute on function public.get_ranking_public(uuid) to anon, authenticated;

-- 비로그인 사용자는 이제 공개 순위표 RPC 로만 접근한다.
revoke select on public.players_public from anon;
