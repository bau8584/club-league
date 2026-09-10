/**
 * 배정 결과 → scheduled_matches 행 변환.
 *
 * 네트워크와 분리된 순수 변환이라 그대로 테스트한다.
 * 실제 insert는 services/league-api.ts의 apiBulkCreateAssignedMatches가 한다.
 */

export interface AssignedMatchInput {
  classId: string;
  matches: { teamA: string[]; teamB: string[] }[];
  matchType?: "single" | "double";
  /** 큐 맨 뒤에 붙이기 위한 기준 시각(ms). 기본값은 지금. */
  baseTimeMs?: number;
  /** 어느 수업의 줄인가. 없으면 세션 밖의 줄이 된다(세션을 쓰지 않는 리그). */
  sessionId?: string | null;
  /** 첫 줄에 붙일 고정 번호. 서버가 발급한 값이다. 없으면 번호 없는 줄이 된다. */
  startSeq?: number | null;
}

/** 배정 결과 → scheduled_matches 행. 네트워크와 분리해 두어 그대로 테스트한다. */
export function buildAssignedMatchRows(payload: AssignedMatchInput) {
  const base = payload.baseTimeMs ?? Date.now();
  return (
    payload.matches
      // 슬롯이 비면 큐에 못 올린다. 팀 미정 예약과 달리 배정은 팀이 확정된 것만 만든다.
      .filter((m) => m.teamA?.[0] && m.teamB?.[0])
      .map((m, i) => ({
        league_id: payload.classId,
        session_id: payload.sessionId ?? null,
        seq: payload.startSeq == null ? null : payload.startSeq + i,
        match_type: payload.matchType ?? (m.teamA.length > 1 ? "double" : "single"),
        player_a_id: m.teamA[0],
        player_b_id: m.teamB[0],
        player_a2_id: m.teamA[1] ?? null,
        player_b2_id: m.teamB[1] ?? null,
        player_ids: [],
        court: null,
        status: "waiting",
        created_at: new Date(base + i).toISOString(),
      }))
  );
}
