-- ─────────────────────────────────────────────────────────────
-- 기록원(scorekeeper) 권한 강제
--   · 현재: record_match_transaction 이 SECURITY INVOKER → RLS(is_class_teacher)에 막혀
--           기록원은 경기 기록을 아예 못 함. (기록원 기능 미작동)
--   · 변경: 함수를 SECURITY DEFINER 로 바꾸고, 내부에서 "이 반의 기록 권한자(소유자/공동관리자/기록원)"
--           인지 직접 검증. → 기록원도 기록 가능하되, 자기 반에서만 + 경기 기록만.
--   · 학생 수정/삭제, 경기 삭제, 설정 변경은 기존 RLS(is_class_teacher)가 계속 차단.
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- ─────────────────────────────────────────────────────────────
begin;

-- 기록 권한자: 소유자 / 공동관리자 / 기록원
create or replace function public.is_class_recorder(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and (c.owner_uid = auth.uid()
           or auth.uid() = any(coalesce(c.co_admin_uids, '{}'::uuid[]))
           or auth.uid() = any(coalesce(c.scorekeeper_uids, '{}'::uuid[])))
  );
$$;

-- 경기 기록 트랜잭션: 멤버십 검증 + 자기 반 학생만 갱신
create or replace function public.record_match_transaction(
  p_class_id uuid,
  p_match_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_player_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_record record;
begin
  -- 이 반의 기록 권한자만 (아무 반에나 기록하는 것을 차단)
  if not public.is_class_recorder(p_class_id) then
    raise exception '권한이 없습니다. 이 반의 경기 기록 권한이 없습니다.';
  end if;

  -- 1. 매치 기록 Insert (season 은 트리거가 현재 시즌으로 자동 도장)
  insert into public.matches (id, class_id, winner_id, loser_id, created_at)
  values (p_match_id, p_class_id, p_winner_id, p_loser_id, now());

  -- 2. 참가자 RP 업데이트 — 반드시 이 반(class_id)의 학생만 (타 반 학생 RP 조작 방지)
  for player_record in select * from jsonb_to_recordset(p_player_updates) as x(id uuid, rp int)
  loop
    update public.students
       set rp = player_record.rp
     where id = player_record.id
       and class_id = p_class_id;
  end loop;
end;
$$;

grant execute on function public.is_class_recorder(uuid) to authenticated;
grant execute on function public.record_match_transaction(uuid, uuid, uuid, uuid, jsonb) to authenticated;

commit;
