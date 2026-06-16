import type { TiersRecord, DecaySettingsRecord, DynamicPenalties, DynamicBonuses, TierName } from "./league-types";

export const DEFAULT_TIERS: TiersRecord = {
  bronze: { threshold: 0, winRp: 20, loseRp: 0 },
  silver: { threshold: 1000, winRp: 15, loseRp: 5 },
  gold: { threshold: 1200, winRp: 15, loseRp: 10 },
  platinum: { threshold: 1400, winRp: 10, loseRp: 15 },
  diamond: { threshold: 1600, winRp: 10, loseRp: 20 }
};

export const DEFAULT_DECAY_SETTINGS: DecaySettingsRecord = {
  bronze: { enabled: false, inactiveDays: 14, decayRp: 10 },
  silver: { enabled: false, inactiveDays: 14, decayRp: 10 },
  gold: { enabled: true, inactiveDays: 14, decayRp: 10 },
  platinum: { enabled: true, inactiveDays: 14, decayRp: 10 },
  diamond: { enabled: true, inactiveDays: 14, decayRp: 15 }
};

export const DEFAULT_DYNAMIC_PENALTIES: DynamicPenalties = {
  enabled: true,
  arrogance: true,
  crushing: true,
  revengeFail: true,
  championWeight: true,
  lossStreak: true,
  arroganceGold: 20,
  arrogancePlatinum: 30,
  arroganceDiamond: 40,
  crushingGold: 10,
  crushingPlatinum: 15,
  crushingDiamond: 20,
  revengeAllowedGold: 10,
  revengeAllowedPlatinum: 15,
  revengeAllowedDiamond: 20,
  championGold: 5,
  championPlatinum: 10,
  championDiamond: 15,
  swampGold2: 5,
  swampGold3: 10,
  swampPlatinum2: 10,
  swampPlatinum3: 15,
  swampDiamond2: 15,
  swampDiamond3: 25,
  redCardPenalty: 10
};

export const DEFAULT_DYNAMIC_BONUSES: DynamicBonuses = {
  freshnessEnabled: true,
  freshnessGames: 5,
  freshnessRp: 5,
  streakEnabled: true,
  streakWins: 3,
  streakRp: 10,
  firstWinEnabled: true,
  firstWinRp: 15,
  revengeEnabled: true,
  revengeRp: 10,
  underdogEnabled: true,
  underdogDiff1Rp: 5,
  underdogDiff2Rp: 10,
  underdogDiff3Rp: 15,
  greatMatchEnabled: true,
  greatMatchRp: 10,
  greatMatchWin1Rp: 10,
  greatMatchLose1Rp: 5,
  greatMatchWin2Rp: 5,
  greatMatchLose2Rp: 2,
  greatMatchWin3Rp: 2,
  greatMatchLose3Rp: 0,
  lossComfortEnabled: true,
  lossComfortRp: 5,
  lossComfortMaxTier: "Gold",
  willOfSteelEnabled: true,
  willOfSteel3Rp: 10,
  willOfSteel4Rp: 15,
  willOfSteel5Rp: 20,
  mentoring: {
    enabled: false,
    mentorRp: 10,
    menteeRp: 15,
    minTierGap: 1
  }
};

