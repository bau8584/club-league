-- 경기 결과 상세(영수증) 완전 복원용.
-- 기록 시 계산된 결과 데이터(승/패 팀, 선수별 이전RP·최종RP·티어·보너스 항목별 내역)를
-- JSONB 로 통째로 저장한다. 최근 경기를 클릭하면 이 값으로 '경기 결과 등록'과 동일한 창을 띄운다.
-- 0이 아닌 보너스만 담기므로 경기당 수백 바이트 수준(용량 부담 없음).
alter table public.matches add column if not exists rp_breakdown jsonb;
