-- 휴면 감점(decay) 감사 로그 + 수동 실시 RPC
-- 관리자(소유자)가 "휴면 감점 실시"를 누르면 대상 선수 RP를 차감하고
-- 각 차감 내역을 decay_log 에 batch 단위로 남긴다. (관리자 전용 열람)

-- 1) decay_log 테이블
create table if not exists public.decay_log (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  batch_id    uuid not null,                 -- 한 번의 "실시" 묶음
  player_id   uuid references public.players(id) on delete set null,
  player_name text,
  tier        text,
  rp_before   int,
  rp_after    int,
  decay_rp    int,                           -- 실제 차감량(0 클램프 반영)
  season      text,
  applied_by  uuid default auth.uid(),
  applied_at  timestamptz not null default now()
);
create index if not exists idx_decay_log_league on public.decay_log (league_id, applied_at desc);
alter table public.decay_log enable row level security;

-- 읽기: 관리 권한자(소유자/공동관리자) 전용. 삽입은 security-definer RPC로만.
drop policy if exists "teachers read decay log" on public.decay_log;
create policy "teachers read decay log" on public.decay_log for select to authenticated
  using (public.is_class_teacher(league_id));

-- 2) 수동 휴면 감점 실시 RPC
--    p_entries: [{player_id, player_name, tier, decay_rp}, ...]
--    각 선수 RP를 현재값 기준으로 차감(0 클램프)하고 decay_log 기록. batch_id 반환.
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

grant execute on function public.apply_dormancy_decay(uuid, text, jsonb) to authenticated;
