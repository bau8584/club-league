// 경기 결과 영수증(결과 창 내용) — 교사 화면(RecordMatch)이 경기 직후 만드는 것과 같은 규칙.
// 점수입력판 서버 함수가 이걸로 영수증을 만들어 저장(rp_breakdown)하고 학생 화면에 돌려준다.
// 순수 함수만(서버 함수로 묶여 나간다).
import type { Student, TierName } from "@/lib/league-types";
import { getTier, getTierSubdivision, TIER_ORDER } from "@/lib/league-types";
import type { PlayerStat } from "@/domain/match-calculator";

const KEYS = [
  "underdogBonus", "scoreDiffBonus", "rivalBonus", "firstWinBonus", "revengeBonus", "freshnessBonus",
  "streakBonus", "comebackBonus", "marginBonus", "mentoringBonus", "greatMatchBonus", "lossComfortBonus",
  "willOfSteelBonus", "arrogancePenalty", "crushingPenalty", "revengeAllowedPenalty", "championPenalty", "swampPenalty",
] as const;

export function buildPlayerReceipt(
  student: Student, stat: PlayerStat | undefined, won: boolean, score: number,
  thresholds: Record<TierName, number>, placement: { enabled: boolean; games: number },
) {
  const v = (k: (typeof KEYS)[number]) => (stat?.[k] as number | undefined) ?? 0;
  const prevRp = student.rp;
  const rpDelta = stat?.delta ?? 0;
  const finalRp = Math.max(0, prevRp + rpDelta);
  const prevTier = getTier(prevRp, thresholds);
  const finalTier = getTier(finalRp, thresholds);
  const prevSub = getTierSubdivision(prevRp, thresholds);
  const finalSub = getTierSubdivision(finalRp, thresholds);
  // 배치고사: 이 경기를 포함한 누적 경기 수가 배치 기준 미만이면 언랭크(티어·RP 비공개)
  const gamesAfter = student.wins + student.losses + 1;
  const unranked = placement.enabled && gamesAfter < placement.games;
  const basePromoted = TIER_ORDER.indexOf(finalTier) < TIER_ORDER.indexOf(prevTier);
  const subPromoted = finalTier === prevTier && finalSub < prevSub;
  const promoted = won && (basePromoted || subPromoted) && !unranked;
  const preStreak = student.currentStreak ?? 0;
  const currentStreak = won ? (preStreak >= 0 ? preStreak + 1 : 1) : (preStreak <= 0 ? preStreak - 1 : -1);
  const baseWin = won
    ? rpDelta - (v("underdogBonus") + v("scoreDiffBonus") + v("rivalBonus") + v("firstWinBonus") + v("revengeBonus")
      + v("freshnessBonus") + v("streakBonus") + v("comebackBonus") + v("marginBonus") + v("mentoringBonus")
      + v("greatMatchBonus") + v("willOfSteelBonus"))
    : 0;
  const baseLoss = !won
    ? -rpDelta + v("freshnessBonus") + v("lossComfortBonus") + v("greatMatchBonus")
      - (v("arrogancePenalty") + v("crushingPenalty") + v("revengeAllowedPenalty") + v("championPenalty") + v("swampPenalty"))
    : 0;
  const bonuses = Object.fromEntries(KEYS.map((k) => [k, v(k)]));
  return {
    name: student.nickname || student.name,
    group: student.group ?? null,
    gender: student.gender,
    prevRp, prevTier, finalRp, finalTier, promoted, score, rpDelta,
    ...bonuses,
    baseWin, baseLoss, currentStreak, unranked,
    placementDone: gamesAfter, placementNeed: placement.games,
  };
}

/** RecordMatch 의 MatchResultData 와 같은 모양. */
export function buildMatchReceipt(args: {
  students: Student[]; playerStats: PlayerStat[];
  winnerId: string; winner2Id: string | null; loserId: string; loser2Id: string | null;
  winnerScore: number; loserScore: number; aWon: boolean;
  thresholds: Record<TierName, number>; placement: { enabled: boolean; games: number };
}) {
  const { students, playerStats, thresholds, placement } = args;
  const one = (id: string | null, won: boolean, score: number) => {
    if (!id) return undefined;
    const s = students.find((x) => x.id === id);
    return s ? buildPlayerReceipt(s, playerStats.find((p) => p.id === id), won, score, thresholds, placement) : undefined;
  };
  return {
    matchType: args.winner2Id ? "double" : "single",
    winner: one(args.winnerId, true, args.winnerScore)!,
    winner2: one(args.winner2Id, true, args.winnerScore),
    loser: one(args.loserId, false, args.loserScore)!,
    loser2: one(args.loser2Id, false, args.loserScore),
    aWon: args.aWon,
  };
}
