// 리그 프리셋 공유 모듈 — 글로벌 설정(AdminSettings)과 리그 개설(Lobby)이 함께 사용.
// 축: 기준점 / 승패 곡선 / 보너스 / 패널티. + 개설용 '리그 성향' 번들.
import type { TierName, TierSettings, DynamicBonuses, DynamicPenalties } from "./league-types";

// ─────────────────────────────────────────────────────────────
// 표준값 (= '표준' 성향, 약간 성장형). 기준 RP 1000.
// ─────────────────────────────────────────────────────────────
export const STANDARD_THRESHOLDS: Record<TierName, number> = {
  Bronze: 0, Silver: 870, Gold: 1120, Platinum: 1400, Diamond: 1720,
};
export const STANDARD_TIER_SETTINGS: TierSettings = {
  Bronze: { winDelta: 24, loseDelta: 6 },
  Silver: { winDelta: 20, loseDelta: 12 },
  Gold: { winDelta: 16, loseDelta: 16 },
  Platinum: { winDelta: 13, loseDelta: 21 },
};
export const STANDARD_RP_VARIABLES = { winDelta: 11, loseDelta: 27 }; // 다이아

export const STANDARD_BONUSES: DynamicBonuses = {
  freshnessEnabled: true, freshnessGames: 5, freshnessRp: 5,
  streakEnabled: true, streakWins: 3, streakRp: 8,
  firstWinEnabled: true, firstWinRp: 12,
  revengeEnabled: true, revengeRp: 8,
  underdogEnabled: true, underdogDiff1Rp: 6, underdogDiff2Rp: 12, underdogDiff3Rp: 20,
  greatMatchEnabled: true, greatMatchRp: 8, greatMatchWin1Rp: 8, greatMatchLose1Rp: 4, greatMatchWin2Rp: 5, greatMatchLose2Rp: 2, greatMatchWin3Rp: 2, greatMatchLose3Rp: 0,
  lossComfortEnabled: true, lossComfortRp: 4, lossComfortMaxTier: "Silver",
  willOfSteelEnabled: true, willOfSteel3Rp: 8, willOfSteel4Rp: 12, willOfSteel5Rp: 16,
  mentoring: { enabled: false, mentorRp: 10, menteeRp: 15, minTierGap: 1 },
};
export const STANDARD_PENALTIES: DynamicPenalties = {
  enabled: true, arrogance: true, crushing: true, revengeFail: true, championWeight: true, lossStreak: true,
  arroganceGold: 15, arrogancePlatinum: 25, arroganceDiamond: 35,
  crushingGold: 8, crushingPlatinum: 12, crushingDiamond: 16,
  revengeAllowedGold: 8, revengeAllowedPlatinum: 12, revengeAllowedDiamond: 16,
  championGold: 4, championPlatinum: 9, championDiamond: 15,
  swampGold2: 4, swampGold3: 8, swampPlatinum2: 8, swampPlatinum3: 13, swampDiamond2: 13, swampDiamond3: 22,
  redCardPenalty: 10,
};

// ─────────────────────────────────────────────────────────────
// 축 A: 기준점 프리셋 (브론즈 0 고정)
// ─────────────────────────────────────────────────────────────
export type ThresholdPreset = "short" | "standard" | "long" | "bell" | "custom";
export const THRESHOLD_PRESETS: Record<Exclude<ThresholdPreset, "custom">, { Silver: number; Gold: number; Platinum: number; Diamond: number; label: string; desc: string }> = {
  short:    { Silver: 900, Gold: 1050, Platinum: 1200, Diamond: 1380, label: "🏃 단기·촘촘", desc: "1개월 내 짧은 리그. 적은 경기로도 승급이 보임" },
  standard: { Silver: 870, Gold: 1120, Platinum: 1400, Diamond: 1720, label: "⚖️ 표준", desc: "약 2개월. 기본 밸런스" },
  long:     { Silver: 850, Gold: 1200, Platinum: 1650, Diamond: 2200, label: "🏔️ 장기·넓게", desc: "3개월~학기. 일찍 만렙 방지, 상위 희소" },
  bell:     { Silver: 820, Gold: 1080, Platinum: 1450, Diamond: 1900, label: "📊 정규분포·정밀", desc: "정확한 등급(종형). 하위 보호·상위 넓음" },
};

