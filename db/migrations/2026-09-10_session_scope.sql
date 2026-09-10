-- 세션 범위 — 한 리그 안의 여러 수업.
--
-- 세션이 리그당 하나뿐이면, 한 리그를 여러 담임이 나눠 쓰는 순간 서로의 수업을 지운다.
-- 5-7 담임이 [새로 시작]을 누르면 리그 전체 큐가 비워져 옆 반에서 진행 중이던 대기열이
-- 사라지고, 지운 쪽도 지워진 쪽도 알아채지 못한다.
--
-- 세션의 소유자는 리그 타입이 정한다.
--   학교   — 교사 한 명당 하나 (owner_id = 교사 계정)
--   동호회 — 리그당 하나 그대로 (owner_id IS NULL)
-- 학교 리그는 여러 개의 독립된 모임을 담지만, 동호회 리그는 하나의 모임 그 자체다.
-- 동호회에 교사별 분리를 적용하면 운영진이 둘일 때 세션이 갈려 오히려 망가진다.
--
-- 동호회 행은 owner_id 가 비어 있는 채로 지금 동작을 그대로 유지한다 — 마이그레이션 영향 없음.
begin;

-- ── 1) assignment_sessions : PK 교체 + owner_id + next_seq ──

-- owner_id 를 PK 에 직접 넣지 않는다. Postgres 에서 NULL 은 서로 같지 않게 취급되어
-- 동호회 행(owner_id IS NULL)의 유일성이 보장되지 않는다. PK 는 별도 surrogate id 로 두고,
-- 유일성은 아래의 부분 유니크 인덱스 두 개로 건다.
alter table public.assignment_sessions
  add column if not exists id       uuid not null default gen_random_uuid(),
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  -- 대진 고유번호 발급기. 줄 번호를 배열 인덱스에서 고정 번호로 바꾸기 위한 카운터로,
  -- 발급은 alloc_match_seq RPC 가 원자적으로 한다(클라이언트에서 읽고-더하고-쓰면
  -- 폰과 태블릿이 같은 값을 읽어 #7 이 두 개 생긴다).
  add column if not exists next_seq int not null default 1;

alter table public.assignment_sessions drop constraint if exists assignment_sessions_pkey;
alter table public.assignment_sessions add primary key (id);

-- 동호회: 리그당 한 행. 학교: 리그 × 교사당 한 행.
create unique index if not exists uniq_session_league_shared
  on public.assignment_sessions (league_id) where owner_id is null;
create unique index if not exists uniq_session_league_owner
  on public.assignment_sessions (league_id, owner_id) where owner_id is not null;

-- 소유자로 세션을 찾는 것이 기본 조회 경로다.
create index if not exists idx_session_league_owner
  on public.assignment_sessions (league_id, owner_id);

-- ── 2) scheduled_matches : 어느 세션의 줄인가 ──

-- session_id 가 NULL 인 행은 세션 밖의 줄이다 — 도전장(challenge), 회원 예약,
-- 그리고 이 마이그레이션 이전에 만들어진 배정 행. 읽는 쪽은 "내 세션 것 + 세션 없는 것"을
-- 함께 보므로, 옛 행이 갑자기 화면에서 사라지지 않는다.
--
-- on delete set null : 세션 행이 사라져도 큐를 지우지 않는다. 큐 정리는 세션 경계에서
-- 명시적으로 하는 일이고, 통계의 진실은 matches 테이블이지 큐가 아니다.
alter table public.scheduled_matches
  add column if not exists session_id uuid references public.assignment_sessions(id) on delete set null,
  -- 줄의 고정 번호. 1번이 끝나도 2번은 2번으로 남는다. NULL 은 번호 없는 줄(도전장·예약·옛 행).
  add column if not exists seq int;

-- 큐 조회는 세션으로 걸러 번호순으로 읽는다. created_at 정렬은 기기 시계가 다르면 흔들린다.
create index if not exists idx_sched_session on public.scheduled_matches (session_id, seq);

-- RLS 는 그대로 둔다. 세션 분리는 권한이 아니라 가시성의 문제이고, 권한 경계는 여전히
-- league_id 다 — 같은 리그의 교사는 서로의 큐를 볼 수 있어야 문제가 생겼을 때 고칠 수 있다.

commit;
