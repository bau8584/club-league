-- ─────────────────────────────────────────────────────────────
-- 개인 코드(PIN) 시스템 제거
--   동호회 버전은 구글 로그인(계정 연동) 기반이라 player_secrets/PIN RPC는 미사용.
--   관련 테이블·함수를 모두 제거한다.
--
-- 적용: Supabase SQL Editor 에 전체 붙여넣고 Run.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.student_has_code(uuid);
drop function if exists public.verify_student_code(uuid, text);
drop function if exists public.claim_student(uuid, text, text);
drop function if exists public.update_student_nickname(uuid, text, text);
drop function if exists public.change_student_code(uuid, text, text);
drop table if exists public.player_secrets cascade;
