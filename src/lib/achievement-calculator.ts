import type { Student, Match, Achievement, TierName } from "./league-types";
import { getTier } from "./league-types";

const TIER_RANKING: Record<TierName, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5
};

export function calculateAchievements(
  students: Student[],
  matches: Match[],
  tierThresholds: any,
  studentId: string
): Achievement[] {
  const student = students.find((s) => s.id === studentId);
  if (!student) return [];

  // 해당 학생이 참여한 모든 경기 필터링 (단식 및 복식 파트너 참여분 포함)
  const studentMatches = matches.filter(
    (m) => m.playerAId === studentId || m.playerBId === studentId || m.playerA2Id === studentId || m.playerB2Id === studentId
  );

  // 경기 기록 시간순 정렬 (과거에서 최신순)
  const chronologicalMatches = [...studentMatches].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const totalGames = studentMatches.length;
  const totalLosses = chronologicalMatches.filter((m) => {
    const isPlayerA = m.playerAId === studentId || m.playerA2Id === studentId;
    const aWon = m.scoreA > m.scoreB;
    const won = isPlayerA ? aWon : !aWon;
    return !won;
  }).length;

  // 연승, 연패, 스냅 연산
  let maxWinStreak = 0;
  let currentWinStreak = 0;
  let maxLossStreak = 0;
  let currentLossStreak = 0;
  let brokeLossStreakOf4Plus = false;

  chronologicalMatches.forEach((m) => {
    const isPlayerA = m.playerAId === studentId || m.playerA2Id === studentId;
    const aWon = m.scoreA > m.scoreB;
    const won = isPlayerA ? aWon : !aWon;

    if (won) {
      currentWinStreak++;
      if (currentLossStreak >= 4) {
        brokeLossStreakOf4Plus = true;
      }
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) {
        maxWinStreak = currentWinStreak;
      }
    } else {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) {
        maxLossStreak = currentLossStreak;
      }
    }
  });

  // 자신보다 높은 티어와 대결한 횟수 (승패 무관)
  let higherTierCount = 0;
  chronologicalMatches.forEach((m) => {
    const isOnTeamA = m.playerAId === studentId || m.playerA2Id === studentId;
    const oppIds = isOnTeamA 
      ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[] 
      : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
    
    const hasHigherTierOpponent = oppIds.some((id) => {
      const opponent = students.find((s) => s.id === id);
      if (opponent) {
        const playerTier = getTier(student.rp, tierThresholds);
        const oppTier = getTier(opponent.rp, tierThresholds);
        const playerTierRank = TIER_RANKING[playerTier] ?? 1;
        const oppTierRank = TIER_RANKING[oppTier] ?? 1;
        return oppTierRank > playerTierRank;
      }
      return false;
    });
    
    if (hasHigherTierOpponent) {
      higherTierCount++;
    }
  });

  // 동일 날짜에 5경기 이상 참여 확인
  const dateCounts: Record<string, number> = {};
  studentMatches.forEach((m) => {
    const d = new Date(m.date);
    const dateStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
  });
  const maxMatchesOnSingleDay = Object.values(dateCounts).reduce((max, val) => Math.max(max, val), 0);

  // 복수전 성공 보너스 누적 횟수
  const revengeCount = studentMatches.filter((m) => {
    const isPlayerA = m.playerAId === studentId;
    return isPlayerA ? (m.revengeBonusA ?? 0) > 0 : (m.revengeBonusB ?? 0) > 0;
  }).length;

  // 라이벌 격퇴 보너스 누적 횟수
  const rivalCount = studentMatches.filter((m) => {
    const isPlayerA = m.playerAId === studentId;
    return isPlayerA ? (m.rivalBonusA ?? 0) > 0 : (m.rivalBonusB ?? 0) > 0;
  }).length;

  return [
    // Common (커먼)
    {
      id: "court_first_greeting",
      name: "코트의 첫인사",
      description: "리그 첫 경기 기록 완료",
      tier: "Common",
      currentValue: totalGames >= 1 ? 1 : 0,
      targetValue: 1,
      isUnlocked: totalGames >= 1
    },
    {
      id: "warmup_complete",
      name: "워밍업 완료",
      description: "누적 경기 수 10회 달성",
      tier: "Common",
      currentValue: totalGames,
      targetValue: 10,
      isUnlocked: totalGames >= 10
    },
    {
      id: "taste_of_victory",
      name: "승리의 맛",
      description: "3연승 달성",
      tier: "Common",
      currentValue: maxWinStreak,
      targetValue: 3,
      isUnlocked: maxWinStreak >= 3
    },
    {
      id: "unbroken_heart",
      name: "꺾이지 않는 마음",
      description: "3연패 기록 (실패를 부끄러워하지 않는 태도 칭찬)",
      tier: "Common",
      currentValue: maxLossStreak,
      targetValue: 3,
      isUnlocked: maxLossStreak >= 3
    },
    // Rare (레어)
    {
      id: "iron_stamina",
      name: "강철 체력",
      description: "누적 경기 수 30회 달성",
      tier: "Rare",
      currentValue: totalGames,
      targetValue: 30,
      isUnlocked: totalGames >= 30
    },
    {
      id: "courageous_challenger",
      name: "용기 있는 도전자",
      description: "자신보다 티어가 높은 상대와 10회 대결 진행 (승패 무관)",
      tier: "Rare",
      currentValue: higherTierCount,
      targetValue: 10,
      isUnlocked: higherTierCount >= 10
    },
    {
      id: "gym_spirit",
      name: "체육관 지박령",
      description: "동일한 날짜에 5경기 이상 참여",
      tier: "Rare",
      currentValue: maxMatchesOnSingleDay,
      targetValue: 5,
      isUnlocked: maxMatchesOnSingleDay >= 5
    },
    {
      id: "unyielding_will",
      name: "불굴의 의지",
      description: "4연패 이상 기록 후 승리하여 연패 사슬 끊어내기",
      tier: "Rare",
      currentValue: brokeLossStreakOf4Plus ? 1 : 0,
      targetValue: 1,
      isUnlocked: brokeLossStreakOf4Plus
    },
    {
      id: "avatar_of_revenge",
      name: "복수의 화신",
      description: "복수전 성공 3회 누적 획득",
      tier: "Rare",
      currentValue: revengeCount,
      targetValue: 3,
      isUnlocked: revengeCount >= 3
    },
    // Epic (에픽)
    {
      id: "court_ruler",
      name: "코트의 지배자",
      description: "누적 경기 수 70회 달성",
      tier: "Epic",
      currentValue: totalGames,
      targetValue: 70,
      isUnlocked: totalGames >= 70
    },
    {
      id: "honorable_sweat",
      name: "명예로운 땀방울",
      description: "누적 패배 수 30회 달성 (실패에 굴하지 않는 스포츠맨십 칭찬)",
      tier: "Epic",
      currentValue: totalLosses,
      targetValue: 30,
      isUnlocked: totalLosses >= 30
    },
    {
      id: "rival_destroyer",
      name: "라이벌 파괴자",
      description: "라이벌 격파 15회 누적 획득",
      tier: "Epic",
      currentValue: rivalCount,
      targetValue: 15,
      isUnlocked: rivalCount >= 15
    },
    // Legendary (레전더리)
    {
      id: "legendary_undefeated",
      name: "무패의 전설",
      description: "10연승 달성",
      tier: "Legendary",
      currentValue: maxWinStreak,
      targetValue: 10,
      isUnlocked: maxWinStreak >= 10
    },
    {
      id: "true_champion",
      name: "진정한 챔피언",
      description: "누적 경기 수 120회 달성 (한 학기 동안 가장 성실하게 참여한 학생)",
      tier: "Legendary",
      currentValue: totalGames,
      targetValue: 120,
      isUnlocked: totalGames >= 120
    }
  ];
}
