import type { AssignmentSession } from "./league-types";

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * 동호회 세션은 리그당 한 행이라 지난주 것이 그대로 남는다. 학교는 [새로 시작]이 수업마다
 * 있어 경계가 분명하지만, 동호회는 "오늘 운동"이 곧 경계다 — 오늘 시작한 세션만 살아 있는
 * 것으로 본다. 지난 세션은 없는 것과 같다: 명단은 비어 있고 [오늘 참석]부터 다시 한다.
 */
export function liveSession(
  session: AssignmentSession | null | undefined,
  leagueType: "school" | "club",
  now: Date = new Date(),
): AssignmentSession | null {
  if (!session || !(session.player_ids?.length > 0)) return null;
  if (leagueType === "school") return session;
  return sameLocalDay(new Date(session.started_at), now) ? session : null;
}
