-- 예약 고도화: 참가자 추가/빼기(로스터 수정), 알림 발신자 표시.

-- 1) 알림을 마지막으로 보낸 사람/시각 (누가 '알림 보내기'를 눌렀는지 표시 + 1분 쿨다운 계산)
alter table public.scheduled_matches
  add column if not exists notified_by uuid references public.players(id) on delete set null,
  add column if not exists notified_at timestamptz;

-- 2) 회원(recorder)이 예약 로스터(player_ids)를 수정하고 완료/취소할 수 있도록 UPDATE 정책 확장.
--    (기존 "members finalize reservation"은 status 전환만 허용 → player_ids 수정이 막혔다)
drop policy if exists "members finalize reservation" on public.scheduled_matches;
drop policy if exists "members manage reservation" on public.scheduled_matches;
create policy "members manage reservation" on public.scheduled_matches for update to authenticated
  using (public.is_class_recorder(league_id) and status in ('waiting', 'called'))
  with check (public.is_class_recorder(league_id) and status in ('waiting', 'called', 'done', 'cancelled'));
