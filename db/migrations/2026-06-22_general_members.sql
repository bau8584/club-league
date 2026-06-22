-- ─────────────────────────────────────────────────────────────
-- 일반 회원(self-signup) 도입 — 역할 분리 + 닉네임 연동 + 승격
--   · 관리자 = owner + admin_uids  /  일반회원 = member_uids(가입자)
--   · 일반회원: 관리 권한 없음, 본인이 참여한 경기만 기록, 명단 닉네임 자율 연동
--   · 방장이 멤버 ↔ 관리자 승격/강등
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;

-- 1) 권한 헬퍼: 관리(record/manage)는 소유자/공동관리자만 (member_uids 제외)
create or replace function public.is_class_recorder(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[])))
  );
$$;

-- 가입한 모든 사람(소유자/공동관리/일반회원)
create or replace function public.is_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(l.member_uids, '{}'::uuid[])))
  );
$$;
grant execute on function public.is_class_member(uuid) to authenticated;

-- 1-b) players_public 뷰에 user_id 노출 (일반회원이 미연결 닉네임을 식별·연동하기 위함)
--   CREATE OR REPLACE VIEW 는 기존 컬럼 순서를 못 바꾸므로 user_id 를 맨 뒤에 추가.
create or replace view public.players_public as
  select id, league_id, rp, tier, win_count, lose_count, nickname,
         group_label, gender, is_deleted, recent_matches, display_name, user_id
  from public.players;
grant select on public.players_public to anon, authenticated;

-- 2) matches: 가입 멤버는 조회 가능 (리더보드·내 기록용)
drop policy if exists "members read matches" on public.matches;
create policy "members read matches" on public.matches for select to authenticated
  using (public.is_class_member(league_id));

-- 3) 경기 기록 RPC: 관리자 또는 "본인이 참여한 경기"인 일반회원 허용
create or replace function public.record_match_transaction(
  p_class_id uuid, p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_player_updates jsonb,
  p_winner2_id uuid default null, p_loser2_id uuid default null,
  p_winner_score int default null, p_loser_score int default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_participant boolean;
begin
  select exists(
    select 1 from public.players p
    where p.user_id = auth.uid() and p.league_id = p_class_id
      and p.id in (p_winner_id, p_loser_id,
                   coalesce(p_winner2_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   coalesce(p_loser2_id,  '00000000-0000-0000-0000-000000000000'::uuid))
  ) into v_participant;

  if not (public.is_class_recorder(p_class_id) or v_participant) then
    raise exception '권한이 없습니다. 본인이 참여한 경기만 기록할 수 있습니다.';
  end if;

  insert into public.matches
    (id, league_id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score, created_at)
  values
    (p_match_id, p_class_id, p_winner_id, p_loser_id, p_winner2_id, p_loser2_id, p_winner_score, p_loser_score, now());
  for r in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int) loop
    update public.players set rp = r.rp where id = r.id and league_id = p_class_id;
  end loop;
end; $$;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int) to authenticated;

-- 4) 닉네임 연동(claim): 계정 미연결 명단 행을 내 계정으로 (자율, 확인 없음)
create or replace function public.claim_player(p_player_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_league uuid;
begin
  select league_id into v_league from public.players
  where id = p_player_id and user_id is null and coalesce(is_deleted,false) = false;
  if v_league is null then raise exception '연동할 수 없는 닉네임입니다 (이미 연동되었거나 존재하지 않음).'; end if;
  if not public.is_class_member(v_league) then raise exception '먼저 리그에 참여해야 합니다.'; end if;
  if exists(select 1 from public.players where league_id = v_league and user_id = auth.uid() and coalesce(is_deleted,false)=false) then
    raise exception '이미 이 리그에 연동된 프로필이 있습니다.';
  end if;
  update public.players set user_id = auth.uid() where id = p_player_id;
end; $$;
grant execute on function public.claim_player(uuid) to authenticated;

-- 5) 멤버 ↔ 관리자 승격/강등 (소유자 전용)
create or replace function public.set_member_admin(p_class_id uuid, p_uid uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_owner(p_class_id) then raise exception '권한이 없습니다.'; end if;
  if p_make_admin then
    update public.leagues
      set admin_uids = (select array(select distinct e from unnest(coalesce(admin_uids,'{}'::uuid[]) || array[p_uid]) e))
      where id = p_class_id;
  else
    update public.leagues set admin_uids = array_remove(coalesce(admin_uids,'{}'::uuid[]), p_uid) where id = p_class_id;
  end if;
end; $$;
grant execute on function public.set_member_admin(uuid, uuid, boolean) to authenticated;

commit;
