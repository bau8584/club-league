export type Gender = "M" | "F" | "U"; // M: 남, F: 여, U: 미지정

/**
 * 경기결과 입력 방식 (관리자가 리그별로 제어)
 * - admin-only: 관리자(방장/공동관리/기록원)만 입력
 * - free: 자율 — 멤버가 "본인이 참여한 경기"만 기록
 * - free-all: 완전 자율 — 모든 멤버가 아무 경기나 입력
 * - peer-confirm / admin-approve: 승인 흐름 (보류 — DB 필요, 현재 미사용)
 */
export type MatchInputMode = "admin-only" | "free" | "free-all" | "peer-confirm" | "admin-approve";

/**
 * Student 인터페이스 - Supabase 'students' 테이블 스키마와 대응
 */
export type Student = {
  // --- Supabase DB 테이블 스키마 속성 (players) ---
  id: string; // UUID (Primary Key)
  rp: number; // 랭킹 포인트
  league_id?: string; // 리그 식별용 UUID (Foreign Key) -> DB: league_id
  userId?: string | null; // 계정 연결 -> DB: user_id (동호회: 본인 계정)

  // --- 동호회 프로필 ---
  name: string; // 이름 -> DB: name
  nickname?: string | null; // 별명 -> DB: nickname
  gender: Gender; // 성별 -> DB: gender
  group?: string | null; // 레벨 -> DB: group_label
  birthYear?: number | null; // 연생 -> DB: birth_year
  displayName?: string | null; // 표시 이름 -> DB: display_name
  equippedTitle?: string | null; // 장착한 대표 호칭 id -> DB: equipped_title

  // 경기 전적(matches) 데이터를 기반으로 실시간 계산되는 속성들
  recent: ("W" | "L")[]; // 최근 5경기 결과 (가장 최근이 첫 요소)
  wins: number; // 승리 횟수
  losses: number; // 패배 횟수
  lastMatchDate?: string; // 마지막 경기 일시 (ISO 8601)
  lastWinDate?: string; // 마지막 승리 일시 (YYYY-MM-DD)
  totalMatches?: number; // 총 경기수
  currentStreak?: number; // 현재 연승/연패 기록 (연승은 양수, 연패는 음수)
  achievements?: any[]; // 획득한 업적 목록
};

/**
 * Match 인터페이스 - Supabase 'matches' 테이블 스키마와 대응
 */
// 대진 호출(예정 경기) — RP/통계와 무관한 별도 엔티티
export type ScheduledMatch = {
  id: string;
  league_id: string;
  match_type: "single" | "double";
  player_a_id: string | null;
  player_b_id: string | null;
  player_a2_id: string | null;
  player_b2_id: string | null;
  court: string | null;
  status: "waiting" | "called" | "done" | "cancelled" | "challenge";
  created_at: string;
};

export type Match = {
  // --- Supabase DB 테이블 스키마 속성 ---
  id: string; // UUID (Primary Key)
  playerAId: string; // 승리자 ID (DB: winner_id)
  playerBId: string; // 패배자 ID (DB: loser_id)
  date: string; // 경기 일시 (DB: created_at)
  
  // --- 프론트엔드 전용 확장 속성 ---
  playerA2Id?: string; // 복식 파트너 A2 (복식 경기 확장 시 사용)
  playerB2Id?: string; // 복식 파트너 B2 (복식 경기 확장 시 사용)
  scoreA: number; // 승리자 점수 (기본값 21)
  scoreB: number; // 패배자 점수 (기본값 19)
  matchType?: "single" | "double"; // 경기 구분 (단식/복식)
  rpDeltaA?: number; // 승리자 RP 변동량
  rpDeltaB?: number; // 패배자 RP 변동량
  rpDeltaA2?: number; // 복식 파트너 A2 RP 변동량
  rpDeltaB2?: number; // 복식 파트너 B2 RP 변동량
  
  // 경기 시점에 지급된 보너스 개별 지급 기록 (프론트엔드 세부 분석용)
  underdogBonusA?: number;
  underdogBonusB?: number;
  underdogBonusA2?: number;
  underdogBonusB2?: number;
  scoreDiffBonusA?: number;
  scoreDiffBonusB?: number;
  scoreDiffBonusA2?: number;
  scoreDiffBonusB2?: number;
  rivalBonusA?: number;
  rivalBonusB?: number;
  rivalBonusA2?: number;
  rivalBonusB2?: number;
  firstWinBonusA?: number;
  firstWinBonusB?: number;
  firstWinBonusA2?: number;
  firstWinBonusB2?: number;
  revengeBonusA?: number;
  revengeBonusB?: number;
  revengeBonusA2?: number;
  revengeBonusB2?: number;
  freshnessBonusA?: number;
  freshnessBonusB?: number;
  freshnessBonusA2?: number;
  freshnessBonusB2?: number;
  streakBonusA?: number;
  streakBonusB?: number;
  streakBonusA2?: number;
  streakBonusB2?: number;
  comebackBonusA?: number;
  comebackBonusB?: number;
  comebackBonusA2?: number;
  comebackBonusB2?: number;
  marginBonusA?: number;
  marginBonusB?: number;
  marginBonusA2?: number;
  marginBonusB2?: number;
  mentoringBonusA?: number;
  mentoringBonusB?: number;
  mentoringBonusA2?: number;
  mentoringBonusB2?: number;
  
  // New bonus and penalty fields
  greatMatchBonusA?: number;
  greatMatchBonusB?: number;
  greatMatchBonusA2?: number;
  greatMatchBonusB2?: number;
  lossComfortBonusA?: number;
  lossComfortBonusB?: number;
  lossComfortBonusA2?: number;
  lossComfortBonusB2?: number;
  arrogancePenaltyA?: number;
  arrogancePenaltyB?: number;
  arrogancePenaltyA2?: number;
  arrogancePenaltyB2?: number;
  crushingPenaltyA?: number;
  crushingPenaltyB?: number;
  crushingPenaltyA2?: number;
  crushingPenaltyB2?: number;
  revengeAllowedPenaltyA?: number;
  revengeAllowedPenaltyB?: number;
  revengeAllowedPenaltyA2?: number;
  revengeAllowedPenaltyB2?: number;
  championPenaltyA?: number;
  championPenaltyB?: number;
  championPenaltyA2?: number;
  championPenaltyB2?: number;
  swampPenaltyA?: number;
  swampPenaltyB?: number;
  swampPenaltyA2?: number;
  swampPenaltyB2?: number;
  willOfSteelBonusA?: number;
  willOfSteelBonusB?: number;
  willOfSteelBonusA2?: number;
  willOfSteelBonusB2?: number;
};

