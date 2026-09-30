-- 코트 수 — 대기열 앞쪽 N줄이 곧 코트 N개에서 뛰는 중이다.
--
-- 지금은 선생님이 "2코트 비었다, 민준이네 들어가" 하고 일일이 불러야 한다. 코트 수를 정해 두면
-- 앞쪽 줄에 "○코트 경기 중"이 붙고, 결과가 들어와 줄이 빠지면 그 코트가 다음 줄에 넘어간다.
-- 교실 화면(태블릿)이 그걸 크게 띄운다.
--
-- 코트 수는 선택이다. 비어 있으면(null) 지금과 똑같다 — 어느 줄에도 코트가 붙지 않는다.
-- 세션 행은 교사마다 하나를 계속 쓰므로 한 번 정하면 다음 수업에도 남는다.
--
-- 코트 번호는 서버가 매긴다(scheduled_matches.court — 원래 있던 메모 칸, 아무도 안 쓰던 자리).
-- 기기마다 셈하면 태블릿을 새로고침할 때 번호가 어긋나 아이들이 엉뚱한 코트로 간다.
begin;

alter table public.assignment_sessions
  add column if not exists court_count int;

-- 한 세션의 코트 배정을 맞춘다.
--   앞쪽 N줄(번호순)이 코트에 있다. 이미 코트를 가진 줄은 그 코트를 지킨다 —
--   2코트에서 뛰는 중인 조의 번호가 바뀌면 안 된다. 코트가 없는 줄은 빈 코트 중 작은 번호.
--   N줄 밖으로 밀린 줄(코트 수를 줄였을 때)은 코트를 뗀다.
create or replace function public.assign_session_courts(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n    int;
  v_row  record;
  v_used int[] := '{}';
  v_kept uuid[] := '{}';
  v_c    int;
  i      int := 0;
begin
  if p_session_id is null then return; end if;
  select court_count into v_n from public.assignment_sessions where id = p_session_id;

  -- 코트를 안 쓰면 붙어 있던 번호를 모두 뗀다(끈 경우).
  if coalesce(v_n, 0) <= 0 then
    update public.scheduled_matches set court = null
     where session_id = p_session_id and court is not null
       and status in ('waiting', 'called');
    return;
  end if;

  -- 1) 앞쪽 N줄 중 올바른 코트를 이미 가진 줄 → 그대로 둔다.
  for v_row in
    select id, court from public.scheduled_matches
     where session_id = p_session_id and status in ('waiting', 'called')
     order by seq nulls last, created_at
     limit v_n
  loop
    if v_row.court ~ '^[0-9]+$' and v_row.court::int between 1 and v_n
       and not (v_row.court::int = any(v_used)) then
      v_used := v_used || v_row.court::int;
      v_kept := v_kept || v_row.id;
    end if;
  end loop;

  -- 2) 나머지 줄: 앞쪽이면 빈 코트, 뒤쪽이면 코트를 뗀다.
  for v_row in
    select id, court from public.scheduled_matches
     where session_id = p_session_id and status in ('waiting', 'called')
     order by seq nulls last, created_at
  loop
    i := i + 1;
    if i <= v_n then
      if v_row.id = any(v_kept) then continue; end if;   -- 1)에서 코트를 지킨 줄
      select min(c) into v_c from generate_series(1, v_n) c where not (c = any(v_used));
      update public.scheduled_matches set court = v_c::text where id = v_row.id;
      v_used := v_used || v_c;
    elsif v_row.court is not null then
      update public.scheduled_matches set court = null where id = v_row.id;
    end if;
  end loop;
end $$;

-- 줄이 생기거나 빠지거나(결과 입력·삭제) 순서가 바뀌면 다시 맞춘다.
-- 이 함수 안의 update 가 다시 방아쇠를 당기지 않게 깊이로 막는다.
create or replace function public.trg_sched_assign_courts()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op in ('UPDATE', 'DELETE') then perform public.assign_session_courts(old.session_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.session_id is distinct from old.session_id) then
    perform public.assign_session_courts(new.session_id);
  end if;
  return null;
