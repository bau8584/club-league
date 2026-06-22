-- ─────────────────────────────────────────────────────────────
-- players 에 연생(birth_year) 컬럼 추가 (선택 입력)
-- 적용: Supabase SQL Editor 에 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
begin;
alter table public.players add column if not exists birth_year int;
commit;