/**
 * Class 인터페이스 - Supabase 'leagues' 테이블 스키마와 1:1 매핑 (동호회 리그)
 */
export type Class = {
  id: string; // UUID (Primary Key)
  season_id?: string | null; // 시즌 외래키
  owner_uid: string; // 방장 UID
  co_owner_uids?: string[] | null; // 공동방장 UID 목록 -> DB: co_owner_uids
  admin_uids: string[] | null; // 공동 관리자 UID 목록 -> DB: admin_uids
  member_uids: string[] | null; // 멤버(동호인) UID 목록 -> DB: member_uids
  join_code?: string | null; // 6자리 초대 코드 -> DB: join_code
  name: string; // 리그명 -> DB: name
  settings: {
    season?: string; // 시즌 텍스트 정보 (예: "2026-1")
    matchInputMode?: MatchInputMode; // 경기결과 입력 방식 (관리자 제어)
    schoolName?: string;
    sport?: string;
    levelMode?: "preset" | "free"; // 레벨 체계: 정의된 목록만(preset) vs 자유 입력(free)
    levels?: { name: string; description?: string }[]; // preset일 때 정의된 레벨 목록(순서=높→낮)
    tierThresholds?: Record<TierName, number>; // 티어 기준선 설정
    rpVariables?: { winDelta: number; loseDelta: number }; // 기본 승패 획득/차감 점수
    decayEnabled?: boolean; // 휴면 감쇠 여부
    decayDays?: number; // 휴면 기준 일수
    decayAmount?: number; // 감쇠 점수
    decayTiers?: TierName[]; // 감쇠 적용 티어 목록
    lastDecayDate?: string; // 최근 감쇠 적용일 (ISO)
    tierSettings?: TierSettings; // 티어별 커스텀 획득 점수
    dynamicBonuses?: DynamicBonuses; // 동적 보너스 세부 설정
    dynamicPenalties?: DynamicPenalties; // 상위 티어 패배 패널티 설정
    activeBonuses?: ActiveBonuses; // 활성화된 보너스 룰셋
    placement?: { enabled: boolean; games: number }; // 배치고사(언랭크) 설정
    [key: string]: any;
  } | null;
  is_deleted?: boolean; // 소프트 딜리트 여부
  created_at: string; // 생성 일시
};

export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export type ActiveBonuses = {
  firstWin: boolean;
  revenge: boolean;
  underdog: boolean;
  scoreDiff: boolean;
  rival: boolean;
};

export function getTier(rp: number, thresholds?: Record<TierName, number>): TierName {
  const t = thresholds || { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 };
  if (rp >= (t.Diamond ?? 1600)) return "Diamond";
  if (rp >= (t.Platinum ?? 1400)) return "Platinum";
  if (rp >= (t.Gold ?? 1200)) return "Gold";
  if (rp >= (t.Silver ?? 1000)) return "Silver";
  return "Bronze";
}

