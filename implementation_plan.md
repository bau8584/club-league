# Implementation Plan - Generalizing to School/Club Universal League System

This plan details the changes required to adapt the school-centric badminton/tennis league application to support middle/high schools and adult clubs. 

---

## User Review Required

> [!IMPORTANT]
> - **Terminology Abstraction**: All visual terms will dynamically adapt based on the selected **Operating Mode (School / Club)**:
>   - '교사' (Teacher) ➔ '관리자(Admin)'
>   - '학생' (Student) ➔ '선수(Player)'
>   - '학교명' (School Name) ➔ '그룹명(소속/학교/클럽명)'
>   - Column names in raw CSV and JSON properties (e.g. `schoolName`, `studentGrade`, `role === "TEACHER"`) remain unchanged to avoid breaking Google Apps Script endpoints and sheets databases.
> - **Grade/Class Fields in Club Mode**: When the operating mode is set to `"club"`, the Grade, Class, and Student Number input fields are hidden from login and registration. Default values (`0` or `""`) will be used and properly synced. Roster navigation will directly list club members sorted alphabetically.

---

## Proposed Changes

### Component 1: Business Logic & Settings State (`src/lib/league-store.ts`)

#### [MODIFY] [league-store.ts](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/lib/league-store.ts)
- Add state variable `opMode: "school" | "club"` (default: `"school"`).
- Update settings caching (`SETTINGS_KEY`) to persist `opMode` locally.
- When loading user session (`SESSION_KEY` and Google Sheets settings synchronization), parse `opMode` from `settingsBonus` JSON payload if present.
- Modify `saveLeagueSettings` to accept and serialize `opMode` to both local settings and remote Google Sheets.
- Expose `getSchoolMode` helper to allow checking the operating mode of any school prior to student logging in (loads from the cached list of teachers).
- Allow empty / optional grade and class values in database syncing; defaults `grade`, `classNum`, and `number` to `0` instead of rejecting them if in `"club"` mode.

---

### Component 2: Main Layout and Context (`src/routes/index.tsx`)

#### [MODIFY] [index.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/routes/index.tsx)
- Pass `opMode={opMode}` down to `<LoginPanel>`, `<RecordMatch>`, `<MatchRecommend>`, `<Leaderboard>`, and `<AdminPanel>`.
- Dynamically adapt page header, tab titles, and welcome cards:
  - `session.userName + " 교사"` ➔ `session.userName + (opMode === "club" ? " 관리자" : " 교사")`
  - `"교사 관리자"` tab name ➔ `opMode === "club" ? "리그 관리자" : "교사 관리자"`

---

### Component 3: Admin Dashboard Settings and Inputs (`src/components/league/AdminPanel.tsx`)

#### [MODIFY] [AdminPanel.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/AdminPanel.tsx)
- Add **운영 모드 선택 (학교 모드 / 동호회 모드)** toggle switcher to the settings card.
- In **동호회 모드 (Club Mode)**:
  - Hide the grade/class selector tab filters in the student list browser.
  - Show a simplified search-by-name list.
  - When copying/pasting NEIS roster, support pasting list of names only (with optional gender: e.g. "홍길동 m" or "김영희") and default `grade`, `classNum`, `number` to `0` or `1`.
  - In CSV download, write empty strings or default values for grade/class/number if `opMode === "club"`.
- Apply Dynamic Terminology abstraction mapping on all buttons, dialog confirmations, labels, and toast messages.

---

### Component 4: Match Entry UI (`src/components/league/RecordMatch.tsx`)

#### [MODIFY] [RecordMatch.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/RecordMatch.tsx)
- Update `PlayerSelector` helper component:
  - If `opMode === "club"`, replace the step-by-step Grade ➔ Class ➔ Player screen flow with a direct alphabetical search list of all active club members.
  - Hide the `({player.grade}학년 {player.classNum}반)` detail blocks.

---

### Component 5: Match Matchmaking Recommendations (`src/components/league/MatchRecommend.tsx`)

#### [MODIFY] [MatchRecommend.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/MatchRecommend.tsx)
- In `"club"` mode:
  - Hide the matchmaking scope buttons ("우리 반 리그", "다른 반 대결", "다른 학년 레이드").
  - Skip grade-proximity weights in selection logic. Recommend strictly based on RP tiers and gap differences.
  - Simplify witty matching tips to avoid school references.

---

### Component 6: Rankings & Student Info HUD (`src/components/league/Leaderboard.tsx` & `src/components/league/MyRecord.tsx`)

#### [MODIFY] [Leaderboard.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/Leaderboard.tsx)
- Hide the Grade and Class filter buttons if `opMode === "club"`.
- Omit the "학년/반" and "번호" columns from the rankings grid if `opMode === "club"`.

#### [MODIFY] [MyRecord.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/MyRecord.tsx)
- Hide grade/class details for the student and their match history opponents if in `"club"` mode.
- Change labels like "교사에게 문의하세요" to "관리자(Admin)에게 문의하세요".

---

### Component 7: Login Page (`src/components/league/LoginPanel.tsx`)

#### [MODIFY] [LoginPanel.tsx](file:///c:/Users/com/Downloads/lovable-project-c1d0bcbc-12c3-486c-b9d2-865bdef007a8-2026-05-22/src/components/league/LoginPanel.tsx)
- Listen to input `schoolName` changes and dynamically query `getSchoolMode` to determine if the target league is in `"club"` mode.
- Hide "학년" and "반" fields completely from the login inputs if `"club"` mode is active.
- Abstract titles and placeholder texts.

---

## Verification Plan

### Automated Verification
- Verify build completeness and TypeScript compilation: `npm run build`.

### Manual Verification
1. **Toggle Switch**: Log in as administrator, change mode to "동호회 모드 (Club Mode)", save settings. Verify it persists after refreshing.
2. **Administrator Roster View**: Check student lists in both modes. In club mode, grade and class columns should disappear.
3. **Player Registration**: Paste names directly (e.g. `홍길동\n김민지 여`) in club mode. Roster should import them correctly.
4. **Player Login**: Open player login page. Verify that entering a club name dynamically hides the Grade and Class fields. Try logging in by entering just the name.
5. **Match Recording**: Record singles & doubles in club mode. Select players directly via the alphabetical search list. Verify that the score entry works and RP computes correctly.
6. **Backward Compatibility**: Switch to school mode, and make sure grade/class selection flow still works. Check sheets sync files.
