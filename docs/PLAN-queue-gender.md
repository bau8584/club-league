# 대기열 남녀 따로 뽑기 — 계획

> 상태: **계획 확정, 미착수** (2026-09-15). 브랜치 `feat/queue-gender`는 **`fix/gender-optional`에서 딴다** — `genderEnabled`·`useGenderEnabled()`가 그 브랜치에만 있다. 합칠 때는 gender-optional 먼저, 그다음 이것.
> 다른 세션이 같은 폴더에서 브랜치를 바꾸면 이쪽 작업 트리가 같이 바뀐다. 별도 작업 폴더로:
> `git worktree add ../club-league-queue -b feat/queue-gender fix/gender-optional`
> 지키는 원칙은 [PLAN-post-launch.md](PLAN-post-launch.md) 0번 — 설정 없으면 지금 방식, DB는 추가만, 기존 테스트 전부 통과.

## 세션에 줄 프롬프트

```
docs/PLAN-queue-gender.md 읽고 feat/queue-gender 브랜치(fix/gender-optional에서 딴 worktree)로 구현해.
순서: 계산기(+테스트) → DB 열 → 스토어 → 출석 창 UI → 대기열 안내 줄.
계산기 기존 테스트는 한 글자도 안 바뀌고 전부 통과해야 한다. main에 합치지 말고 커밋만.
```

## 기능

- **남녀 따로**: 남자끼리, 여자끼리만 한 경기에 들어간다. 초등 체육의 남자부/여자부.
- 혼복(팀마다 남1+여1)은 **이번엔 뺀다.** 값 자리만 `"mixed" | "separate"`로 두고 나중에 `"pairs"` 추가 가능하게.
- 성별 미지정(U) 학생은 **어느 쪽이든 되는 사람**으로 취급 — 남자 쪽이 3명 남으면 거기에, 여자 쪽이 모자라면 거기에. 빠뜨리지 않는다. 미지정끼리만 붙이거나 제외하지 않는다.
- 한 바퀴 = 남 바퀴 + 여 바퀴. 남 11명·여 12명 복식이면 2 + 3 = 5경기(섞어서와 같음), 남 5·여 7이면 1 + 1 = 2경기(섞어서는 3). 남는 아이는 지금처럼 다음 바퀴에 먼저.
- 어느 그룹도 한 경기 인원이 안 모이면 **억지로 섞지 않고 멈춘다**(shortfall).

## 어디서 켜나

