-- 대표 호칭(장착) 저장용 컬럼.
-- 호칭 판정 자체는 클라이언트에서 이번 시즌 경기 데이터로 실시간 계산하고,
-- 여기에는 회원이 '장착'으로 고른 호칭 id 한 개만 저장한다(미장착이면 null).
-- 회원 본인은 기존 "self manage own player" 정책(user_id = auth.uid())으로 자기 행을 수정 가능하므로
-- 추가 정책은 필요 없다.
alter table public.players add column if not exists equipped_title text;

-- 순위표는 비관리자(회원/비로그인)에게 players_public 뷰로 제공되므로,
-- 모두에게 호칭이 보이도록 뷰에도 equipped_title 을 노출한다.
-- (CREATE OR REPLACE VIEW 는 컬럼 순서를 못 바꾸므로 맨 뒤에 추가)
create or replace view public.players_public as
  select id, league_id, rp, tier, win_count, lose_count, nickname,
         group_label, gender, is_deleted, recent_matches, display_name, user_id,
         equipped_title
  from public.players;
grant select on public.players_public to anon, authenticated;
