-- '경기' 통합 탭: 인원 소집 예약 + 예약↔결과 연동.
--  - player_ids: 인원 소집 예약의 참가자(팀 미정). 결과 입력 때 팀이 확정된다.
--  - result_match_id: 예약이 실제 경기(matches 행)로 완료되면 그 결과를 가리킨다.
--  실제 결과·RP는 기존 matches 파이프라인을 그대로 쓰고, 여기에는 링크만 저장한다.
alter table public.scheduled_matches
  add column if not exists player_ids uuid[] not null default '{}',
  add column if not exists result_match_id uuid references public.matches(id) on delete set null;

-- 예약 목록은 리그의 모든 회원이 열람 가능해야 한다.
-- (기존 "recorders read scheduled" 정책이 회원 읽기를 이미 허용하지만, 명시적으로 유지)
