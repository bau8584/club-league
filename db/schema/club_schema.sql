-- ============================================================
-- club-league 클럽 스키마 (동호회 버전) — 단일 통합본
--   새 Supabase 프로젝트 SQL Editor 에 전체 붙여넣고 Run.
--   학교형(classes/students/학년·반·번호)을 걷어내고
--   클럽형(leagues/players/구분조 + 계정연결)으로 재설계.
--
--   * RPC 이름과 파라미터(p_class_id 등)는 코드 호환을 위해 유지.
--     (사용자에게 보이는 Table Editor 의 테이블/컬럼만 클럽 이름)
-- ============================================================
begin;

create extension if not exists pgcrypto;

-- ── 0) 이전 시도/학교용 잔재 정리 (새 프로젝트라 데이터 없음 → 안전) ──
--   기존 테이블이 남아 있으면 'create table if not exists'가 새 정의를
--   건너뛰어 컬럼 불일치(42703)가 난다. 깨끗이 비우고 새로 만든다.
drop view  if exists public.players_public   cascade;
drop view  if exists public.students_public  cascade;
drop table if exists public.season_standings cascade;
drop table if exists public.player_secrets   cascade;
drop table if exists public.student_secrets  cascade;
drop table if exists public.league_secrets   cascade;
drop table if exists public.class_secrets    cascade;
drop table if exists public.matches          cascade;
drop table if exists public.players          cascade;
drop table if exists public.students         cascade;
drop table if exists public.leagues          cascade;
drop table if exists public.classes          cascade;

-- 반환 형식이 바뀐 함수는 create or replace 가 실패하므로 먼저 제거.
drop function if exists public.is_class_recorder(uuid);
drop function if exists public.is_class_teacher(uuid);
drop function if exists public.is_class_owner(uuid);
drop function if exists public.current_season_of(uuid);
drop function if exists public.stamp_match_season();
drop function if exists public.start_new_season(uuid, text);
drop function if exists public.list_class_seasons(uuid);
drop function if exists public.get_season_standings_public(uuid, text);
drop function if exists public.restore_season(uuid, text);
drop function if exists public.rename_season(uuid, text, text);
drop function if exists public.delete_season(uuid, text, boolean);
drop function if exists public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb);
drop function if exists public.restore_class_data(uuid, jsonb, jsonb);
drop function if exists public.join_league(uuid);
drop function if exists public.leave_league(uuid);
drop function if exists public.get_league_members(uuid);
drop function if exists public.remove_league_member(uuid, uuid);
drop function if exists public.student_has_code(uuid);
drop function if exists public.verify_student_code(uuid, text);
drop function if exists public.claim_student(uuid, text, text);
drop function if exists public.update_student_nickname(uuid, text, text);
drop function if exists public.change_student_code(uuid, text, text);

-- ── 1) leagues : 리그 ─────────────────────────────────────────
create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   uuid not null references auth.users(id) on delete cascade,
  admin_uids  uuid[] not null default '{}',   -- 공동 관리자
  member_uids uuid[] not null default '{}',   -- 일반 멤버(동호인)
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  join_code   text,            -- 6자리 초대 코드(트리거 자동 부여)
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_leagues_join_code on public.leagues (join_code);
alter table public.leagues enable row level security;

-- ── 2) players : 선수(동호인) ─────────────────────────────────
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null, -- 계정 연결(동호회 토대)
  name          text,            -- 본명/표시 이름
  nickname      text,
  gender        text not null default 'U',
  group_label   text,            -- 구분조 (학년/반 대체)
  birth_year    int,             -- 연생 (선택)
  rp            int  not null default 1000,
  tier          text,
  win_count     int  not null default 0,
  lose_count    int  not null default 0,
  recent_matches text,
  display_name  text,
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_players_league on public.players (league_id);
create unique index if not exists uq_players_league_user
  on public.players (league_id, user_id) where user_id is not null;
alter table public.players enable row level security;