// ─────────────────────────────────────────────────────────────
// 축 B: 승/패 곡선 프리셋 (티어별)
// ─────────────────────────────────────────────────────────────
export type WinlossPreset = "balanced" | "speed" | "growth" | "strict" | "custom";
export const WINLOSS_PRESETS: Record<Exclude<WinlossPreset, "custom">, { label: string; desc: string; tiers: Record<TierName, { winDelta: number; loseDelta: number }> }> = {
  balanced: { label: "⚖️ 표준(균형)", desc: "기본. 하위 친화·골드 연착륙·상위 엄격",
    tiers: { Bronze: { winDelta: 24, loseDelta: 6 }, Silver: { winDelta: 20, loseDelta: 12 }, Gold: { winDelta: 16, loseDelta: 16 }, Platinum: { winDelta: 13, loseDelta: 21 }, Diamond: { winDelta: 11, loseDelta: 27 } } },
  speed:    { label: "⚡ 스피드(빠른 변동)", desc: "변동이 느려 지루하거나 단기 리그",
    tiers: { Bronze: { winDelta: 42, loseDelta: 10 }, Silver: { winDelta: 36, loseDelta: 20 }, Gold: { winDelta: 30, loseDelta: 30 }, Platinum: { winDelta: 24, loseDelta: 38 }, Diamond: { winDelta: 20, loseDelta: 46 } } },
  growth:   { label: "🌱 성장(하위 독려)", desc: "하위권 좌절·이탈 방지. 모두 승급 분위기",
    tiers: { Bronze: { winDelta: 30, loseDelta: 2 }, Silver: { winDelta: 28, loseDelta: 6 }, Gold: { winDelta: 22, loseDelta: 14 }, Platinum: { winDelta: 16, loseDelta: 20 }, Diamond: { winDelta: 12, loseDelta: 28 } } },
  strict:   { label: "🎯 정밀·하드(상위 관리)", desc: "상위 견제·정확 등급",
    tiers: { Bronze: { winDelta: 18, loseDelta: 14 }, Silver: { winDelta: 16, loseDelta: 18 }, Gold: { winDelta: 14, loseDelta: 22 }, Platinum: { winDelta: 12, loseDelta: 28 }, Diamond: { winDelta: 10, loseDelta: 34 } } },
};

// ─────────────────────────────────────────────────────────────
// 축 C: 보너스 프리셋
// ─────────────────────────────────────────────────────────────
export type BonusPreset = "balanced" | "encourage" | "competitive" | "custom";
const BONUS_SIG: (keyof DynamicBonuses)[] = [
  "firstWinEnabled", "firstWinRp", "freshnessEnabled", "streakEnabled", "revengeEnabled",
  "underdogEnabled", "underdogDiff1Rp", "underdogDiff2Rp", "underdogDiff3Rp",
  "greatMatchEnabled", "lossComfortEnabled", "lossComfortRp", "lossComfortMaxTier",
  "willOfSteelEnabled", "willOfSteel3Rp", "willOfSteel4Rp", "willOfSteel5Rp",
];
export const BONUS_PRESETS: Record<Exclude<BonusPreset, "custom">, { label: string; desc: string; fields: Partial<DynamicBonuses> }> = {
  balanced: { label: "⚖️ 균형", desc: "기본. 적당한 참여 보상",
    fields: { firstWinEnabled: true, firstWinRp: 12, freshnessEnabled: true, freshnessRp: 5, streakEnabled: true, streakRp: 8, revengeEnabled: true, revengeRp: 8, underdogEnabled: true, underdogDiff1Rp: 6, underdogDiff2Rp: 12, underdogDiff3Rp: 20, greatMatchEnabled: true, lossComfortEnabled: true, lossComfortRp: 4, lossComfortMaxTier: "Silver", willOfSteelEnabled: true, willOfSteel3Rp: 8, willOfSteel4Rp: 12, willOfSteel5Rp: 16 } },
  encourage: { label: "🌱 하위 독려", desc: "하위권 좌절·이탈 방지. 언더독·위로·연패탈출↑, 연승은 끔",
    fields: { firstWinEnabled: true, firstWinRp: 15, freshnessEnabled: true, freshnessRp: 8, streakEnabled: false, streakRp: 8, revengeEnabled: true, revengeRp: 8, underdogEnabled: true, underdogDiff1Rp: 8, underdogDiff2Rp: 16, underdogDiff3Rp: 26, greatMatchEnabled: true, lossComfortEnabled: true, lossComfortRp: 8, lossComfortMaxTier: "Platinum", willOfSteelEnabled: true, willOfSteel3Rp: 14, willOfSteel4Rp: 20, willOfSteel5Rp: 28 } },
  competitive: { label: "🎯 경쟁·최소", desc: "순수 실력 반영·정확 등급. 진짜 실력인 언더독만 소폭",
    fields: { firstWinEnabled: false, firstWinRp: 12, freshnessEnabled: false, freshnessRp: 5, streakEnabled: false, streakRp: 8, revengeEnabled: false, revengeRp: 8, underdogEnabled: true, underdogDiff1Rp: 4, underdogDiff2Rp: 8, underdogDiff3Rp: 12, greatMatchEnabled: false, lossComfortEnabled: false, lossComfortRp: 4, lossComfortMaxTier: "Silver", willOfSteelEnabled: false, willOfSteel3Rp: 8, willOfSteel4Rp: 12, willOfSteel5Rp: 16 } },
};

