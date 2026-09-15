-- 출석 세션의 남녀 모드. mixed(섞어서, 기본) | separate(남녀 따로 — 남자끼리·여자끼리만 한 경기).
-- 열 추가만이라 옛 화면은 이 값을 모른 채 지금처럼(섞어서) 뽑는다.
alter table public.assignment_sessions
  add column if not exists gender_mode text not null default 'mixed';
