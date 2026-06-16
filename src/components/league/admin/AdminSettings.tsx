import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, Unlock, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TierName, TierSettings, DynamicBonuses, DynamicPenalties } from "@/lib/league-types";
import type { ActiveBonuses } from "@/lib/league-store";

type PresetType = "standard" | "speedup" | "hardcore" | "underdog" | "custom";

const PRESETS: Record<Exclude<PresetType, "custom">, {
  Bronze: number;
  Silver: number;
  Gold: number;
  Platinum: number;
  Diamond: number;
  winDelta: number;
  loseDelta: number;
}> = {
  standard: { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600, winDelta: 25, loseDelta: 20 },
  speedup: { Bronze: 0, Silver: 800, Gold: 1000, Platinum: 1200, Diamond: 1400, winDelta: 50, loseDelta: 40 },
  hardcore: { Bronze: 0, Silver: 1200, Gold: 1500, Platinum: 1800, Diamond: 2100, winDelta: 15, loseDelta: 25 },
  underdog: { Bronze: 0, Silver: 1100, Gold: 1300, Platinum: 1500, Diamond: 1700, winDelta: 30, loseDelta: 15 }
};

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

const WILL_OF_STEEL_LEVELS = [
  { key: "willOfSteel3Rp" as const, label: "3연패 탈출", defaultVal: 10 },
  { key: "willOfSteel4Rp" as const, label: "4연패 탈출", defaultVal: 15 },
  { key: "willOfSteel5Rp" as const, label: "5연패+ 탈출", defaultVal: 20 },
] as const;

const checkPreset = (
  thresholds: Record<TierName, string>,
  win: string,
  lose: string
): PresetType => {
  const b = parseInt(thresholds.Bronze, 10) || 0;
  const s = parseInt(thresholds.Silver, 10) || 0;
  const g = parseInt(thresholds.Gold, 10) || 0;
  const p = parseInt(thresholds.Platinum, 10) || 0;
  const d = parseInt(thresholds.Diamond, 10) || 0;
  const w = parseInt(win, 10) || 0;
  const l = parseInt(lose, 10) || 0;

  for (const key of ["standard", "speedup", "hardcore", "underdog"] as const) {
    const val = PRESETS[key];
    if (
      val.Bronze === b &&
      val.Silver === s &&
      val.Gold === g &&
      val.Platinum === p &&
      val.Diamond === d &&
      val.winDelta === w &&
      val.loseDelta === l
    ) {
      return key;
    }
  }
  return "custom";
};

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

// Reusable wrapper card for dynamic bonuses
const BonusCardWrapper = ({
  title,
  enabled,
  onToggle,
  className,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={cn("flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2", className)}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-foreground">{title}</span>
      <ToggleSwitch checked={enabled} onChange={onToggle} />
    </div>
    {children}
  </div>
);

// Reusable component for basic single-input dynamic bonuses
const SimpleBonusCard = ({
  title,
  enabled,
  onToggle,
  val,
  onChangeVal,
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
  val: number;
  onChangeVal: (val: number) => void;
}) => (
  <BonusCardWrapper title={title} enabled={enabled} onToggle={onToggle}>
    <div className="flex items-center gap-2 text-xs">
      <Input
        type="number"
        value={val}
        disabled={!enabled}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChangeVal(isNaN(v) ? 0 : v);
        }}
        className="w-16 h-7 text-center font-mono font-bold bg-background/50 border-border/30 text-neon-blue p-0"
      />
      <span className="text-[10px] text-muted-foreground">RP 추가</span>
    </div>
  </BonusCardWrapper>
);

export interface AdminSettingsProps {
  isLocked: boolean;
  onToggleLock: (locked: boolean) => void;
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
  saveDecaySettings: (enabled: boolean, days: number, amount: number, tiers: TierName[]) => Promise<void> | void;
  tierSettings: TierSettings | null;
  dynamicBonuses: DynamicBonuses | null;
  dynamicPenalties: DynamicPenalties | null;
}

