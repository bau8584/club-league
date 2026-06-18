import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TierName, TierSettings, DynamicBonuses, DynamicPenalties, DecaySettingsRecord } from "@/lib/league-types";
import type { ActiveBonuses } from "@/lib/league-store";
import {
  THRESHOLD_PRESETS, WINLOSS_PRESETS, BONUS_PRESETS, PENALTY_PRESETS,
  detectThresholdPreset, detectWinlossPreset, detectBonusPreset, detectPenaltyPreset,
  bonusesFromPreset, penaltiesFromPreset,
  type ThresholdPreset, type WinlossPreset, type BonusPreset, type PenaltyPreset,
} from "@/lib/league-presets";

const PENALTY_TIERS = [
  { key: "Gold", label: "골드", colorClass: "text-tier-gold" },
  { key: "Platinum", label: "플래티넘", colorClass: "text-tier-platinum" },
  { key: "Diamond", label: "다이아", colorClass: "text-tier-diamond" },
] as const;

const PENALTY_ITEMS = [
  {
    key: "arrogance",
    title: "👤 오만함의 대가 (2단계 아래에 패배)",
    stateKey: "arrogance" as const,
    tierKeys: { Gold: "arroganceGold", Platinum: "arrogancePlatinum", Diamond: "arroganceDiamond" } as const,
  },
  {
    key: "crushing",
    title: "💥 굴욕적 완패 (5점 차 이상 완패)",
    stateKey: "crushing" as const,
    tierKeys: { Gold: "crushingGold", Platinum: "crushingPlatinum", Diamond: "crushingDiamond" } as const,
  },
  {
    key: "revengeFail",
    title: "😈 복수 허용 (상대 복수전 성공)",
    stateKey: "revengeFail" as const,
    tierKeys: { Gold: "revengeAllowedGold", Platinum: "revengeAllowedPlatinum", Diamond: "revengeAllowedDiamond" } as const,
  },
  {
    key: "championWeight",
    title: "👑 챔피언의 무게 (패배 가중치)",
    stateKey: "championWeight" as const,
    tierKeys: { Gold: "championGold", Platinum: "championPlatinum", Diamond: "championDiamond" } as const,
  },
] as const;

const SWAMP_TIERS = [
  { key: "Gold", label: "골드", keys: ["swampGold2", "swampGold3"] as const },
  { key: "Platinum", label: "플래", keys: ["swampPlatinum2", "swampPlatinum3"] as const },
  { key: "Diamond", label: "다이아", keys: ["swampDiamond2", "swampDiamond3"] as const },
] as const;

const UNDERDOG_LEVELS = [
  { key: "underdogDiff1Rp" as const, label: "1티어 차이", defaultVal: 5 },
  { key: "underdogDiff2Rp" as const, label: "2티어 차이", defaultVal: 10 },
  { key: "underdogDiff3Rp" as const, label: "3티어+ 차이", defaultVal: 15 },
] as const;

const GREAT_MATCH_DIFFS = [
  { label: "1점차 (승/패)", winKey: "greatMatchWin1Rp" as const, loseKey: "greatMatchLose1Rp" as const },
  { label: "2점차 (승/패)", winKey: "greatMatchWin2Rp" as const, loseKey: "greatMatchLose2Rp" as const },
  { label: "3점차 (승/패)", winKey: "greatMatchWin3Rp" as const, loseKey: "greatMatchLose3Rp" as const },
] as const;

// 보너스 점수 카드들의 개별 활성화 플래그 — '전체 활성화' 토글이 한 번에 켜고 끈다.
const BONUS_ENABLE_KEYS = [
  "firstWinEnabled",
  "revengeEnabled",
  "underdogEnabled",
  "freshnessEnabled",
  "streakEnabled",
  "greatMatchEnabled",
  "lossComfortEnabled",
  "willOfSteelEnabled",
] as const;

// 패널티 카드들의 개별 활성화 플래그 — '전체 활성화' 토글이 한 번에 켜고 끈다.
const PENALTY_ENABLE_KEYS = [
  "arrogance",
  "crushing",
  "revengeFail",
  "championWeight",
  "lossStreak",
] as const;

const WILL_OF_STEEL_LEVELS = [
  { key: "willOfSteel3Rp" as const, label: "3연패 탈출", defaultVal: 10 },
  { key: "willOfSteel4Rp" as const, label: "4연패 탈출", defaultVal: 15 },
  { key: "willOfSteel5Rp" as const, label: "5연패+ 탈출", defaultVal: 20 },
] as const;

