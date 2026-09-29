import type { AssignmentSession } from "./league-types";

/**
 * 만든 지 이 시간이 넘은 줄과 명단은 지난 수업·운동의 것이다.
 * 날짜(자정)로 자르지 않는다 — 밤샘 운동이 자정을 넘어도 살아 있는 줄이다.
 * 반이 안 바뀌는 수업은 [새로 시작]을 누를 일이 없어 이 기준이 줄을 치운다.
 */
export const STALE_HOURS = 12;
export const STALE_MS = STALE_HOURS * 60 * 60 * 1000;

/** 이 시각보다 전에 만든 줄은 지난 것이다. */
export const staleCutoffIso = (now: Date = new Date()) => new Date(now.getTime() - STALE_MS).toISOString();

/**
 * 동호회 세션은 리그당 한 행이라 지난주 것이 그대로 남는다. 학교는 [새로 시작]이 수업마다
 * 있어 경계가 분명하지만, 동호회는 "오늘 운동"이 곧 경계다 — 시작한 지 ${STALE_HOURS}시간 안의 세션만 살아 있는
 * 것으로 본다. 지난 세션은 없는 것과 같다: 명단은 비어 있고 [오늘 참석]부터 다시 한다.
 */
export function liveSession(
  session: AssignmentSession | null | undefined,
  leagueType: "school" | "club",
  now: Date = new Date(),
): AssignmentSession | null {
  if (!session || !(session.player_ids?.length > 0)) return null;
  if (leagueType === "school") return session;
  return now.getTime() - new Date(session.started_at).getTime() < STALE_MS ? session : null;
}