export function migrateSettings(rawSettings: any): any {
  if (!rawSettings) return null;

  const migrated = { ...rawSettings };

  // 1. Migrate "tiers" (RP & thresholds)
  if (!migrated.tiers) {
    const th = migrated.tierThresholds || { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600 };
    const ts = migrated.tierSettings || {
      Bronze: { winDelta: 20, loseDelta: 0 },
      Silver: { winDelta: 15, loseDelta: 5 },
      Gold: { winDelta: 15, loseDelta: 10 },
      Platinum: { winDelta: 10, loseDelta: 15 }
    };
    const rpv = migrated.rpVariables || { winDelta: 10, loseDelta: 20 };

    migrated.tiers = {
      bronze: {
        threshold: th.Bronze !== undefined ? Number(th.Bronze) : 0,
        winRp: ts.Bronze?.winDelta !== undefined ? Number(ts.Bronze.winDelta) : 20,
        loseRp: ts.Bronze?.loseDelta !== undefined ? Number(ts.Bronze.loseDelta) : 0
      },
      silver: {
        threshold: th.Silver !== undefined ? Number(th.Silver) : 1000,
        winRp: ts.Silver?.winDelta !== undefined ? Number(ts.Silver.winDelta) : 15,
        loseRp: ts.Silver?.loseDelta !== undefined ? Number(ts.Silver.loseDelta) : 5
      },
      gold: {
        threshold: th.Gold !== undefined ? Number(th.Gold) : 1200,
        winRp: ts.Gold?.winDelta !== undefined ? Number(ts.Gold.winDelta) : 15,
        loseRp: ts.Gold?.loseDelta !== undefined ? Number(ts.Gold.loseDelta) : 10
      },
      platinum: {
        threshold: th.Platinum !== undefined ? Number(th.Platinum) : 1400,
        winRp: ts.Platinum?.winDelta !== undefined ? Number(ts.Platinum.winDelta) : 10,
        loseRp: ts.Platinum?.loseDelta !== undefined ? Number(ts.Platinum.loseDelta) : 15
      },
      diamond: {
        threshold: th.Diamond !== undefined ? Number(th.Diamond) : 1600,
        winRp: rpv.winDelta !== undefined ? Number(rpv.winDelta) : 10,
        loseRp: rpv.loseDelta !== undefined ? Number(rpv.loseDelta) : 20
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

  // 2. Migrate "decaySettings"
  if (!migrated.decaySettings) {
    const enabled = migrated.decayEnabled !== undefined ? migrated.decayEnabled : false;
    const days = migrated.decayDays !== undefined ? Number(migrated.decayDays) : 14;
    const amount = migrated.decayAmount !== undefined ? Number(migrated.decayAmount) : 10;
    const tiersList = migrated.decayTiers || ["Bronze", "Silver", "Gold", "Platinum"];

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

  // 3. Migrate "dynamicPenalties"
  if (migrated.dynamicPenalties) {
    const defaultEnabledVal = migrated.dynamicPenalties.enabled !== undefined ? !!migrated.dynamicPenalties.enabled : true;
    migrated.dynamicPenalties = {
      ...DEFAULT_DYNAMIC_PENALTIES,
      arrogance: migrated.dynamicPenalties.arrogance !== undefined ? !!migrated.dynamicPenalties.arrogance : defaultEnabledVal,
      crushing: migrated.dynamicPenalties.crushing !== undefined ? !!migrated.dynamicPenalties.crushing : defaultEnabledVal,
      revengeFail: migrated.dynamicPenalties.revengeFail !== undefined ? !!migrated.dynamicPenalties.revengeFail : defaultEnabledVal,
      championWeight: migrated.dynamicPenalties.championWeight !== undefined ? !!migrated.dynamicPenalties.championWeight : defaultEnabledVal,
      lossStreak: migrated.dynamicPenalties.lossStreak !== undefined ? !!migrated.dynamicPenalties.lossStreak : defaultEnabledVal,
      ...migrated.dynamicPenalties
    };
  } else {
    migrated.dynamicPenalties = { ...DEFAULT_DYNAMIC_PENALTIES };
  }

  // 4. Migrate "dynamicBonuses"
  if (migrated.dynamicBonuses) {
    migrated.dynamicBonuses = {
      ...DEFAULT_DYNAMIC_BONUSES,
      ...migrated.dynamicBonuses,
      mentoring: {
        ...DEFAULT_DYNAMIC_BONUSES.mentoring,
        ...(migrated.dynamicBonuses.mentoring || {})
      }
    };
  } else {
    migrated.dynamicBonuses = { ...DEFAULT_DYNAMIC_BONUSES };
  }

  // Project back for UI compatibility
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

  const isAnyDecayEnabled = Object.values(migrated.decaySettings).some((d: any) => d.enabled);
  migrated.decayEnabled = isAnyDecayEnabled;
  migrated.decayDays = Number(migrated.decaySettings.platinum.inactiveDays);
  migrated.decayAmount = Number(migrated.decaySettings.platinum.decayRp);
  const decayTiersArr: string[] = [];
  if (migrated.decaySettings.bronze.enabled) decayTiersArr.push("Bronze");
  if (migrated.decaySettings.silver.enabled) decayTiersArr.push("Silver");
  if (migrated.decaySettings.gold.enabled) decayTiersArr.push("Gold");
  if (migrated.decaySettings.platinum.enabled) decayTiersArr.push("Platinum");
  if (migrated.decaySettings.diamond.enabled) decayTiersArr.push("Diamond");
  migrated.decayTiers = decayTiersArr;

  return migrated;
}
