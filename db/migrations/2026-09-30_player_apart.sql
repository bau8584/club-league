-- 같이 안 붙이기 — 대기열이 한 경기(같은 편·상대편 모두)에 넣지 않는 두 학생.
--
-- 이유는 저장하지 않는다. 민감한 사정(학교폭력 등)일 수 있어서, 남는 것은 "이 둘"이라는 사실뿐이다.
-- 읽기도 관리 권한자만 — assignment_sessions 는 기록 권한자(학생 기록원·회원)도 읽으므로 거기 얹지 않는다.
-- 수업(세션)이 아니라 리그에 붙는다: 다음 수업에도, 다른 선생님이 열어도 그대로 지켜진다.
create table if not exists public.player_apart (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  player_a   uuid not null references public.players(id) on delete cascade,
  player_b   uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (player_a < player_b),
  unique (league_id, player_a, player_b)
);
create index if not exists player_apart_league on public.player_apart (league_id);

alter table public.player_apart enable row level security;
drop policy if exists "teachers manage apart" on public.player_apart;
create policy "teachers manage apart" on public.player_apart for all to authenticated
  using (public.is_class_teacher(league_id)) with check (public.is_class_teacher(league_id));
grant select, insert, delete on public.player_apart to authenticated;
