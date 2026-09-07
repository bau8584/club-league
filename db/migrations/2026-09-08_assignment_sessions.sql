-- 배정 세션 — "지금 여기 모인 참가자 명단 한 벌".
--
-- 큐를 소유하는 단위는 "반"이 아니라 세션이다. 2반 수업이면 2반 학생, 학년 대전이면
-- 여러 반이 섞인 명단, 동호회면 오늘 나온 사람들. 반으로 묶으면 학년 대전에서 무너지고
-- 동호회는 반 개념 자체가 없다.
--
-- 명단을 로컬에 두면 안 된다: 태블릿 A에서 명단을 고쳐 큐를 뽑고, 태블릿 B가 옛 명단으로
-- [채우기]를 누르면 결석자가 다시 들어간 대진이 나온다. 편의가 아니라 정합성 문제이고,
-- 어긋난 순간을 아무도 눈치채지 못한다.
--
-- leagues.settings 에 얹지 않는다. 세션은 수업마다 갱신되는 휘발성 상태인데 settings 에는
-- 티어 임계·보너스가 들어 있어, 두 기기가 동시에 갱신하면 read-modify-write 경합으로
-- 한쪽의 리그 설정 변경이 조용히 롤백될 수 있다.
create table if not exists public.assignment_sessions (
  league_id    uuid primary key references public.leagues(id) on delete cascade,
  player_ids   uuid[] not null default '{}',      -- 오늘 참석자(출석 체크 결과)
  match_type   text not null default 'double',    -- single | double (세션의 종목)
  started_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now()
);

-- league_id 를 PK 로 두면 [새로 시작]이 upsert 한 번이다. 이력은 남기지 않는다 —
-- 커버리지와 판 수는 전부 matches 에서 유도되므로 세션 이력을 읽을 일이 없다.
alter table public.assignment_sessions enable row level security;

-- RLS 는 scheduled_matches 의 정책을 그대로 본뜬다.
-- 읽기는 기록 권한자(회원 포함) — 회원이 자기가 명단에 있는지 봐야 한다.
drop policy if exists "recorders read session" on public.assignment_sessions;
create policy "recorders read session" on public.assignment_sessions for select to authenticated
  using (public.is_class_recorder(league_id));
-- 생성/수정/삭제는 관리 권한자(방장/공동방장/공동관리자).
drop policy if exists "teachers manage session" on public.assignment_sessions;
create policy "teachers manage session" on public.assignment_sessions for all to authenticated
  using (public.is_class_teacher(league_id)) with check (public.is_class_teacher(league_id));

grant select, insert, update, delete on public.assignment_sessions to authenticated;

-- 실시간 구독: 명단이 큐와 같은 방식으로 모든 기기에 즉시 반영돼야 한다.
do $$ begin
  alter publication supabase_realtime add table public.assignment_sessions;
exception when duplicate_object then null; when undefined_object then null; end $$;
