-- 운영 방식 — 줄 서서 기다려요(queue) | 모두 동시에 해요(simultaneous).
--
-- 비어 있으면(null) 지금과 똑같다 — 줄서기. 옛 세션은 한 글자도 안 바뀐다.
-- "모두 동시에"는 화면만 다르다: [다음 라운드] 하나, 줄이 다 빠져야 다시 누를 수 있다.
-- 서버 쪽 동작(코트 배정·번호 발급)은 그대로라 함수는 손대지 않는다.
begin;

alter table public.assignment_sessions
  add column if not exists queue_mode text
  check (queue_mode is null or queue_mode in ('queue', 'simultaneous'));

commit;
