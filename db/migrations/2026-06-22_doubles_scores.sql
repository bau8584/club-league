-- ─────────────────────────────────────────────────────────────
-- 복식(2:2) 파트너 + 점수 보존
--   matches 에 winner2_id/loser2_id/winner_score/loser_score 추가하고
--   record_match_transaction 이 이를 함께 저장하도록 확장.
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- (이미 club_schema.sql 을 적용한 기존 DB 용. 새로 설치하면 club_schema.sql 에 이미 포함됨)
-- ─────────────────────────────────────────────────────────────
begin;

alter table public.matches
  add column if not exists winner2_id   uuid references public.players(id) on delete set null,
  add column if not exists loser2_id    uuid references public.players(id) on delete set null,
  add column if not exists winner_score int,
  add column if not exists loser_score  int;

-- 시그니처가 바뀌므로 옛 버전 제거 후 재생성
drop function if exists public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb);

create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score int default null, p_loser_score int default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not public.is_class_recorder(p_class_id) then raise exception '권한이 없습니다.'; end if;
  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score, created_at)
  values
    (p_match_id, p_class_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score, now());
  for r in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int) loop
    update public.players set rp = r.rp where id = r.id and league_id = p_class_id;
  end loop;
end; $$;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int) to authenticated;

commit;
