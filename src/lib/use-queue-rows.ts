import { useMemo } from "react";
import { useLeagueStore } from "@/lib/league-store";
import type { ScheduledMatch } from "@/lib/league-types";

/** 한 줄에서 양 팀과, 아직 팀이 안 갈린 인원을 꺼낸다. */
export const teamsOf = (r: ScheduledMatch) => ({
  teamA: [r.player_a_id, r.player_a2_id].filter(Boolean) as string[],
  teamB: [r.player_b_id, r.player_b2_id].filter(Boolean) as string[],
  pool: ((r.player_ids || []).filter(Boolean) as string[]) ?? [],
});

/** 서버가 코트 번호를 붙인 줄(= 경기 중). 코트를 안 쓰면 번호가 없다. */
export const onCourt = (r: { court?: string | null }) => !!r.court && /^\d+$/.test(r.court);

/**
 * 대기 중인 줄과 "내가 몇 번째냐".
 *
 * 목록을 그리는 MatchQueue와 머리글에 줄 수를 적는 SessionCard가 같은 값을 봐야 해서
 * 밖으로 뺐다 — 같은 파생을 두 파일에 복붙하면 한쪽만 고치는 날이 온다.
 */
export function useQueueRows() {
  const { scheduledMatches, myPlayerId } = useLeagueStore();

  /**
   * 큐는 번호순이다. 위에서부터 코트에 들어간다.
   *
   * 만든 시각으로 정렬하지 않는다. 그 시각은 뽑은 기기의 시계라, 폰과 태블릿의 시계가
   * 어긋나 있으면 순서가 흔들린다. 번호는 서버가 매기므로 흔들리지 않는다.
   *
   * 번호 없는 줄(회원 예약, 고유번호 도입 이전에 뽑아둔 줄)은 뒤로 보내고 자기들끼리
   * 만든 순서로 둔다. 번호가 곧 순서인 목록에 번호 없는 줄을 끼워 넣을 자리가 없다.
   */
  const queue = useMemo(
    () =>
      scheduledMatches
        .filter((m) => m.status === "waiting" || m.status === "called")
        .sort((a, b) => {
          // 코트에 든 줄이 먼저. 단식 코트를 쓰면 빈 코트에 그 종류의 줄이 번호를 건너뛰어
          // 들어간다(#6 단식이 #4 복식보다 먼저). 단식 코트가 없으면 코트에 든 줄이 곧 앞쪽 N줄이라 그대로다.
          const ca = onCourt(a) ? 0 : 1;
          const cb = onCourt(b) ? 0 : 1;
          if (ca !== cb) return ca - cb;
          const sa = a.seq ?? Number.POSITIVE_INFINITY;
          const sb = b.seq ?? Number.POSITIVE_INFINITY;
          if (sa !== sb) return sa - sb;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }),
    [scheduledMatches],
  );

  const myTurn = useMemo(
    () =>
      queue.findIndex((r) => {
        const { teamA, teamB, pool } = teamsOf(r);
        return !!myPlayerId && [...teamA, ...teamB, ...pool].includes(myPlayerId);
      }),
    [queue, myPlayerId],
  );

  return { queue, myTurn };
}