// ─────────────────────────────────────────────────────────────
// 축 D: 패널티 프리셋
// ─────────────────────────────────────────────────────────────
export type PenaltyPreset = "balanced" | "topcontrol" | "lenient" | "custom";
const PENALTY_SIG: (keyof DynamicPenalties)[] = [
  "arrogance", "arroganceGold", "arrogancePlatinum", "arroganceDiamond",
  "crushing", "crushingGold", "crushingPlatinum", "crushingDiamond",
  "revengeFail", "revengeAllowedGold", "revengeAllowedPlatinum", "revengeAllowedDiamond",
  "championWeight", "championGold", "championPlatinum", "championDiamond",
  "lossStreak", "swampGold2", "swampGold3", "swampPlatinum2", "swampPlatinum3", "swampDiamond2", "swampDiamond3",
];
export const PENALTY_PRESETS: Record<Exclude<PenaltyPreset, "custom">, { label: string; desc: string; fields: Partial<DynamicPenalties> }> = {
  balanced: { label: "⚖️ 균형", desc: "기본. 적당한 상위 견제",
    fields: { enabled: true, arrogance: true, arroganceGold: 15, arrogancePlatinum: 25, arroganceDiamond: 35, crushing: true, crushingGold: 8, crushingPlatinum: 12, crushingDiamond: 16, revengeFail: true, revengeAllowedGold: 8, revengeAllowedPlatinum: 12, revengeAllowedDiamond: 16, championWeight: true, championGold: 4, championPlatinum: 9, championDiamond: 15, lossStreak: true, swampGold2: 4, swampGold3: 8, swampPlatinum2: 8, swampPlatinum3: 13, swampDiamond2: 13, swampDiamond3: 22 } },
  topcontrol: { label: "🛡️ 상위 견제·하드", desc: "다이아·플래 과다 시. 상위가 미끄러지면 더 깎임",
    fields: { enabled: true, arrogance: true, arroganceGold: 22, arrogancePlatinum: 36, arroganceDiamond: 50, crushing: true, crushingGold: 10, crushingPlatinum: 16, crushingDiamond: 22, revengeFail: true, revengeAllowedGold: 10, revengeAllowedPlatinum: 16, revengeAllowedDiamond: 22, championWeight: true, championGold: 9, championPlatinum: 16, championDiamond: 26, lossStreak: true, swampGold2: 7, swampGold3: 13, swampPlatinum2: 13, swampPlatinum3: 20, swampDiamond2: 20, swampDiamond3: 32 } },
  lenient: { label: "🍃 관대", desc: "져도 손해 적게. 캐주얼·이탈 방지(행동 위반만)",
    fields: { enabled: true, arrogance: false, arroganceGold: 15, arrogancePlatinum: 25, arroganceDiamond: 35, crushing: false, crushingGold: 8, crushingPlatinum: 12, crushingDiamond: 16, revengeFail: false, revengeAllowedGold: 8, revengeAllowedPlatinum: 12, revengeAllowedDiamond: 16, championWeight: false, championGold: 4, championPlatinum: 9, championDiamond: 15, lossStreak: false, swampGold2: 4, swampGold3: 8, swampPlatinum2: 8, swampPlatinum3: 13, swampDiamond2: 13, swampDiamond3: 22 } },
};

