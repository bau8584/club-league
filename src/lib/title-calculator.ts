import type { Student, Match, TierName } from "./league-types";
import { getTier } from "./league-types";

// ─────────────────────────────────────────────────────────────
// 호칭(타이틀) 시스템
//
// 모든 호칭은 "이번 시즌" 경기 데이터(students/matches)로 실시간 자동 판정한다.
// 별도 저장/추적 없음. 회원은 획득한 호칭 중 1개를 '대표 호칭'으로 장착(players.equipped_title)한다.
//
// - competitive(경쟁형): 리그에 단 1명만 보유(1위 등). 순위가 바뀌면 주인도 바뀐다.
// - achievement(성취형): 기준을 넘으면 획득(여러 명 가능).
// - style(성격형): 플레이 스타일/근성(여러 명 가능).
// ─────────────────────────────────────────────────────────────

export type TitleRarity = "competitive" | "achievement" | "style";

export type TitleDef = {
  id: string;
  name: string;
  emoji: string;
  rarity: TitleRarity;
  description: string; // 획득 조건 설명
};

// name 은 닉네임 앞에 붙는 '수식어'로 읽히도록 형용사형으로 작성한다("~하는/~한/~된").
export const TITLE_CATALOG: TitleDef[] = [
  // 🏆 경쟁형 — 리그에 1명
  { id: "champion", name: "챔피언", emoji: "👑", rarity: "competitive", description: "현재 RP 1위" },
  { id: "streak_king", name: "불타오르는", emoji: "🔥", rarity: "competitive", description: "현재 최다 연승 보유자 (2연승 이상)" },
  { id: "win_king", name: "승리를 쓸어담는", emoji: "⚔️", rarity: "competitive", description: "이번 시즌 최다 승리" },
  { id: "sniper", name: "빗나가지 않는", emoji: "🎯", rarity: "competitive", description: "10경기 이상 중 승률 1위" },
  { id: "socialite", name: "발 넓은", emoji: "🦋", rarity: "competitive", description: "가장 많은 서로 다른 상대와 경기" },
  { id: "runner_up", name: "정상을 노리는", emoji: "🥈", rarity: "competitive", description: "현재 RP 2위" },
  // 💎 성취형 — 기준 달성 (초보 친화)
  { id: "rookie", name: "갓 입문한", emoji: "🌱", rarity: "achievement", description: "첫 경기 완료" },
  { id: "first_win", name: "첫 승 맛본", emoji: "🎉", rarity: "achievement", description: "첫 승리 달성" },
  { id: "double_digit", name: "열 판 넘긴", emoji: "🔢", rarity: "achievement", description: "누적 10경기" },
  { id: "friendly", name: "붙임성 좋은", emoji: "🤗", rarity: "achievement", description: "서로 다른 상대 5명과 경기" },
  { id: "ironman", name: "지치지 않는", emoji: "🏸", rarity: "achievement", description: "누적 30경기" },
  { id: "ghost", name: "코트에 눌러앉은", emoji: "🗿", rarity: "achievement", description: "하루 5경기 이상" },
  { id: "giant_killer", name: "거인 잡는", emoji: "🛡️", rarity: "achievement", description: "상위 티어 상대 격파 5회" },
  { id: "bomber", name: "몰아치는", emoji: "💥", rarity: "achievement", description: "압승 10회" },
  // 🎭 성격형 — 스타일/근성
  { id: "avenger", name: "복수에 불타는", emoji: "😈", rarity: "style", description: "복수전 성공 3회" },
  { id: "comeback", name: "다시 일어서는", emoji: "🩹", rarity: "style", description: "4연패 후 다시 승리" },
  { id: "mentor", name: "이끌어주는", emoji: "🤝", rarity: "style", description: "멘토링 보너스 5회" },
  { id: "late_bloomer", name: "뒤늦게 피어난", emoji: "🐢", rarity: "style", description: "4연패를 딛고 골드 이상 도달" },
  { id: "slide", name: "주르륵 미끄러지는", emoji: "🛝", rarity: "style", description: "5연패 기록 (그래도 계속 나오는 근성)" },
  { id: "flipflop", name: "오르락내리락", emoji: "🌊", rarity: "style", description: "승-패-승-패 6연속 교대" },
  { id: "stalker", name: "집착하는", emoji: "🕵️", rarity: "style", description: "한 상대와 8번 이상 경기" },
  { id: "rollercoaster", name: "종잡을 수 없는", emoji: "🎢", rarity: "style", description: "한 시즌에 4연승과 4연패 모두 기록" },
  { id: "owl", name: "밤에 나타나는", emoji: "🦉", rarity: "style", description: "밤 22시~새벽 5시 경기 5회" },
  { id: "grit", name: "꿋꿋한", emoji: "😤", rarity: "style", description: "20경기 이상 뛴 꾸준함 (승률 무관)" },
];

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries(
  TITLE_CATALOG.map((t) => [t.id, t])
);

