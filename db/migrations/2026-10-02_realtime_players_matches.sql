-- 실시간 알림에 선수(players)·경기(matches) 표를 넣는다.
--
-- 왜: 교사 화면은 채널 하나에 4개 표(players·matches·scheduled_matches·assignment_sessions)를 같이 구독한다.
-- 그런데 실시간 목록(supabase_realtime)에 players·matches가 빠져 있어서 서버가 그 채널 전체를
-- "구독 실패"로 처리했다. 그래서 목록에 있는 scheduled_matches·assignment_sessions 알림까지 0건이었다.
-- (2026-10-02 시험: 4개 같이 구독 → 서버 오류 메시지, scheduled_matches만 구독 → 정상)
--
-- 동시 접속 한도(무료 200)에는 영향 없음: 연결 수는 화면당 1개 그대로, 표가 늘어도 연결은 안 는다.
-- 기존 데이터는 한 글자도 안 바뀐다(알림 목록에 표 이름만 추가).
-- 되돌리기: alter publication supabase_realtime drop table public.players, public.matches;

alter publication supabase_realtime add table public.players, public.matches;

-- 확인: 4행이 나와야 한다
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
