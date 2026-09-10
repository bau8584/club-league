-- 교실 화면 — 로그인 없이 대기열과 등급을 본다.
--
-- 아이들이 몰려와 보는 태블릿이 지금 교사 계정으로 로그인돼 있다. 아이 누구나 대기열의
-- × 를 눌러 대진을 지울 수 있고, 명단 관리·경기 삭제·리그 설정까지 열려 있다.
-- 보여주는 기기와 조작하는 기기를 분리한다.
--
-- 이름 규칙이 이 파일의 핵심이다.
--   대기열   — 수업 중에만, 실명. "누구 나와라" 하고 부르려면 실명이어야 한다.
--   등급 목록 — 언제나 김○○. 아이는 자기 이름을 이미 알고, 자기 줄은 학년·반·번호로 찾는다.
-- 실명이 필요한 곳이 대기열뿐이므로 노출을 거기로 묶는다. 링크가 새어나가도 수업 중이
-- 아니면 실명이 화면에 없다.
--
-- 이건 자물쇠가 아니다. 링크를 아는 사람은 수업 중 대기열의 실명을 본다. 그걸 막는
-- 방법은 로그인뿐이고, 로그인을 붙이면 아이가 못 여니 기능의 전제가 무너진다.
begin;

-- 수업이 살아 있다고 볼 시간. 마지막 활동으로부터 이만큼 지나면 대기열을 감추고
-- 이름을 가린다. 수업이 끝나는 순간을 앱이 알 수 없어서 활동으로 가늠한다 —
-- [수업 끝] 버튼은 아이들 정리시키고 나가는 길에 눌리지 않고, 안 눌리면 화면이
-- 밤새 실명을 띄운다. 잊어버렸을 때 가려지는 쪽으로 실패해야 한다.
--
-- 값은 써보고 정한다. 짧을수록 촘촘하지만 수업 중에 가려질 확률이 오른다.
-- 10분은 출석 체크 + 대진 뽑기 + 첫 경기가 끝나기 전에 걸릴 수 있어 쓰지 않는다.
create or replace function public.class_view_idle_after()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

-- 부를 때 쓰는 이름. 대기열에만 쓴다 — 교사가 "김민준!" 하고 부르려면 실명이어야 한다.
-- 등급 목록은 이 함수를 쓰지 않는다(거긴 언제나 mask_person_name 이다).
create or replace function public.player_call_name(p_player_id uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''),
                  nullif(btrim(p.display_name), ''), '?')
  from public.players p where p.id = p_player_id;
$$;

-- ── 학년·반 고르기 ──────────────────────────────────────
-- 첫 화면에는 아무것도 안 보이고 학년·반을 고르게 한다. 링크만 주운 사람이 아무것도
-- 모른 채 리그 전체 명단을 보는 일이 없어진다. 학년·반은 비밀이 아니므로 자물쇠는
-- 아니고, 안내판이다.
drop function if exists public.get_class_options_public(uuid);
create or replace function public.get_class_options_public(p_league_id uuid)
returns table(grade int, class_num int, player_count int)
language sql stable security definer set search_path = public, extensions as $$
  select p.grade, p.class_num, count(*)::int
  from public.players p
  join public.leagues l on l.id = p.league_id
  where p.league_id = p_league_id
    and coalesce(p.is_deleted, false) = false
    and coalesce(l.is_deleted, false) = false
    and p.grade is not null and p.class_num is not null
  group by p.grade, p.class_num
  order by p.grade, p.class_num;
$$;
grant execute on function public.get_class_options_public(uuid) to anon, authenticated;

-- ── 교실 화면 본문 ──────────────────────────────────────
--
-- state 가 화면을 정한다.
--   session       — 내 반이 수업 중. 대기열(실명) + 참석자 등급
--   other_session — 수업은 돌고 있는데 내 반이 아니다. "수업 진행 중이에요" + 고른 반 등급
--   idle          — 수업 중이 아니다. 고른 반 등급
--   need_input    — 아직 학년·반을 안 골랐고 수업도 안 돈다. 고르기 화면
--
-- other_session 에서 어느 반이 수업 중인지는 알려주지 않는다. 아이가 그 정보로 할 게
-- 없고, 얻는 것 없이 알려주기만 하는 정보는 안 알려주는 게 기본이다.
drop function if exists public.get_class_view_public(uuid, uuid, int, int);
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
    'players', v_players
  );
end $$;

grant execute on function public.get_class_view_public(uuid, uuid, int, int) to anon, authenticated;

commit;