const TIER_RANKING: Record<TierName, number> = {
  Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Diamond: 5,
};

// 한 선수가 어느 팀 슬롯인지 판별
function slotOf(m: Match, id: string): "A" | "A2" | "B" | "B2" | null {
  if (m.playerAId === id) return "A";
  if (m.playerA2Id === id) return "A2";
  if (m.playerBId === id) return "B";
  if (m.playerB2Id === id) return "B2";
  return null;
}

type Stats = {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number; // 0~1
  currentWinStreak: number; // 양수만(연승), 아니면 0
  maxWinStreak: number;
  maxLossStreak: number;
  maxMatchesOnSingleDay: number;
  higherTierWins: number;
  marginWins: number;
  revengeCount: number;
  mentoringCount: number;
  brokeLossStreak4: boolean;
  distinctOpponents: number;
  maxVsSameOpp: number; // 특정 한 상대와 맞붙은 최대 횟수
  longestAltRun: number; // 승/패가 연속으로 교대된 최장 길이
  nightMatches: number; // 밤(22시~새벽5시) 경기 수
  tierRank: number;
};

function computeStats(student: Student, students: Student[], matches: Match[], thresholds: any): Stats {
  const id = student.id;
  const mine = matches.filter((m) => slotOf(m, id) !== null);
  const chrono = [...mine].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let wins = 0, losses = 0;
  let curWin = 0, curLoss = 0, brokeLossStreak4 = false;
  let maxWinStreak = 0, maxLossStreak = 0;
  let higherTierWins = 0, marginWins = 0, revengeCount = 0, mentoringCount = 0;
  let nightMatches = 0;
  const opponents = new Set<string>();
  const oppCounts: Record<string, number> = {};
  const results: boolean[] = []; // 시간순 승(true)/패(false)
  const dateCounts: Record<string, number> = {};
  const playerTier = getTier(student.rp, thresholds);
  const playerTierRank = TIER_RANKING[playerTier] ?? 1;

  for (const m of chrono) {
    const slot = slotOf(m, id)!;
    const onA = slot === "A" || slot === "A2";
    const aWon = m.scoreA > m.scoreB;
    const won = onA ? aWon : !aWon;
    results.push(won);

    if (won) {
      wins++;
      curWin++;
      if (curLoss >= 4) brokeLossStreak4 = true;
      curLoss = 0;
      if (curWin > maxWinStreak) maxWinStreak = curWin;
    } else {
      losses++;
      curLoss++;
      curWin = 0;
      if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    }

    // 밤 경기(22시~새벽5시) 집계
    const hour = new Date(m.date).getHours();
    if (hour >= 22 || hour < 5) nightMatches++;

    // 상대 목록 / 상위 티어 격파
    const oppIds = (onA ? [m.playerBId, m.playerB2Id] : [m.playerAId, m.playerA2Id]).filter(Boolean) as string[];
    oppIds.forEach((oid) => { opponents.add(oid); oppCounts[oid] = (oppCounts[oid] || 0) + 1; });
    if (won) {
      const beatHigher = oppIds.some((oid) => {
        const opp = students.find((s) => s.id === oid);
        if (!opp) return false;
        return (TIER_RANKING[getTier(opp.rp, thresholds)] ?? 1) > playerTierRank;
      });
      if (beatHigher) higherTierWins++;
    }

    // 슬롯별 보너스(압승/복수/멘토링)
    const mm = m as unknown as Record<string, number | undefined>;
    if ((mm[`marginBonus${slot}`] ?? 0) > 0) marginWins++;
    if ((mm[`revengeBonus${slot}`] ?? 0) > 0) revengeCount++;
    if ((mm[`mentoringBonus${slot}`] ?? 0) > 0) mentoringCount++;

    const d = new Date(m.date);
    const dk = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    dateCounts[dk] = (dateCounts[dk] || 0) + 1;
  }

  const totalGames = mine.length;
  const maxMatchesOnSingleDay = Object.values(dateCounts).reduce((mx, v) => Math.max(mx, v), 0);
  // 마지막 흐름이 연승이면 curWin, 연패면 0
  const currentWinStreak = curLoss === 0 ? curWin : 0;
  const maxVsSameOpp = Object.values(oppCounts).reduce((mx, v) => Math.max(mx, v), 0);
  // 승/패 최장 교대(퐁당퐁당) 길이
  let longestAltRun = results.length > 0 ? 1 : 0;
  let altRun = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) { altRun++; if (altRun > longestAltRun) longestAltRun = altRun; }
    else altRun = 1;
  }

  return {
    totalGames, wins, losses,
    winRate: wins + losses === 0 ? 0 : wins / (wins + losses),
    currentWinStreak, maxWinStreak, maxLossStreak,
    maxMatchesOnSingleDay, higherTierWins, marginWins,
    revengeCount, mentoringCount, brokeLossStreak4,
    distinctOpponents: opponents.size,
    maxVsSameOpp, longestAltRun, nightMatches,
    tierRank: playerTierRank,
  };
}