-- ── 3) matches : 경기 기록 ────────────────────────────────────
create table if not exists public.matches (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  winner_id    uuid references public.players(id) on delete set null,
  loser_id     uuid references public.players(id) on delete set null,
  winner2_id   uuid references public.players(id) on delete set null,  -- 복식 승리팀 파트너
  loser2_id    uuid references public.players(id) on delete set null,  -- 복식 패배팀 파트너
  winner_score int,
  loser_score  int,
  season       text,
  status       text not null default 'confirmed',  -- confirmed | pending | rejected (승인모드용)
  created_at   timestamptz not null default now()
);
create index if not exists idx_matches_league on public.matches (league_id);
create index if not exists idx_matches_league_season on public.matches (league_id, season);
alter table public.matches enable row level security;

-- ── 4) league_secrets : 관리자 코드 ──────────────────────────
create table if not exists public.league_secrets (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  admin_code text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_league_secrets_league on public.league_secrets (league_id);
alter table public.league_secrets enable row level security;

-- ── 6) season_standings : 과거 시즌 순위 스냅샷 ──────────────
create table if not exists public.season_standings (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  season       text not null,
  player_id    uuid not null,
  name         text,
  nickname     text,
  display_name text,
  group_label  text,
  gender       text,
  rp           int,
  win_count    int,
  lose_count   int,
  archived_at  timestamptz not null default now()
);
create index if not exists idx_season_standings_league_season
  on public.season_standings (league_id, season);
-- 한 시즌에 같은 선수 스냅샷이 중복 저장되지 않도록 보장
create unique index if not exists uq_season_standings_player
  on public.season_standings (league_id, season, player_id);
alter table public.season_standings enable row level security;

-- ── 7) players_public : 본명(name) 제외 공개 뷰 ──────────────
create or replace view public.players_public as
  select id, league_id, rp, tier, win_count, lose_count, nickname,
         group_label, gender, is_deleted, recent_matches, display_name, user_id
  from public.players;

-- ============================================================
-- 권한 헬퍼
-- ============================================================
-- 기록 권한자 = 소유자 / 공동관리자 / 멤버 (동호회는 멤버도 기록 가능)
create or replace function public.is_class_recorder(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(l.member_uids, '{}'::uuid[])))
  );
$$;

-- 관리 권한자 = 소유자 / 공동관리자
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.leagues l
    where l.id = p_class_id
      and (l.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(l.admin_uids, '{}'::uuid[])))
  );
$$;

-- 소유자 전용
create or replace function public.is_class_owner(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.leagues l where l.id = p_class_id and l.owner_uid = auth.uid());
$$;

grant execute on function public.is_class_recorder(uuid) to authenticated;
grant execute on function public.is_class_teacher(uuid)  to authenticated;
grant execute on function public.is_class_owner(uuid)    to authenticated;

-- ============================================================
-- RLS 정책
-- ============================================================
-- leagues
drop policy if exists "members read leagues" on public.leagues;
create policy "members read leagues" on public.leagues for select to authenticated
  using (owner_uid = auth.uid()
    or auth.uid() = any(coalesce(admin_uids, '{}'::uuid[]))
    or auth.uid() = any(coalesce(member_uids, '{}'::uuid[])));

drop policy if exists "create own league" on public.leagues;
create policy "create own league" on public.leagues for insert to authenticated
  with check (owner_uid = auth.uid());

drop policy if exists "admins update league" on public.leagues;
create policy "admins update league" on public.leagues for update to authenticated
  using (public.is_class_teacher(id)) with check (public.is_class_teacher(id));

drop policy if exists "owner delete league" on public.leagues;
create policy "owner delete league" on public.leagues for delete to authenticated
  using (owner_uid = auth.uid());

-- players : 기록 권한자 전체 관리 + 본인(user_id) 자가 생성/수정
drop policy if exists "recorders manage players" on public.players;
create policy "recorders manage players" on public.players for all to authenticated
  using (public.is_class_recorder(league_id)) with check (public.is_class_recorder(league_id));

