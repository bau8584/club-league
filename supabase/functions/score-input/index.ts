// 자동 생성 — 직접 고치지 말고 src.ts 를 고친 뒤 npm run build:fn

// supabase/functions/score-input/src.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/lib/league-types.ts
function getTier(rp, thresholds) {
  const t = thresholds || { Bronze: 0, Silver: 1e3, Gold: 1200, Platinum: 1400, Diamond: 1600 };
  if (rp >= (t.Diamond ?? 1600)) return "Diamond";
  if (rp >= (t.Platinum ?? 1400)) return "Platinum";
  if (rp >= (t.Gold ?? 1200)) return "Gold";
  if (rp >= (t.Silver ?? 1e3)) return "Silver";
  return "Bronze";
}
function getTierSubdivision(rp, thresholds) {
  const t = thresholds || { Bronze: 0, Silver: 1e3, Gold: 1200, Platinum: 1400, Diamond: 1600 };
  const tier = getTier(rp, thresholds);
  if (tier === "Diamond") {
    const diff = rp - (t.Diamond ?? 1600);
    if (diff >= 300) return 1;
    if (diff >= 200) return 2;
    if (diff >= 100) return 3;
    return 4;
  }
  let currentCutoff = 0;
  let nextCutoff = 1e3;
  if (tier === "Bronze") {
    currentCutoff = t.Bronze ?? 0;
    nextCutoff = t.Silver ?? 1e3;
  } else if (tier === "Silver") {
    currentCutoff = t.Silver ?? 1e3;
    nextCutoff = t.Gold ?? 1200;
  } else if (tier === "Gold") {
    currentCutoff = t.Gold ?? 1200;
    nextCutoff = t.Platinum ?? 1400;
  } else if (tier === "Platinum") {
    currentCutoff = t.Platinum ?? 1400;
    nextCutoff = t.Diamond ?? 1600;
  }
  const range = nextCutoff - currentCutoff;
  if (range <= 0) return 4;
  const step = range / 4;
  const relativeRp = rp - currentCutoff;
  if (relativeRp < step) return 4;
  if (relativeRp < 2 * step) return 3;
  if (relativeRp < 3 * step) return 2;
  return 1;
}
function getFullTierLabel(rp, thresholds) {
  const tier = getTier(rp, thresholds);
  const sub = getTierSubdivision(rp, thresholds);
  const style = TIER_STYLES[tier];
  return `${style.label} ${sub}`;
}
var TIER_ORDER = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
var TIER_STYLES = {
  Bronze: { bg: "bg-tier-bronze/15", text: "text-tier-bronze", ring: "ring-tier-bronze/40", label: "\uBE0C\uB860\uC988" },
  Silver: { bg: "bg-tier-silver/15", text: "text-tier-silver", ring: "ring-tier-silver/40", label: "\uC2E4\uBC84" },
  Gold: { bg: "bg-tier-gold/15", text: "text-tier-gold", ring: "ring-tier-gold/40", label: "\uACE8\uB4DC" },
  Platinum: { bg: "bg-tier-platinum/15", text: "text-tier-platinum", ring: "ring-tier-platinum/40", label: "\uD50C\uB798\uD2F0\uB118" },
  Diamond: { bg: "bg-tier-diamond/15", text: "text-tier-diamond", ring: "ring-tier-diamond/40", label: "\uB2E4\uC774\uC544\uBAAC\uB4DC" }
};

