import type { Student, Match, TierName, TiersRecord, DynamicBonuses, DynamicPenalties } from "@/lib/league-types";
import { getTier, getTierSubdivision, getFullTierLabel, TIER_ORDER } from "@/lib/league-types";

const TIER_RANKING: Record<TierName, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5
};

export interface CalculateMatchResultInput {
  students: Student[];
  matches: Match[];
  playerAId: string;
  playerBId: string;
  scoreA: number;
  scoreB: number;
  playerA2Id?: string;
  playerB2Id?: string;
  matchType: "single" | "double";
  tierThresholds: Record<TierName, number>;
  tiers: TiersRecord;
  rpVariables: { winDelta: number; loseDelta: number };
  dynamicBonuses: DynamicBonuses;
  dynamicPenalties: DynamicPenalties;
  todayYmd: string;
  matchId: string;
  matchDate: string;
}

export interface PlayerStat {
  id: string;
  role: "A" | "A2" | "B" | "B2";
  isA: boolean;
  won: boolean;
  delta: number;
  underdogBonus: number;
  scoreDiffBonus: number;
  rivalBonus: number;
  firstWinBonus: number;
  revengeBonus: number;
  freshnessBonus: number;
  streakBonus: number;
  comebackBonus: number;
  marginBonus: number;
  mentoringBonus: number;
  greatMatchBonus: number;
  lossComfortBonus: number;
  willOfSteelBonus: number;
  arrogancePenalty: number;
  crushingPenalty: number;
  revengeAllowedPenalty: number;
  championPenalty: number;
  swampPenalty: number;
}

export interface PromotionEventInfo {
  isPromoted: boolean;
  newTier: string;
  studentName: string;
}

export interface CalculateMatchResultOutput {
  playerStats: PlayerStat[];
  nextStudents: Student[];
  match: Match;
  promotions: PromotionEventInfo[];
}

