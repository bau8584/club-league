# 새 세션용 프롬프트 — "승패만" 입력 모드

> 상태 (2026-10-24 점검): **미착수**(`scoreEnabled` 코드 없음). 이 프롬프트의 "feat/winloss-only 브랜치 만들기"는 지금 규칙(브랜치는 `dev` 하나)과 어긋나니 쓰기 전에 `dev`에서 하도록 고칠 것. 참고: 점검 보고서에 따르면 경기의 31%가 승패만(1-0)이다.

아래를 그대로 붙여 넣으면 된다.

---

브랜치 `feat/winloss-only`를 만들고 학교 리그에 **"승패만" 입력 모드**를 추가해 줘.

**왜**: 인디스쿨 배포 후 실사용 데이터(2026-09-15~16)를 보니, 경기를 가장 많이 기록한 4개 리그(구구단·랜덤빙고·공기·체스)의 211경기가 전부 `1:0`이었다. 점수가 의미 없는 종목인데 점수칸이 있으니 형식적으로 1:0을 찍는 것. 승패만 고르면 끝나게 해서 입력을 절반으로 줄인다.

**무엇이 달라지나**
- 리그 설정(AdminSettings)에 "점수 기록" 스위치 추가. 기본값은 **켜짐**(= 지금 동작). 값이 없으면 켜진 것으로 본다 — 기존 리그는 한 글자도 안 바뀌어야 한다.
- 스위치를 끄면 경기 입력 화면(RecordMatch)에서 점수 입력 UI가 사라지고, 두 선수(복식이면 네 명)를 고른 뒤 **"A 이김 / B 이김" 두 버튼**만 남는다. 저장은 winner_score=1, loser_score=0으로 — DB·기존 계산과 호환.
- 점수를 안 쓰는 리그에서는 점수 차 보너스(marginBonus, greatMatch 등 점수를 읽는 항목)가 0이 되게 하고, 경기 목록·상세·공개 순위표에서 `1:0` 표시를 숨긴다(승/패만 보이게).
- 개설 화면(Lobby)의 학교 리그 항목에도 같은 체크박스를 넣되 기본 켜짐.

**지켜야 할 것** (docs/PLAN-post-launch.md 0번 원칙)
- main 직접 커밋 금지. DB는 settings JSON에 키 하나(`scoreEnabled`) 추가만, 열 추가 없음.
- 점수 계산 코드(src/domain/match-calculator.ts)는 건드리지 말고 입력값으로만 제어. 바꿔야 하면 먼저 현재 결과를 테스트로 고정.
- 끝나면 `npx tsc --noEmit`, 그리고 청림초 컬링 리그(점수 켜짐)가 전과 똑같이 보이는지 확인.

**참고 위치**
- 설정 스위치 예: `genderEnabled` 스위치 (src/components/league/admin/AdminSettings.tsx ~790행, 저장은 league-store의 `saveGenderEnabled`)
- 점수 입력: src/components/league/RecordMatch.tsx `scoreA/scoreB`(161행), 저장 시 winnerScore/loserScore(755행)
- 설정 읽기: src/lib/league-store.ts 345행 부근(`matchInputMode` 읽는 곳과 같은 방식)

먼저 계획을 한 화면 분량으로 보여 주고, 내가 확인하면 시작해.
