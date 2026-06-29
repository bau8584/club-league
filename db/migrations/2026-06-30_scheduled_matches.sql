-- 대진 호출(예정 경기): 운영진이 대진을 잡아 두고(waiting) "입장 호출"(called) 하면
-- 해당 회원 화면에 실시간 배너가 뜬다. 실제 경기 결과는 기존 matches로 별도 기록되므로
-- 이 테이블은 RP/통계에 영향을 주지 않는다(완전 분리).
create table if not exists public.scheduled_matches (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  match_type    text not null default 'single',  -- single | double
  player_a_id   uuid references public.players(id) on delete cascade,
  player_b_id   uuid references public.players(id) on delete cascade,
  player_a2_id  uuid references public.players(id) on delete set null,
  player_b2_id  uuid references public.players(id) on delete set null,
  court         text,                            -- 코트/장소 메모(선택)
  status        text not null default 'waiting', -- waiting | called | done | cancelled
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sched_league on public.scheduled_matches (league_id, status);
alter table public.scheduled_matches enable row level security;

-- 읽기: 기록 권한자(회원 포함) — 본인 배정을 확인해야 함
drop policy if exists "recorders read scheduled" on public.scheduled_matches;
create policy "recorders read scheduled" on public.scheduled_matches for select to authenticated
  using (public.is_class_recorder(league_id));
-- 생성/수정/삭제: 관리 권한자(방장/공동방장/공동관리자)
drop policy if exists "teachers manage scheduled" on public.scheduled_matches;
create policy "teachers manage scheduled" on public.scheduled_matches for all to authenticated
  using (public.is_class_teacher(league_id)) with check (public.is_class_teacher(league_id));

grant select, insert, update, delete on public.scheduled_matches to authenticated;

-- 실시간 구독 대상에 추가 (이미 추가돼 있거나 publication이 없으면 무시)
do $$ begin
  alter publication supabase_realtime add table public.scheduled_matches;
exception when duplicate_object then null; when undefined_object then null; end $$;