export function calculateMatchResult(input: CalculateMatchResultInput): CalculateMatchResultOutput {
  const {
    students,
    matches,
    playerAId,
    playerBId,
    scoreA,
    scoreB,
    playerA2Id,
    playerB2Id,
    matchType,
    tierThresholds,
    tiers,
    rpVariables,
    dynamicBonuses,
    dynamicPenalties,
    todayYmd,
    matchId,
    matchDate
  } = input;

  const aWon = scoreA > scoreB;

  // 복식/단식 참가 플레이어 목록 빌드
  const activePlayers = [
    { id: playerAId, role: "A" as const, isA: true },
    { id: playerA2Id, role: "A2" as const, isA: true },
    { id: playerBId, role: "B" as const, isA: false },
    { id: playerB2Id, role: "B2" as const, isA: false }
  ].filter((p) => p.id !== undefined && p.id !== "") as { id: string; role: "A" | "A2" | "B" | "B2"; isA: boolean }[];

  // precompute match-level freshness
  let isFreshMatch = false;
  if (dynamicBonuses?.freshnessEnabled) {
    const teamAIds = [playerAId, playerA2Id].filter(Boolean) as string[];
    const teamBIds = [playerBId, playerB2Id].filter(Boolean) as string[];
    const gamesLimit = dynamicBonuses.freshnessGames || 5;

    const teamAHasFacedTeamB = teamAIds.some((memberId) => {
      const memberMatches = matches
        .filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId)
        .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
        .slice(-gamesLimit);
      return memberMatches.some((m) => {
        const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
        return teamBIds.some((bId) => mPlayers.includes(bId));
      });
    });

    const teamBHasFacedTeamA = teamBIds.some((memberId) => {
      const memberMatches = matches
        .filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId)
        .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
        .slice(-gamesLimit);
      return memberMatches.some((m) => {
        const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
        return teamAIds.some((aId) => mPlayers.includes(aId));
      });
    });

    isFreshMatch = !teamAHasFacedTeamB && !teamBHasFacedTeamA;
  }

  // precompute if winning team got revenge
  const winningPlayerIds = aWon 
    ? [playerAId, playerA2Id].filter(Boolean) as string[]
    : [playerBId, playerB2Id].filter(Boolean) as string[];
  const losingPlayerIds = aWon
    ? [playerBId, playerB2Id].filter(Boolean) as string[]
    : [playerAId, playerA2Id].filter(Boolean) as string[];

  const winningTeamGotRevenge = winningPlayerIds.some((wId) => {
    if (!dynamicBonuses?.revengeEnabled) return false;
    const s = students.find((st) => st.id === wId);
    if (!s) return false;
    const sRecentMatches = matches
      .filter((m) => m.playerAId === wId || m.playerBId === wId || m.playerA2Id === wId || m.playerB2Id === wId)
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
      .slice(-20);

    return sRecentMatches.some((m) => {
      const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
      const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
      const mAWon = m.scoreA > m.scoreB;
      
      const sIsOnA = mTeamA.includes(wId);
      const sIsOnB = mTeamB.includes(wId);
      
      if (sIsOnA) {
        const lost = !mAWon;
        const facedAnyOpp = mTeamB.some((oppId) => losingPlayerIds.includes(oppId));
        return lost && facedAnyOpp;
      }
      if (sIsOnB) {
        const lost = mAWon;
        const facedAnyOpp = mTeamA.some((oppId) => losingPlayerIds.includes(oppId));
        return lost && facedAnyOpp;
      }
      return false;
    });
  });

  // 각 참가 선수별로 개별 RP 변동 및 보너스 계산
  const playerStats = activePlayers.map((p) => {
    const student = students.find((s) => s.id === p.id);
    if (!student) return null;

    const won = p.isA ? aWon : !aWon;
    const oppIds = p.isA 
      ? [playerBId, playerB2Id].filter(Boolean) as string[] 
      : [playerAId, playerA2Id].filter(Boolean) as string[];
    const opponents = students.filter((s) => oppIds.includes(s.id));

    let underdogBonus = 0;
    let firstWinBonus = 0;
    let revengeBonus = 0;
    let freshnessBonus = 0;
    let streakBonus = 0;
    let mentoringBonus = 0;
    let greatMatchBonus = 0;
    let lossComfortBonus = 0;

    let arrogancePenalty = 0;
    let crushingPenalty = 0;
    let revengeAllowedPenalty = 0;
    let championPenalty = 0;
    let swampPenalty = 0;

    const playerTier = getTier(student.rp, tierThresholds);
    const tierKey = playerTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
    const baseWin = tiers[tierKey]?.winRp ?? 10;
    const baseLoss = tiers[tierKey]?.loseRp ?? 20;

    // freshness 계산 (승패 무관, 양팀 선수 전원 적용)
    if (dynamicBonuses?.freshnessEnabled && isFreshMatch) {
      freshnessBonus = dynamicBonuses.freshnessRp ?? 5;
    }

    let willOfSteelBonus = 0;
    if (won) {
      if (dynamicBonuses?.underdogEnabled && opponents.length > 0) {
        const TIER_NUM: Record<TierName, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
        const myTierNum = TIER_NUM[playerTier as TierName] ?? 0;
        const maxOppRp = Math.max(...opponents.map((o) => o.rp));
        const maxOppTier = getTier(maxOppRp, tierThresholds);
        const maxOppTierNum = TIER_NUM[maxOppTier] ?? 0;
        const tierDiff = maxOppTierNum - myTierNum;
        if (tierDiff === 1) {
          underdogBonus = dynamicBonuses.underdogDiff1Rp ?? 5;
        } else if (tierDiff === 2) {
          underdogBonus = dynamicBonuses.underdogDiff2Rp ?? 10;
        } else if (tierDiff >= 3) {
          underdogBonus = dynamicBonuses.underdogDiff3Rp ?? 15;
        }
      }

      if (dynamicBonuses?.firstWinEnabled) {
        firstWinBonus = student.lastWinDate !== todayYmd ? (dynamicBonuses.firstWinRp ?? 15) : 0;
      }

      if (dynamicBonuses?.revengeEnabled) {
        const sRecentMatches = matches
          .filter((m) => m.playerAId === student.id || m.playerBId === student.id || m.playerA2Id === student.id || m.playerB2Id === student.id)
          .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
          .slice(-20);

        const hasPastLoss = sRecentMatches.some((m) => {
          const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
          const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
          const mAWon = m.scoreA > m.scoreB;
          
          const sIsOnA = mTeamA.includes(student.id);
          const sIsOnB = mTeamB.includes(student.id);
          
          if (sIsOnA) {
            const lost = !mAWon;
            const facedAnyOpp = mTeamB.some((oppId) => oppIds.includes(oppId));
            return lost && facedAnyOpp;
          }
          if (sIsOnB) {
            const lost = mAWon;
            const facedAnyOpp = mTeamA.some((oppId) => oppIds.includes(oppId));
            return lost && facedAnyOpp;
          }
          return false;
        });
        revengeBonus = hasPastLoss ? (dynamicBonuses.revengeRp ?? 10) : 0;
      }

      if (dynamicBonuses?.streakEnabled && playerTier !== "Platinum" && playerTier !== "Diamond") {
        const preStreak = student.currentStreak ?? 0;
        if (preStreak + 1 >= dynamicBonuses.streakWins) {
          streakBonus = dynamicBonuses.streakRp ?? 10;
        }
      }

      if (dynamicBonuses?.greatMatchEnabled) {
        const scoreDiff = Math.abs(scoreA - scoreB);
        if (scoreDiff === 1) {
          greatMatchBonus = dynamicBonuses.greatMatchWin1Rp ?? 10;
        } else if (scoreDiff === 2) {
          greatMatchBonus = dynamicBonuses.greatMatchWin2Rp ?? 5;
        } else if (scoreDiff === 3) {
          greatMatchBonus = dynamicBonuses.greatMatchWin3Rp ?? 2;
        }
      }

      if (dynamicBonuses?.willOfSteelEnabled) {
        const preStreak = student.currentStreak ?? 0;
        if (preStreak <= -3) {
          const lossesCount = Math.abs(preStreak);
          if (lossesCount === 3) {
            willOfSteelBonus = dynamicBonuses.willOfSteel3Rp ?? 10;
          } else if (lossesCount === 4) {
            willOfSteelBonus = dynamicBonuses.willOfSteel4Rp ?? 15;
          } else if (lossesCount >= 5) {
            willOfSteelBonus = dynamicBonuses.willOfSteel5Rp ?? 20;
          }
        }
      }

      if (matchType === "double") {
        const partnerId = p.role === "A" ? playerA2Id : p.role === "A2" ? playerAId : p.role === "B" ? playerB2Id : playerBId;
        if (partnerId) {
          const partner = students.find((s) => s.id === partnerId);
          if (partner) {
            const partnerTier = getTier(partner.rp, tierThresholds);
            const myTierRank = TIER_RANKING[playerTier] ?? 1;
            const partnerTierRank = TIER_RANKING[partnerTier] ?? 1;
            if (dynamicBonuses?.mentoring?.enabled) {
              const minGap = dynamicBonuses.mentoring.minTierGap ?? 1;
              const gap = Math.abs(myTierRank - partnerTierRank);
              if (gap >= minGap) {
                if (myTierRank > partnerTierRank) {
                  mentoringBonus = dynamicBonuses.mentoring.mentorRp ?? 10;
                } else if (myTierRank < partnerTierRank) {
                  mentoringBonus = dynamicBonuses.mentoring.menteeRp ?? 15;
                }
              }
            }
          }
        }
      }
    } else {
      if (dynamicBonuses?.lossComfortEnabled) {
        const maxTier = dynamicBonuses.lossComfortMaxTier || "Silver";
        const maxTierRank = TIER_RANKING[maxTier] ?? 2;
        const playerTierRank = TIER_RANKING[playerTier] ?? 1;
        if (playerTierRank <= maxTierRank) {
          const preStreak = student.currentStreak ?? 0;
          const currentLossStreak = preStreak <= 0 ? Math.abs(preStreak) + 1 : 1;
          if (currentLossStreak >= 2) {
            lossComfortBonus = dynamicBonuses.lossComfortRp ?? 5;
          }
        }
      }

      if (dynamicBonuses?.greatMatchEnabled) {
        const scoreDiff = Math.abs(scoreA - scoreB);
        if (scoreDiff === 1) {
          greatMatchBonus = dynamicBonuses.greatMatchLose1Rp ?? 5;
        } else if (scoreDiff === 2) {
          greatMatchBonus = dynamicBonuses.greatMatchLose2Rp ?? 2;
        } else if (scoreDiff === 3) {
          greatMatchBonus = dynamicBonuses.greatMatchLose3Rp ?? 0;
        }
      }

      const isGoldPlus = playerTier === "Gold" || playerTier === "Platinum" || playerTier === "Diamond";
      if (isGoldPlus && opponents.length > 0) {
        const playerTierRank = TIER_RANKING[playerTier] ?? 1;
        const maxOppRp = Math.max(...opponents.map((o) => o.rp));
        const maxOppTier = getTier(maxOppRp, tierThresholds);
        const maxOppTierRank = TIER_RANKING[maxOppTier] ?? 1;

        if (dynamicPenalties?.arrogance && playerTierRank - maxOppTierRank >= 2) {
          if (playerTier === "Gold") arrogancePenalty = dynamicPenalties.arroganceGold ?? 20;
          else if (playerTier === "Platinum") arrogancePenalty = dynamicPenalties.arrogancePlatinum ?? 30;
          else if (playerTier === "Diamond") arrogancePenalty = dynamicPenalties.arroganceDiamond ?? 40;
        }

        if (dynamicPenalties?.crushing && Math.abs(scoreA - scoreB) >= 5) {
          if (playerTier === "Gold") crushingPenalty = dynamicPenalties.crushingGold ?? 10;
          else if (playerTier === "Platinum") crushingPenalty = dynamicPenalties.crushingPlatinum ?? 15;
          else if (playerTier === "Diamond") crushingPenalty = dynamicPenalties.crushingDiamond ?? 20;
        }

        if (dynamicPenalties?.revengeFail && winningTeamGotRevenge) {
          if (playerTier === "Gold") revengeAllowedPenalty = dynamicPenalties.revengeAllowedGold ?? 10;
          else if (playerTier === "Platinum") revengeAllowedPenalty = dynamicPenalties.revengeAllowedPlatinum ?? 15;
          else if (playerTier === "Diamond") revengeAllowedPenalty = dynamicPenalties.revengeAllowedDiamond ?? 20;
        }

        if (dynamicPenalties?.championWeight) {
          if (playerTier === "Gold") championPenalty = dynamicPenalties.championGold ?? 5;
          else if (playerTier === "Platinum") championPenalty = dynamicPenalties.championPlatinum ?? 10;
          else if (playerTier === "Diamond") championPenalty = dynamicPenalties.championDiamond ?? 15;
        }

        if (dynamicPenalties?.lossStreak) {
          const preStreak = student.currentStreak ?? 0;
          const currentLossStreak = preStreak <= 0 ? Math.abs(preStreak) + 1 : 1;
          if (currentLossStreak === 2) {
            if (playerTier === "Gold") swampPenalty = dynamicPenalties.swampGold2 ?? 5;
            else if (playerTier === "Platinum") swampPenalty = dynamicPenalties.swampPlatinum2 ?? 10;
            else if (playerTier === "Diamond") swampPenalty = dynamicPenalties.swampDiamond2 ?? 15;
          } else if (currentLossStreak >= 3) {
            if (playerTier === "Gold") swampPenalty = dynamicPenalties.swampGold3 ?? 10;
            else if (playerTier === "Platinum") swampPenalty = dynamicPenalties.swampPlatinum3 ?? 15;
            else if (playerTier === "Diamond") swampPenalty = dynamicPenalties.swampDiamond3 ?? 25;
          }
        }
      }
    }

    const delta = won 
      ? (baseWin + underdogBonus + freshnessBonus + streakBonus + greatMatchBonus + mentoringBonus + firstWinBonus + revengeBonus + willOfSteelBonus)
      : (-baseLoss + freshnessBonus + lossComfortBonus + greatMatchBonus - (arrogancePenalty + crushingPenalty + revengeAllowedPenalty + championPenalty + swampPenalty));

    return {
      id: student.id,
      role: p.role,
      isA: p.isA,
      won,
      delta,
      underdogBonus,
      scoreDiffBonus: 0,
      rivalBonus: 0,
      firstWinBonus,
      revengeBonus,
      freshnessBonus,
      streakBonus,
      comebackBonus: 0,
      marginBonus: 0,
      mentoringBonus,
      greatMatchBonus,
      lossComfortBonus,
      willOfSteelBonus,
      arrogancePenalty,
      crushingPenalty,
      revengeAllowedPenalty,
      championPenalty,
      swampPenalty
    };
  }).filter(Boolean) as PlayerStat[];

  const statA = playerStats.find((p) => p.role === "A");
  const statB = playerStats.find((p) => p.role === "B");
  const statA2 = playerStats.find((p) => p.role === "A2");
  const statB2 = playerStats.find((p) => p.role === "B2");

  const match: Match = { 
    id: matchId, 
    playerAId, 
    playerBId, 
    playerA2Id,
    playerB2Id,
    scoreA, 
    scoreB, 
    date: matchDate,
    matchType,
    rpDeltaA: statA?.delta,
    rpDeltaB: statB?.delta,
    rpDeltaA2: statA2?.delta,
    rpDeltaB2: statB2?.delta,
    underdogBonusA: statA?.underdogBonus,
    underdogBonusB: statB?.underdogBonus,
    underdogBonusA2: statA2?.underdogBonus,
    underdogBonusB2: statB2?.underdogBonus,
    scoreDiffBonusA: 0,
    scoreDiffBonusB: 0,
    scoreDiffBonusA2: 0,
    scoreDiffBonusB2: 0,
    rivalBonusA: 0,
    rivalBonusB: 0,
    rivalBonusA2: 0,
    rivalBonusB2: 0,
    firstWinBonusA: statA?.firstWinBonus,
    firstWinBonusB: statB?.firstWinBonus,
    firstWinBonusA2: statA2?.firstWinBonus,
    firstWinBonusB2: statB2?.firstWinBonus,
    revengeBonusA: statA?.revengeBonus,
    revengeBonusB: statB?.revengeBonus,
    revengeBonusA2: statA2?.revengeBonus,
    revengeBonusB2: statB2?.revengeBonus,
    freshnessBonusA: statA?.freshnessBonus,
    freshnessBonusB: statB?.freshnessBonus,
    freshnessBonusA2: statA2?.freshnessBonus,
    freshnessBonusB2: statB2?.freshnessBonus,
    streakBonusA: statA?.streakBonus,
    streakBonusB: statB?.streakBonus,
    streakBonusA2: statA2?.streakBonus,
    streakBonusB2: statB2?.streakBonus,
    comebackBonusA: 0,
    comebackBonusB: 0,
    comebackBonusA2: 0,
    comebackBonusB2: 0,
    marginBonusA: 0,
    marginBonusB: 0,
    marginBonusA2: 0,
    marginBonusB2: 0,
    mentoringBonusA: statA?.mentoringBonus,
    mentoringBonusB: statB?.mentoringBonus,
    mentoringBonusA2: statA2?.mentoringBonus,
    mentoringBonusB2: statB2?.mentoringBonus,
    greatMatchBonusA: statA?.greatMatchBonus,
    greatMatchBonusB: statB?.greatMatchBonus,
    greatMatchBonusA2: statA2?.greatMatchBonus,
    greatMatchBonusB2: statB2?.greatMatchBonus,
    lossComfortBonusA: statA?.lossComfortBonus,
    lossComfortBonusB: statB?.lossComfortBonus,
    lossComfortBonusA2: statA2?.lossComfortBonus,
    lossComfortBonusB2: statB2?.lossComfortBonus,
    arrogancePenaltyA: statA?.arrogancePenalty,
    arrogancePenaltyB: statB?.arrogancePenalty,
    arrogancePenaltyA2: statA2?.arrogancePenalty,
    arrogancePenaltyB2: statB2?.arrogancePenalty,
    crushingPenaltyA: statA?.crushingPenalty,
    crushingPenaltyB: statB?.crushingPenalty,
    crushingPenaltyA2: statA2?.crushingPenalty,
    crushingPenaltyB2: statB2?.crushingPenalty,
    revengeAllowedPenaltyA: statA?.revengeAllowedPenalty,
    revengeAllowedPenaltyB: statB?.revengeAllowedPenalty,
    revengeAllowedPenaltyA2: statA2?.revengeAllowedPenalty,
    revengeAllowedPenaltyB2: statB2?.revengeAllowedPenalty,
    championPenaltyA: statA?.championPenalty,
    championPenaltyB: statB?.championPenalty,
    championPenaltyA2: statA2?.championPenalty,
    championPenaltyB2: statB2?.championPenalty,
    swampPenaltyA: statA?.swampPenalty,
    swampPenaltyB: statB?.swampPenalty,
    swampPenaltyA2: statA2?.swampPenalty,
    swampPenaltyB2: statB2?.swampPenalty,
    willOfSteelBonusA: statA?.willOfSteelBonus,
    willOfSteelBonusB: statB?.willOfSteelBonus,
    willOfSteelBonusA2: statA2?.willOfSteelBonus,
    willOfSteelBonusB2: statB2?.willOfSteelBonus,
  };

  const nextStudents = students.map((s) => {
    const pStat = playerStats.find((p) => p.id === s.id);
    if (!pStat) return s;

    const won = pStat.won;
    const delta = pStat.delta;

    const preRp = s.rp;
    const preTier = getTier(preRp, tierThresholds);
    const preTierRank = TIER_RANKING[preTier] ?? 1;

    let nextRp = preRp + delta;
    let nextShields = s.demotionShields ?? 0;

    if (won) {
      const tentativeTier = getTier(nextRp, tierThresholds);
      const tentativeTierRank = TIER_RANKING[tentativeTier] ?? 1;
      if (tentativeTierRank > preTierRank) {
        nextShields = 3; // 승급 시 방어막 3회 완충
      }
      nextRp = Math.max(0, nextRp);
    } else {
      const minThreshold = tierThresholds[preTier] ?? 0;
      if (nextRp < minThreshold && preTier !== "Bronze") {
        if (nextShields >= 1) {
          nextRp = minThreshold; // 강등 방어막 가동
          nextShields = nextShields - 1;
        } else {
          nextRp = Math.max(0, nextRp); // 방어막이 소진되어 강등
        }
      } else {
        nextRp = Math.max(0, nextRp);
      }
    }

    const preStreak = s.currentStreak ?? 0;
    const nextStreak = won 
      ? (preStreak >= 0 ? preStreak + 1 : 1)
      : (preStreak <= 0 ? preStreak - 1 : -1);

    return {
      ...s,
      rp: nextRp,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      recent: [(won ? "W" : "L") as "W" | "L", ...s.recent].slice(0, 5),
      demotionShields: nextShields,
      lastMatchDate: matchDate,
      lastWinDate: won ? todayYmd : s.lastWinDate,
      currentStreak: nextStreak,
    };
  });

  // 승리팀 중 실시간 승급 효과 감지
  const promotedPlayers = playerStats.filter((ps) => {
    if (!ps.won) return false;
    const s = students.find((st) => st.id === ps.id);
    if (!s) return false;
    const finalRp = s.rp + ps.delta;
    const prevTier = getTier(s.rp, tierThresholds);
    const finalTier = getTier(finalRp, tierThresholds);
    const prevSub = getTierSubdivision(s.rp, tierThresholds);
    const finalSub = getTierSubdivision(finalRp, tierThresholds);
    
    const basePromoted = TIER_ORDER.indexOf(finalTier) < TIER_ORDER.indexOf(prevTier);
    const subPromoted = finalTier === prevTier && finalSub < prevSub;
    return basePromoted || subPromoted;
  });

  const promotions: PromotionEventInfo[] = [];
  promotedPlayers.forEach((ps) => {
    const s = students.find((st) => st.id === ps.id);
    if (s) {
      const finalRp = s.rp + ps.delta;
      const currentLabel = getFullTierLabel(finalRp, tierThresholds);
      promotions.push({
        isPromoted: true,
        newTier: currentLabel,
        studentName: s.name
      });
    }
  });

  return {
    playerStats,
    nextStudents,
    match,
    promotions
  };
}