- **출석 체크 창**([SessionRoster.tsx:428](../src/components/league/SessionRoster.tsx#L428) "종목: 복식/단식" 옆)에 **"남녀: 섞어서 / 따로"** 칩. 종목과 같은 이유로 그날 수업의 설정이며 저장된다(태블릿 새로고침해도 안 풀림).
- `genderEnabled`가 꺼진 리그에는 칩 자체가 없다 → 그 리그는 지금과 완전히 같다.
- 대기열 카드 2층 안내 줄([MatchQueue.tsx](../src/components/league/MatchQueue.tsx) `roundHint`)에 따로 모드면 "남녀 따로 · 남 3경기 · 여 2경기 · 미지정 2명은 자리 남는 쪽에".

## 손대는 곳

### 1. 계산기 — [assignment-calculator.ts](../src/domain/assignment-calculator.ts)

`AssignmentInput`에 추가:
```ts
/** id → 그룹. 같은 그룹(또는 그룹 없음)끼리만 한 경기에 들어간다. 없으면 지금처럼 전부 섞는다. */
groupOf?: Record<string, string>;
```
- 매 경기 루프: 앵커(덜 뛴 사람)를 잡은 뒤 후보 창(`window`)을 **앵커와 같은 그룹 또는 그룹 없음**으로 거른다. 앵커가 그룹 없음(U)이면 창은 전체지만, 조합을 훑을 때 한 경기 안에 서로 다른 그룹이 섞이면 버린다(U + 남 + 남 + 남 은 되고, U + 남 + 여 + 남 은 안 됨).
- 그 앵커로 유효한 조합이 하나도 없으면(같은 그룹 놀고 있는 사람이 모자람) **다음 순위 앵커로 넘어간다.** 지금은 앵커가 실패하면 바로 shortfall인데, 따로 모드에선 남자 쪽이 막혀도 여자 쪽은 뽑을 수 있어야 한다. 모든 앵커가 실패해야 shortfall.
- 완화(busy 재사용)도 같은 그룹 안에서만.
- `groupOf`를 안 주면 코드 경로가 완전히 지금과 같아야 한다. 기존 테스트 [assignment-calculator.test.ts](../src/domain/assignment-calculator.test.ts) 무수정 통과.

새 테스트:
- 남 8·여 8 복식 4경기 → 어느 경기도 안 섞임.
- 남 3·여 4·U 1 복식 → U가 남자 쪽에 붙어 2경기.
- 남 5·여 7 복식 count 3 → 2경기 + shortfall 1, 섞인 경기 없음.
- 남 2·여 6 단식 → 남 1경기, 여 3경기(앵커 실패 시 넘어가기 확인).
- `groupOf` 없이 돌리면 seed 같을 때 결과가 이전과 같음(스냅샷).

### 2. DB — 새 마이그레이션 `db/migrations/2026-09-XX_session_gender_mode.sql`
```sql
alter table public.assignment_sessions
  add column if not exists gender_mode text not null default 'mixed';  -- mixed | separate
```
[club_schema.sql](../db/schema/club_schema.sql)의 테이블 정의도 같이. 열 추가만이라 옛 화면은 모른 채 지금처럼 뽑는다.

### 3. 타입·API·스토어
- [league-types.ts:89](../src/lib/league-types.ts#L89) `AssignmentSession`에 `gender_mode?: "mixed" | "separate"`.
- [league-api.ts:153](../src/services/league-api.ts#L153) `apiUpsertAssignmentSession` payload에 `genderMode?`, fields에 `...(payload.genderMode ? { gender_mode } : {})` — 안 주면 안 건드림(옛 값 유지).
- [league-store.ts](../src/lib/league-store.ts) `startAssignmentSession` / `updateAssignmentSession`에 `genderMode` 통과.
- `fillAssignmentQueue`(≈3177행): `assignmentSession.gender_mode === "separate" && genderEnabled`이면
  - `groupOf` = 참석자 중 M/F인 학생만 `{ id: gender }` (U는 넣지 않음 = 그룹 없음).
  - 한 바퀴 count = `floor((freeM + freeU) / n) + floor(freeF / n)`와 `floor(freeM / n) + floor((freeF + freeU) / n)` 중 **큰 쪽** (U가 어느 쪽에 붙느냐로 한 경기가 갈릴 수 있다). count가 실제보다 많으면 계산기가 shortfall로 멈추니 안전하다.
  - 섞어서 모드(또는 성별 꺼짐)는 `groupOf` 자체를 안 넘긴다.

### 4. 출석 창 — [SessionRoster.tsx](../src/components/league/SessionRoster.tsx)
- `draftType` 옆에 `draftGender: "mixed" | "separate"` 초안 상태. 세션에서 읽어 채우고, `dirty` 판정에 포함.
- 종목 칩 줄 아래(또는 옆) "남녀" 칩: 섞어서 / 따로. `useGenderEnabled()`가 false면 렌더 안 함.
- 저장 시 `genderMode` 함께 전달.

### 5. 대기열 안내 줄 — [MatchQueue.tsx](../src/components/league/MatchQueue.tsx)
- `roundHint(free, perMatch)`를 따로 모드에서 남/여/미지정으로 나눠 센 문구로. 성별 카운트는 `byId`로 참석자 성별을 세면 된다.
- [한 바퀴] 버튼이 넘기는 `count`도 같은 계산(스토어 기본값과 일치시키려면 `mode: "round"`로 넘기고 스토어가 세는 편이 안전).

### 6. 확인
- `bun test` 전부 통과, `npx tsc --noEmit`.
- 청림초 컬링(성별 있음 → 자동 켜짐)에서 "섞어서"일 때 전과 똑같이 뽑히는지(같은 참석자·같은 큐면 결과 동일해야 함).
- 미리보기 주소로 확인할 땐 테스트용 리그에서만 뽑기(진짜 DB).

## 손 안 대는 것
골라 넣기(수동), 결과 입력, 교실 화면, 동호회 예약 줄, 혼복.
