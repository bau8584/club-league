-- ─────────────────────────────────────────────────────────────
-- 레벨 이름변경/삭제 시 기존 회원 자동 이전/정리
--   · 관리자가 레벨 체계를 수정하면, 그 레벨이던 선수들의 group_label 을 일괄 이전.
--   · p_new 가 NULL/빈문자면 해당 레벨을 정리(그 선수들 group_label = NULL).
--   · 관리(소유자/공동관리자)만 실행.
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_player_level(p_class_id uuid, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_recorder(p_class_id) then
    raise exception '권한이 없습니다. 관리자만 레벨을 수정할 수 있습니다.';
  end if;
  if p_old is null or btrim(p_old) = '' then return; end if;
  update public.players
     set group_label = nullif(btrim(coalesce(p_new, '')), '')
   where league_id = p_class_id
     and group_label = p_old;
end; $$;
grant execute on function public.set_player_level(uuid, text, text) to authenticated;
