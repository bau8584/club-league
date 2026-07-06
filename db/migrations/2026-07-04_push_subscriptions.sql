-- 웹 푸시 구독 저장. 회원이 브라우저에서 알림을 켜면 endpoint/keys를 저장하고,
-- 발송 서버(Cloudflare Worker)가 service_role로 조회해 푸시를 보낸다.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  league_id   uuid references public.leagues(id) on delete cascade,
  player_id   uuid references public.players(id) on delete set null,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists idx_push_sub_player on public.push_subscriptions (player_id);
create index if not exists idx_push_sub_league on public.push_subscriptions (league_id);
alter table public.push_subscriptions enable row level security;

-- 본인 구독만 관리(추가/삭제/조회). 발송 서버는 service_role로 RLS 우회.
drop policy if exists "self manage push sub" on public.push_subscriptions;
create policy "self manage push sub" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;
