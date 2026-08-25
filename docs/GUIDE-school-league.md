# 학교 리그 작업 가이드

> 학교(school) 리그의 디테일을 수정할 때 **세션 시작에 이 문서부터 읽는다.**
> 클럽(club) 리그와 무엇이 어떻게 다른지, 어디를 고쳐야 하는지, 무엇을 건드리면 안 되는지를 담았다.

---

## 0. 토큰 최적화 규칙 — 먼저 지킬 것

작업 전에 이 규칙을 적용한다. 지키지 않으면 탐색만으로 토큰이 크게 샌다.

- **파일 전체를 읽지 않는다.** `grep -n`으로 해당 함수·문자열만 발췌하고, 필요한 줄 범위만 `sed -n 'A,Bp'`로 본다.
  - 특히 대용량 파일: `league-store.ts`(3400줄), `RecordMatch.tsx`(2100줄), `MatchRecommend.tsx`(1400줄), `Lobby.tsx`(1000줄), `AdminStudentManage.tsx`(650줄)
- **독립적인 조사는 한 번에 묶어 보낸다.** (토큰보다 시간 절감 효과가 크다)
- **UI 컴포넌트 라이브러리(`src/components/ui/`)는 열지 않는다.** 수정 대상이 아니다.
- **검증은 가벼운 것부터**: `npx tsc --noEmit` → 필요할 때만 `npx vite build`
- **커밋 전 확인은 `git diff --stat`** 위주. 상세 diff는 의심될 때만.
- 서브에이전트는 꼭 필요할 때만. 대부분의 수정은 직접 grep이 더 싸다.

---

## 1. club과 school은 무엇이 다른가

**같은 앱, 같은 DB, 같은 계산 로직을 쓴다.** 다른 것은 아래뿐이다.

| | club (동호인) | school (학교) |
|---|---|---|
| **입구 URL** | `/` | `/school` |
| **리그 URL** | `/class/$classId` | `/school/$classId` |
| **로그인** | 회원 각자 구글 로그인 | **교사(방장)만** 로그인. 학생 로그인 없음 |
| **선수 계정** | `players.user_id` 연결 | `user_id` 영구히 null. **선수 연동 UI 없음** |
| **초대 참가 등급** | `member_uids` (멤버) | `admin_uids` (공동 관리자) |
| **경기 입력** | `matchInputMode` 선택 가능 | 개설 시 `admin-only` 고정 |
| **분류 축** | `group_label` (레벨: 초심~A급) | `grade` / `class_num` / `student_no` |
| **레벨 체계 UI** | 개설 시 선택 + 관리자 탭에서 관리 | **숨김** (LevelManager 미노출) |
| **용어** | 회원 / 방장 / 공동방장 / 닉네임 | 학생 / 선생님 / 공동 담당 선생님 / 이름 |
| **학생 열람** | 회원이 로그인해서 봄 | **무인증 공개 순위표** `/ranking/$classId` |

**공유하는 것**: RP 계산, 보너스·패널티, 티어, 시즌, 호칭(`title-calculator.ts`), 예약·도전장·입장 호출, 휴면 감점, 배치고사(언랭크).

**school에서 폐기한 것**: PIN 인증(LockGate), 뱃지형 업적(`achievement-calculator.ts`) — 이식하지 않았다.

---

## 2. 분기는 어떻게 구현돼 있나

### 뿌리: `leagues.league_type`

```
DB: leagues.league_type ('club' | 'school', 기본값 'club')
      ↓ loadClassData 가 읽음
useLeagueStore().leagueType
      ↓
useLeagueTerms()      → 용어 (회원/학생, 방장/선생님 …)
useIsSchoolLeague()   → boolean. club 전용 UI 숨김에 사용
```

`league_type`이 없는 옛 리그는 **club으로 취급**한다(`?? "club"`). 하위호환의 핵심.

### 핵심 파일 4개

| 파일 | 역할 |
|---|---|
| `src/lib/league-terms.ts` | 용어 사전. `CLUB_TERMS` / `SCHOOL_TERMS` / `useLeagueTerms()` / `useIsSchoolLeague()` |
| `src/lib/league-types.ts` | `LeagueType`, `Student.grade/classNum/studentNo`, `schoolLabel()`, `schoolLabelCompact()`, `schoolAxesOf()` |
| `src/lib/league-store.ts` | `leagueType` 상태, 선수 매핑, 명단 upsert |
| `src/routes/class.$classId.tsx` | `LeagueApp` 본체 — club/school 두 라우트가 공유 |