export function getTierSubdivision(rp: number, thresholds?: Record<TierName, number>): number {
  const t = thresholds || { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 };
  const tier = getTier(rp, thresholds);
  
  if (tier === "Diamond") {
    const diff = rp - (t.Diamond ?? 1600);
    if (diff >= 300) return 1;
    if (diff >= 200) return 2;
    if (diff >= 100) return 3;
    return 4;
  }
  
  let currentCutoff = 0;
  let nextCutoff = 1000;
  
  if (tier === "Bronze") {
    currentCutoff = t.Bronze ?? 0;
    nextCutoff = t.Silver ?? 1000;
  } else if (tier === "Silver") {
    currentCutoff = t.Silver ?? 1000;
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

export function getFullTierLabel(rp: number, thresholds?: Record<TierName, number>): string {
  const tier = getTier(rp, thresholds);
  const sub = getTierSubdivision(rp, thresholds);
  const style = TIER_STYLES[tier];
  return `${style.label} ${sub}`;
}

// 배치고사(언랭크): 배치 경기 수를 채우기 전이면 티어·RP를 비공개로 취급.
export function isUnranked(
  s: { wins: number; losses: number },
  placementEnabled: boolean,
  placementGames: number,
): boolean {
  return placementEnabled && s.wins + s.losses < placementGames;
}

export const TIER_ORDER: TierName[] = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];

export const TIER_STYLES: Record<TierName, { bg: string; text: string; ring: string; label: string }> = {
  Bronze:   { bg: "bg-tier-bronze/15",   text: "text-tier-bronze",   ring: "ring-tier-bronze/40",   label: "브론즈" },
  Silver:   { bg: "bg-tier-silver/15",   text: "text-tier-silver",   ring: "ring-tier-silver/40",   label: "실버" },
  Gold:     { bg: "bg-tier-gold/15",     text: "text-tier-gold",     ring: "ring-tier-gold/40",     label: "골드" },
  Platinum: { bg: "bg-tier-platinum/15", text: "text-tier-platinum", ring: "ring-tier-platinum/40", label: "플래티넘" },
  Diamond:  { bg: "bg-tier-diamond/15",  text: "text-tier-diamond",  ring: "ring-tier-diamond/40",  label: "다이아몬드" },
};

export function studentKey(s: { id?: string; name?: string; nickname?: string | null; group?: string | null }) {
  // 동호회: 안정적 식별은 id 우선, 없으면 이름/레벨 조합.
  if (s.id) return s.id;
  return `${s.group ?? ""}-${s.name ?? s.nickname ?? ""}`;
}

export type TierSettings = Record<"Bronze" | "Silver" | "Gold" | "Platinum", {
  winDelta: number;
  loseDelta: number;
 }>;

export type TierConfig = {
  threshold: number;
  winRp: number;
  loseRp: number;
};

export type TiersRecord = Record<'bronze'|'silver'|'gold'|'platinum'|'diamond', TierConfig>;

export type DecayTierConfig = {
  enabled: boolean;
  inactiveDays: number;
  decayRp: number;
};

export type DecaySettingsRecord = Record<'bronze'|'silver'|'gold'|'platinum'|'diamond', DecayTierConfig>;

export type DynamicBonuses = {
  freshnessEnabled: boolean;
  freshnessGames: number;
  freshnessRp: number;
  streakEnabled: boolean;
  streakWins: number;
  streakRp: number;
  firstWinEnabled: boolean;
  firstWinRp: number;
  revengeEnabled: boolean;
  revengeRp: number;
  underdogEnabled: boolean;
  underdogPercent?: number;
  underdogDiff1Rp?: number;
  underdogDiff2Rp?: number;
  underdogDiff3Rp?: number;
  greatMatchEnabled: boolean;
  greatMatchRp: number;
  greatMatchWin1Rp?: number;
  greatMatchLose1Rp?: number;
  greatMatchWin2Rp?: number;
  greatMatchLose2Rp?: number;
  greatMatchWin3Rp?: number;
  greatMatchLose3Rp?: number;
  lossComfortEnabled: boolean;
  lossComfortRp: number;
  lossComfortMaxTier?: TierName;
  willOfSteelEnabled?: boolean;
  willOfSteel3Rp?: number;
  willOfSteel4Rp?: number;
  willOfSteel5Rp?: number;
  mentoring?: {
    enabled: boolean;
    mentorRp: number;
    menteeRp: number;
    minTierGap: number;
  };
};

export type DynamicPenalties = {
  enabled: boolean;
  arrogance: boolean;
  crushing: boolean;
  revengeFail: boolean;
  championWeight: boolean;
  lossStreak: boolean;
  arroganceGold: number;
  arrogancePlatinum: number;
  arroganceDiamond: number;
  crushingGold: number;
  crushingPlatinum: number;
  crushingDiamond: number;
  revengeAllowedGold: number;
  revengeAllowedPlatinum: number;
  revengeAllowedDiamond: number;
  championGold: number;
  championPlatinum: number;
  championDiamond: number;
  swampGold2: number;
  swampGold3: number;
  swampPlatinum2: number;
  swampPlatinum3: number;
  swampDiamond2: number;
  swampDiamond3: number;
  redCardPenalty: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  tier: "Common" | "Rare" | "Epic" | "Legendary";
  currentValue: number;
  targetValue: number;
  isUnlocked: boolean;
};
