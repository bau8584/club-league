import { useMemo } from "react";
import { useLeagueStore } from "@/lib/league-store";
import type { ScheduledMatch } from "@/lib/league-types";

/** 한 줄에서 양 팀과, 아직 팀이 안 갈린 인원을 꺼낸다. */
export const teamsOf = (r: ScheduledMatch) => ({
  teamA: [r.player_a_id, r.player_a2_id].filter(Boolean) as string[],
  teamB: [r.player_b_id, r.player_b2_id].filter(Boolean) as string[],
  pool: ((r.player_ids || []).filter(Boolean) as string[]) ?? [],
});

/**
 * 대기 중인 줄과 "내가 몇 번째냐".
 *
 * 목록을 그리는 MatchQueue와 머리글에 줄 수를 적는 SessionCard가 같은 값을 봐야 해서
 * 밖으로 뺐다 — 같은 파생을 두 파일에 복붙하면 한쪽만 고치는 날이 온다.
 */
export function useQueueRows() {
  const { scheduledMatches, myPlayerId } = useLeagueStore();

  // 큐는 만든 순서대로다. 위에서부터 코트에 들어간다.
  const queue = useMemo(
    () =>
      scheduledMatches
        .filter((m) => m.status === "waiting" || m.status === "called")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
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