### 라우트 구성

```
src/routes/index.tsx          → Lobby (club)
src/routes/school.index.tsx   → Lobby schoolMode (school 입구)
src/routes/class.$classId.tsx → LeagueApp  ← 본체가 여기 있다
src/routes/school.$classId.tsx→ LeagueApp 재사용 (얇은 껍데기)
src/routes/ranking.$classId.tsx → PublicRanking (무인증)
src/routes/__root.tsx         → 로그인 게이트 + 공개 경로 예외
```

`__root.tsx`는 세션이 없으면 경로와 무관하게 `<Login />`만 렌더한다.
- 공개 경로는 `PUBLIC_PATH_PREFIXES`(`/ranking/`)로 예외 처리
- `/school` 계열이면 `Login`에 `schoolMode` 전달해 학교용 문구 표시

### 학년/반 축의 "자동 적응"

학교 리그는 운영 단위가 학급/학년/전교로 제각각이다. 그래서 **설정으로 고르게 하지 않고 명단 구성을 보고 화면이 맞춘다.**

`schoolAxesOf(students)` → `{ grades, classes, varyGrade, varyClass }`
- 값이 **한 종류뿐이면 그 축은 필터 칩도 라벨도 생략**

| 명단 구성 | 필터 칩 | 선수 라벨 |
|---|---|---|
| 학급 (3-2 전원) | 없음 | `15번` |
| 학년 (3학년) | 반 칩만 | `2반 15번` |
| 전교 | 학년 + 반 칩 | `3학년 2반 15번` |

적용 위치: `RecordMatch.tsx`(PlayerPicker), `MatchRecommend.tsx`, `PublicRanking.tsx`
**예외**: `AdminStudentManage.tsx`의 학년/반/번호 컬럼은 **값이 균일해도 항상 노출**한다. 거기가 값을 입력·수정하는 창구라, 숨기면 나중에 다른 반을 추가할 수 없다.

---

## 3. 분기가 들어있는 파일 지도

수정하려는 게 어디 있는지 여기서 찾는다.

| 하고 싶은 일 | 파일 |
|---|---|
| 입구/로비 문구, 리그 유형 선택, 개설 폼 | `src/components/Lobby.tsx` |
| 로그인 화면 문구 | `src/components/Login.tsx` |
| 로그인 게이트 / 공개 경로 예외 | `src/routes/__root.tsx` |
| 대시보드 상단(역할 배지·탭) | `src/routes/class.$classId.tsx` |
| 용어 자체를 바꾸기 | `src/lib/league-terms.ts` ← **여기 한 곳만 고치면 전파됨** |
| 선수 추가 폼 (이름/학년/반/번호) | `src/components/league/AddMemberForm.tsx` |
| 명단 관리 표, 붙여넣기 파서 | `src/components/league/admin/AdminStudentManage.tsx` |
| 경기 기록 시 선수 선택·필터 | `src/components/league/RecordMatch.tsx` (PlayerPicker) |
| 매치 추천 대상 선택·필터 | `src/components/league/MatchRecommend.tsx` |
| 관리자 메뉴, 레벨 관리 노출 | `src/components/league/AdminPanel.tsx` |
| 무인증 공개 순위표 | `src/features/leaderboard/PublicRanking.tsx` |
| 학년/반 표기·축 계산 | `src/lib/league-types.ts` |

그 외 용어만 분기된 파일: `MatchesTab.tsx`, `MyRecord.tsx`, `AdminMatchRecords.tsx`, `AdminSettings.tsx`, `DecayManager.tsx`, `RpRecoveryPanel.tsx`

### 명단 붙여넣기 형식 (school)

앞쪽 숫자 칸 수로 자동 판별한다. 단위 문자("3학년 2반 15번")도 인식.

| 입력 | 해석 |
|---|---|
| `3 2 15 홍길동` | 학년·반·번호·이름 |
| `2 15 홍길동` | 반·번호·이름 |
| `15 홍길동` | 번호·이름 |
| `홍길동` | 이름만 |

