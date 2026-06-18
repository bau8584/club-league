import type { TiersRecord, DecaySettingsRecord, DynamicPenalties, DynamicBonuses, TierName } from "./league-types";
import { STANDARD_BONUSES, STANDARD_PENALTIES } from "./league-presets";

// 표준(약간 성장형) 기본 티어 — league-presets STANDARD 와 정합
export const DEFAULT_TIERS: TiersRecord = {
  bronze: { threshold: 0, winRp: 24, loseRp: 6 },
  silver: { threshold: 870, winRp: 20, loseRp: 12 },
  gold: { threshold: 1120, winRp: 16, loseRp: 16 },
  platinum: { threshold: 1400, winRp: 13, loseRp: 21 },
  diamond: { threshold: 1720, winRp: 11, loseRp: 27 }
};

// 휴면 감점은 "기준일수(inactiveDays) 동안 미경기 시 사이클당 1회"만 차감된다.
// (한 번 깎인 뒤 다시 기준일수가 지나야 다음 1회 감점 — 매일 누적이 아님)
// 초보 보호를 위해 하위 티어(브론즈·실버)는 기본 비활성, 상위 티어일수록 차감 폭을 키운다.
export const DEFAULT_DECAY_SETTINGS: DecaySettingsRecord = {
  bronze: { enabled: false, inactiveDays: 10, decayRp: 5 },
  silver: { enabled: false, inactiveDays: 10, decayRp: 5 },
  gold: { enabled: true, inactiveDays: 10, decayRp: 5 },
  platinum: { enabled: true, inactiveDays: 10, decayRp: 7 },
  diamond: { enabled: true, inactiveDays: 10, decayRp: 10 }
};

// 표준 보너스/패널티 — league-presets STANDARD 를 단일 소스로 사용
export const DEFAULT_DYNAMIC_PENALTIES: DynamicPenalties = STANDARD_PENALTIES;
export const DEFAULT_DYNAMIC_BONUSES: DynamicBonuses = STANDARD_BONUSES;

export function migrateSettings(rawSettings: any): any {
  if (!rawSettings) return null;

  const migrated = { ...rawSettings };

  // 1. Migrate "tiers" (RP & thresholds)
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
    const days = migrated.decayDays !== undefined ? Number(migrated.decayDays) : 10;
    const amount = migrated.decayAmount !== undefined ? Number(migrated.decayAmount) : 5;
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
