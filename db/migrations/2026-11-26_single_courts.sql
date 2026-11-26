-- 단식 코트 — 복식 수업에서 코트 몇 개를 단식으로 돌린다(2026-11-26).
--
-- 선생님이 코트 3개 중 하나를 단식으로 쓰면서 [+복식][+복식][+단식]을 손으로 눌렀다(한 수업 23번).
-- 단식 코트 수를 정해 두면 채우기가 종류를 섞어 넣고, 빈 코트에는 그 코트 종류의 줄이 먼저 들어간다.
-- 단식은 보통 복식보다 빨리 끝난다. 번호순으로만 넣으면 단식 코트에 복식 넷이 들어간다.
--
-- 비어 있으면(null·0) 지금과 똑같다 — 앞쪽 N줄이 코트에 있다(옛 코드 그대로).
-- 종목이 단식인 세션도 지금과 똑같다(모든 코트가 단식이라 가를 것이 없다).
--
-- 코트 번호: 1 ~ (N−S) 는 복식, (N−S+1) ~ N 은 단식. 예) 코트 3·단식 1 → 3코트가 단식.
-- 맞는 종류의 줄이 없으면 다른 종류라도 넣는다 — 코트를 비워 두지 않는다. 그 경기가 끝나면 다시 맞춰진다.
begin;

alter table public.assignment_sessions
  add column if not exists single_courts int;

create or replace function public.assign_session_courts(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n    int;
  v_s    int;
  v_type text;
  v_row  record;
  v_used int[] := '{}';
  v_kept uuid[] := '{}';
  v_c    int;
  v_id   uuid;
  v_want text;
  i      int := 0;
begin
  if p_session_id is null then return; end if;
  select court_count, coalesce(single_courts, 0), match_type
    into v_n, v_s, v_type
    from public.assignment_sessions where id = p_session_id;

  -- 코트를 안 쓰면 붙어 있던 번호를 모두 뗀다(끈 경우).
  if coalesce(v_n, 0) <= 0 then
    update public.scheduled_matches set court = null
     where session_id = p_session_id and court is not null
       and status in ('waiting', 'called');
    return;
  end if;

  -- ── 단식 코트가 없으면: 옛 규칙 그대로(2026-09-30_court_count.sql) ──
  if v_s <= 0 or v_type = 'single' then
    -- 1) 앞쪽 N줄 중 올바른 코트를 이미 가진 줄 → 그대로 둔다.
    for v_row in
      select id, court from public.scheduled_matches
       where session_id = p_session_id and status in ('waiting', 'called')
       order by seq nulls last, created_at
       limit v_n
    loop
      if v_row.court ~ '^[0-9]+$' and v_row.court::int between 1 and v_n
         and not (v_row.court::int = any(v_used)) then
        v_used := v_used || v_row.court::int;
        v_kept := v_kept || v_row.id;
      end if;
    end loop;

    -- 2) 나머지 줄: 앞쪽이면 빈 코트, 뒤쪽이면 코트를 뗀다.
    for v_row in
      select id, court from public.scheduled_matches
       where session_id = p_session_id and status in ('waiting', 'called')
       order by seq nulls last, created_at
    loop
      i := i + 1;
      if i <= v_n then
        if v_row.id = any(v_kept) then continue; end if;
        select min(c) into v_c from generate_series(1, v_n) c where not (c = any(v_used));
        update public.scheduled_matches set court = v_c::text where id = v_row.id;
        v_used := v_used || v_c;
      elsif v_row.court is not null then
        update public.scheduled_matches set court = null where id = v_row.id;
      end if;
    end loop;
    return;
  end if;

  -- ── 단식 코트가 있으면: 빈 코트마다 그 종류의 가장 앞 줄 ──
  v_s := least(v_s, v_n);

  -- 1) 올바른 코트를 이미 가진 줄은 자리와 상관없이 지킨다(뛰는 중인 조를 빼지 않는다).
  --    범위 밖(코트 수를 줄였을 때)이거나 겹치는 번호는 뗀다.
  for v_row in
    select id, court from public.scheduled_matches
     where session_id = p_session_id and status in ('waiting', 'called') and court is not null
     order by seq nulls last, created_at
  loop
    if v_row.court ~ '^[0-9]+$' and v_row.court::int between 1 and v_n
       and not (v_row.court::int = any(v_used)) then
      v_used := v_used || v_row.court::int;
      v_kept := v_kept || v_row.id;
    else
      update public.scheduled_matches set court = null where id = v_row.id;
    end if;
  end loop;

  -- 2) 빈 코트(작은 번호부터)에 맞는 종류의 가장 앞 줄. 없으면 아무 종류의 가장 앞 줄.
  for v_c in select c from generate_series(1, v_n) c where not (c = any(v_used)) order by c loop
    v_want := case when v_c > v_n - v_s then 'single' else 'double' end;
    select id into v_id from public.scheduled_matches
     where session_id = p_session_id and status in ('waiting', 'called')
       and not (id = any(v_kept)) and coalesce(match_type, 'double') = v_want
     order by seq nulls last, created_at limit 1;
    if v_id is null then
      select id into v_id from public.scheduled_matches
       where session_id = p_session_id and status in ('waiting', 'called')
         and not (id = any(v_kept))
       order by seq nulls last, created_at limit 1;
    end if;
    exit when v_id is null;
    update public.scheduled_matches set court = v_c::text where id = v_id;
    v_kept := v_kept || v_id;
    v_id := null;
  end loop;
end $$;

-- 코트 수·단식 코트 수·종목을 바꾸면 바로 다시 맞춘다.
create or replace function public.trg_session_assign_courts()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.court_count is distinct from old.court_count
     or new.single_courts is distinct from old.single_courts
     or new.match_type is distinct from old.match_type then
    perform public.assign_session_courts(new.id);
  end if;
  return null;
end $$;

drop trigger if exists session_assign_courts on public.assignment_sessions;
create trigger session_assign_courts
  after update of court_count, single_courts, match_type on public.assignment_sessions
  for each row execute function public.trg_session_assign_courts();

commit;