end $$;

drop trigger if exists sched_assign_courts on public.scheduled_matches;
create trigger sched_assign_courts
  after insert or delete or update of status, seq, session_id on public.scheduled_matches
  for each row execute function public.trg_sched_assign_courts();

-- 코트 수를 바꾸면 바로 다시 맞춘다.
create or replace function public.trg_session_assign_courts()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.court_count is distinct from old.court_count then
    perform public.assign_session_courts(new.id);
  end if;
  return null;
end $$;

drop trigger if exists session_assign_courts on public.assignment_sessions;
create trigger session_assign_courts
  after update of court_count on public.assignment_sessions
  for each row execute function public.trg_session_assign_courts();

-- ── 교실 화면에 코트를 내려보낸다 ──────────────────────
-- 2026-09-10_class_view_public.sql 의 본문 그대로에 두 가지만 더한다:
-- 줄마다 'court', 그리고 수업 중일 때 'court_count'.
create or replace function public.get_class_view_public(
  p_league_id uuid,
  p_owner_id  uuid default null,
  p_grade     int  default null,
  p_class_num int  default null
)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_league        public.leagues%rowtype;
  v_session       public.assignment_sessions%rowtype;
  v_last_activity timestamptz;
  v_active        boolean := false;
  v_mine          boolean := false;   -- 고른 반이 지금 수업 중인 반인가
  v_state         text;
  v_scope_ids     uuid[];             -- 등급 목록에 올릴 사람
  v_queue         jsonb;
  v_players       jsonb;
  v_label         text;
  v_today         timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  select * into v_league from public.leagues
   where id = p_league_id and coalesce(is_deleted, false) = false;
  if v_league.id is null then
    return jsonb_build_object('state', 'not_found');
  end if;

  -- 내 세션. 학교는 교사별, 동호회는 주인 없는 한 행.
  if p_owner_id is null then
    select * into v_session from public.assignment_sessions
     where league_id = p_league_id and owner_id is null;
  else
    select * into v_session from public.assignment_sessions
     where league_id = p_league_id and owner_id = p_owner_id;
  end if;

  -- 살아 있는가 = 마지막 활동이 얼마나 됐나.
  -- 활동은 셋 중 가장 최근 것이다. 결과 입력만 보면 좁다 — 수업을 막 시작해 아직
  -- 첫 경기가 안 끝난 구간이 통째로 "죽은" 것으로 잡힌다.
  if v_session.id is not null and array_length(v_session.player_ids, 1) > 0 then
    select greatest(
             v_session.started_at,                                   -- [새로 시작]
             coalesce((select max(created_at) from public.scheduled_matches
                        where session_id = v_session.id), v_session.started_at),  -- 대진 뽑기
             coalesce((select max(created_at) from public.matches
                        where league_id = p_league_id
                          and created_at >= v_session.started_at), v_session.started_at)  -- 결과 입력
           )
      into v_last_activity;
    v_active := (now() - v_last_activity) < public.class_view_idle_after();
  end if;

  -- 고른 반이 지금 수업 중인 반인가. 개인이 아니라 반 단위로 본다 —
  -- 개인으로 보면 오늘 결석한 아이에게 "네 반은 수업 중이 아니다"라고 거짓말한다.
  if v_active then
    if p_grade is null or p_class_num is null then
      v_mine := true;   -- 아무것도 안 고른 화면(교실 태블릿)은 지금 도는 수업을 보여준다
    else
      select exists (
        select 1 from public.players p
         where p.id = any(v_session.player_ids)
           and p.grade = p_grade and p.class_num = p_class_num
      ) into v_mine;
    end if;
  end if;

  if v_active and v_mine then
    v_state := 'session';
    v_scope_ids := v_session.player_ids;
  elsif p_grade is null or p_class_num is null then
    -- 수업도 안 돌고 고른 반도 없다 → 고를 것을 물어본다.
    return jsonb_build_object(
      'state', 'need_input',
      'league_type', v_league.league_type,
      'league_name', v_league.name
    );
  else
    v_state := case when v_active then 'other_session' else 'idle' end;
    select array_agg(p.id) into v_scope_ids from public.players p
     where p.league_id = p_league_id
       and coalesce(p.is_deleted, false) = false
       and p.grade = p_grade and p.class_num = p_class_num;
  end if;

  -- 화면 제목. 세션이 여러 반을 담을 수 있으므로(학년 대전) 실제로 든 반을 모아 짓는다.
  select string_agg(distinct (p.grade || '-' || p.class_num || '반'), ', ' order by (p.grade || '-' || p.class_num || '반'))
    into v_label
    from public.players p
   where p.id = any(coalesce(v_scope_ids, '{}'::uuid[]))
     and p.grade is not null and p.class_num is not null;

  -- 대기열 — 내 반이 수업 중일 때만. 여기만 실명이다.
  if v_state = 'session' then
    select coalesce(jsonb_agg(item order by row_seq nulls last, row_created), '[]'::jsonb)
      into v_queue
      from (
        select
          sm.seq as row_seq,
          sm.created_at as row_created,
          jsonb_build_object(
            'seq', sm.seq,
            'court', sm.court,
            'team_a', (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                         from unnest(array[sm.player_a_id, sm.player_a2_id]) x where x is not null),
            'team_b', (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                         from unnest(array[sm.player_b_id, sm.player_b2_id]) x where x is not null),
            'pool',   (select coalesce(jsonb_agg(public.player_call_name(x)), '[]'::jsonb)
                         from unnest(coalesce(sm.player_ids, '{}'::uuid[])) x where x is not null)
          ) as item
        from public.scheduled_matches sm
       where sm.session_id = v_session.id
         and sm.status in ('waiting', 'called')
      ) q;
  else
    v_queue := '[]'::jsonb;
  end if;

  -- 등급 목록 — 언제나 가린 이름. 티어 계산에 필요한 rp 는 내려보낸다(지금 공개
  -- 순위표도 내려보내는 값이다). 화면에 숫자로 찍지 않을 뿐이다.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', p.id,
             'name', case when v_league.league_type = 'school'
                          then public.mask_person_name(coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.display_name), ''), p.nickname))
                          else coalesce(nullif(btrim(p.display_name), ''), p.nickname) end,
             'rp', p.rp,
             'wins', coalesce(p.win_count, 0),
             'losses', coalesce(p.lose_count, 0),
             'grade', p.grade,
             'class_num', p.class_num,
             'student_no', p.student_no,
             -- 오늘 몇 판 뛰었나. 교실에서 제일 자주 나오는 항의가 "쟤만 많이 했어요"다.
             'today_plays', (
               select count(*)::int from public.matches m
                where m.league_id = p_league_id
                  and m.created_at >= v_today
                  and p.id in (m.winner_id, m.loser_id, m.winner2_id, m.loser2_id)
             )
           )
           order by coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.display_name), ''), p.nickname)
         ), '[]'::jsonb)
    into v_players
    from public.players p
   where p.id = any(coalesce(v_scope_ids, '{}'::uuid[]))
     and coalesce(p.is_deleted, false) = false;

  return jsonb_build_object(
    'state', v_state,
    'league_type', v_league.league_type,
    'league_name', v_league.name,
    'class_label', v_label,
    'tier_thresholds', v_league.settings->'tierThresholds',
    'placement', v_league.settings->'placement',
    'queue', v_queue,
    'court_count', case when v_state = 'session' then v_session.court_count end,
    'players', v_players
  );
end $$;

grant execute on function public.get_class_view_public(uuid, uuid, int, int) to anon, authenticated;

commit;