export type TitleIndex = {
  earnedByStudent: Map<string, Set<string>>;
};

// 리그 전체를 한 번에 계산 — 경쟁형(1명) + 개인 성취/성격형
export function buildTitleIndex(students: Student[], matches: Match[], thresholds: any): TitleIndex {
  const statsById = new Map<string, Stats>();
  students.forEach((s) => statsById.set(s.id, computeStats(s, students, matches, thresholds)));

  const played = students.filter((s) => (statsById.get(s.id)?.totalGames ?? 0) > 0);

  // 경쟁형 보유자 1명씩 산출
  const pickMax = (
    pool: Student[],
    value: (s: Student, st: Stats) => number,
    minValue = -Infinity,
  ): string | null => {
    let best: { id: string; v: number } | null = null;
    for (const s of pool) {
      const st = statsById.get(s.id)!;
      const v = value(s, st);
      if (v <= minValue) continue;
      if (!best || v > best.v) best = { id: s.id, v };
    }
    return best?.id ?? null;
  };

  // RP 2위(콩라인) — 1위를 뺀 나머지 중 최고
  const championId = pickMax(played, (s) => s.rp, 0);
  const runnerUpId = pickMax(played.filter((s) => s.id !== championId), (s) => s.rp, 0);

  const holders: Record<string, string | null> = {
    champion: championId,
    runner_up: runnerUpId,
    streak_king: pickMax(played, (_s, st) => st.currentWinStreak, 1), // 2연승 이상
    win_king: pickMax(played, (_s, st) => st.wins, 0),
    sniper: pickMax(
      played.filter((s) => (statsById.get(s.id)!.wins + statsById.get(s.id)!.losses) >= 10),
      (_s, st) => st.winRate + st.wins * 1e-6, // 동률이면 경기 많은 쪽
    ),
    socialite: pickMax(played, (_s, st) => st.distinctOpponents, 1), // 최소 2명 이상
  };

  const earnedByStudent = new Map<string, Set<string>>();
  for (const s of students) {
    const st = statsById.get(s.id)!;
    const set = new Set<string>();

    // 경쟁형
    for (const key of ["champion", "runner_up", "streak_king", "win_king", "sniper", "socialite"]) {
      if (holders[key] === s.id) set.add(key);
    }
    // 성취형(초보 친화)
    if (st.totalGames >= 1) set.add("rookie");
    if (st.wins >= 1) set.add("first_win");
    if (st.totalGames >= 10) set.add("double_digit");
    if (st.distinctOpponents >= 5) set.add("friendly");
    if (st.totalGames >= 30) set.add("ironman");
    if (st.maxMatchesOnSingleDay >= 5) set.add("ghost");
    if (st.higherTierWins >= 5) set.add("giant_killer");
    if (st.marginWins >= 10) set.add("bomber");
    // 성격형/웃긴 것
    if (st.revengeCount >= 3) set.add("avenger");
    if (st.brokeLossStreak4) set.add("comeback");
    if (st.mentoringCount >= 5) set.add("mentor");
    if (st.brokeLossStreak4 && st.tierRank >= 3) set.add("late_bloomer");
    if (st.maxLossStreak >= 5) set.add("slide");
    if (st.longestAltRun >= 6) set.add("flipflop");
    if (st.maxVsSameOpp >= 8) set.add("stalker");
    if (st.maxWinStreak >= 4 && st.maxLossStreak >= 4) set.add("rollercoaster");
    if (st.nightMatches >= 5) set.add("owl");
    if (st.totalGames >= 20) set.add("grit");

    earnedByStudent.set(s.id, set);
  }

  return { earnedByStudent };
}
