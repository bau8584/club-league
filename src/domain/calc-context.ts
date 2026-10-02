// 경기 계산 재료 준비 — 교사 태블릿(league-store)과 점수입력판 서버 함수(supabase/functions/score-input)가
// 같은 코드를 쓴다. 여기가 갈라지면 같은 경기도 기기마다 RP 가 달라진다(PLAN-student-input.md 위험 ①).
// 순수 함수만. supabase·React 를 불러오지 않는다(서버 함수로 그대로 묶여 나간다).
import type { Student, Match, Gender } from "@/lib/league-types";

/** DB matches 행 → 화면 Match. playerA = 승자. */
export function mapMatchRow(m: any): Match {
  return {
    id: m.id,
    playerAId: m.winner_id,
    playerBId: m.loser_id,
    playerA2Id: m.winner2_id ?? undefined,
    playerB2Id: m.loser2_id ?? undefined,
    scoreA: m.winner_score ?? 21,
    scoreB: m.loser_score ?? 19,
    // playerA=winner_id 로 매핑되므로 승자 델타→A, 패자 델타→B 로 자동 정합.
    // 과거(마이그레이션 이전) 경기는 NULL → undefined 로 두어 deleteMatch fallback 이 동작.
    rpDeltaA: m.rp_delta_winner ?? undefined,
    rpDeltaB: m.rp_delta_loser ?? undefined,
    rpDeltaA2: m.rp_delta_winner2 ?? undefined,
    rpDeltaB2: m.rp_delta_loser2 ?? undefined,
    date: m.created_at || new Date().toISOString(),
    matchType: m.winner2_id ? "double" : "single",
    rpBreakdown: m.rp_breakdown ?? null,
    inputSource: m.input_source ?? null
  };
}

/** 날짜 키(YYYY-MM-DD). 태블릿은 기기 시간대, 서버는 한국 시간을 넘긴다. */
export type YmdOf = (iso: string) => string;

/** 기기 시간대 기준 날짜 키 — 교사 태블릿이 지금까지 써 온 방식. */
export const localYmd: YmdOf = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000).toISOString().split("T")[0];
};

/** 한국 시간 기준 날짜 키 — 서버(UTC)에서 태블릿과 같은 '오늘'을 얻는다. */
export const seoulYmd: YmdOf = (iso) =>
  new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

/** DB players 행 + 이번 시즌 경기 → 계산용 Student(연승·최근 5경기·마지막 승리일 포함). RP 내림차순. */
export function mapPlayerRows(dbStudents: any[], matchesList: Match[], ymdOf: YmdOf = localYmd): Student[] {
  const list: Student[] = (dbStudents || []).map((s: any) => {
    const group = s.group_label ?? null;
    // name(표시)은 본명/닉네임/레벨 순으로 fallback
    const name = s.name || s.display_name || s.nickname || "이름없음";
    const gender = (s.gender || "U") as Gender;

    // 복식: 파트너(playerA2Id/playerB2Id)도 승/패에 포함해야 함.
    const isWinnerSide = (m: Match) => m.playerAId === s.id || m.playerA2Id === s.id;
    const isLoserSide = (m: Match) => m.playerBId === s.id || m.playerB2Id === s.id;
    const studentMatches = matchesList
      .filter((m) => isWinnerSide(m) || isLoserSide(m))
      .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

    const wins = studentMatches.filter(isWinnerSide).length;
    const losses = studentMatches.filter(isLoserSide).length;

    // Last 5 matches form (W or L)
    const recent = studentMatches.slice(0, 5).map((m) => (isWinnerSide(m) ? "W" : "L"));

    // 마지막 경기·마지막 승리일. 경기 하나가 저장될 때마다 이 목록이 다시 만들어지는데,
    // 여기서 안 채우면 둘 다 undefined 로 돌아간다 — 그러면 "오늘 첫 승" 보너스가 매 승리마다
    // 붙고(모멘턴 리그 실측: 승리 176건 중 166건), 휴면 감점은 아무에게도 안 걸린다.
    // 날짜 키는 경기 기록 시 쓰는 것과 같은 YYYY-MM-DD 다.
    const lastMatch = studentMatches[0];
    const lastWin = studentMatches.find(isWinnerSide);

    // Current streak
    let currentStreak = 0;
    for (const m of studentMatches) {
      const won = isWinnerSide(m);
      if (currentStreak === 0) {
        currentStreak = won ? 1 : -1;
      } else if (currentStreak > 0) {
        if (won) currentStreak++;
        else break;
      } else {
        if (!won) currentStreak--;
        else break;
      }
    }

    return {
      id: s.id,
      league_id: s.league_id,
      userId: s.user_id ?? null,
      name,
      nickname: s.nickname ?? "",
      group,
      birthYear: s.birth_year ?? null,
      grade: s.grade ?? null,
      classNum: s.class_num ?? null,
      studentNo: s.student_no ?? null,
      displayName: s.display_name ?? null,
      equippedTitle: s.equipped_title ?? null,
      gender,
      rp: s.rp || 1000,
      wins,
      losses,
      recent,
      currentStreak,
      lastMatchDate: lastMatch?.date,
      lastWinDate: lastWin ? ymdOf(lastWin.date) : undefined,
    };
  });
  // Sort students by RP descending
  list.sort((a, b) => b.rp - a.rp);
  return list;
}

/** 이번 시즌 경기를 최신순으로. calculateMatchResult 가 받는 순서. */
export function sortMatchesNewestFirst(list: Match[]): Match[] {
  return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
