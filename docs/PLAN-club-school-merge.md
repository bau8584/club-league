# club-league + school-league 통합 설계

## 토큰 최소화 전략
- 파일 전체를 열어 읽지 않는다. 목록/줄수 확인은 `find`+`wc -l`, 내용 확인은 grep으로 필요한 함수/섹션만 발췌한다.
- 서브에이전트(Explore/Task 등)는 꼭 필요한 경우가 아니면 쓰지 않는다. 직접 최소한의 명령으로 조사한다.
- 구현 단계에서도 한 파일당 필요한 부분만 Read/Edit하고, 관련 없는 대량 파일(예: `db/schema` 전체, `ui/` 컴포넌트 라이브러리)은 목록/시그니처 확인 수준에서 멈춘다.
- 커밋 전 diff 확인은 `git diff --stat` 위주로, 필요할 때만 상세 diff를 본다.
- 각 작업 단계마다 결과를 간결히 요약 보고하고, 원문 인용은 최소화한다.

## Context
club-league(동호인 리그)와 school-league(학교 리그)는 같은 RP/티어 계산·경기기록·시즌 로직을 쓰는 자매 프로젝트였으나 별도 레포로 갈라져 있었다. school-league를 club-league 기반으로 재이식하여, 핵심 로직(RP계산, 시즌관리, 순위표, 경기기록, 호칭시스템)은 공유하고, 실제로 다른 지점(회원 식별 방식, 레벨/그룹 축, 학생 열람 화면)만 분리 관리한다. school-league는 실사용 종료(1학기 리그, 마이그레이션 불필요)라 새 리그로 새로 시작한다. school은 전국 배포 목적이라 club의 기존 운영 URL(`/class/$classId`)은 절대 변경하지 않는다.

## 확정된 설계 결정
- **레포/배포**: club-league 단일 레포·단일 Cloudflare Worker로 통합. school-league는 최종 검수 후 아카이브(지금은 유지).
- **DB**: 하나의 Supabase 프로젝트. `leagues.league_type: 'club' | 'school'` 컬럼 추가. `players`에 `grade int null`, `class_num int null`, `student_no int null` 추가(둘 다 nullable, additive migration 1개).
- **인증**: club = 회원 각자 구글 로그인(`auth.uid()` 기반, 기존 그대로). school = 교사(방장)만 구글 로그인, 학생 로그인 없음 → 별도 인증모델 신설 없음, school players는 `user_id`가 영구히 null인 채로 운용.
- **경기 입력**: club은 기존 `matchInputMode` 선택지 유지. school은 `admin-only` 고정(교사 태블릿 전용).
- **급수/레벨 축**: club은 기존 `group_label` + `LevelManager.tsx`(preset/free 급수 체계, 예: 초심~A급) 그대로 유지. school은 grade/class_num/student_no 3컬럼으로 완전히 별개 축 — 통합하지 않고 `league_type`에 따라 어느 필드를 노출할지만 분기.
- **호칭/업적**: club의 `title-calculator.ts`(장착형 호칭)로 통일. school의 `achievement-calculator.ts`(뱃지형)는 폐지, 이식하지 않음.
- **학생 열람 화면**: PIN 인증(LockGate) 폐지. **B안 채택** — 무인증 공개 순위표 링크만 제공(개인 상세 없음, club의 "회원 순위표 열람 가능" 코드 재사용). 추가 기능(개인화 등)은 이번 범위에 넣지 않고 추후 별도 논의.
- **URL 분리**: club 기존 라우트(`src/routes/class.$classId.tsx`)는 절대 변경하지 않음(운영 중인 동호인 링크 보존). school 전용 신규 라우트 `src/routes/school.$classId.tsx`(가칭)를 추가해 같은 컴포넌트 트리를 `league_type` prop만 다르게 공유. Lobby(`index.tsx`)의 리그 생성 플로우에 "학교 리그 만들기" 진입점을 추가해 `/school/...`로 연결.
- **아카이브**: school-league 레포 아카이브는 최종 검수 완료 후 별도로 진행(이번 범위 아님).

## 구현 대상 파일 (설계 단계 — 실제 착수는 별도 승인 후)
- `db/schema/club_schema.sql`: `leagues.league_type`, `players.grade/class_num/student_no` 컬럼 추가 마이그레이션.
- `src/lib/league-types.ts`: `LeagueType`, `Student`에 school 필드 optional 추가.
- `src/lib/settings-migration.ts`: school 리그 기본값(matchInputMode=admin-only 등) 분기 추가.
- `src/components/Lobby.tsx`: 리그 생성 시 club/school 선택 UI, school 선택 시 기본 설정 자동 적용.
- `src/routes/school.$classId.tsx` (신규): school 전용 라우트, 기존 `class.$classId.tsx`의 컴포넌트를 `league_type="school"`로 재사용.
- `src/components/league/RecordMatch.tsx`, `MatchRecommend.tsx`: school일 때 학년/반 필터 UI 노출(school-league의 grade/classNum 필터 로직 참고 이식).
- `src/lib/title-calculator.ts`: school 리그에도 그대로 적용(수정 불필요, achievement-calculator는 이식하지 않음).
- 신규 공개 순위표 라우트/컴포넌트(B안): 무인증 열람용, club의 기존 회원 순위표 열람 코드 재사용.

## 검증 방법
- 마이그레이션 적용 후 기존 club 리그 데이터/RLS 정상 동작 확인(신규 컬럼 all null, 기존 쿼리 영향 없음).
- club 기존 URL(`/class/$id`)이 이번 변경으로 전혀 달라지지 않았는지 diff로 확인.
- 신규 school 리그 생성 → 교사 로그인 → 학생 명부(grade/class/no) 등록 → 경기 기록(admin-only) → 공개 순위표 링크(비로그인) 열람까지 end-to-end 플로우 수동 테스트.

## 다음 논의(이번 범위 밖)
- 공개 순위표(B안)에 추가할 기능(개인화, 필터 등) — 추후 별도 설계.
- school-league 레포 아카이브 시점.