drop policy if exists "self manage own player" on public.players;
create policy "self manage own player" on public.players for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- matches : 기록 권한자 전체
drop policy if exists "recorders manage matches" on public.matches;
create policy "recorders manage matches" on public.matches for all to authenticated
  using (public.is_class_recorder(league_id)) with check (public.is_class_recorder(league_id));

-- league_secrets : 소유자 쓰기, 권한자 읽기
drop policy if exists "recorders read league secret" on public.league_secrets;
create policy "recorders read league secret" on public.league_secrets for select to authenticated
  using (public.is_class_recorder(league_id));
drop policy if exists "owner write league secret" on public.league_secrets;
create policy "owner write league secret" on public.league_secrets for all to authenticated
  using (public.is_class_owner(league_id)) with check (public.is_class_owner(league_id));

-- season_standings : 관리자 읽기
drop policy if exists "teachers read season standings" on public.season_standings;
create policy "teachers read season standings" on public.season_standings for select to authenticated
  using (public.is_class_teacher(league_id));

-- ============================================================
-- 시즌 RPC
-- ============================================================
create or replace function public.current_season_of(p_class_id uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select coalesce(nullif(btrim((l.settings->>'season')), ''), '시즌 1')
  from public.leagues l where l.id = p_class_id;
$$;

create or replace function public.stamp_match_season()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.season is null then new.season := public.current_season_of(new.league_id); end if;
  return new;
end; $$;
drop trigger if exists trg_stamp_match_season on public.matches;
create trigger trg_stamp_match_season before insert on public.matches
  for each row execute function public.stamp_match_season();

create or replace function public.start_new_season(p_class_id uuid, p_new_season text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_old text; v_new text := nullif(btrim(coalesce(p_new_season,'')),'');
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  if v_new is null then raise exception '새 시즌 이름을 입력해 주세요.'; end if;
  v_old := public.current_season_of(p_class_id);
  if v_new = v_old then raise exception '현재 시즌과 다른 이름을 입력해 주세요.'; end if;

  insert into public.season_standings
    (league_id, season, player_id, name, nickname, display_name, group_label, gender, rp, win_count, lose_count)
  select p.league_id, v_old, p.id, p.name, p.nickname, p.display_name, p.group_label, p.gender, p.rp, p.win_count, p.lose_count
  from public.players p
  where p.league_id = p_class_id and coalesce(p.is_deleted,false) = false;

  update public.players set rp = 1000, win_count = 0, lose_count = 0
   where league_id = p_class_id and coalesce(is_deleted,false) = false;

  update public.leagues set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('season', v_new)
   where id = p_class_id;
  return v_new;
end; $$;

create or replace function public.list_class_seasons(p_class_id uuid)
returns table(season text, is_current boolean) language sql stable security definer set search_path = public, extensions as $$
  with cur as (select public.current_season_of(p_class_id) as s)
  select x.season, (x.season = (select s from cur)) as is_current
  from (
    select distinct season from public.season_standings where league_id = p_class_id
    union select (select s from cur)
  ) x where x.season is not null
  order by (x.season = (select s from cur)) desc, x.season desc;
$$;

create or replace function public.get_season_standings_public(p_class_id uuid, p_season text)
returns table(player_id uuid, nickname text, display_name text, group_label text, gender text, rp int, win_count int, lose_count int)
language sql stable security definer set search_path = public, extensions as $$
  select player_id, nickname, display_name, group_label, gender, rp, win_count, lose_count
  from public.season_standings where league_id = p_class_id and season = p_season
  order by rp desc;
$$;

create or replace function public.rename_season(p_class_id uuid, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  update public.season_standings set season = p_new where league_id = p_class_id and season = p_old;
  update public.matches set season = p_new where league_id = p_class_id and season = p_old;
  if public.current_season_of(p_class_id) = p_old then
    update public.leagues set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('season', p_new) where id = p_class_id;
  end if;
end; $$;

create or replace function public.delete_season(p_class_id uuid, p_season text, p_delete_matches boolean default false)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  delete from public.season_standings where league_id = p_class_id and season = p_season;
  if p_delete_matches then delete from public.matches where league_id = p_class_id and season = p_season; end if;
end; $$;

-- ============================================================
-- 경기/멤버 RPC
-- ============================================================
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

create or replace function public.restore_class_data(p_class_id uuid, p_students jsonb, p_matches jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_owner(p_class_id) then raise exception '권한이 없습니다.'; end if;
  delete from public.matches where league_id = p_class_id;
  delete from public.players where league_id = p_class_id;
  insert into public.players select * from jsonb_populate_recordset(null::public.players, p_students);
  insert into public.matches select * from jsonb_populate_recordset(null::public.matches, p_matches);
  return jsonb_build_object('ok', true);
end; $$;

-- 6자리 초대 코드 생성/자동부여 + 코드로 참여
create or replace function public.gen_unique_join_code()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text; v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where join_code = v_code);
  end loop;
  return v_code;
end; $$;

create or replace function public.set_join_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.join_code is null or btrim(new.join_code) = '' then
    new.join_code := public.gen_unique_join_code();
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_join_code on public.leagues;
create trigger trg_set_join_code before insert on public.leagues
  for each row execute function public.set_join_code();

create or replace function public.join_league_by_code(p_code text)
returns table(id uuid, class_name text, is_owner boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_owner uuid; v_members uuid[];
begin
  select l.id, l.owner_uid, coalesce(l.member_uids,'{}'::uuid[])
    into v_id, v_owner, v_members
  from public.leagues l
  where upper(btrim(l.join_code)) = upper(btrim(p_code))
    and coalesce(l.is_deleted, false) = false;
  if v_id is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;
  if v_owner <> auth.uid() and not (auth.uid() = any(v_members)) then
    update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = v_id;
  end if;
  return query select l.id, l.name, (l.owner_uid = auth.uid()) from public.leagues l where l.id = v_id;
end; $$;

create or replace function public.join_league(p_class_id uuid)
returns table(id uuid, class_name text, is_owner boolean) language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_members uuid[];
begin
  select l.owner_uid, coalesce(l.member_uids,'{}'::uuid[]) into v_owner, v_members
  from public.leagues l where l.id = p_class_id and coalesce(l.is_deleted,false) = false;
  if v_owner is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;
  if v_owner <> auth.uid() and not (auth.uid() = any(v_members)) then
    update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = p_class_id;
  end if;
  return query select l.id, l.name, (l.owner_uid = auth.uid()) from public.leagues l where l.id = p_class_id;
end; $$;

create or replace function public.leave_league(p_class_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.leagues
     set member_uids = array_remove(coalesce(member_uids,'{}'::uuid[]), auth.uid()),
         admin_uids  = array_remove(coalesce(admin_uids,'{}'::uuid[]),  auth.uid())
   where id = p_class_id;
  -- 탈퇴 시 내 계정↔선수 연동만 해제(기록·명단 행은 보존 → 삭제는 관리자 권한).
  -- 재참가하면 myPlayer 가 없으므로 프로필 선택(온보딩) 화면이 다시 뜬다.
  update public.players
     set user_id = null
   where league_id = p_class_id and user_id = auth.uid();
end; $$;

-- 레벨 이름변경/삭제 시 기존 회원 group_label 일괄 이전/정리 (관리자 전용)
create or replace function public.set_player_level(p_class_id uuid, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_recorder(p_class_id) then
    raise exception '권한이 없습니다. 관리자만 레벨을 수정할 수 있습니다.';
  end if;
  if p_old is null or btrim(p_old) = '' then return; end if;
  update public.players
     set group_label = nullif(btrim(coalesce(p_new, '')), '')
   where league_id = p_class_id and group_label = p_old;
end; $$;

create or replace function public.get_league_members(p_class_id uuid)
returns table(uid uuid, email text, role text) language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  return query
    select u.id, u.email::text,
      case when l.owner_uid = u.id then 'owner'
           when u.id = any(coalesce(l.admin_uids,'{}'::uuid[])) then 'admin'
           else 'member' end
    from public.leagues l
    join auth.users u on (u.id = l.owner_uid
        or u.id = any(coalesce(l.admin_uids,'{}'::uuid[]))
        or u.id = any(coalesce(l.member_uids,'{}'::uuid[])))
    where l.id = p_class_id;
end; $$;

create or replace function public.remove_league_member(p_class_id uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_class_teacher(p_class_id) then raise exception '권한이 없습니다.'; end if;
  update public.leagues
     set member_uids = array_remove(coalesce(member_uids,'{}'::uuid[]), p_member),
         admin_uids  = array_remove(coalesce(admin_uids,'{}'::uuid[]),  p_member)
   where id = p_class_id;
end; $$;

-- ============================================================
-- 휴면 감점(decay) 로그 + 수동 실시 RPC
-- ============================================================
create table if not exists public.decay_log (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  batch_id    uuid not null,
  player_id   uuid references public.players(id) on delete set null,
  player_name text,
  tier        text,
  rp_before   int,
  rp_after    int,
  decay_rp    int,
  season      text,
  applied_by  uuid default auth.uid(),
  applied_at  timestamptz not null default now()
);
create index if not exists idx_decay_log_league on public.decay_log (league_id, applied_at desc);
alter table public.decay_log enable row level security;

drop policy if exists "teachers read decay log" on public.decay_log;
create policy "teachers read decay log" on public.decay_log for select to authenticated
  using (public.is_class_teacher(league_id));

create or replace function public.apply_dormancy_decay(p_class_id uuid, p_season text, p_entries jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_batch  uuid := gen_random_uuid();
  v_entry  jsonb;
  v_pid    uuid;
  v_decay  int;
  v_before int;
  v_after  int;
begin
  if not public.is_class_owner(p_class_id) then
    raise exception '권한이 없습니다 (소유자 전용)';
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
  loop
    v_pid   := (v_entry->>'player_id')::uuid;
    v_decay := greatest(0, coalesce((v_entry->>'decay_rp')::int, 0));
    if v_pid is null or v_decay = 0 then continue; end if;

    select rp into v_before from public.players
      where id = v_pid and league_id = p_class_id;
    if v_before is null then continue; end if;

    v_after := greatest(0, v_before - v_decay);
    if v_after = v_before then continue; end if;

    update public.players set rp = v_after where id = v_pid;

    insert into public.decay_log(
      league_id, batch_id, player_id, player_name, tier,
      rp_before, rp_after, decay_rp, season
    ) values (
      p_class_id, v_batch, v_pid, v_entry->>'player_name', v_entry->>'tier',
      v_before, v_after, v_before - v_after, p_season
    );
  end loop;

  return v_batch;
end;
$$;

-- ============================================================
-- 실행 권한 + Data API 권한
-- ============================================================
grant execute on function public.current_season_of(uuid)            to authenticated, anon;
grant execute on function public.start_new_season(uuid, text)       to authenticated;
grant execute on function public.list_class_seasons(uuid)           to authenticated, anon;
grant execute on function public.get_season_standings_public(uuid, text) to authenticated, anon;
grant execute on function public.rename_season(uuid, text, text)    to authenticated;
grant execute on function public.delete_season(uuid, text, boolean) to authenticated;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, int, int) to authenticated;
grant execute on function public.restore_class_data(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.join_league(uuid)                  to authenticated;
grant execute on function public.join_league_by_code(text)          to authenticated;
grant execute on function public.leave_league(uuid)                 to authenticated;
grant execute on function public.set_player_level(uuid, text, text) to authenticated;
grant execute on function public.get_league_members(uuid)           to authenticated;
grant execute on function public.remove_league_member(uuid, uuid)   to authenticated;
grant execute on function public.apply_dormancy_decay(uuid, text, jsonb) to authenticated;

grant select, insert, update, delete on public.leagues        to authenticated;
grant select, insert, update, delete on public.players        to authenticated;
grant select, insert, update, delete on public.matches        to authenticated;
grant select, insert, update, delete on public.league_secrets to authenticated;
grant select                          on public.season_standings to authenticated;
grant select                          on public.decay_log         to authenticated;
grant select on public.players_public to anon, authenticated;

commit;
