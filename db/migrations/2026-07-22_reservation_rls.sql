-- 인원 소집 예약(status='waiting')은 회원(recorder)도 만들고, 결과 입력 시 완료(done)로 바꾸고,
-- 취소(삭제)할 수 있어야 한다. 기존 정책은 관리자(is_class_teacher)와 도전장(challenge)만 커버해
-- 회원 예약 INSERT/UPDATE 가 RLS 403 으로 막혔다. 아래 정책으로 회원 예약 생명주기를 허용한다.
-- (도전장 관련 기존 정책은 그대로 두고, 예약용 정책만 추가한다.)

-- 회원이 인원 소집 예약 생성 (status='waiting', 본인이 생성자)
drop policy if exists "members create reservation" on public.scheduled_matches;
create policy "members create reservation" on public.scheduled_matches for insert to authenticated
  with check (
    public.is_class_recorder(league_id)
    and status = 'waiting'
    and created_by = auth.uid()
  );

-- 회원이 예약을 완료(done)/취소(cancelled)로 마감 (결과 입력 시 연결)
drop policy if exists "members finalize reservation" on public.scheduled_matches;
create policy "members finalize reservation" on public.scheduled_matches for update to authenticated
  using (public.is_class_recorder(league_id) and status in ('waiting', 'called'))
  with check (public.is_class_recorder(league_id) and status in ('done', 'cancelled', 'called'));

-- 회원이 예약 삭제(취소)
drop policy if exists "members delete reservation" on public.scheduled_matches;
create policy "members delete reservation" on public.scheduled_matches for delete to authenticated
  using (public.is_class_recorder(league_id) and status in ('waiting', 'called'));