export function AdminSettings({
  isLocked,
  onToggleLock,
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
  saveDecaySettings,
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
  const [localDecayAmount, setLocalDecayAmount] = useState(decayAmount.toString());
  const [localDecayTiers, setLocalDecayTiers] = useState<TierName[]>(decayTiers);

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
    setLocalDecayAmount(decayAmount.toString());
  }, [decayAmount]);

  useEffect(() => {
    setLocalDecayTiers(decayTiers);
  }, [decayTiers]);

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

  const handleSaveDecaySettings = (enabled: boolean, daysStr: string, amountStr: string, tiers: TierName[]) => {
    const days = parseInt(daysStr, 10);
    const amount = parseInt(amountStr, 10);
    if (isNaN(days) || days <= 0 || isNaN(amount) || amount <= 0) return;
    saveDecaySettings(enabled, days, amount, tiers);
  };

  const handleToggleDecay = () => {
    const nextVal = !localDecayEnabled;
    setLocalDecayEnabled(nextVal);
    handleSaveDecaySettings(nextVal, localDecayDays, localDecayAmount, localDecayTiers);
  };

  const handleDaysBlur = () => {
    handleSaveDecaySettings(localDecayEnabled, localDecayDays, localDecayAmount, localDecayTiers);
  };

  const handleAmountBlur = () => {
    handleSaveDecaySettings(localDecayEnabled, localDecayDays, localDecayAmount, localDecayTiers);
  };

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

  const [preset, setPreset] = useState<PresetType>(() => {
    return checkPreset(
      {
        Bronze: thresholds?.Bronze?.toString() ?? "0",
        Silver: thresholds?.Silver?.toString() ?? "1000",
        Gold: thresholds?.Gold?.toString() ?? "1200",
        Platinum: thresholds?.Platinum?.toString() ?? "1400",
        Diamond: thresholds?.Diamond?.toString() ?? "1600",
      },
      rpVariables?.winDelta?.toString() ?? "25",
      rpVariables?.loseDelta?.toString() ?? "20"
    );
  });

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
    if (thresholds && rpVariables) {
      const b = thresholds.Bronze?.toString() ?? "0";
      const s = thresholds.Silver?.toString() ?? "1000";
      const g = thresholds.Gold?.toString() ?? "1200";
      const p = thresholds.Platinum?.toString() ?? "1400";
      const d = thresholds.Diamond?.toString() ?? "1600";
      const win = rpVariables.winDelta?.toString() ?? "25";
      const lose = rpVariables.loseDelta?.toString() ?? "20";
      setPreset(checkPreset({ Bronze: b, Silver: s, Gold: g, Platinum: p, Diamond: d }, win, lose));
    }
  }, [thresholds, rpVariables]);

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

    const decayDaysNum = parseInt(localDecayDays, 10);
    const decayAmountNum = parseInt(localDecayAmount, 10);
    if (isNaN(decayDaysNum) || decayDaysNum <= 0 || isNaN(decayAmountNum) || decayAmountNum <= 0) {
      return toast.error("휴면 감점 설정값은 1 이상의 정수여야 합니다.");
    }

    const savePromise = (async () => {
      await saveDecaySettings(localDecayEnabled, decayDaysNum, decayAmountNum, localDecayTiers);

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
      loading: "티어 및 감쇠 설정 저장 중...",
      success: "티어 및 감쇠 설정이 안전하게 저장되었습니다!",
      error: "티어 및 감쇠 설정 저장 실패. 다시 시도해 주세요."
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
      loading: "패배 패널티 설정 저장 중...",
      success: "패배 패널티 설정이 성공적으로 저장되었습니다!",
      error: "패배 패널티 설정 저장 실패. 다시 시도해 주세요."
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. League Title Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">1단계: 리그 이름 설정</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-bold">사용자 설정 활성화</span>
              <ToggleSwitch checked={isTitleCustomOpen} onChange={() => setIsTitleCustomOpen(!isTitleCustomOpen)} />
            </div>
          </div>
          
          {isTitleCustomOpen && (
            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="space-y-2">
                <Input
                  type="text"
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  placeholder="예: 2026 초등 리그전"
                  className="h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs text-foreground"
                />
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSaveTitle}
                  className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-black px-4 h-8 transition-all active:scale-95 rounded-xl shadow-md font-sans text-[11px]"
                >
                  <Save className="size-3.5 mr-1" /> 저장
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Tier-specific Settings Card */}
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">2단계: 티어별 세부 설정 (기준점/RP/감쇠)</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-bold">사용자 설정 활성화</span>
              <ToggleSwitch checked={isTierCustomOpen} onChange={() => setIsTierCustomOpen(!isTierCustomOpen)} />
            </div>
          </div>

          {isTierCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Tab headers */}
              <div className="flex border-b border-border/30 pb-2 overflow-x-auto gap-1.5 scrollbar-thin">
                {(["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const).map((t) => {
                  const labelMap: Record<string, string> = {
                    Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드"
                  };
                  const colorClassMap: Record<string, string> = {
                    Bronze: "text-tier-bronze", Silver: "text-tier-silver", Gold: "text-tier-gold", Platinum: "text-tier-platinum", Diamond: "text-tier-diamond"
                  };
                  const isSelected = activeTierTab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setActiveTierTab(t)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-black transition-all",
                        isSelected 
                          ? "bg-muted border-border/50 text-foreground shadow" 
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={colorClassMap[t]}>{labelMap[t]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tier threshold */}
                  <div className="space-y-1 bg-background/20 rounded-lg p-3 border border-border/20">
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1">티어 기준점 (RP)</label>
                    <Input
                      type="number"
                      value={inputThresholds[activeTierTab]}
                      onChange={(e) => {
                        setPreset("custom");
                        const val = e.target.value;
                        setInputThresholds(prev => ({ ...prev, [activeTierTab]: val }));
                      }}
                      disabled={activeTierTab === "Bronze"}
                      className="h-8 font-mono text-center font-bold bg-background/40 border-border/30 text-foreground"
                    />
                  </div>

                  {/* Preset Selector */}
                  <div className="space-y-1 bg-background/20 rounded-lg p-3 border border-border/20">
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1">기준 밸런싱 프리셋</label>
                    <select
                      value={preset}
                      onChange={(e) => {
                        const nextPreset = e.target.value as PresetType;
                        setPreset(nextPreset);
                        if (nextPreset !== "custom") {
                          const val = PRESETS[nextPreset];
                          setInputThresholds({
                            Bronze: val.Bronze.toString(),
                            Silver: val.Silver.toString(),
                            Gold: val.Gold.toString(),
                            Platinum: val.Platinum.toString(),
                            Diamond: val.Diamond.toString(),
                          });
                          setInputWinDelta(val.winDelta.toString());
                          setInputLoseDelta(val.loseDelta.toString());
                        }
                      }}
                      className="w-full h-8 px-2 rounded bg-background/40 border border-border/30 text-xs text-foreground focus:ring-1 focus:ring-neon-blue focus:outline-none"
                    >
                      <option value="standard" className="bg-card">⚖️ 스탠다드</option>
                      <option value="speedup" className="bg-card">⚡ 스피드업</option>
                      <option value="hardcore" className="bg-card">💀 하드코어</option>
                      <option value="underdog" className="bg-card">🦊 언더독</option>
                      <option value="custom" className="bg-card">🛠️ 사용자 설정</option>
                    </select>
                  </div>
                </div>

                {/* Win/Loss RP */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 bg-background/20 rounded-lg p-3 border border-border/20">
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1">승리 시 획득 RP</label>
                    <Input
                      type="number"
                      value={
                        activeTierTab === "Diamond"
                          ? inputWinDelta
                          : localTierSettings[activeTierTab]?.winDelta.toString() ?? "15"
                      }
                      onChange={(e) => {
                        setPreset("custom");
                        const val = parseInt(e.target.value, 10);
                        if (isNaN(val)) return;
                        if (activeTierTab === "Diamond") {
                          setInputWinDelta(val.toString());
                        } else {
                          setLocalTierSettings(prev => ({
                            ...prev,
                            [activeTierTab]: { ...prev[activeTierTab], winDelta: val }
                          }));
                        }
                      }}
                      className="h-8 font-mono text-center font-bold text-emerald-500 bg-background/40 border-border/30"
                    />
                  </div>
                  <div className="space-y-1 bg-background/20 rounded-lg p-3 border border-border/20">
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1">패배 시 차감 RP</label>
                    <Input
                      type="number"
                      value={
                        activeTierTab === "Diamond"
                          ? inputLoseDelta
                          : localTierSettings[activeTierTab]?.loseDelta.toString() ?? "10"
                      }
                      onChange={(e) => {
                        setPreset("custom");
                        const val = parseInt(e.target.value, 10);
                        if (isNaN(val)) return;
                        if (activeTierTab === "Diamond") {
                          setInputLoseDelta(val.toString());
                        } else {
                          setLocalTierSettings(prev => ({
                            ...prev,
                            [activeTierTab]: { ...prev[activeTierTab], loseDelta: val }
                          }));
                        }
                      }}
                      className="h-8 font-mono text-center font-bold text-rose-500 bg-background/40 border-border/30"
                    />
                  </div>
                </div>

                {/* Decay settings for this tier */}
                <div className="mt-2 pt-3 border-t border-border/20 space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/20 border border-border/25">
                    <div>
                      <span className="text-[11px] font-bold text-foreground block">휴면 감점 시스템 활성화 (전체)</span>
                      <span className="text-[9px] text-muted-foreground">전체 리그에서 미활동 유저에 대한 일일 RP 감점 처리 여부</span>
                    </div>
                    <ToggleSwitch checked={localDecayEnabled} onChange={handleToggleDecay} activeColor="bg-amber-500" />
                  </div>

                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/20 border border-border/20">
                    <div>
                      <span className="text-[11px] font-bold text-foreground block">이 티어에서 감점 적용</span>
                      <span className="text-[9px] text-muted-foreground">이 티어에 해당하는 학생들에게 휴면 유저 감점을 개별 적용합니다.</span>
                    </div>
                    <ToggleSwitch
                      checked={localDecayTiers.includes(activeTierTab) && localDecayEnabled}
                      disabled={!localDecayEnabled}
                      onChange={() => {
                        if (!localDecayEnabled) return;
                        const checked = localDecayTiers.includes(activeTierTab);
                        const nextTiers = checked
                          ? localDecayTiers.filter(t => t !== activeTierTab)
                          : [...localDecayTiers, activeTierTab];
                        setLocalDecayTiers(nextTiers);
                        handleSaveDecaySettings(localDecayEnabled, localDecayDays, localDecayAmount, nextTiers);
                      }}
                      activeColor="bg-amber-500"
                    />
                  </div>

                  {localDecayTiers.includes(activeTierTab) && localDecayEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/30 p-3 rounded-lg border border-border/20">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground">기준 미활동 일수</label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={1}
                            value={localDecayDays}
                            onChange={(e) => setLocalDecayDays(e.target.value)}
                            onBlur={handleDaysBlur}
                            className="h-8 border-border/30 bg-background/40 focus:border-amber-500 font-sans text-xs pr-12"
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] text-muted-foreground font-bold">일 이상</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground">차감할 RP</label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={1}
                            value={localDecayAmount}
                            onChange={(e) => setLocalDecayAmount(e.target.value)}
                            onBlur={handleAmountBlur}
                            className="h-8 border-border/30 bg-background/40 focus:border-amber-500 font-sans text-xs text-rose-500 pr-12"
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] text-rose-500 font-bold">RP 감점</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Save button at the bottom of Step 2 card */}
              <div className="flex justify-end pt-2 border-t border-border/10">
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
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">3단계: 점수 획득 규칙 (글로벌 보너스)</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-bold">사용자 설정 활성화</span>
              <ToggleSwitch checked={isBonusCustomOpen} onChange={() => setIsBonusCustomOpen(!isBonusCustomOpen)} />
            </div>
          </div>

          {isBonusCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                
                {/* 1. firstWin */}
                <SimpleBonusCard
                  title="🌟 오늘의 첫 승"
                  enabled={localDynamicBonuses.firstWinEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, firstWinEnabled: !prev.firstWinEnabled }))}
                  val={localDynamicBonuses.firstWinRp}
                  onChangeVal={(val) => setLocalDynamicBonuses(prev => ({ ...prev, firstWinRp: val }))}
                />

                {/* 2. revenge */}
                <SimpleBonusCard
                  title="😈 복수전 성공"
                  enabled={localDynamicBonuses.revengeEnabled}
                  onToggle={() => setLocalDynamicBonuses(prev => ({ ...prev, revengeEnabled: !prev.revengeEnabled }))}
                  val={localDynamicBonuses.revengeRp}
                  onChangeVal={(val) => setLocalDynamicBonuses(prev => ({ ...prev, revengeRp: val }))}
                />

                {/* 3. underdog */}
                <BonusCardWrapper
                  title="🛡️ 언더독 격파"
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
                            className="w-10 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
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
                      className="w-8 h-7 text-center font-mono bg-background/50 border-border/30 p-0"
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
                      className="w-8 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
                    />
                    <span>RP</span>
                  </div>
                </BonusCardWrapper>

                {/* 5. streak */}
                <BonusCardWrapper
                  title="🔥 연승 행진"
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
                      className="w-8 h-7 text-center font-mono bg-background/50 border-border/30 p-0"
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
                      className="w-8 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
                    />
                    <span>RP 추가 (플래티넘↑ 제외)</span>
                  </div>
                </BonusCardWrapper>

                {/* 6. greatMatch */}
                <BonusCardWrapper
                  title="⚔️ 명승부 보너스"
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
                            className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                          />
                          <Input
                            type="number"
                            value={localDynamicBonuses[diff.loseKey]}
                            disabled={!localDynamicBonuses.greatMatchEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, [diff.loseKey]: isNaN(val) ? 0 : val }));
                            }}
                            className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </BonusCardWrapper>

                {/* 7. lossComfort */}
                <BonusCardWrapper
                  title="🩹 꺾이지 않는 마음"
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
                        className="w-full h-7 mt-0.5 px-1.5 rounded bg-background/40 border border-border/30 text-[10px] text-foreground focus:outline-none"
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
                          className="w-12 h-7 text-center font-mono font-bold bg-background/50 border-border/30 text-neon-blue p-0"
                        />
                        <span>RP</span>
                      </div>
                    </div>
                  </div>
                </BonusCardWrapper>

                {/* 8. willOfSteel */}
                <BonusCardWrapper
                  title="🔥 불굴의 의지"
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
                          className="w-10 h-7 text-center mt-0.5 font-mono p-0 bg-background/50 border-border/30 text-neon-blue mx-auto"
                        />
                      </div>
                    ))}
                  </div>
                </BonusCardWrapper>

              </div>
              
              {/* Save button at the bottom of Step 3 card */}
              <div className="flex justify-end pt-2 border-t border-border/10">
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
            <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">4단계: 상위 티어 패배 패널티 설정</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-bold">사용자 설정 활성화</span>
              <ToggleSwitch checked={isPenaltyCustomOpen} onChange={() => setIsPenaltyCustomOpen(!isPenaltyCustomOpen)} />
            </div>
          </div>

          {isPenaltyCustomOpen && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="text-[11px] font-bold text-foreground">패배 패널티 기능 전체 활성화</span>
                <ToggleSwitch
                  checked={localDynamicPenalties.enabled}
                  onChange={() => setLocalDynamicPenalties(prev => ({ ...prev, enabled: !prev.enabled }))}
                  activeColor="bg-rose-500"
                />
              </div>

              {localDynamicPenalties.enabled && (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  
                  {PENALTY_ITEMS.map((item) => (
                    <div key={item.key} className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20">
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
                                className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* lossStreak / swamp */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20 md:col-span-2">
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
                                className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* redCardPenalty */}
                  <div className="flex justify-between items-center p-3 rounded-lg border border-border/20 bg-background/20 md:col-span-2">
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
                        className="w-16 h-7 text-center font-mono font-bold bg-background/50 border-border/30 text-rose-500 p-0"
                      />
                      <span className="text-[9px] text-rose-500 font-bold">RP</span>
                    </div>
                  </div>

                </div>
              )}

              {/* Save button at the bottom of Step 4 card */}
              <div className="flex justify-end pt-2 border-t border-border/10">
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

      {/* Lock Switch Card */}
      <Card className={cn(
        "border transition-all duration-300 p-5 backdrop-blur shadow-lg relative overflow-hidden",
        isLocked 
          ? "border-destructive/40 bg-destructive/5 shadow-[0_0_20px_rgba(239,68,68,0.1)]" 
          : "border-neon-green/30 bg-neon-green/5 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              {isLocked ? (
                <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-bold text-destructive">
                  <Lock className="size-3" /> 경기 입력 비활성화 (잠금됨)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-neon-green/15 px-2.5 py-0.5 text-xs font-bold text-neon-green">
                  <Unlock className="size-3" /> 경기 입력 활성화 (입력 가능)
                </span>
              )}
            </div>
            <h3 className="mt-2 text-lg font-black tracking-tight">수업 경기 등록 통제 스위치</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              스위치를 '잠금'으로 변경하면 학생들이 [경기 기록 입력] 탭에서 경기 결과를 직접 등록할 수 없도록 입력 폼이 완벽히 차단됩니다.
            </p>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              onClick={() => {
                onToggleLock(!isLocked);
                toast.success(isLocked ? "학생 경기 입력을 활성화했습니다!" : "학생 경기 입력을 비활성화(잠금)했습니다!");
              }}
              size="lg"
              className={cn(
                "h-12 px-6 font-black tracking-wide shadow-md transition-all active:scale-95",
                isLocked 
                  ? "bg-neon-green text-primary-foreground hover:bg-neon-green/90" 
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              {isLocked ? (
                <><Unlock className="mr-2 size-4" /> 경기 등록 해제</>
              ) : (
                <><Lock className="mr-2 size-4" /> 경기 등록 잠금</>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
