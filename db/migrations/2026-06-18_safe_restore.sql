-- ─────────────────────────────────────────────────────────────
-- 안전한 데이터 복원 (원자적 트랜잭션)
--   · 기존: 클라이언트가 "전체 삭제 → 다시 삽입"을 순차 실행 → 중간 실패 시 DB 소실 위험
--   · 변경: 서버 함수 한 번에 처리. 어느 한 행이라도 잘못되면 전체 롤백 → 원본 데이터 보존
--   · 소유자(개설자)만 실행 가능
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 실행(Run).
-- ─────────────────────────────────────────────────────────────
begin;

create or replace function public.restore_class_data(
  p_class_id uuid,
  p_students jsonb,
  p_matches  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_students int := 0;
  v_matches  int := 0;
begin
  -- 권한: 개설자 전용
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.owner_uid = auth.uid()) then
    raise exception '권한이 없습니다. (개설자 전용)';
  end if;

  -- 입력 검증: 학생 배열 필수
  if p_students is null or jsonb_typeof(p_students) <> 'array' or jsonb_array_length(p_students) = 0 then
    raise exception '복원할 학생 데이터가 없습니다.';
  end if;

  -- 1) 기존 데이터 삭제 (이 함수 전체가 하나의 트랜잭션 → 이후 단계 실패 시 자동 롤백)
  delete from public.matches  where class_id = p_class_id;
  delete from public.students where class_id = p_class_id;

  -- 2) 학생 삽입 (잘못된 UUID/타입이면 캐스팅 실패 → 전체 롤백되어 원본 보존)
  insert into public.students (id, class_id, rp, grade, class_number, student_no, real_name, nickname, gender)
  select
    (e->>'id')::uuid,
    p_class_id,
    coalesce((e->>'rp')::int, 1000),
    coalesce((e->>'grade')::int, 0),
    coalesce((e->>'classNum')::int, 0),
    coalesce((e->>'number')::int, 0),
    coalesce(nullif(btrim(e->>'realName'), ''), nullif(btrim(e->>'name'), ''), '학생'),
    nullif(btrim(coalesce(e->>'nickname', '')), ''),
    coalesce(nullif(e->>'gender', ''), 'U')
  from jsonb_array_elements(p_students) as e;
  get diagnostics v_students = row_count;

  -- 3) 경기 삽입 (점수로 승자/패자 판정. season 은 트리거가 현재 시즌으로 자동 도장)
  insert into public.matches (id, class_id, winner_id, loser_id, created_at)
  select
    (m->>'id')::uuid,
    p_class_id,
    case when coalesce((m->>'scoreA')::int, 0) >= coalesce((m->>'scoreB')::int, 0)
         then (m->>'playerAId')::uuid else (m->>'playerBId')::uuid end,
    case when coalesce((m->>'scoreA')::int, 0) >= coalesce((m->>'scoreB')::int, 0)
         then (m->>'playerBId')::uuid else (m->>'playerAId')::uuid end,
    coalesce((m->>'date')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as m;
  get diagnostics v_matches = row_count;

  return jsonb_build_object('students', v_students, 'matches', v_matches);
end;
$$;

grant execute on function public.restore_class_data(uuid, jsonb, jsonb) to authenticated;

commit;
