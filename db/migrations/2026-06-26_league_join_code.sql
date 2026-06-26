-- 리그 초대 코드 단축: 36자 UUID 대신 6자리 짧은 코드(join_code)
-- 헷갈리는 문자(0/O/1/I) 제외한 32자 알파벳에서 6자 → 약 10억 조합, 충돌은 루프로 회피.
-- 기존 UUID/초대 링크 참여 방식은 그대로 유지(하위 호환).

alter table public.leagues add column if not exists join_code text;

-- 유니크한 6자리 코드 생성기
create or replace function public.gen_unique_join_code()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.leagues where join_code = v_code);
  end loop;
  return v_code;
end; $$;

-- 신규 리그 insert 시 코드 자동 부여
create or replace function public.set_join_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.join_code is null or btrim(new.join_code) = '' then
    new.join_code := public.gen_unique_join_code();
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_join_code on public.leagues;
create trigger trg_set_join_code before insert on public.leagues
  for each row execute function public.set_join_code();

-- 기존 리그 백필
update public.leagues set join_code = public.gen_unique_join_code() where join_code is null;

create unique index if not exists uq_leagues_join_code on public.leagues (join_code);

-- 코드로 리그 참여 (security definer → RLS 우회해 코드 조회)
create or replace function public.join_league_by_code(p_code text)
returns table(id uuid, class_name text, is_owner boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_owner uuid; v_members uuid[];
begin
  select l.id, l.owner_uid, coalesce(l.member_uids,'{}'::uuid[])
    into v_id, v_owner, v_members
  from public.leagues l
  where upper(btrim(l.join_code)) = upper(btrim(p_code))
    and coalesce(l.is_deleted, false) = false;
  if v_id is null then raise exception '리그를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'; end if;
  if v_owner <> auth.uid() and not (auth.uid() = any(v_members)) then
    update public.leagues set member_uids = array_append(v_members, auth.uid()) where leagues.id = v_id;
  end if;
  return query select l.id, l.name, (l.owner_uid = auth.uid()) from public.leagues l where l.id = v_id;
end; $$;

grant execute on function public.join_league_by_code(text) to authenticated;
