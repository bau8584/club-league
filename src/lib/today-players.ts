import type { Match } from "./league-types";

// 같은 날짜(로컬 기준) 비교
const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * 오늘(로컬 기준) 한 번이라도 경기에 참여한 선수 id 집합.
 * 매치 추천·경기 예약에서 "오늘 참여자만" 필터에 공용으로 사용.
 */
export function getTodayPlayerIds(matches: Match[], now: Date = new Date()): Set<string> {
  const set = new Set<string>();
  for (const m of matches) {
    if (!isSameLocalDay(new Date(m.date), now)) continue;
    for (const id of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) if (id) set.add(id);
  }
  return set;
}