// src/domain/match-calculator.ts
var TIER_RANKING = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5
};
var isUpper = (tier) => tier === "Platinum" || tier === "Diamond";
var upperRp = (tier, plat, dia, fallback) => tier === "Diamond" ? dia ?? plat ?? fallback : plat ?? fallback;
function rivalClashBonus(b, myTier, maxOppTier) {
  if (!b?.rivalEnabled || !isUpper(myTier) || !maxOppTier) return 0;
  if (TIER_RANKING[maxOppTier] < TIER_RANKING[myTier]) return 0;
  return upperRp(myTier, b.rivalPlatinumRp, b.rivalDiamondRp, 6);
}
function upperStreakBonus(b, myTier, streakAfterWin) {
  if (!b?.streakUpperEnabled || !isUpper(myTier)) return 0;
  if (streakAfterWin < (b.streakWins ?? 3)) return 0;
  return upperRp(myTier, b.streakUpperPlatinumRp, b.streakUpperDiamondRp, 5);
}
function mentoringBonusOf(b, myTier, partnerTier) {
  const m = b?.mentoring;
  if (!m?.enabled) return 0;
  const gap = Math.abs(TIER_RANKING[myTier] - TIER_RANKING[partnerTier]);
  if (gap < (m.minTierGap ?? 1)) return 0;
  if (TIER_RANKING[myTier] > TIER_RANKING[partnerTier]) {
    const minTier = m.mentorMinTier ?? "Bronze";
    if (TIER_RANKING[myTier] < TIER_RANKING[minTier]) return 0;
    return upperRp(myTier, m.mentorRp, m.mentorDiamondRp, 10);
  }
  if (TIER_RANKING[myTier] < TIER_RANKING[partnerTier]) return m.menteeRp ?? 0;
  return 0;
}
function calculateMatchResult(input) {
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
  const activePlayers = [
    { id: playerAId, role: "A", isA: true },
    { id: playerA2Id, role: "A2", isA: true },
    { id: playerBId, role: "B", isA: false },
    { id: playerB2Id, role: "B2", isA: false }
  ].filter((p) => p.id !== void 0 && p.id !== "");
  let isFreshMatch = false;
  if (dynamicBonuses?.freshnessEnabled) {
    const teamAIds = [playerAId, playerA2Id].filter(Boolean);
    const teamBIds = [playerBId, playerB2Id].filter(Boolean);
    const gamesLimit = dynamicBonuses.freshnessGames || 5;
    const teamAHasFacedTeamB = teamAIds.some((memberId) => {
      const memberMatches = matches.filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId).sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(-gamesLimit);
      return memberMatches.some((m) => {
        const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
        return teamBIds.some((bId) => mPlayers.includes(bId));
      });
    });
    const teamBHasFacedTeamA = teamBIds.some((memberId) => {
      const memberMatches = matches.filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId).sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(-gamesLimit);
      return memberMatches.some((m) => {
        const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
        return teamAIds.some((aId) => mPlayers.includes(aId));
      });
    });
    isFreshMatch = !teamAHasFacedTeamB && !teamBHasFacedTeamA;
  }
  const winningPlayerIds = aWon ? [playerAId, playerA2Id].filter(Boolean) : [playerBId, playerB2Id].filter(Boolean);
  const losingPlayerIds = aWon ? [playerBId, playerB2Id].filter(Boolean) : [playerAId, playerA2Id].filter(Boolean);
  const winningTeamGotRevenge = winningPlayerIds.some((wId) => {
    if (!dynamicBonuses?.revengeEnabled) return false;
    const s = students.find((st) => st.id === wId);
    if (!s) return false;
    const sRecentMatches = matches.filter((m) => m.playerAId === wId || m.playerBId === wId || m.playerA2Id === wId || m.playerB2Id === wId).sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(-20);
    return sRecentMatches.some((m) => {
      const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean);
      const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean);
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
  const playerStats = activePlayers.map((p) => {
    const student = students.find((s) => s.id === p.id);
    if (!student) return null;
    const won = p.isA ? aWon : !aWon;
    const oppIds = p.isA ? [playerBId, playerB2Id].filter(Boolean) : [playerAId, playerA2Id].filter(Boolean);
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
    const tierKey = playerTier.toLowerCase();
    const baseWin = tiers[tierKey]?.winRp ?? 10;
    const baseLoss = tiers[tierKey]?.loseRp ?? 20;
    if (dynamicBonuses?.freshnessEnabled && isFreshMatch) {
      freshnessBonus = dynamicBonuses.freshnessRp ?? 5;
    }
    let willOfSteelBonus = 0;
    let rivalBonus = 0;
    if (won) {
      if (opponents.length > 0) {
        const maxOppTier = getTier(Math.max(...opponents.map((o) => o.rp)), tierThresholds);
        rivalBonus = rivalClashBonus(dynamicBonuses, playerTier, maxOppTier);
      }
      if (dynamicBonuses?.underdogEnabled && opponents.length > 0) {
        const TIER_NUM = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
        const myTierNum = TIER_NUM[playerTier] ?? 0;
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
        firstWinBonus = student.lastWinDate !== todayYmd ? dynamicBonuses.firstWinRp ?? 15 : 0;
      }
      if (dynamicBonuses?.revengeEnabled) {
        const sRecentMatches = matches.filter((m) => m.playerAId === student.id || m.playerBId === student.id || m.playerA2Id === student.id || m.playerB2Id === student.id).sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(-20);
        const hasPastLoss = sRecentMatches.some((m) => {
          const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean);
          const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean);
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
        revengeBonus = hasPastLoss ? dynamicBonuses.revengeRp ?? 10 : 0;
      }
      if (dynamicBonuses?.streakEnabled && playerTier !== "Platinum" && playerTier !== "Diamond") {
        const preStreak = student.currentStreak ?? 0;
        if (preStreak + 1 >= dynamicBonuses.streakWins) {
          streakBonus = dynamicBonuses.streakRp ?? 10;
        }
      }
      streakBonus += upperStreakBonus(dynamicBonuses, playerTier, (student.currentStreak ?? 0) + 1);
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
            mentoringBonus = mentoringBonusOf(dynamicBonuses, playerTier, getTier(partner.rp, tierThresholds));
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
        if (dynamicPenalties?.crushing && Math.abs(scoreA - scoreB) >= (dynamicPenalties.crushingMargin ?? 10)) {
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
    const delta = won ? baseWin + underdogBonus + freshnessBonus + streakBonus + greatMatchBonus + mentoringBonus + firstWinBonus + revengeBonus + willOfSteelBonus + rivalBonus : -baseLoss + freshnessBonus + lossComfortBonus + greatMatchBonus - (arrogancePenalty + crushingPenalty + revengeAllowedPenalty + championPenalty + swampPenalty);
    return {
      id: student.id,
      role: p.role,
      isA: p.isA,
      won,
      delta,
      underdogBonus,
      scoreDiffBonus: 0,
      rivalBonus,
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
  }).filter(Boolean);
  const statA = playerStats.find((p) => p.role === "A");
  const statB = playerStats.find((p) => p.role === "B");
  const statA2 = playerStats.find((p) => p.role === "A2");
  const statB2 = playerStats.find((p) => p.role === "B2");
  const match = {
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
    rivalBonusA: statA?.rivalBonus,
    rivalBonusB: statB?.rivalBonus,
    rivalBonusA2: statA2?.rivalBonus,
    rivalBonusB2: statB2?.rivalBonus,
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
    willOfSteelBonusB2: statB2?.willOfSteelBonus
  };
  const nextStudents = students.map((s) => {
    const pStat = playerStats.find((p) => p.id === s.id);
    if (!pStat) return s;
    const won = pStat.won;
    const delta = pStat.delta;
    const preRp = s.rp;
    const nextRp = Math.max(0, preRp + delta);
    const preStreak = s.currentStreak ?? 0;
    const nextStreak = won ? preStreak >= 0 ? preStreak + 1 : 1 : preStreak <= 0 ? preStreak - 1 : -1;
    return {
      ...s,
      rp: nextRp,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      recent: [won ? "W" : "L", ...s.recent].slice(0, 5),
      lastMatchDate: matchDate,
      lastWinDate: won ? todayYmd : s.lastWinDate,
      currentStreak: nextStreak
    };
  });
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
  const promotions = [];
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

// src/domain/calc-context.ts
function mapMatchRow(m) {
  return {
    id: m.id,
    playerAId: m.winner_id,
    playerBId: m.loser_id,
    playerA2Id: m.winner2_id ?? void 0,
    playerB2Id: m.loser2_id ?? void 0,
    scoreA: m.winner_score ?? 21,
    scoreB: m.loser_score ?? 19,
    // playerA=winner_id 로 매핑되므로 승자 델타→A, 패자 델타→B 로 자동 정합.
    // 과거(마이그레이션 이전) 경기는 NULL → undefined 로 두어 deleteMatch fallback 이 동작.
    rpDeltaA: m.rp_delta_winner ?? void 0,
    rpDeltaB: m.rp_delta_loser ?? void 0,
    rpDeltaA2: m.rp_delta_winner2 ?? void 0,
    rpDeltaB2: m.rp_delta_loser2 ?? void 0,
    date: m.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    matchType: m.winner2_id ? "double" : "single",
    rpBreakdown: m.rp_breakdown ?? null
  };
}
var localYmd = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1e3).toISOString().split("T")[0];
};
var seoulYmd = (iso) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1e3).toISOString().split("T")[0];
function mapPlayerRows(dbStudents, matchesList, ymdOf = localYmd) {
  const list = (dbStudents || []).map((s) => {
    const group = s.group_label ?? null;
    const name = s.name || s.display_name || s.nickname || "\uC774\uB984\uC5C6\uC74C";
    const gender = s.gender || "U";
    const isWinnerSide = (m) => m.playerAId === s.id || m.playerA2Id === s.id;
    const isLoserSide = (m) => m.playerBId === s.id || m.playerB2Id === s.id;
    const studentMatches = matchesList.filter((m) => isWinnerSide(m) || isLoserSide(m)).sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
    const wins = studentMatches.filter(isWinnerSide).length;
    const losses = studentMatches.filter(isLoserSide).length;
    const recent = studentMatches.slice(0, 5).map((m) => isWinnerSide(m) ? "W" : "L");
    const lastMatch = studentMatches[0];
    const lastWin = studentMatches.find(isWinnerSide);
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
      rp: s.rp || 1e3,
      wins,
      losses,
      recent,
      currentStreak,
      lastMatchDate: lastMatch?.date,
      lastWinDate: lastWin ? ymdOf(lastWin.date) : void 0
    };
  });
  list.sort((a, b) => b.rp - a.rp);
  return list;
}
function sortMatchesNewestFirst(list) {
  return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// src/lib/league-presets.ts
var STANDARD_BONUSES = {
  freshnessEnabled: true,
  freshnessGames: 5,
  freshnessRp: 5,
  streakEnabled: true,
  streakWins: 3,
  streakRp: 8,
  firstWinEnabled: true,
  firstWinRp: 12,
  revengeEnabled: true,
  revengeRp: 8,
  underdogEnabled: true,
  underdogDiff1Rp: 6,
  underdogDiff2Rp: 12,
  underdogDiff3Rp: 20,
  greatMatchEnabled: true,
  greatMatchRp: 8,
  greatMatchWin1Rp: 8,
  greatMatchLose1Rp: 4,
  greatMatchWin2Rp: 5,
  greatMatchLose2Rp: 2,
  greatMatchWin3Rp: 2,
  greatMatchLose3Rp: 0,
  lossComfortEnabled: true,
  lossComfortRp: 4,
  lossComfortMaxTier: "Silver",
  willOfSteelEnabled: true,
  willOfSteel3Rp: 8,
  willOfSteel4Rp: 12,
  willOfSteel5Rp: 16,
  rivalEnabled: true,
  rivalPlatinumRp: 6,
  rivalDiamondRp: 8,
  streakUpperEnabled: true,
  streakUpperPlatinumRp: 5,
  streakUpperDiamondRp: 6,
  mentoring: { enabled: true, mentorRp: 5, mentorDiamondRp: 7, menteeRp: 0, minTierGap: 1, mentorMinTier: "Platinum" }
};
var STANDARD_PENALTIES = {
  enabled: true,
  arrogance: true,
  crushing: true,
  revengeFail: false,
  championWeight: true,
  lossStreak: true,
  arroganceGold: 10,
  arrogancePlatinum: 18,
  arroganceDiamond: 25,
  crushingMargin: 10,
  crushingGold: 6,
  crushingPlatinum: 9,
  crushingDiamond: 12,
  revengeAllowedGold: 4,
  revengeAllowedPlatinum: 6,
  revengeAllowedDiamond: 8,
  championGold: 0,
  championPlatinum: 4,
  championDiamond: 8,
  swampGold2: 0,
  swampGold3: 4,
  swampPlatinum2: 4,
  swampPlatinum3: 8,
  swampDiamond2: 8,
  swampDiamond3: 13,
  redCardPenalty: 10
};
var BONUS_SIG = [
  "firstWinEnabled",
  "firstWinRp",
  "freshnessEnabled",
  "streakEnabled",
  "revengeEnabled",
  "underdogEnabled",
  "underdogDiff1Rp",
  "underdogDiff2Rp",
  "underdogDiff3Rp",
  "greatMatchEnabled",
  "lossComfortEnabled",
  "lossComfortRp",
  "lossComfortMaxTier",
  "willOfSteelEnabled",
  "willOfSteel3Rp",
  "willOfSteel4Rp",
  "willOfSteel5Rp",
  "rivalEnabled",
  "rivalPlatinumRp",
  "rivalDiamondRp",
  "streakUpperEnabled",
  "streakUpperPlatinumRp",
  "streakUpperDiamondRp"
];
var BONUS_PRESETS = {
  /**
   * 상위 전용 셋(정상 결전·상위 연승·캐리)의 눈금. 균형은 셋 다 켜서 플래 본전 ~51%.
   * 독려는 캐리를 조금 올리고(강자가 약한 짝을 끌어주는 게 곧 독려) 상위 연승은 일반 연승과
   * 같이 끈다. 경쟁은 실력만 남긴다 — 정상 결전만, 그것도 크게.
   */
  balanced: {
    label: "\u2696\uFE0F \uADE0\uD615",
    desc: "\uAE30\uBCF8. \uC801\uB2F9\uD55C \uCC38\uC5EC \uBCF4\uC0C1 + \uC0C1\uC704 \uC804\uC6A9 \uBCF4\uB108\uC2A4",
    fields: {
      firstWinEnabled: true,
      firstWinRp: 12,
      freshnessEnabled: true,
      freshnessRp: 5,
      streakEnabled: true,
      streakRp: 8,
      revengeEnabled: true,
      revengeRp: 8,
      underdogEnabled: true,
      underdogDiff1Rp: 6,
      underdogDiff2Rp: 12,
      underdogDiff3Rp: 20,
      greatMatchEnabled: true,
      lossComfortEnabled: true,
      lossComfortRp: 4,
      lossComfortMaxTier: "Silver",
      willOfSteelEnabled: true,
      willOfSteel3Rp: 8,
      willOfSteel4Rp: 12,
      willOfSteel5Rp: 16,
      rivalEnabled: true,
      rivalPlatinumRp: 6,
      rivalDiamondRp: 8,
      streakUpperEnabled: true,
      streakUpperPlatinumRp: 5,
      streakUpperDiamondRp: 6,
      mentoring: { enabled: true, mentorRp: 5, mentorDiamondRp: 7, menteeRp: 0, minTierGap: 1, mentorMinTier: "Platinum" }
    }
  },
  encourage: {
    label: "\u{1F331} \uD558\uC704 \uB3C5\uB824",
    desc: "\uD558\uC704\uAD8C \uC88C\uC808\xB7\uC774\uD0C8 \uBC29\uC9C0. \uC5B8\uB354\uB3C5\xB7\uC704\uB85C\xB7\uC5F0\uD328\uD0C8\uCD9C\u2191, \uC5F0\uC2B9\uC740 \uB054",
    fields: {
      firstWinEnabled: true,
      firstWinRp: 15,
      freshnessEnabled: true,
      freshnessRp: 8,
      streakEnabled: false,
      streakRp: 8,
      revengeEnabled: true,
      revengeRp: 8,
      underdogEnabled: true,
      underdogDiff1Rp: 8,
      underdogDiff2Rp: 16,
      underdogDiff3Rp: 26,
      greatMatchEnabled: true,
      lossComfortEnabled: true,
      lossComfortRp: 8,
      lossComfortMaxTier: "Platinum",
      willOfSteelEnabled: true,
      willOfSteel3Rp: 14,
      willOfSteel4Rp: 20,
      willOfSteel5Rp: 28,
      rivalEnabled: true,
      rivalPlatinumRp: 5,
      rivalDiamondRp: 6,
      streakUpperEnabled: false,
      streakUpperPlatinumRp: 4,
      streakUpperDiamondRp: 5,
      mentoring: { enabled: true, mentorRp: 6, mentorDiamondRp: 8, menteeRp: 0, minTierGap: 1, mentorMinTier: "Platinum" }
    }
  },
  competitive: {
    label: "\u{1F3AF} \uACBD\uC7C1\xB7\uCD5C\uC18C",
    desc: "\uC21C\uC218 \uC2E4\uB825 \uBC18\uC601\xB7\uC815\uD655 \uB4F1\uAE09. \uC5B8\uB354\uB3C5\xB7\uC815\uC0C1 \uACB0\uC804\uB9CC",
    fields: {
      firstWinEnabled: false,
      firstWinRp: 12,
      freshnessEnabled: false,
      freshnessRp: 5,
      streakEnabled: false,
      streakRp: 8,
      revengeEnabled: false,
      revengeRp: 8,
      underdogEnabled: true,
      underdogDiff1Rp: 4,
      underdogDiff2Rp: 8,
      underdogDiff3Rp: 12,
      greatMatchEnabled: false,
      lossComfortEnabled: false,
      lossComfortRp: 4,
      lossComfortMaxTier: "Silver",
      willOfSteelEnabled: false,
      willOfSteel3Rp: 8,
      willOfSteel4Rp: 12,
      willOfSteel5Rp: 16,
      rivalEnabled: true,
      rivalPlatinumRp: 8,
      rivalDiamondRp: 10,
      streakUpperEnabled: false,
      streakUpperPlatinumRp: 5,
      streakUpperDiamondRp: 6,
      mentoring: { enabled: false, mentorRp: 5, mentorDiamondRp: 7, menteeRp: 0, minTierGap: 1, mentorMinTier: "Platinum" }
    }
  }
};
function bonusesFromPreset(key) {
  return { ...STANDARD_BONUSES, ...BONUS_PRESETS[key].fields };
}
function fillNewBonusFields(b) {
  if (b.rivalEnabled !== void 0) return b;
  const legacySig = BONUS_SIG.filter((k) => !String(k).startsWith("rival") && !String(k).startsWith("streakUpper"));
  for (const k of ["balanced", "encourage", "competitive"]) {
    const merged = bonusesFromPreset(k);
    if (legacySig.every((key) => b[key] === merged[key])) {
      const f2 = BONUS_PRESETS[k].fields;
      return {
        ...b,
        rivalEnabled: f2.rivalEnabled,
        rivalPlatinumRp: f2.rivalPlatinumRp,
        rivalDiamondRp: f2.rivalDiamondRp,
        streakUpperEnabled: f2.streakUpperEnabled,
        streakUpperPlatinumRp: f2.streakUpperPlatinumRp,
        streakUpperDiamondRp: f2.streakUpperDiamondRp,
        mentoring: f2.mentoring
      };
    }
  }
  const f = BONUS_PRESETS.balanced.fields;
  return {
    ...b,
    rivalEnabled: f.rivalEnabled,
    rivalPlatinumRp: f.rivalPlatinumRp,
    rivalDiamondRp: f.rivalDiamondRp,
    streakUpperEnabled: f.streakUpperEnabled,
    streakUpperPlatinumRp: f.streakUpperPlatinumRp,
    streakUpperDiamondRp: f.streakUpperDiamondRp,
    mentoring: b.mentoring?.enabled ? b.mentoring : f.mentoring
  };
}

// src/lib/settings-migration.ts
var DEFAULT_TIERS = {
  bronze: { threshold: 0, winRp: 24, loseRp: 6 },
  silver: { threshold: 870, winRp: 20, loseRp: 12 },
  gold: { threshold: 1120, winRp: 16, loseRp: 16 },
  platinum: { threshold: 1400, winRp: 13, loseRp: 21 },
  diamond: { threshold: 1720, winRp: 11, loseRp: 27 }
};
var DEFAULT_DECAY_SETTINGS = {
  bronze: { enabled: false, inactiveDays: 10, decayRp: 5 },
  silver: { enabled: false, inactiveDays: 10, decayRp: 5 },
  gold: { enabled: true, inactiveDays: 10, decayRp: 5 },
  platinum: { enabled: true, inactiveDays: 10, decayRp: 7 },
  diamond: { enabled: true, inactiveDays: 10, decayRp: 10 }
};
var DEFAULT_DYNAMIC_PENALTIES = STANDARD_PENALTIES;
var DEFAULT_DYNAMIC_BONUSES = STANDARD_BONUSES;
function migrateSettings(rawSettings) {
  if (!rawSettings) return null;
  const migrated = { ...rawSettings };
  migrated.matchInputMode = rawSettings.matchInputMode ?? "admin-only";
  if (!migrated.tiers) {
    const th = migrated.tierThresholds || { Bronze: 0, Silver: 870, Gold: 1120, Platinum: 1400, Diamond: 1720 };
    const ts = migrated.tierSettings || {
      Bronze: { winDelta: 24, loseDelta: 6 },
      Silver: { winDelta: 20, loseDelta: 12 },
      Gold: { winDelta: 16, loseDelta: 16 },
      Platinum: { winDelta: 13, loseDelta: 21 }
    };
    const rpv = migrated.rpVariables || { winDelta: 11, loseDelta: 27 };
    migrated.tiers = {
      bronze: {
        threshold: th.Bronze !== void 0 ? Number(th.Bronze) : 0,
        winRp: ts.Bronze?.winDelta !== void 0 ? Number(ts.Bronze.winDelta) : 20,
        loseRp: ts.Bronze?.loseDelta !== void 0 ? Number(ts.Bronze.loseDelta) : 0
      },
      silver: {
        threshold: th.Silver !== void 0 ? Number(th.Silver) : 1e3,
        winRp: ts.Silver?.winDelta !== void 0 ? Number(ts.Silver.winDelta) : 15,
        loseRp: ts.Silver?.loseDelta !== void 0 ? Number(ts.Silver.loseDelta) : 5
      },
      gold: {
        threshold: th.Gold !== void 0 ? Number(th.Gold) : 1200,
        winRp: ts.Gold?.winDelta !== void 0 ? Number(ts.Gold.winDelta) : 15,
        loseRp: ts.Gold?.loseDelta !== void 0 ? Number(ts.Gold.loseDelta) : 10
      },
      platinum: {
        threshold: th.Platinum !== void 0 ? Number(th.Platinum) : 1400,
        winRp: ts.Platinum?.winDelta !== void 0 ? Number(ts.Platinum.winDelta) : 10,
        loseRp: ts.Platinum?.loseDelta !== void 0 ? Number(ts.Platinum.loseDelta) : 15
      },
      diamond: {
        threshold: th.Diamond !== void 0 ? Number(th.Diamond) : 1600,
        winRp: rpv.winDelta !== void 0 ? Number(rpv.winDelta) : 10,
        loseRp: rpv.loseDelta !== void 0 ? Number(rpv.loseDelta) : 20
      }
    };
  } else {
    migrated.tiers = {
      bronze: { ...DEFAULT_TIERS.bronze, ...migrated.tiers.bronze },
      silver: { ...DEFAULT_TIERS.silver, ...migrated.tiers.silver },
      gold: { ...DEFAULT_TIERS.gold, ...migrated.tiers.gold },
      platinum: { ...DEFAULT_TIERS.platinum, ...migrated.tiers.platinum },
      diamond: { ...DEFAULT_TIERS.diamond, ...migrated.tiers.diamond }
    };
  }
  if (!migrated.decaySettings) {
    const enabled = migrated.decayEnabled !== void 0 ? migrated.decayEnabled : false;
    const days = migrated.decayDays !== void 0 ? Number(migrated.decayDays) : 10;
    const amount = migrated.decayAmount !== void 0 ? Number(migrated.decayAmount) : 5;
    const tiersList = migrated.decayTiers || ["Gold", "Platinum", "Diamond"];
    migrated.decaySettings = {
      bronze: { enabled: enabled && tiersList.includes("Bronze"), inactiveDays: days, decayRp: amount },
      silver: { enabled: enabled && tiersList.includes("Silver"), inactiveDays: days, decayRp: amount },
      gold: { enabled: enabled && tiersList.includes("Gold"), inactiveDays: days, decayRp: amount },
      platinum: { enabled: enabled && tiersList.includes("Platinum"), inactiveDays: days, decayRp: amount },
      diamond: { enabled: enabled && tiersList.includes("Diamond"), inactiveDays: days, decayRp: amount }
    };
  } else {
    migrated.decaySettings = {
      bronze: { ...DEFAULT_DECAY_SETTINGS.bronze, ...migrated.decaySettings.bronze },
      silver: { ...DEFAULT_DECAY_SETTINGS.silver, ...migrated.decaySettings.silver },
      gold: { ...DEFAULT_DECAY_SETTINGS.gold, ...migrated.decaySettings.gold },
      platinum: { ...DEFAULT_DECAY_SETTINGS.platinum, ...migrated.decaySettings.platinum },
      diamond: { ...DEFAULT_DECAY_SETTINGS.diamond, ...migrated.decaySettings.diamond }
    };
  }
  if (migrated.dynamicPenalties) {
    const defaultEnabledVal = migrated.dynamicPenalties.enabled !== void 0 ? !!migrated.dynamicPenalties.enabled : true;
    migrated.dynamicPenalties = {
      ...DEFAULT_DYNAMIC_PENALTIES,
      arrogance: migrated.dynamicPenalties.arrogance !== void 0 ? !!migrated.dynamicPenalties.arrogance : defaultEnabledVal,
      crushing: migrated.dynamicPenalties.crushing !== void 0 ? !!migrated.dynamicPenalties.crushing : defaultEnabledVal,
      revengeFail: migrated.dynamicPenalties.revengeFail !== void 0 ? !!migrated.dynamicPenalties.revengeFail : defaultEnabledVal,
      championWeight: migrated.dynamicPenalties.championWeight !== void 0 ? !!migrated.dynamicPenalties.championWeight : defaultEnabledVal,
      lossStreak: migrated.dynamicPenalties.lossStreak !== void 0 ? !!migrated.dynamicPenalties.lossStreak : defaultEnabledVal,
      ...migrated.dynamicPenalties
    };
  } else {
    migrated.dynamicPenalties = { ...DEFAULT_DYNAMIC_PENALTIES };
  }
  if (migrated.dynamicBonuses) {
    const filled = fillNewBonusFields(migrated.dynamicBonuses);
    migrated.dynamicBonuses = {
      ...DEFAULT_DYNAMIC_BONUSES,
      ...filled,
      mentoring: {
        ...DEFAULT_DYNAMIC_BONUSES.mentoring,
        ...filled.mentoring || {}
      }
    };
  } else {
    migrated.dynamicBonuses = { ...DEFAULT_DYNAMIC_BONUSES };
  }
  migrated.tierThresholds = {
    Bronze: Number(migrated.tiers.bronze.threshold),
    Silver: Number(migrated.tiers.silver.threshold),
    Gold: Number(migrated.tiers.gold.threshold),
    Platinum: Number(migrated.tiers.platinum.threshold),
    Diamond: Number(migrated.tiers.diamond.threshold)
  };
  migrated.rpVariables = {
    winDelta: Number(migrated.tiers.diamond.winRp),
    loseDelta: Number(migrated.tiers.diamond.loseRp)
  };
  migrated.tierSettings = {
    Bronze: { winDelta: Number(migrated.tiers.bronze.winRp), loseDelta: Number(migrated.tiers.bronze.loseRp) },
    Silver: { winDelta: Number(migrated.tiers.silver.winRp), loseDelta: Number(migrated.tiers.silver.loseRp) },
    Gold: { winDelta: Number(migrated.tiers.gold.winRp), loseDelta: Number(migrated.tiers.gold.loseRp) },
    Platinum: { winDelta: Number(migrated.tiers.platinum.winRp), loseDelta: Number(migrated.tiers.platinum.loseRp) }
  };
  const isAnyDecayEnabled = Object.values(migrated.decaySettings).some((d) => d.enabled);
  migrated.decayEnabled = isAnyDecayEnabled;
  migrated.decayDays = Number(migrated.decaySettings.platinum.inactiveDays);
  migrated.decayAmount = Number(migrated.decaySettings.platinum.decayRp);
  const decayTiersArr = [];
  if (migrated.decaySettings.bronze.enabled) decayTiersArr.push("Bronze");
  if (migrated.decaySettings.silver.enabled) decayTiersArr.push("Silver");
  if (migrated.decaySettings.gold.enabled) decayTiersArr.push("Gold");
  if (migrated.decaySettings.platinum.enabled) decayTiersArr.push("Platinum");
  if (migrated.decaySettings.diamond.enabled) decayTiersArr.push("Diamond");
  migrated.decayTiers = decayTiersArr;
  return migrated;
}

// src/domain/score-input-calc.ts
function computeScoreInput(input) {
  const { teamA, teamB, scoreA, scoreB } = input;
  if (scoreA === scoreB) throw new Error("\uBE44\uAE34 \uACBD\uAE30\uB294 \uB123\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  const m = migrateSettings(input.settings ?? {});
  const matches = sortMatchesNewestFirst((input.matchRows || []).map(mapMatchRow));
  const students = mapPlayerRows(input.playerRows || [], matches, seoulYmd);
  const [playerAId, playerA2Id] = teamA;
  const [playerBId, playerB2Id] = teamB;
  for (const id of [...teamA, ...teamB]) {
    if (!students.some((s) => s.id === id)) throw new Error("\uC120\uC218\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  }
  const matchType = teamA.length > 1 || teamB.length > 1 ? "double" : "single";
  const { playerStats } = calculateMatchResult({
    students,
    matches,
    playerAId,
    playerBId,
    scoreA,
    scoreB,
    playerA2Id,
    playerB2Id,
    matchType,
    tierThresholds: m.tierThresholds,
    tiers: m.tiers,
    rpVariables: m.rpVariables,
    dynamicBonuses: m.dynamicBonuses,
    dynamicPenalties: m.dynamicPenalties,
    todayYmd: seoulYmd(input.nowIso),
    matchId: input.matchId,
    matchDate: input.nowIso
  });
  const aWon = scoreA > scoreB;
  const winnerId = aWon ? playerAId : playerBId;
  const loserId = aWon ? playerBId : playerAId;
  const winner2Id = (aWon ? playerA2Id : playerB2Id) ?? null;
  const loser2Id = (aWon ? playerB2Id : playerA2Id) ?? null;
  const deltaOf = (id) => id ? playerStats.find((p) => p.id === id)?.delta ?? null : null;
  return {
    winnerId,
    loserId,
    winner2Id,
    loser2Id,
    winnerScore: aWon ? scoreA : scoreB,
    loserScore: aWon ? scoreB : scoreA,
    rpDeltaWinner: deltaOf(winnerId),
    rpDeltaLoser: deltaOf(loserId),
    rpDeltaWinner2: deltaOf(winner2Id),
    rpDeltaLoser2: deltaOf(loser2Id),
    playerStats
  };
}

// supabase/functions/score-input/src.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });
var fail = (message, status = 400) => json({ ok: false, message }, status);
var PLAYER_COLS = "id, league_id, user_id, rp, nickname, name, display_name, group_label, birth_year, grade, class_num, student_no, gender, equipped_title";
var MATCH_COLS = "id, winner_id, loser_id, winner2_id, loser2_id, winner_score, loser_score, rp_delta_winner, rp_delta_loser, rp_delta_winner2, rp_delta_loser2, created_at";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("method-not-allowed", 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return fail("\uC798\uBABB\uB41C \uC694\uCCAD\uC774\uC5D0\uC694.");
  }
  const key = String(body?.key ?? "");
  const scheduledId = String(body?.scheduledId ?? "");
  const scoreA = Number(body?.scoreA), scoreB = Number(body?.scoreB);
  const okScore = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
  if (key.length < 12 || !scheduledId || !okScore(scoreA) || !okScore(scoreB)) return fail("\uC810\uC218\uB97C \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  if (scoreA === scoreB) return fail("\uBE44\uAE34 \uACBD\uAE30\uB294 \uB123\uC744 \uC218 \uC5C6\uC5B4\uC694. \uC774\uAE34 \uD300 \uC810\uC218\uAC00 \uB354 \uCEE4\uC57C \uD574\uC694.");
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
  const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
  const { data: sess } = await db.from("assignment_sessions").select("id, league_id").eq("input_key", key).eq("input_key_day", today).maybeSingle();
  if (!sess) return fail("\uC785\uB825\uC774 \uB2EB\uD614\uC5B4\uC694. \uC120\uC0DD\uB2D8\uAED8 \uC0C8 QR\uC744 \uBC1B\uC544 \uC8FC\uC138\uC694.", 403);
  const { data: row } = await db.from("scheduled_matches").select("id, session_id, status, player_a_id, player_a2_id, player_b_id, player_b2_id").eq("id", scheduledId).maybeSingle();
  if (!row || row.session_id !== sess.id) return fail("\uC774 \uACBD\uAE30\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
  if (row.status !== "waiting" && row.status !== "called") return fail("\uC774\uBBF8 \uAE30\uB85D\uB41C \uACBD\uAE30\uC608\uC694.", 409);
  if (!row.player_a_id || !row.player_b_id) return fail("\uD300\uC774 \uC544\uC9C1 \uC548 \uC815\uD574\uC9C4 \uC904\uC774\uC5D0\uC694.");
  const { data: league } = await db.from("leagues").select("settings").eq("id", sess.league_id).single();
  const season = league?.settings?.season || "\uC2DC\uC98C 1";
  const { data: players, error: pe } = await db.from("players").select(PLAYER_COLS).eq("league_id", sess.league_id).or("is_deleted.is.null,is_deleted.eq.false");
  if (pe) return fail("\uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.", 500);
  const matchRows = [];
  for (let from = 0; ; from += 1e3) {
    const { data, error } = await db.from("matches").select(MATCH_COLS).eq("league_id", sess.league_id).eq("season", season).order("created_at", { ascending: true }).range(from, from + 999);
    if (error) return fail("\uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.", 500);
    matchRows.push(...data || []);
    if (!data || data.length < 1e3) break;
  }
  const matchId = crypto.randomUUID();
  let out;
  try {
    out = computeScoreInput({
      settings: league?.settings,
      playerRows: players || [],
      matchRows,
      teamA: [row.player_a_id, row.player_a2_id].filter(Boolean),
      teamB: [row.player_b_id, row.player_b2_id].filter(Boolean),
      scoreA,
      scoreB,
      matchId,
      nowIso: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    return fail(e.message || "\uACC4\uC0B0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
  }
  const { error: re } = await db.rpc("record_match_by_key", {
    p_key: key,
    p_scheduled_id: scheduledId,
    p_match_id: matchId,
    p_winner_id: out.winnerId,
    p_loser_id: out.loserId,
    p_winner2_id: out.winner2Id,
    p_loser2_id: out.loser2Id,
    p_winner_score: out.winnerScore,
    p_loser_score: out.loserScore,
    p_rp_delta_winner: out.rpDeltaWinner,
    p_rp_delta_loser: out.rpDeltaLoser,
    p_rp_delta_winner2: out.rpDeltaWinner2,
    p_rp_delta_loser2: out.rpDeltaLoser2
  });
  if (re) return fail(re.message || "\uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", 409);
  const aWon = scoreA > scoreB;
  return json({
    ok: true,
    // 학생 화면에 보여 줄 것: 줄의 팀 순서(A/B) 기준 RP 변화
    deltaA: [out.playerStats.find((p) => p.role === "A")?.delta ?? 0, out.playerStats.find((p) => p.role === "A2")?.delta ?? null],
    deltaB: [out.playerStats.find((p) => p.role === "B")?.delta ?? 0, out.playerStats.find((p) => p.role === "B2")?.delta ?? null],
    aWon
  });
});
