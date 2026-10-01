-- 이름 칸과 닉네임 칸을 맞춘다 (2026-10-01).
-- 학생 관리 표의 "이름" 칸은 닉네임만 고쳐 왔다. 그래서 고친 학생은 이름 칸에 옛 이름이
-- 남았고, 이름 칸을 먼저 보는 교실 화면에 옛 이름이 떴다. 정답은 선생님이 마지막으로 고친 닉네임.
-- 이후로는 앱이 저장할 때 둘을 같이 바꾼다(league-api.ts trimNames).
begin;

update public.players
   set name = btrim(nickname)
 where nickname is not null
   and btrim(nickname) <> ''
   and name is distinct from btrim(nickname);

commit;