빠진 축은 `null`로 두고 표에서 채운다. **학년/반은 계속 선택 입력이며, 비어 있어도 순위표·경기 기록·RP가 모두 정상 동작한다.**

---

### 하드코딩된 경로를 주의할 것

`window.location.href = "/"` 처럼 **club 기준으로 굳어진 경로**가 곳곳에 있었다.
school 라우트에서 그대로 실행되면 학교 사용자가 클럽 로비로 튕겨 나간다.
실제로 이 문제가 세 번 나왔다.

| 지점 | 처리 |
|---|---|
| 초대 참가 후 이동 (`routes/join.tsx`) | `join_league()`가 돌려주는 `league_type`으로 분기 |
| 웹푸시 딥링크 7곳 (`league-store.ts`) | `classPath()` 헬퍼로 통일 |
| 헤더 "리그 로비로" 버튼 2곳 (`class.$classId.tsx`) | `window.location.pathname.startsWith("/school")`로 분기 |

**새 이동 경로를 추가할 때는 반드시 club/school 분기를 확인한다.**
점검용: `grep -rn '"/class/\|href = "/"\|to="/"' src --include=*.tsx --include=*.ts`

### 권한 4단계

| 등급 | 저장 위치 | DB 함수 | UI 플래그 | 할 수 있는 것 |
|---|---|---|---|---|
| 원조 방장 | `owner_uid` | `is_class_primary_owner` | `isClassPrimaryOwner` | 소유권 위임, 공동방장 지정/해제, 리그 삭제 |
| 공동방장 | `co_owner_uids` | `is_class_owner` | `isClassOwner` | + 글로벌 설정, 시즌, 휴면 감점, 데이터 관리 |
| 공동 관리자 | `admin_uids` | `is_class_teacher` | `isClassManager` | 선수 관리, 경기 기록·수정·삭제 |
| 멤버 | `member_uids` | `is_class_recorder` | `isClassMember` | (club에서만) 경기 기록 |

**school은 초대로 참가하면 공동 관리자**가 된다. `admin-only` 고정이라
`canRecord = isClassManager || matchInputMode !== "admin-only"` 를 통과하려면 관리자여야 하기 때문.
멤버로 들어가면 경기를 기록할 수 없어 초대 기능이 무의미해진다.
⚠️ 링크를 가진 사람은 누구나 공동 관리자가 된다(방장 권한은 아님).

### school에 선수 연동이 없는 이유

학생은 로그인이 없어 연동 자체가 불가능하고, 교사는 선수가 아니다.
`admin-only` 고정이라 자율 기록도 없고, 도전장·예약 참가도 회원 기능이다.
남는 실익은 "내 카드"뿐인데 교사는 관리자 화면에서 다 본다.

그래서 school에서는:
- `needsOnboarding` 면제 — 안 그러면 초대받은 동료 교사가
  "학생 명단에서 본인을 고르세요" 화면에 **갇힌다**
- 탭바의 "선수 연동" 버튼 숨김
- "내 카드" 탭은 `myLinked` 조건 그대로 둠(school에선 자연히 false)

## 4. 건드리면 안 되는 것

1. **club의 기존 URL `/class/$classId`** — 운영 중인 동호인 링크다. 절대 바꾸지 않는다.
2. **RP 계산·보너스·패널티·호칭 판정 로직** — school은 club과 **같은 규칙을 쓴다.** 학교용으로 계산을 바꾸자는 요구가 나오면 별도 논의 대상이지, 디테일 수정으로 처리하지 않는다.
3. **예약·도전장·입장 호출**(`scheduled_matches`) — 동호인 UX의 핵심. school에서도 그대로 쓴다.
4. **`players.group_label`** — club 전용. school에서는 항상 null로 둔다. 학년/반을 여기에 욱여넣지 않는다.

---

## 5. DB 변경 규칙

- 마이그레이션은 `db/migrations/YYYY-MM-DD_이름.sql`로 **새 파일** 추가
- 동시에 `db/schema/club_schema.sql`(전체 통합본)에도 같은 내용을 반영 — 새 프로젝트 생성용이다
- **additive만**: 컬럼 추가는 nullable 또는 기본값 필수. 기존 컬럼 삭제·타입 변경 금지
- `if not exists` / `drop function if exists`로 **재실행 안전**하게
- 반환 타입이 바뀌는 함수는 `create or replace`가 실패하므로 `drop` 먼저
- 데이터를 쓰는 마이그레이션은 **읽기 전용 미리보기 SQL을 함께 제공**한다
  (예: `2026-08-25_win_count_preview.sql`)