// ─────────────────────────────────────────────────────────────
// 헬퍼: 프리셋 → 저장 형태
// ─────────────────────────────────────────────────────────────
export function thresholdsFromPreset(key: Exclude<ThresholdPreset, "custom">): Record<TierName, number> {
  const v = THRESHOLD_PRESETS[key];
  return { Bronze: 0, Silver: v.Silver, Gold: v.Gold, Platinum: v.Platinum, Diamond: v.Diamond };
}
export function winlossSplit(key: Exclude<WinlossPreset, "custom">): { tierSettings: TierSettings; diamond: { winDelta: number; loseDelta: number } } {
  const t = WINLOSS_PRESETS[key].tiers;
  return { tierSettings: { Bronze: t.Bronze, Silver: t.Silver, Gold: t.Gold, Platinum: t.Platinum }, diamond: t.Diamond };
}
export function bonusesFromPreset(key: Exclude<BonusPreset, "custom">): DynamicBonuses {
  return { ...STANDARD_BONUSES, ...BONUS_PRESETS[key].fields };
}
export function penaltiesFromPreset(key: Exclude<PenaltyPreset, "custom">): DynamicPenalties {
  return { ...STANDARD_PENALTIES, ...PENALTY_PRESETS[key].fields };
}

// ─────────────────────────────────────────────────────────────
// 탐지 (현재 값 → 어떤 프리셋인지, 미일치면 custom)
// ─────────────────────────────────────────────────────────────
export function detectThresholdPreset(th: Record<TierName, number | string>): ThresholdPreset {
  const s = Number(th.Silver), g = Number(th.Gold), p = Number(th.Platinum), d = Number(th.Diamond);
  for (const k of ["short", "standard", "long", "bell"] as const) {
    const v = THRESHOLD_PRESETS[k];
    if (v.Silver === s && v.Gold === g && v.Platinum === p && v.Diamond === d) return k;
  }
  return "custom";
}
export function detectWinlossPreset(ts: TierSettings, dWin: number | string, dLose: number | string): WinlossPreset {
  const dw = Number(dWin), dl = Number(dLose);
  for (const k of ["balanced", "speed", "growth", "strict"] as const) {
    const v = WINLOSS_PRESETS[k].tiers;
    const lower = (["Bronze", "Silver", "Gold", "Platinum"] as const).every((t) => ts[t]?.winDelta === v[t].winDelta && ts[t]?.loseDelta === v[t].loseDelta);
    if (lower && v.Diamond.winDelta === dw && v.Diamond.loseDelta === dl) return k;
  }
  return "custom";
}
export function detectBonusPreset(b: DynamicBonuses): BonusPreset {
  for (const k of ["balanced", "encourage", "competitive"] as const) {
    const merged = bonusesFromPreset(k);
    if (BONUS_SIG.every((key) => (b as any)[key] === (merged as any)[key])) return k;
  }
  return "custom";
}
export function detectPenaltyPreset(p: DynamicPenalties): PenaltyPreset {
  for (const k of ["balanced", "topcontrol", "lenient"] as const) {
    const merged = penaltiesFromPreset(k);
    if (PENALTY_SIG.every((key) => (p as any)[key] === (merged as any)[key])) return k;
  }
  return "custom";
}

// ─────────────────────────────────────────────────────────────
// 개설용 '리그 성향' 번들
// ─────────────────────────────────────────────────────────────
export type BundleKey = "standard" | "casual" | "precise" | "shortevent";
export const LEAGUE_BUNDLES: Record<BundleKey, { label: string; desc: string; threshold: Exclude<ThresholdPreset, "custom">; winloss: Exclude<WinlossPreset, "custom">; bonus: Exclude<BonusPreset, "custom">; penalty: Exclude<PenaltyPreset, "custom"> }> = {
  standard:   { label: "⚖️ 표준", desc: "약 2개월·균형. 약간 성장형(추천)", threshold: "standard", winloss: "balanced", bonus: "balanced", penalty: "balanced" },
  casual:     { label: "🎉 캐주얼·모두 행복", desc: "하위 독려·관대. 모두 승급 분위기", threshold: "short", winloss: "growth", bonus: "encourage", penalty: "lenient" },
  precise:    { label: "🎯 정밀·경쟁(하드)", desc: "정확한 등급·상위 견제", threshold: "bell", winloss: "strict", bonus: "competitive", penalty: "topcontrol" },
  shortevent: { label: "🏃 단기 이벤트", desc: "1개월 내 빠른 변동", threshold: "short", winloss: "speed", bonus: "balanced", penalty: "lenient" },
};

// 번들 → classes.settings 에 병합할 설정 묶음
export function buildBundleSettings(key: BundleKey) {
  const b = LEAGUE_BUNDLES[key];
  const { tierSettings, diamond } = winlossSplit(b.winloss);
  return {
    tierThresholds: thresholdsFromPreset(b.threshold),
    rpVariables: diamond,
    tierSettings,
    dynamicBonuses: bonusesFromPreset(b.bonus),
    dynamicPenalties: penaltiesFromPreset(b.penalty),
  };
}
