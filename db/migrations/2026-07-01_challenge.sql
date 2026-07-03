-- 도전장/저격전: 회원이 상대를 지목해 도전(status='challenge')하면 상대 화면에 배너가 뜨고
-- 수락하면 'called'(입장 배너)로, 거절하면 'cancelled'로 전환된다. scheduled_matches 재사용.

-- 회원이 도전장 생성 (본인이 도전자, challenge 상태만)
drop policy if exists "members create challenge" on public.scheduled_matches;
create policy "members create challenge" on public.scheduled_matches for insert to authenticated
  with check (
    public.is_class_recorder(league_id)
    and status = 'challenge'
    and created_by = auth.uid()
    and exists (select 1 from public.players p where p.id = player_a_id and p.user_id = auth.uid())
  );

-- 지목당한 회원이 수락(called)/거절(cancelled)
drop policy if exists "target responds challenge" on public.scheduled_matches;
create policy "target responds challenge" on public.scheduled_matches for update to authenticated
  using (
    status = 'challenge'
    and exists (select 1 from public.players p where p.id = player_b_id and p.user_id = auth.uid())
  )
  with check (
    status in ('called', 'cancelled')
    and exists (select 1 from public.players p where p.id = player_b_id and p.user_id = auth.uid())
  );