### 적용 완료된 마이그레이션

| 파일 | 내용 |
|---|---|
| `2026-08-24_school_league.sql` | `leagues.league_type`, `players.grade/class_num/student_no`, `players_public` 갱신 |
| `2026-08-24_join_league_type.sql` | `join_league()`가 `league_type` 반환 |
| `2026-08-24_public_ranking.sql` | `get_league_public()` — 무인증 순위표용 |
| `2026-08-25_win_count_maintain.sql` | `win_count`/`lose_count` 서버 유지 + 백필 |
| `2026-08-25_school_invite_admin.sql` | school 초대 참가 시 `admin_uids` 부여 (`join_league`, `join_league_by_code`) |

---

## 6. 검증 방법

```bash
npx tsc --noEmit -p tsconfig.json     # 1순위. 대부분 여기서 걸린다
npx vite build                         # 라우트 추가 시 필수 (routeTree.gen.ts 재생성)
```

### 화면을 눈으로 확인하려면

컨테이너 안에서 개발 서버를 띄우고 Playwright로 캡처할 수 있다. 배포 없이 확인 가능.

```bash
# .env 에 더미 값이라도 있어야 부팅된다 (로그인 전 화면만 확인 가능)
printf 'VITE_SUPABASE_URL=https://example-test.supabase.co\nVITE_SUPABASE_ANON_KEY=dummy\n' > .env
npx vite dev --host 127.0.0.1 --port 3001 &
# Playwright: executablePath 를 반드시 지정 (번들 버전과 컨테이너 버전이 다름)
#   chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
# 끝나면 .env 삭제 + 서버 종료
```

### SQL을 검증하려면

로컬 PostgreSQL 16으로 운영 스키마를 재현해 실제로 돌려본다. root로는 실행 불가하므로 `postgres` 사용자로, 데이터 디렉터리는 `/var/tmp` 아래에 만든다(스크래치패드는 권한 문제로 실패).

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
D=/var/tmp/pgtest; mkdir -p $D; chown postgres:postgres $D; chmod 700 $D
su postgres -s /bin/bash -c "PATH=/usr/lib/postgresql/16/bin:\$PATH initdb -D $D -U postgres -A trust"
su postgres -s /bin/bash -c "PATH=/usr/lib/postgresql/16/bin:\$PATH pg_ctl -D $D -o '-p 5433 -k /var/tmp' -l $D/log start"
psql -h /var/tmp -p 5433 -U postgres -c "select 1;"
```

`auth.users`와 권한 함수(`is_class_recorder` 등)는 항상 true를 반환하는 스텁으로 대체하면 된다.

---

## 7. 배포

- `main`에 푸시하면 **Cloudflare Workers가 자동 배포**한다
- 작업 브랜치에서 커밋 → 푸시 → `main`에 fast-forward 병합 → `main` 푸시
- **DB 마이그레이션은 자동이 아니다.** Supabase SQL Editor에서 수동 실행해야 하며, 사용자에게 파일과 실행 순서를 명확히 전달할 것

---

## 8. 아직 안 한 것

| | 내용 |
|---|---|
| 순위표 학년/반 필터 | 로그인 후 보는 랭킹 탭에는 학년/반 필터가 없다. club의 레벨 필터는 값이 없으면 자동으로 숨겨져 school에선 필터가 아예 안 뜬다. 전교 리그에서 불편하면 추가 |
| 증분 동기화 | `docs/PLAN-incremental-sync.md` 참고. 합의 완료, 미착수 |
| 공개 순위표 추가 기능 | 개인화·필터 등. 처음부터 범위 밖으로 뒀다 |
| school-league 레포 아카이브 | 최종 검수 후 별도 진행 |

## 9. 관련 문서

- `docs/PLAN-incremental-sync.md` — 증분 동기화(수정된 B&D) 설계. 트래픽·비용 논의 포함
- `docs/PLAN-club-school-merge.md` — 최초 통합 설계 (다른 브랜치에 있음, 역사적 참고용)