// Reusable local toggle switch to remove 17 blocks of inline buttons
const ToggleSwitch = ({
  checked,
  onChange,
  activeColor = "bg-neon-blue",
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  activeColor?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={cn(
      "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
      checked ? activeColor : "bg-muted",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    <div
      className={cn(
        "size-4 rounded-full bg-white transition-transform shadow-sm",
        checked ? "translate-x-3" : "translate-x-0"
      )}
    />
  </button>
);

// 카드 펼치기/접기 헤더 토글 — 기능 스위치(파란 토글)와 헷갈리지 않도록 셰브론(▾) 사용.
const CollapseToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold select-none hover:text-foreground transition-colors"
    aria-expanded={open}
  >
    {open ? "닫기" : "열기"}
    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
  </button>
);

// 저장되지 않은 변경이 있을 때 저장 버튼 옆에 표시 — 수정값이 조용히 사라지는 것을 방지.
const UnsavedBadge = ({ show }: { show: boolean }) =>
  show ? (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> 미저장 변경
    </span>
  ) : null;

// Reusable wrapper card for dynamic bonuses.
// 활성 시 파란 색조, 비활성 시 회색조로 시각 대비를 준다. desc로 짧은 설명을 표시.
const BonusCardWrapper = ({
  title,
  desc,
  enabled,
  onToggle,
  className,
  accent = "blue",
  children,
}: {
  title: string;
  desc?: string;
  enabled: boolean;
  onToggle: () => void;
  className?: string;
  accent?: "blue" | "rose";
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col justify-between p-3.5 rounded-xl border space-y-2.5 transition-colors",
      enabled
        ? accent === "rose"
          ? "border-rose-500/35 bg-rose-500/[0.07]"
          : "border-neon-blue/35 bg-neon-blue/[0.07]"
        : "border-border/30 bg-muted/15 opacity-70",
      className
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-0.5">
        <span className="text-xs font-bold text-foreground block">{title}</span>
        {desc && <span className="text-[10px] text-muted-foreground leading-snug block">{desc}</span>}
      </div>
      <ToggleSwitch checked={enabled} onChange={onToggle} activeColor={accent === "rose" ? "bg-rose-500" : "bg-neon-blue"} />
    </div>
    {children}
  </div>
);

// Reusable component for basic single-input dynamic bonuses
const SimpleBonusCard = ({
  title,
  desc,
  enabled,
  onToggle,
  val,
  onChangeVal,
}: {
  title: string;
  desc?: string;
  enabled: boolean;
  onToggle: () => void;
  val: number;
  onChangeVal: (val: number) => void;
}) => (
  <BonusCardWrapper title={title} desc={desc} enabled={enabled} onToggle={onToggle}>
    <div className="flex items-center gap-2 text-xs">
      <Input
        type="number"
        value={val}
        disabled={!enabled}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChangeVal(isNaN(v) ? 0 : v);
        }}
        className="w-16 h-7 text-center font-mono font-bold bg-input border-border/40 text-neon-blue p-0"
      />
      <span className="text-[10px] text-muted-foreground">RP 추가</span>
    </div>
  </BonusCardWrapper>
);

export interface AdminSettingsProps {
  thresholds?: Record<TierName, number>;
  rpVariables?: { winDelta: number; loseDelta: number };
  onUpdateSettings?: (thresholds: Record<TierName, number>, rpVars: { winDelta: number; loseDelta: number }) => void;
  title?: string;
  activeBonuses?: ActiveBonuses;
  onSaveLeagueSettings?: (
    title: string,
    bonuses: ActiveBonuses,
    tierSettings?: TierSettings,
    dynamicBonuses?: DynamicBonuses,
    dynamicPenalties?: DynamicPenalties
  ) => Promise<void>;
  
  // Decay settings and extra stores passed as props
  decayEnabled: boolean;
  decayDays: number;
  decayAmount: number;
  decayTiers: TierName[];
  decaySettings?: DecaySettingsRecord;
  saveDecaySettings: (enabled: boolean, days: number, amount: number, tiers: TierName[], perTierRp?: Partial<Record<TierName, number>>) => Promise<void> | void;
  lockLeaderboard?: boolean;
  lockAdmin?: boolean;
  saveLockSetting?: (which: "leaderboard" | "admin", enabled: boolean) => Promise<void> | void;
  accessCode?: string;
  isOwner?: boolean;
  tierSettings: TierSettings | null;
  dynamicBonuses: DynamicBonuses | null;
  dynamicPenalties: DynamicPenalties | null;
}

export function AdminSettings({
  thresholds,
  rpVariables,
  onUpdateSettings,
  title,
  activeBonuses,
  onSaveLeagueSettings,
  decayEnabled,
  decayDays,
  decayAmount,
  decayTiers,
  decaySettings,
  saveDecaySettings,
  lockLeaderboard = false,
  lockAdmin = false,
  saveLockSetting,
  accessCode = "",
  isOwner = false,
  tierSettings,
  dynamicBonuses,
  dynamicPenalties,
}: AdminSettingsProps) {
  const [isTitleCustomOpen, setIsTitleCustomOpen] = useState(false);
  const [isTierCustomOpen, setIsTierCustomOpen] = useState(false);
  const [isBonusCustomOpen, setIsBonusCustomOpen] = useState(false);
  const [isPenaltyCustomOpen, setIsPenaltyCustomOpen] = useState(false);

  // Decay settings
  const [localDecayEnabled, setLocalDecayEnabled] = useState(decayEnabled);
  const [localDecayDays, setLocalDecayDays] = useState(decayDays.toString());
  const [localDecayTiers, setLocalDecayTiers] = useState<TierName[]>(decayTiers);
  // 티어별 1회 차감 RP (티어마다 다르게 설정). decaySettings(소문자 키)에서 초기화.
  const [localTierRp, setLocalTierRp] = useState<Record<TierName, string>>(() => ({
    Bronze: String(decaySettings?.bronze?.decayRp ?? decayAmount),
    Silver: String(decaySettings?.silver?.decayRp ?? decayAmount),
    Gold: String(decaySettings?.gold?.decayRp ?? decayAmount),
    Platinum: String(decaySettings?.platinum?.decayRp ?? decayAmount),
    Diamond: String(decaySettings?.diamond?.decayRp ?? decayAmount),
  }));

  // Tier specific settings
  const [localTierSettings, setLocalTierSettings] = useState<TierSettings>(() => tierSettings || {
    Bronze: { winDelta: 25, loseDelta: 20 },
    Silver: { winDelta: 25, loseDelta: 20 },
    Gold: { winDelta: 25, loseDelta: 20 },
    Platinum: { winDelta: 25, loseDelta: 20 }
  });

  const [activeTierTab, setActiveTierTab] = useState<TierName>("Bronze");

  const [localDynamicBonuses, setLocalDynamicBonuses] = useState<DynamicBonuses>(() => dynamicBonuses || {
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
    willOfSteel5Rp: 20
  });

  const [localDynamicPenalties, setLocalDynamicPenalties] = useState<DynamicPenalties>(() => dynamicPenalties || {
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
  });

  // Sync states when database changes
  useEffect(() => {
    setLocalDecayEnabled(decayEnabled);
  }, [decayEnabled]);

  useEffect(() => {
    setLocalDecayDays(decayDays.toString());
  }, [decayDays]);

  useEffect(() => {
    setLocalDecayTiers(decayTiers);
  }, [decayTiers]);

  useEffect(() => {
    if (decaySettings) {
      setLocalTierRp({
        Bronze: String(decaySettings.bronze?.decayRp ?? decayAmount),
        Silver: String(decaySettings.silver?.decayRp ?? decayAmount),
        Gold: String(decaySettings.gold?.decayRp ?? decayAmount),
        Platinum: String(decaySettings.platinum?.decayRp ?? decayAmount),
        Diamond: String(decaySettings.diamond?.decayRp ?? decayAmount),
      });
    }
  }, [decaySettings, decayAmount]);

  useEffect(() => {
    if (tierSettings) {
      setLocalTierSettings(tierSettings);
    }
  }, [tierSettings]);

  useEffect(() => {
    if (dynamicBonuses) {
      setLocalDynamicBonuses(dynamicBonuses);
    }
  }, [dynamicBonuses]);

  useEffect(() => {
    if (dynamicPenalties) {
      setLocalDynamicPenalties(dynamicPenalties);
    }
  }, [dynamicPenalties]);

  // League environment settings
  const [localTitle, setLocalTitle] = useState(title || "");
  const [localBonuses, setLocalBonuses] = useState<ActiveBonuses>({
    firstWin: activeBonuses?.firstWin ?? true,
    revenge: activeBonuses?.revenge ?? true,
    underdog: activeBonuses?.underdog ?? true,
    scoreDiff: activeBonuses?.scoreDiff ?? true,
    rival: activeBonuses?.rival ?? true,
  });

  useEffect(() => {
    if (title) setLocalTitle(title);
  }, [title]);

  useEffect(() => {
    if (activeBonuses) {
      setLocalBonuses(activeBonuses);
    }
  }, [activeBonuses]);

  // Tier & RP manually settings (Consolidated)
  const [inputThresholds, setInputThresholds] = useState<Record<TierName, string>>(() => ({
    Bronze: thresholds?.Bronze?.toString() ?? "0",
    Silver: thresholds?.Silver?.toString() ?? "1000",
    Gold: thresholds?.Gold?.toString() ?? "1200",
    Platinum: thresholds?.Platinum?.toString() ?? "1400",
    Diamond: thresholds?.Diamond?.toString() ?? "1600",
  }));

  const [inputWinDelta, setInputWinDelta] = useState(rpVariables?.winDelta?.toString() ?? "25");
  const [inputLoseDelta, setInputLoseDelta] = useState(rpVariables?.loseDelta?.toString() ?? "20");

  const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>(() => detectThresholdPreset({
    Bronze: "0",
    Silver: thresholds?.Silver?.toString() ?? "1000",
    Gold: thresholds?.Gold?.toString() ?? "1200",
    Platinum: thresholds?.Platinum?.toString() ?? "1400",
    Diamond: thresholds?.Diamond?.toString() ?? "1600",
  }));
  const [winlossPreset, setWinlossPreset] = useState<WinlossPreset>(() => detectWinlossPreset(
    tierSettings || { Bronze: { winDelta: 20, loseDelta: 0 }, Silver: { winDelta: 15, loseDelta: 5 }, Gold: { winDelta: 15, loseDelta: 10 }, Platinum: { winDelta: 10, loseDelta: 15 } },
    rpVariables?.winDelta?.toString() ?? "10",
    rpVariables?.loseDelta?.toString() ?? "20"
  ));

  useEffect(() => {
    if (thresholds) {
      setInputThresholds({
        Bronze: thresholds.Bronze?.toString() ?? "0",
        Silver: thresholds.Silver?.toString() ?? "1000",
        Gold: thresholds.Gold?.toString() ?? "1200",
        Platinum: thresholds.Platinum?.toString() ?? "1400",
        Diamond: thresholds.Diamond?.toString() ?? "1600",
      });
    }
  }, [thresholds]);

  useEffect(() => {
    if (rpVariables) {
      setInputWinDelta(rpVariables.winDelta?.toString() ?? "25");
      setInputLoseDelta(rpVariables.loseDelta?.toString() ?? "20");
    }
  }, [rpVariables]);

  useEffect(() => {
    if (thresholds) {
      setThresholdPreset(detectThresholdPreset({
        Bronze: "0",
        Silver: thresholds.Silver?.toString() ?? "1000",
        Gold: thresholds.Gold?.toString() ?? "1200",
        Platinum: thresholds.Platinum?.toString() ?? "1400",
        Diamond: thresholds.Diamond?.toString() ?? "1600",
      }));
    }
  }, [thresholds]);

  useEffect(() => {
    if (rpVariables && tierSettings) {
      setWinlossPreset(detectWinlossPreset(tierSettings, rpVariables.winDelta?.toString() ?? "10", rpVariables.loseDelta?.toString() ?? "20"));
    }
  }, [rpVariables, tierSettings]);

  const handleSaveTitle = async () => {
    if (!localTitle.trim()) {
      return toast.error("리그 이름을 입력해 주세요.");
    }
    const savePromise = (async () => {
      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          localTierSettings,
          localDynamicBonuses,
          localDynamicPenalties
        );
      }
    })();
    toast.promise(savePromise, {
      loading: "리그 이름 저장 중...",
      success: "리그 이름이 성공적으로 저장되었습니다!",
      error: "리그 이름 저장 실패. 다시 시도해 주세요."
    });
  };

  const handleSaveTierSettings = async () => {
    const b = parseInt(inputThresholds.Bronze, 10);
    const s = parseInt(inputThresholds.Silver, 10);
    const g = parseInt(inputThresholds.Gold, 10);
    const p = parseInt(inputThresholds.Platinum, 10);
    const d = parseInt(inputThresholds.Diamond, 10);

    const winD = parseInt(inputWinDelta, 10);
    const loseD = parseInt(inputLoseDelta, 10);

    if (isNaN(b) || isNaN(s) || isNaN(g) || isNaN(p) || isNaN(d) || isNaN(winD) || isNaN(loseD)) {
      return toast.error("모든 설정값은 유효한 정수여야 합니다.");
    }

    if (b < 0 || s < 0 || g < 0 || p < 0 || d < 0 || winD < 0 || loseD < 0) {
      return toast.error("점수 설정은 0점 이상이어야 합니다.");
    }

    // 티어 기준점은 브론즈<실버<골드<플래티넘<다이아 순으로 증가해야 한다 (거꾸로 된 사다리 방지).
    if (!(b < s && s < g && g < p && p < d)) {
      return toast.error("티어 기준점은 브론즈 < 실버 < 골드 < 플래티넘 < 다이아 순으로 높아야 합니다.");
    }

    const savePromise = (async () => {
      if (onUpdateSettings) {
        await onUpdateSettings(
          { Bronze: b, Silver: s, Gold: g, Platinum: p, Diamond: d },
          { winDelta: winD, loseDelta: loseD }
        );
      }

      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          localTierSettings,
          localDynamicBonuses,
          localDynamicPenalties
        );
      }
    })();

    toast.promise(savePromise, {
      loading: "티어 설정 저장 중...",
      success: "티어 설정이 안전하게 저장되었습니다!",
      error: "티어 설정 저장 실패. 다시 시도해 주세요."
    });
  };

  const handleSaveBonuses = async () => {
    const savePromise = (async () => {
      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          localTierSettings,
          localDynamicBonuses,
          localDynamicPenalties
        );
      }
    })();
    toast.promise(savePromise, {
      loading: "글로벌 보너스 설정 저장 중...",
      success: "글로벌 보너스 설정이 성공적으로 저장되었습니다!",
      error: "글로벌 보너스 설정 저장 실패. 다시 시도해 주세요."
    });
  };

  const handleSavePenalties = async () => {
    // 휴면 감점(decay) 설정도 이 단계에서 함께 저장한다.
    const decayDaysNum = parseInt(localDecayDays, 10);
    if (localDecayEnabled && (isNaN(decayDaysNum) || decayDaysNum <= 0)) {
      return toast.error("기준 미활동 일수는 1 이상의 정수여야 합니다.");
    }

    // 켜진 티어별 1회 차감 RP를 수집·검증
    const perTierRp: Partial<Record<TierName, number>> = {};
    if (localDecayEnabled) {
      for (const t of localDecayTiers) {
        const v = parseInt(localTierRp[t], 10);
        if (isNaN(v) || v <= 0) {
          const labelMap: Record<string, string> = { Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드" };
          return toast.error(`${labelMap[t]} 티어의 차감 RP는 1 이상의 정수여야 합니다.`);
        }
        perTierRp[t] = v;
      }
    }
    // 레거시 단일 amount 호환값: 첫 켜진 티어 값 또는 기존값
    const legacyAmount = localDecayTiers.length > 0 ? (perTierRp[localDecayTiers[0]] ?? decayAmount) : decayAmount;

    const savePromise = (async () => {
      await saveDecaySettings(
        localDecayEnabled,
        isNaN(decayDaysNum) ? decayDays : decayDaysNum,
        legacyAmount,
        localDecayTiers,
        perTierRp
      );
      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          localTierSettings,
          localDynamicBonuses,
          localDynamicPenalties
        );
      }
    })();
    toast.promise(savePromise, {
      loading: "패널티 설정 저장 중...",
      success: "패널티 설정이 성공적으로 저장되었습니다!",
      error: "패널티 설정 저장 실패. 다시 시도해 주세요."
    });
  };

  // 미저장 변경 감지 — 저장된 값(props)이 존재할 때만 비교해 false-positive를 막는다.
  const titleDirty = !!title && localTitle !== title;
  const tierDirty =
    (!!tierSettings && JSON.stringify(localTierSettings) !== JSON.stringify(tierSettings)) ||
    (!!thresholds && (
      inputThresholds.Silver !== String(thresholds.Silver) ||
      inputThresholds.Gold !== String(thresholds.Gold) ||
      inputThresholds.Platinum !== String(thresholds.Platinum) ||
      inputThresholds.Diamond !== String(thresholds.Diamond)
    )) ||
    (!!rpVariables && (
      inputWinDelta !== String(rpVariables.winDelta) ||
      inputLoseDelta !== String(rpVariables.loseDelta)
    ));
  const bonusDirty = !!dynamicBonuses && JSON.stringify(localDynamicBonuses) !== JSON.stringify(dynamicBonuses);
  const penaltyDirty = !!dynamicPenalties && JSON.stringify(localDynamicPenalties) !== JSON.stringify(dynamicPenalties);

  // 보너스/패널티 프리셋은 현재 값에서 파생 탐지(항목을 손대면 자동 '사용자 설정')
  const bonusPreset = detectBonusPreset(localDynamicBonuses);
  const penaltyPreset = detectPenaltyPreset(localDynamicPenalties);

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
      {/* 0. 화면 잠금 설정 카드 — 소유자 전용 */}
      {isOwner && (
        <Card className="border border-amber-500/40 bg-amber-500/[0.06] p-6 backdrop-blur shadow-xl">
          <div className="space-y-3">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider block">🔒 화면 잠금</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md">
              태블릿을 학생에게 맡길 때 켜세요. 잠긴 화면은 <b>리그 코드(4자리)</b>를 입력해야 열리며, 경기 기록 입력 화면은 그대로 열려 있습니다.
            </p>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/30 px-3 py-2.5">
              <span className="text-[11px] font-bold text-foreground">🏆 순위표 잠그기</span>
              <ToggleSwitch
                checked={lockLeaderboard}
                onChange={() => saveLockSetting?.("leaderboard", !lockLeaderboard)}
                activeColor="bg-amber-500"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/30 px-3 py-2.5">
              <span className="text-[11px] font-bold text-foreground">⚙️ 관리자 탭 잠그기</span>
              <ToggleSwitch
                checked={lockAdmin}
                onChange={() => saveLockSetting?.("admin", !lockAdmin)}
                activeColor="bg-amber-500"
              />
            </div>

            {(lockLeaderboard || lockAdmin) && !accessCode && (
              <p className="text-[10px] font-bold text-destructive leading-snug bg-destructive/10 rounded-lg px-2.5 py-1.5 border border-destructive/30">
                ⚠️ 이 리그에 코드가 설정되어 있지 않아 잠금이 동작하지 않습니다. 리그 생성 시 코드를 설정해야 잠금을 쓸 수 있습니다.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/80 leading-snug bg-background/30 rounded-lg px-2.5 py-1.5 border border-border/20">
              💡 코드로 한 번 열면 헤더의 <b>“다시 잠그기”</b> 버튼이나 새로고침 전까지 열린 상태가 유지됩니다. 기록관도 같은 코드를 사용합니다.
            </p>
          </div>
        </Card>
      )}

      {/* 1. League Title Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">리그 이름 설정</span>
            <UnsavedBadge show={titleDirty} />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder="예: 2026 초등 리그전"
              className="h-10 flex-1 border-border/50 bg-input hover:bg-input focus:bg-background/80 transition-all font-sans text-xs text-foreground"
            />
            <Button
              onClick={handleSaveTitle}
              className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black px-4 h-10 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-[11px]"
            >
              <Save className="size-3.5 mr-1" /> 저장
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. Tier-specific Settings Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">티어 세부 설정</span>
            <CollapseToggle open={isTierCustomOpen} onToggle={() => setIsTierCustomOpen(!isTierCustomOpen)} />
          </div>

          {isTierCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* 독립 프리셋: 기준점 / 승패 */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* 축 A: 기준점 프리셋 (시즌 길이) */}
                <div className="bg-background/20 rounded-lg p-3 border border-border/20 space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground block">📐 기준점 프리셋 <span className="text-muted-foreground/70 font-normal">(시즌 길이)</span></label>
                  <select
                    value={thresholdPreset}
                    onChange={(e) => {
                      const key = e.target.value as ThresholdPreset;
                      setThresholdPreset(key);
                      if (key !== "custom") {
                        const v = THRESHOLD_PRESETS[key];
                        setInputThresholds({ Bronze: "0", Silver: v.Silver.toString(), Gold: v.Gold.toString(), Platinum: v.Platinum.toString(), Diamond: v.Diamond.toString() });
                      }
                    }}
                    className="w-full h-8 px-2 rounded bg-input border border-border/30 text-xs text-foreground focus:ring-1 focus:ring-neon-blue focus:outline-none"
                  >
                    {(["short", "standard", "long", "bell"] as const).map((k) => (
                      <option key={k} value={k} className="bg-card">{THRESHOLD_PRESETS[k].label}</option>
                    ))}
                    <option value="custom" className="bg-card">🛠️ 사용자 설정</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-snug min-h-[26px]">
                    {thresholdPreset === "custom" ? "표를 직접 편집한 사용자 설정입니다." : THRESHOLD_PRESETS[thresholdPreset].desc}
                  </p>
                </div>

                {/* 축 B: 승/패 RP 프리셋 (반응형) */}
                <div className="bg-background/20 rounded-lg p-3 border border-border/20 space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground block">⚔️ 승/패 RP 프리셋 <span className="text-muted-foreground/70 font-normal">(분포 보고 조절)</span></label>
                  <select
                    value={winlossPreset}
                    onChange={(e) => {
                      const key = e.target.value as WinlossPreset;
                      setWinlossPreset(key);
                      if (key !== "custom") {
                        const v = WINLOSS_PRESETS[key].tiers;
                        setInputWinDelta(v.Diamond.winDelta.toString());
                        setInputLoseDelta(v.Diamond.loseDelta.toString());
                        setLocalTierSettings(prev => {
                          const next = { ...prev };
                          (["Bronze", "Silver", "Gold", "Platinum"] as const).forEach((tier) => {
                            next[tier] = { winDelta: v[tier].winDelta, loseDelta: v[tier].loseDelta };
                          });
                          return next;
                        });
                      }
                    }}
                    className="w-full h-8 px-2 rounded bg-input border border-border/30 text-xs text-foreground focus:ring-1 focus:ring-neon-blue focus:outline-none"
                  >
                    {(["balanced", "speed", "growth", "strict"] as const).map((k) => (
                      <option key={k} value={k} className="bg-card">{WINLOSS_PRESETS[k].label}</option>
                    ))}
                    <option value="custom" className="bg-card">🛠️ 사용자 설정</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-snug min-h-[26px]">
                    {winlossPreset === "custom" ? "표를 직접 편집한 사용자 설정입니다." : WINLOSS_PRESETS[winlossPreset].desc}
                  </p>
                </div>
              </div>

              {/* 티어 표: 모든 티어를 한눈에 편집 */}
              <div className="overflow-x-auto rounded-lg border border-border/25">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left font-bold">티어</th>
                      <th className="px-2 py-2 text-center font-bold">기준점 (RP)</th>
                      <th className="px-2 py-2 text-center font-bold text-emerald-500">승리 시 +RP</th>
                      <th className="px-2 py-2 text-center font-bold text-rose-500">패배 시 −RP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map((t, idx) => {
                      const labelMap: Record<string, string> = {
                        Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드"
                      };
                      const colorClassMap: Record<string, string> = {
                        Bronze: "text-tier-bronze", Silver: "text-tier-silver", Gold: "text-tier-gold", Platinum: "text-tier-platinum", Diamond: "text-tier-diamond"
                      };
                      const borderColorMap: Record<string, string> = {
                        Bronze: "border-l-tier-bronze", Silver: "border-l-tier-silver", Gold: "border-l-tier-gold", Platinum: "border-l-tier-platinum", Diamond: "border-l-tier-diamond"
                      };
                      const winVal = t === "Diamond" ? inputWinDelta : (localTierSettings[t]?.winDelta?.toString() ?? "15");
                      const loseVal = t === "Diamond" ? inputLoseDelta : (localTierSettings[t]?.loseDelta?.toString() ?? "10");
                      return (
                        <tr
                          key={t}
                          className={cn(
                            "border-t border-border/20 transition-colors hover:bg-neon-blue/[0.04]",
                            idx % 2 === 1 && "bg-muted/[0.18]"
                          )}
                        >
                          <td className={cn("px-3 py-1.5 font-black whitespace-nowrap border-l-2 bg-muted/20", borderColorMap[t])}>
                            <span className={colorClassMap[t]}>{labelMap[t]}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={inputThresholds[t]}
                              disabled={t === "Bronze"}
                              onChange={(e) => {
                                setThresholdPreset("custom");
                                const val = e.target.value;
                                setInputThresholds(prev => ({ ...prev, [t]: val }));
                              }}
                              className="h-8 font-mono text-center font-bold bg-input border-border/30 text-foreground"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={winVal}
                              onChange={(e) => {
                                setWinlossPreset("custom");
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val)) return;
                                if (t === "Diamond") {
                                  setInputWinDelta(val.toString());
                                } else {
                                  setLocalTierSettings(prev => ({ ...prev, [t]: { ...prev[t], winDelta: val } }));
                                }
                              }}
                              className="h-8 font-mono text-center font-bold text-emerald-500 bg-input border-border/30"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={loseVal}
                              onChange={(e) => {
                                setWinlossPreset("custom");
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val)) return;
                                if (t === "Diamond") {
                                  setInputLoseDelta(val.toString());
                                } else {
                                  setLocalTierSettings(prev => ({ ...prev, [t]: { ...prev[t], loseDelta: val } }));
                                }
                              }}
                              className="h-8 font-mono text-center font-bold text-rose-500 bg-input border-border/30"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug space-y-1">
                <p>※ 브론즈 기준점은 0으로 고정됩니다.</p>
                <p className="text-amber-500/90">
                  💡 승/패 프리셋으로 <b>큰 방향</b>을 잡고, 보너스·패널티는 <b>상황 보정</b>으로만 쓰세요. 같은 방향(예: 성장 곡선 + 하위 보너스, 정밀 곡선 + 상위 패널티)을 둘 다 세게 켜면 과도해질 수 있습니다.
                </p>
              </div>

              {/* Save button at the bottom of Step 2 card */}
              <div className="flex justify-between items-center pt-2 border-t border-border/10">
                <UnsavedBadge show={tierDirty} />
                <Button
                  onClick={handleSaveTierSettings}
                  className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black px-4 h-8 transition-all active:scale-95 rounded-xl shadow-md font-sans text-[11px]"
                >
                  <Save className="size-3.5 mr-1" /> 저장
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 3. Global Bonus Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">보너스 점수 설정</span>
            <CollapseToggle open={isBonusCustomOpen} onToggle={() => setIsBonusCustomOpen(!isBonusCustomOpen)} />
          </div>

          {isBonusCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* 보너스 프리셋 */}
              <div className="bg-background/20 rounded-lg p-3 border border-border/20 space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground block">🎁 보너스 프리셋</label>
                <select
                  value={bonusPreset}
                  onChange={(e) => {
                    const key = e.target.value as BonusPreset;
                    if (key !== "custom") setLocalDynamicBonuses(prev => ({ ...prev, ...bonusesFromPreset(key) }));
                  }}
                  className="w-full h-8 px-2 rounded bg-input border border-border/30 text-xs text-foreground focus:ring-1 focus:ring-neon-blue focus:outline-none"
                >
                  {(["balanced", "encourage", "competitive"] as const).map((k) => (
                    <option key={k} value={k} className="bg-card">{BONUS_PRESETS[k].label}</option>
                  ))}
                  <option value="custom" className="bg-card">🛠️ 사용자 설정</option>
                </select>
                <p className="text-[10px] text-muted-foreground leading-snug min-h-[26px]">
                  {bonusPreset === "custom" ? "항목을 직접 조정한 사용자 설정입니다." : BONUS_PRESETS[bonusPreset].desc}
                </p>
              </div>

              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="text-[11px] font-bold text-foreground">보너스 점수 기능 전체 활성화</span>
                <ToggleSwitch
                  checked={BONUS_ENABLE_KEYS.every((k) => localDynamicBonuses[k])}
                  onChange={() => {
                    const allOn = BONUS_ENABLE_KEYS.every((k) => localDynamicBonuses[k]);
                    setLocalDynamicBonuses(prev => ({
                      ...prev,
                      ...Object.fromEntries(BONUS_ENABLE_KEYS.map((k) => [k, !allOn])),
                    }));
                  }}
                />
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                
                {/* 1. firstWin */}
                <SimpleBonusCard
                  title="🌟 오늘의 첫 승"
                  desc="그날 첫 승리를 거두면 추가 RP를 줍니다."
                  enabled={localDynamicBonuses.firstWinEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, firstWinEnabled: !prev.firstWinEnabled }))}
                  val={localDynamicBonuses.firstWinRp}
                  onChangeVal={(val) => setLocalDynamicBonuses(prev => ({ ...prev, firstWinRp: val }))}
                />

                {/* 2. revenge */}
                <SimpleBonusCard
                  title="😈 복수전 성공"
                  desc="이전에 졌던 상대를 이기면 추가 RP."
                  enabled={localDynamicBonuses.revengeEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, revengeEnabled: !prev.revengeEnabled }))}
                  val={localDynamicBonuses.revengeRp}
                  onChangeVal={(val) => setLocalDynamicBonuses(prev => ({ ...prev, revengeRp: val }))}
                />

                {/* 3. underdog */}
                <BonusCardWrapper
                  title="🛡️ 언더독 격파"
                  desc="나보다 높은 티어 상대를 이기면 보너스 (티어 차이가 클수록 ↑)."
                  enabled={localDynamicBonuses.underdogEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, underdogEnabled: !prev.underdogEnabled }))}
                  className="md:col-span-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {UNDERDOG_LEVELS.map((level) => (
                      <div key={level.key}>
                        <label className="text-[9px] text-muted-foreground font-bold block">{level.label}</label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={localDynamicBonuses[level.key] ?? level.defaultVal}
                            disabled={!localDynamicBonuses.underdogEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, [level.key]: isNaN(val) ? 0 : val }));
                            }}
                            className="w-10 h-7 text-center font-mono bg-input border-border/30 p-0 text-neon-blue"
                          />
                          <span className="text-[9px] text-muted-foreground">RP</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </BonusCardWrapper>

                {/* 4. freshness */}
                <BonusCardWrapper
                  title="✨ 신선한 매치"
                  desc="오랜만에 만난 상대와 경기하면 보너스."
                  enabled={localDynamicBonuses.freshnessEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, freshnessEnabled: !prev.freshnessEnabled }))}
                >
                  <div className="flex items-center gap-1 text-[10px] flex-wrap">
                    <span>최근</span>
                    <Input
                      type="number"
                      value={localDynamicBonuses.freshnessGames}
                      disabled={!localDynamicBonuses.freshnessEnabled}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalDynamicBonuses(prev => ({ ...prev, freshnessGames: isNaN(val) ? 0 : val }));
                      }}
                      className="w-8 h-7 text-center font-mono bg-input border-border/30 p-0"
                    />
                    <span>대결無</span>
                    <Input
                      type="number"
                      value={localDynamicBonuses.freshnessRp}
                      disabled={!localDynamicBonuses.freshnessEnabled}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalDynamicBonuses(prev => ({ ...prev, freshnessRp: isNaN(val) ? 0 : val }));
                      }}
                      className="w-8 h-7 text-center font-mono bg-input border-border/30 p-0 text-neon-blue"
                    />
                    <span>RP</span>
                  </div>
                </BonusCardWrapper>

                {/* 5. streak */}
                <BonusCardWrapper
                  title="🔥 연승 행진"
                  desc="연승 중일 때 추가 RP (플래티넘↑ 제외)."
                  enabled={localDynamicBonuses.streakEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, streakEnabled: !prev.streakEnabled }))}
                >
                  <div className="flex items-center gap-1 text-[10px] flex-wrap">
                    <Input
                      type="number"
                      value={localDynamicBonuses.streakWins}
                      disabled={!localDynamicBonuses.streakEnabled}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalDynamicBonuses(prev => ({ ...prev, streakWins: isNaN(val) ? 0 : val }));
                      }}
                      className="w-8 h-7 text-center font-mono bg-input border-border/30 p-0"
                    />
                    <span>연승 시</span>
                    <Input
                      type="number"
                      value={localDynamicBonuses.streakRp}
                      disabled={!localDynamicBonuses.streakEnabled}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalDynamicBonuses(prev => ({ ...prev, streakRp: isNaN(val) ? 0 : val }));
                      }}
                      className="w-8 h-7 text-center font-mono bg-input border-border/30 p-0 text-neon-blue"
                    />
                    <span>RP 추가 (플래티넘↑ 제외)</span>
                  </div>
                </BonusCardWrapper>

                {/* 6. greatMatch */}
                <BonusCardWrapper
                  title="⚔️ 명승부 보너스"
                  desc="점수 차가 적은 접전이면 승자·패자 모두 보너스 (왼쪽=승자, 오른쪽=패자)."
                  enabled={localDynamicBonuses.greatMatchEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, greatMatchEnabled: !prev.greatMatchEnabled }))}
                  className="md:col-span-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {GREAT_MATCH_DIFFS.map((diff) => (
                      <div key={diff.winKey} className="bg-background/20 p-2 rounded text-[10px] text-center space-y-1">
                        <span>{diff.label}</span>
                        <div className="flex justify-center gap-1 mt-0.5">
                          <Input
                            type="number"
                            value={localDynamicBonuses[diff.winKey]}
                            disabled={!localDynamicBonuses.greatMatchEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, [diff.winKey]: isNaN(val) ? 0 : val }));
                            }}
                            className="w-8 h-6 text-center font-mono p-0 bg-input border-border/30 text-neon-blue"
                          />
                          <Input
                            type="number"
                            value={localDynamicBonuses[diff.loseKey]}
                            disabled={!localDynamicBonuses.greatMatchEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, [diff.loseKey]: isNaN(val) ? 0 : val }));
                            }}
                            className="w-8 h-6 text-center font-mono p-0 bg-input border-border/30 text-neon-blue"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </BonusCardWrapper>

                {/* 7. lossComfort */}
                <BonusCardWrapper
                  title="🩹 꺾이지 않는 마음"
                  desc="설정한 티어 이하 학생은 져도 위로 RP를 받습니다."
                  enabled={localDynamicBonuses.lossComfortEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, lossComfortEnabled: !prev.lossComfortEnabled }))}
                >
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span>상한선 티어</span>
                      <select
                        value={localDynamicBonuses.lossComfortMaxTier ?? "Gold"}
                        disabled={!localDynamicBonuses.lossComfortEnabled}
                        onChange={(e) => {
                          const val = e.target.value as TierName;
                          setLocalDynamicBonuses(prev => ({ ...prev, lossComfortMaxTier: val }));
                        }}
                        className="w-full h-7 mt-0.5 px-1.5 rounded bg-input border border-border/30 text-[10px] text-foreground focus:outline-none"
                      >
                        <option value="Bronze" className="bg-card">브론즈 이하</option>
                        <option value="Silver" className="bg-card">실버 이하</option>
                        <option value="Gold" className="bg-card">골드 이하</option>
                        <option value="Platinum" className="bg-card">플래티넘 이하</option>
                        <option value="Diamond" className="bg-card">모든 티어</option>
                      </select>
                    </div>
                    <div>
                      <span>위로 RP</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Input
                          type="number"
                          value={localDynamicBonuses.lossComfortRp}
                          disabled={!localDynamicBonuses.lossComfortEnabled}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicBonuses(prev => ({ ...prev, lossComfortRp: isNaN(val) ? 0 : val }));
                          }}
                          className="w-12 h-7 text-center font-mono font-bold bg-input border-border/30 text-neon-blue p-0"
                        />
                        <span>RP</span>
                      </div>
                    </div>
                  </div>
                </BonusCardWrapper>

                {/* 8. willOfSteel */}
                <BonusCardWrapper
                  title="🔥 불굴의 의지"
                  desc="연패를 끊고 승리하면 보너스 (연패가 길수록 ↑)."
                  enabled={localDynamicBonuses.willOfSteelEnabled ?? false}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, willOfSteelEnabled: !prev.willOfSteelEnabled }))}
                >
                  <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                    {WILL_OF_STEEL_LEVELS.map((level) => (
                      <div key={level.key}>
                        <span>{level.label}</span>
                        <Input
                          type="number"
                          value={localDynamicBonuses[level.key] ?? level.defaultVal}
                          disabled={!localDynamicBonuses.willOfSteelEnabled}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicBonuses(prev => ({ ...prev, [level.key]: isNaN(val) ? 0 : val }));
                          }}
                          className="w-10 h-7 text-center mt-0.5 font-mono p-0 bg-input border-border/30 text-neon-blue mx-auto"
                        />
                      </div>
                    ))}
                  </div>
                </BonusCardWrapper>

              </div>
              
              {/* Save button at the bottom of Step 3 card */}
              <div className="flex justify-between items-center pt-2 border-t border-border/10">
                <UnsavedBadge show={bonusDirty} />
                <Button
                  onClick={handleSaveBonuses}
                  className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black px-4 h-8 transition-all active:scale-95 rounded-xl shadow-md font-sans text-[11px]"
                >
                  <Save className="size-3.5 mr-1" /> 저장
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 4. Global Penalty Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">패널티 설정</span>
            <CollapseToggle open={isPenaltyCustomOpen} onToggle={() => setIsPenaltyCustomOpen(!isPenaltyCustomOpen)} />
          </div>

          {isPenaltyCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* 패널티 프리셋 */}
              <div className="bg-background/20 rounded-lg p-3 border border-border/20 space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground block">🛡️ 패널티 프리셋</label>
                <select
                  value={penaltyPreset}
                  onChange={(e) => {
                    const key = e.target.value as PenaltyPreset;
                    if (key !== "custom") setLocalDynamicPenalties(prev => ({ ...prev, ...penaltiesFromPreset(key) }));
                  }}
                  className="w-full h-8 px-2 rounded bg-input border border-border/30 text-xs text-foreground focus:ring-1 focus:ring-neon-blue focus:outline-none"
                >
                  {(["balanced", "topcontrol", "lenient"] as const).map((k) => (
                    <option key={k} value={k} className="bg-card">{PENALTY_PRESETS[k].label}</option>
                  ))}
                  <option value="custom" className="bg-card">🛠️ 사용자 설정</option>
                </select>
                <p className="text-[10px] text-muted-foreground leading-snug min-h-[26px]">
                  {penaltyPreset === "custom" ? "항목을 직접 조정한 사용자 설정입니다." : PENALTY_PRESETS[penaltyPreset].desc}
                </p>
              </div>

              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="text-[11px] font-bold text-foreground">패널티 기능 전체 활성화</span>
                <ToggleSwitch
                  checked={PENALTY_ENABLE_KEYS.every((k) => localDynamicPenalties[k])}
                  onChange={() => {
                    const allOn = PENALTY_ENABLE_KEYS.every((k) => localDynamicPenalties[k]);
                    setLocalDynamicPenalties(prev => ({
                      ...prev,
                      enabled: !allOn,
                      ...Object.fromEntries(PENALTY_ENABLE_KEYS.map((k) => [k, !allOn])),
                    }));
                  }}
                  activeColor="bg-rose-500"
                />
              </div>

              {(
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  
                  {PENALTY_ITEMS.map((item) => (
                    <div key={item.key} className={cn(
                      "space-y-2 p-3.5 rounded-xl border transition-colors",
                      localDynamicPenalties[item.stateKey]
                        ? "border-rose-500/35 bg-rose-500/[0.07]"
                        : "border-border/30 bg-muted/15 opacity-70"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground">{item.title}</span>
                        <ToggleSwitch
                          checked={localDynamicPenalties[item.stateKey]}
                          onChange={() => setLocalDynamicPenalties(prev => ({ ...prev, [item.stateKey]: !prev[item.stateKey] }))}
                          activeColor="bg-rose-500"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {PENALTY_TIERS.map((tier) => {
                          const stateField = item.tierKeys[tier.key];
                          return (
                            <div key={tier.key}>
                              <label className={cn("text-[9px] block", tier.colorClass)}>{tier.label}</label>
                              <Input
                                type="number"
                                disabled={!localDynamicPenalties[item.stateKey]}
                                value={localDynamicPenalties[stateField] as number}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setLocalDynamicPenalties(prev => ({ ...prev, [stateField]: isNaN(val) ? 0 : val }));
                                }}
                                className="h-7 text-center font-mono mt-0.5 p-0 bg-input border-border/30 text-foreground"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* lossStreak / swamp */}
                  <div className={cn(
                    "space-y-2 p-3.5 rounded-xl border transition-colors md:col-span-2",
                    localDynamicPenalties.lossStreak
                      ? "border-rose-500/35 bg-rose-500/[0.07]"
                      : "border-border/30 bg-muted/15 opacity-70"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">🐊 연패의 늪 (2연패 / 3연패↑ 추가 감점)</span>
                      <ToggleSwitch
                        checked={localDynamicPenalties.lossStreak}
                        onChange={() => setLocalDynamicPenalties(prev => ({ ...prev, lossStreak: !prev.lossStreak }))}
                        activeColor="bg-rose-500"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[9px]">
                      {SWAMP_TIERS.map((tier) => (
                        <div key={tier.key}>
                          <span>{tier.label} (2/3+연패)</span>
                          <div className="flex gap-1 mt-0.5">
                            {tier.keys.map((k) => (
                              <Input
                                key={k}
                                type="number"
                                disabled={!localDynamicPenalties.lossStreak}
                                value={localDynamicPenalties[k]}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setLocalDynamicPenalties(prev => ({ ...prev, [k]: isNaN(val) ? 0 : val }));
                                }}
                                className="h-7 text-center font-mono p-0 bg-input border-border/30 text-foreground w-8"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* redCardPenalty */}
                  <div className="flex justify-between items-center p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] md:col-span-2">
                    <div>
                      <span className="text-xs font-bold text-foreground text-[11px]">🚨 스포츠맨십 위반 (레드카드 감점)</span>
                      <span className="text-[9px] text-muted-foreground block">행동 징계 시 차감할 벌점선</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={localDynamicPenalties.redCardPenalty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setLocalDynamicPenalties(prev => ({ ...prev, redCardPenalty: isNaN(val) ? 0 : val }));
                        }}
                        className="w-16 h-7 text-center font-mono font-bold bg-input border-border/30 text-rose-500 p-0"
                      />
                      <span className="text-[9px] text-rose-500 font-bold">RP</span>
                    </div>
                  </div>

                </div>
              )}

              {/* 휴면 감점 시스템 (이전 2단계에서 이동) */}
              <div className={cn(
                "space-y-3 p-3.5 rounded-xl border transition-colors",
                localDecayEnabled ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-border/30 bg-muted/15 opacity-70"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold text-foreground block">😴 휴면 감점 시스템</span>
                    <span className="text-[10px] text-muted-foreground leading-snug block">기준일수 동안 경기가 없으면 RP를 <b>1회</b> 차감합니다.</span>
                  </div>
                  <ToggleSwitch checked={localDecayEnabled} onChange={() => setLocalDecayEnabled(!localDecayEnabled)} activeColor="bg-amber-500" />
                </div>

                {localDecayEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground">기준 미활동 일수 (모든 티어 공통)</label>
                      <div className="relative max-w-[180px]">
                        <Input
                          type="number"
                          min={1}
                          value={localDecayDays}
                          onChange={(e) => setLocalDecayDays(e.target.value)}
                          className="h-8 border-border/30 bg-input focus:border-amber-500 font-sans text-xs pr-12"
                        />
                        <span className="absolute right-2 top-1.5 text-[10px] text-muted-foreground font-bold">일 이상</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border/20">
                      💡 한 번 차감된 뒤 경기를 하지 않으면 <b>기준일수마다 다시 1회씩</b> 차감됩니다. 경기를 하면 카운트가 초기화됩니다. 학생 화면에는 “차감까지 며칠 남음”이 표시됩니다.
                    </p>
                    {/* 티어별 감점 적용 여부 + 1회 차감 RP */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground block">티어별 1회 차감 RP <span className="text-muted-foreground/70 font-medium">(티어를 켜고 감점값을 따로 지정)</span></label>
                      <div className="space-y-1.5">
                        {(["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map((t) => {
                          const labelMap: Record<string, string> = { Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드" };
                          const on = localDecayTiers.includes(t);
                          return (
                            <div key={t} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setLocalDecayTiers(on ? localDecayTiers.filter((x) => x !== t) : [...localDecayTiers, t])}
                                className={cn(
                                  "w-[78px] shrink-0 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all text-center",
                                  on ? "border-amber-500/50 bg-amber-500/15 text-amber-500" : "border-border/30 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {labelMap[t]}
                              </button>
                              {on ? (
                                <div className="relative flex-1 max-w-[160px]">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={localTierRp[t]}
                                    onChange={(e) => setLocalTierRp((prev) => ({ ...prev, [t]: e.target.value }))}
                                    className="h-8 border-border/30 bg-input focus:border-amber-500 font-sans text-xs text-rose-500 pr-12"
                                  />
                                  <span className="absolute right-2 top-1.5 text-[10px] text-rose-500 font-bold">RP 감점</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/70 font-semibold">감점 없음</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save button at the bottom of Step 4 card */}
              <div className="flex justify-between items-center pt-2 border-t border-border/10">
                <UnsavedBadge show={penaltyDirty} />
                <Button
                  onClick={handleSavePenalties}
                  className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black px-4 h-8 transition-all active:scale-95 rounded-xl shadow-md font-sans text-[11px]"
                >
                  <Save className="size-3.5 mr-1" /> 저장
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
