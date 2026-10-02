// 점수입력판 서버 계산 — DB 행 그대로 받아 교사 태블릿(recordMatch)과 같은 순서로 계산한다.
// 서버 함수(supabase/functions/score-input)가 이 파일을 묶어 간다. 순수 함수만.
import { calculateMatchResult, type PlayerStat } from "@/domain/match-calculator";
import { mapMatchRow, mapPlayerRows, seoulYmd, sortMatchesNewestFirst } from "@/domain/calc-context";
import { migrateSettings } from "@/lib/settings-migration";
import { buildMatchReceipt } from "@/domain/match-receipt";

export interface ScoreInputCalcInput {
  settings: any;            // leagues.settings
  playerRows: any[];        // players (삭제 안 된 것)
  matchRows: any[];         // 이번 시즌 matches
  teamA: string[];          // [A] 또는 [A, A2]
  teamB: string[];
  scoreA: number;
  scoreB: number;
  matchId: string;
  nowIso: string;
}

export interface ScoreInputCalcOutput {
  winnerId: string; loserId: string; winner2Id: string | null; loser2Id: string | null;
  winnerScore: number; loserScore: number;
  rpDeltaWinner: number | null; rpDeltaLoser: number | null;
  rpDeltaWinner2: number | null; rpDeltaLoser2: number | null;
  /** 항목별 보너스(비교 시험·영수증용) */
  playerStats: PlayerStat[];
  /** 결과 영수증 — 교사 화면 결과 창과 같은 모양(MatchResultData). matches.rp_breakdown 에 저장한다. */
  receipt: ReturnType<typeof buildMatchReceipt>;
}

export function computeScoreInput(input: ScoreInputCalcInput): ScoreInputCalcOutput {
  const { teamA, teamB, scoreA, scoreB } = input;
  if (scoreA === scoreB) throw new Error("비긴 경기는 넣을 수 없어요.");
  const m = migrateSettings(input.settings ?? {});
  const matches = sortMatchesNewestFirst((input.matchRows || []).map(mapMatchRow));
  const students = mapPlayerRows(input.playerRows || [], matches, seoulYmd);
  const [playerAId, playerA2Id] = teamA;
  const [playerBId, playerB2Id] = teamB;
  for (const id of [...teamA, ...teamB]) {
    if (!students.some((s) => s.id === id)) throw new Error("선수를 찾을 수 없어요.");
  }
  const matchType = teamA.length > 1 || teamB.length > 1 ? "double" : "single";

  const { playerStats } = calculateMatchResult({
    students, matches, playerAId, playerBId, scoreA, scoreB, playerA2Id, playerB2Id, matchType,
    tierThresholds: m.tierThresholds, tiers: m.tiers, rpVariables: m.rpVariables,
    dynamicBonuses: m.dynamicBonuses, dynamicPenalties: m.dynamicPenalties,
    todayYmd: seoulYmd(input.nowIso), matchId: input.matchId, matchDate: input.nowIso,
  });

  // 아래는 recordMatch(league-store) 의 저장 직전 변환과 같다.
  const aWon = scoreA > scoreB;
  const winnerId = aWon ? playerAId : playerBId;
  const loserId = aWon ? playerBId : playerAId;
  const winner2Id = (aWon ? playerA2Id : playerB2Id) ?? null;
  const loser2Id = (aWon ? playerB2Id : playerA2Id) ?? null;
  const deltaOf = (id: string | null | undefined) =>
    id ? (playerStats.find((p) => p.id === id)?.delta ?? null) : null;
  return {
    winnerId, loserId, winner2Id, loser2Id,
    winnerScore: aWon ? scoreA : scoreB, loserScore: aWon ? scoreB : scoreA,
    rpDeltaWinner: deltaOf(winnerId), rpDeltaLoser: deltaOf(loserId),
    rpDeltaWinner2: deltaOf(winner2Id), rpDeltaLoser2: deltaOf(loser2Id),
    playerStats,
    receipt: buildMatchReceipt({
      students, playerStats,
      winnerId, winner2Id, loserId, loser2Id,
      winnerScore: aWon ? scoreA : scoreB, loserScore: aWon ? scoreB : scoreA, aWon,
      thresholds: m.tierThresholds,
      // 교사 화면(league-store)과 같은 기본값: 배치고사 꺼짐, 3경기
      placement: {
        enabled: !!m.placement?.enabled,
        games: typeof m.placement?.games === "number" ? m.placement.games : 3,
      },
    }),
  };
}
