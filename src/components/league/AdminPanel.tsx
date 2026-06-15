import { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  AlertCircle, 
  Database, 
  Lock, 
  Unlock, 
  Search, 
  Trash2, 
  RotateCcw, 
  Download, 
  User, 
  ShieldAlert,
  Save,
  Pencil,
  Swords,
  Calendar,
  Users,
  Settings,
  UserPlus,
  ArrowLeft
} from "lucide-react";
import type { Gender, Student, Match, TierName, TierSettings, DynamicBonuses, DynamicPenalties } from "@/lib/league-types";
import { useLeagueStore, type ActiveBonuses } from "@/lib/league-store";
import { getTier, TIER_STYLES, getFullTierLabel } from "@/lib/league-types";
import { GenderMark } from "./GenderMark";
import { TierBadge } from "./TierBadge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { SecurityModal } from "./SecurityModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Row = { grade: number; classNum: number; number: number; name: string; gender?: Gender };

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

const checkPreset = (
  bronze: string,
  silver: string,
  gold: string,
  platinum: string,
  diamond: string,
  win: string,
  lose: string
): PresetType => {
  const b = parseInt(bronze, 10) || 0;
  const s = parseInt(silver, 10) || 0;
  const g = parseInt(gold, 10) || 0;
  const p = parseInt(platinum, 10) || 0;
  const d = parseInt(diamond, 10) || 0;
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

function detectGender(token: string): Gender | null {
  const t = token.trim();
  if (t === "남" || t === "M" || t === "m" || t === "남자") return "M";
  if (t === "여" || t === "F" || t === "f" || t === "여자") return "F";
  return null;
}

function parsePaste(text: string): { rows: Row[]; errors: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Row[] = [];
  let errors = 0;
  for (const line of lines) {
    // Strictly Grade Class Number Name [Gender]
    // Matches e.g. "5 1 1 홍길동 남", "5학년 1반 1번 홍길동 남", "5-1-1 홍길동 남"
    const regex = /^(\d+)\s*[학년\s-]*\s*(\d+)\s*[반\s-]*\s*(\d+)\s*[번\s-]*\s*([가-힣a-zA-Z\s]+?)(?:\s+(남|여|남자|여자|M|F|m|f|U|u))?$/;
    const match = line.match(regex);

    if (match) {
      const grade = parseInt(match[1], 10);
      const classNum = parseInt(match[2], 10);
      const number = parseInt(match[3], 10);
      const name = match[4].trim();
      const genderToken = match[5];
      const gender = genderToken ? (detectGender(genderToken) || "U") : "U";

      if (grade >= 1 && grade <= 6 && classNum >= 1 && number >= 1 && name) {
        rows.push({ grade, classNum, number, name, gender });
        continue;
      }
    }
    errors++;
  }
  return { rows, errors };
}

export function AdminPanel({
  students,
  matches,
  onUpsert,
  count,
  isLocked,
  onToggleLock,
  onDeleteMatch,
  onResetStudent,
  onResetAll,
  onUpdateRP,
  thresholds,
  rpVariables,
  onUpdateSettings,
  onDeleteStudent,
  onUpdateGender,
  onUpdateStudentInfo,
  onRestoreFromCSV,
  onBulkDecay,
  teacherAccessCode,
  onUpdateMatchScore,
  title,
  activeBonuses,
  onSaveLeagueSettings,
  seasonList,
  onChangeSeason,
}: {
  students: Student[];
  matches: Match[];
  onUpsert: (rows: Row[]) => Promise<{ added: number; kept: number }>;
  count: number;
  isLocked: boolean;
  onToggleLock: (locked: boolean) => void;
  onDeleteMatch: (matchId: string) => void;
  onResetStudent: (studentId: string) => void;
  onResetAll: () => void;
  onUpdateRP: (studentId: string, nextRp: number) => void;
  thresholds?: Record<TierName, number>;
  rpVariables?: { winDelta: number; loseDelta: number };
  onUpdateSettings?: (thresholds: Record<TierName, number>, rpVars: { winDelta: number; loseDelta: number }) => void;
  onDeleteStudent?: (studentId: string) => void;
  onUpdateGender?: (studentId: string, gender: Gender) => void;
  onUpdateStudentInfo?: (
    studentId: string,
    info: { grade: number; classNum: number; number: number; name: string; gender: Gender; rp?: number }
  ) => Promise<void>;
  onRestoreFromCSV?: (students: Student[], matches: Match[]) => void;
  onBulkDecay?: (inactiveDays: number, decayAmount: number) => Promise<number> | number | any;
  teacherAccessCode?: string;
  onUpdateMatchScore: (matchId: string, scoreA: number, scoreB: number) => void;
  title?: string;
  activeBonuses?: ActiveBonuses;
  onSaveLeagueSettings?: (
    title: string,
    bonuses: ActiveBonuses,
    opMode?: "school" | "club",
    tierSettings?: TierSettings,
    dynamicBonuses?: DynamicBonuses,
    dynamicPenalties?: DynamicPenalties
  ) => Promise<void>;
  seasonList?: string[];
  onChangeSeason?: (seasonName: string) => Promise<{ success: boolean; message?: string }>;
}) {
  // Active Tab for dashboard split layout
  const [activeTab, setActiveTab] = useState<string>("settings");

  // JSON 롤백 복원 상태
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<Student[] | null>(null);
  const [pendingRestoreMatches, setPendingRestoreMatches] = useState<Match[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이중 보안 상태 및 자동 잠금 훅
  const [isUnlocked, setIsUnlocked] = useState(true);
  const { 
    session,
    decayEnabled,
    decayDays,
    decayAmount: storeDecayAmount,
    decayTiers,
    saveDecaySettings,
    checkAndApplyAutomaticDecay,
    tierSettings,
    dynamicBonuses,
    dynamicPenalties,
    saveLeagueSettings
  } = useLeagueStore();
  const isDemo = session?.loginId === "guest" || session?.schoolName?.includes("꿈나무");

  // 접기/펴기 (Collapsible) 상태 (기본값: false = 닫힘)
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isStudentDashboardOpen, setIsStudentDashboardOpen] = useState(false);
  const [isTierSettingsOpen, setIsTierSettingsOpen] = useState(false);
  const [isTierRpOpen, setIsTierRpOpen] = useState(false);
  const [isDynamicBonusesOpen, setIsDynamicBonusesOpen] = useState(false);

  const [isTitleCustomOpen, setIsTitleCustomOpen] = useState(false);
  const [isTierCustomOpen, setIsTierCustomOpen] = useState(false);
  const [isBonusCustomOpen, setIsBonusCustomOpen] = useState(false);
  const [isPenaltyCustomOpen, setIsPenaltyCustomOpen] = useState(false);

  // 휴면 유저 관리(Decay) 설정 관련 로컬 상태
  const [localDecayEnabled, setLocalDecayEnabled] = useState(decayEnabled);
  const [localDecayDays, setLocalDecayDays] = useState(decayDays.toString());
  const [localDecayAmount, setLocalDecayAmount] = useState(storeDecayAmount.toString());
  const [localDecayTiers, setLocalDecayTiers] = useState<TierName[]>(decayTiers);

  // 티어별 RP 및 다이내믹 보너스 로컬 상태
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
    willOfSteel5Rp: 20,
    comebackEnabled: true,
    comebackLosses: 3,
    comebackRp: 10,
    marginEnabled: true,
    marginDiff: 10,
    marginRp: 10
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

  // 백엔드로부터 설정이 주입될 때 로컬 상태 싱크
  useEffect(() => {
    setLocalDecayEnabled(decayEnabled);
  }, [decayEnabled]);

  useEffect(() => {
    setLocalDecayDays(decayDays.toString());
  }, [decayDays]);

  useEffect(() => {
    setLocalDecayAmount(storeDecayAmount.toString());
  }, [storeDecayAmount]);

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

  // 설정 저장 헬퍼
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

  const handleTierCheckboxChange = (tier: TierName) => {
    const nextTiers = localDecayTiers.includes(tier)
      ? localDecayTiers.filter(t => t !== tier)
      : [...localDecayTiers, tier];
    setLocalDecayTiers(nextTiers);
    handleSaveDecaySettings(localDecayEnabled, localDecayDays, localDecayAmount, nextTiers);
  };

  // 관리자 대시보드 마운트/잠금 해제 시 자동 휴면 차감 실행 (하루 1회 제한)
  const hasEntered = isUnlocked || isDemo;
  useEffect(() => {
    if (hasEntered) {
      checkAndApplyAutomaticDecay();
    }
  }, [hasEntered, checkAndApplyAutomaticDecay]);

  // 시즌 변경/초기화 관련 상태
  const [isSeasonChangeModalOpen, setIsSeasonChangeModalOpen] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [isSeasonChangeLoading, setIsSeasonChangeLoading] = useState(false);

  const recommendedSeasonName = useMemo(() => {
    if (!seasonList || seasonList.length === 0) {
      return "시즌1";
    }
    
    let maxNumber = 0;
    let hasSeasonPattern = false;
    
    for (const season of seasonList) {
      const sName = typeof season === "string" ? season : (season && typeof season === "object" && "name" in season ? String((season as any).name) : "");
      if (!sName) continue;
      
      const match = sName.match(/시즌\s*(\d+)/);
      if (match) {
        hasSeasonPattern = true;
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      } else {
        const numbers = sName.match(/\d+/g);
        if (numbers) {
          const lastNum = parseInt(numbers[numbers.length - 1], 10);
          if (lastNum > maxNumber) {
            maxNumber = lastNum;
          }
        }
      }
    }
    
    if (hasSeasonPattern || maxNumber > 0) {
      return `시즌${maxNumber + 1}`;
    }
    return "시즌1";
  }, [seasonList]);

  // 경기 점수 세부 수정 기능 상태
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScoreA, setEditScoreA] = useState<string>("");
  const [editScoreB, setEditScoreB] = useState<string>("");

  // 경기 기록 필터링 관련 카테고리 상태
  const [matchFilterType, setMatchFilterType] = useState<"recent" | "student" | "date" | "class">("recent");
  const [matchSearchStudent, setMatchSearchStudent] = useState("");
  const [matchSearchDate, setMatchSearchDate] = useState("");
  const [matchSearchGradeClass, setMatchSearchGradeClass] = useState("");

  // 실제 필터에 적용되는 검색어 상태 (버튼 클릭 / 엔터 시점에만 갱신하여 렉 발생 방지)
  const [appliedSearchStudent, setAppliedSearchStudent] = useState("");
  const [appliedSearchDate, setAppliedSearchDate] = useState("");
  const [appliedSearchGradeClass, setAppliedSearchGradeClass] = useState("");

  // 리그 환경 설정 상태
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

  useEffect(() => {
    setIsUnlocked(false);
    return () => {
      setIsUnlocked(false);
    };
  }, []);

  const handleSaveScoreEdit = () => {
    if (!editingMatchId) return;
    const sA = parseInt(editScoreA, 10);
    const sB = parseInt(editScoreB, 10);

    if (isNaN(sA) || sA < 0 || isNaN(sB) || sB < 0) {
      return toast.error("올바른 점수 값을 입력해 주세요 (0점 이상).");
    }

    if (sA === sB) {
      return toast.error("경기는 동점으로 끝날 수 없습니다. 승패가 결정되는 점수를 입력해 주세요.");
    }

    onUpdateMatchScore(editingMatchId, sA, sB);
    setEditingMatchId(null);
    toast.success("경기 점수가 수정되었으며 두 학생의 보너스 및 최종 RP가 오차 없이 즉시 재계산되어 덮어씌워졌습니다!");
  };

  // 3.9. All Match Records Filtered Matches Computing
  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    let result = [...matches];

    // Sort all matches initially by date descending (most recent first)
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matchFilterType === "recent") {
      return result.slice(0, 20);
    }

    if (matchFilterType === "student") {
      const query = appliedSearchStudent.trim().toLowerCase();
      if (!query) return []; // 검색하기 전에는 빈 배열 반환하여 버벅임 방지
      return result.filter((m) => {
        const playerA = students.find((s) => s.id === m.playerAId);
        const playerB = students.find((s) => s.id === m.playerBId);
        const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
        const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
        return (
          (playerA && playerA.name.toLowerCase().includes(query)) ||
          (playerB && playerB.name.toLowerCase().includes(query)) ||
          (playerA2 && playerA2.name.toLowerCase().includes(query)) ||
          (playerB2 && playerB2.name.toLowerCase().includes(query))
        );
      });
    }

    if (matchFilterType === "date") {
      const query = appliedSearchDate.trim();
      if (!query) return []; // 검색하기 전에는 빈 배열 반환하여 버벅임 방지
      return result.filter((m) => {
        const mDate = new Date(m.date);
        const mMonth = mDate.getMonth() + 1;
        const mDay = mDate.getDate();

        // 1. Month/Day combo formats: "6/2", "6-2", "6.2", "6 2"
        const parts = query.split(/[\/\-\.\s]+/);
        if (parts.length === 2) {
          const qMonth = parseInt(parts[0], 10);
          const qDay = parseInt(parts[1], 10);
          if (!isNaN(qMonth) && !isNaN(qDay)) {
            return mMonth === qMonth && mDay === qDay;
          }
        }

        // 2. Single digit e.g. "2" -> match month OR day
        if (/^\d+$/.test(query)) {
          const qNum = parseInt(query, 10);
          return mMonth === qNum || mDay === qNum;
        }

        // 3. String representations (e.g. "6월 2일", "2026-06-02")
        const localDateStr = mDate.toLocaleString("ko-KR", { month: "long", day: "numeric" });
        const localDateShort = mDate.toLocaleString("ko-KR", { month: "short", day: "numeric" });
        const isoStr = mDate.toISOString().split("T")[0];

        return (
          localDateStr.toLowerCase().includes(query.toLowerCase()) ||
          localDateShort.toLowerCase().includes(query.toLowerCase()) ||
          isoStr.includes(query)
        );
      });
    }

    if (matchFilterType === "class") {
      const query = appliedSearchGradeClass.trim();
      if (!query) return []; // 검색하기 전에는 빈 배열 반환하여 버벅임 방지

      // 1. Grade-Class format like "6-1", "6 1", "6/1", "6학년 1반"
      const parts = query.split(/[\-\s\/학년반]+/);
      if (parts.length >= 2) {
        const qGrade = parseInt(parts[0], 10);
        const qClass = parseInt(parts[1], 10);
        if (!isNaN(qGrade) && !isNaN(qClass)) {
          return result.filter((m) => {
            const playerA = students.find((s) => s.id === m.playerAId);
            const playerB = students.find((s) => s.id === m.playerBId);
            const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
            const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
            const aMatch = (playerA && playerA.grade === qGrade && playerA.classNum === qClass) ||
                           (playerA2 && playerA2.grade === qGrade && playerA2.classNum === qClass);
            const bMatch = (playerB && playerB.grade === qGrade && playerB.classNum === qClass) ||
                           (playerB2 && playerB2.grade === qGrade && playerB2.classNum === qClass);
            return aMatch || bMatch;
          });
        }
      }

      // 2. Just a single number like "6" -> match grade OR class
      const qNum = parseInt(query, 10);
      if (!isNaN(qNum)) {
        return result.filter((m) => {
          const playerA = students.find((s) => s.id === m.playerAId);
          const playerB = students.find((s) => s.id === m.playerBId);
          const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
          const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
          return (
            (playerA && (playerA.grade === qNum || playerA.classNum === qNum)) ||
            (playerB && (playerB.grade === qNum || playerB.classNum === qNum)) ||
            (playerA2 && (playerA2.grade === qNum || playerA2.classNum === qNum)) ||
            (playerB2 && (playerB2.grade === qNum || playerB2.classNum === qNum))
          );
        });
      }

      // 3. String representation
      return result.filter((m) => {
        const playerA = students.find((s) => s.id === m.playerAId);
        const playerB = students.find((s) => s.id === m.playerBId);
        const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
        const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
        const aStr = playerA ? `${playerA.grade}-${playerA.classNum}` : "";
        const a2Str = playerA2 ? `${playerA2.grade}-${playerA2.classNum}` : "";
        const bStr = playerB ? `${playerB.grade}-${playerB.classNum}` : "";
        const b2Str = playerB2 ? `${playerB2.grade}-${playerB2.classNum}` : "";
        return aStr.includes(query) || a2Str.includes(query) || bStr.includes(query) || b2Str.includes(query);
      });
    }

    return result;
  }, [matches, students, matchFilterType, appliedSearchStudent, appliedSearchDate, appliedSearchGradeClass]);



  // Bulk upload states
  const [text, setText] = useState("");
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const parsed = useMemo(() => parsePaste(text), [text]);

  // Student editor states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editRpInput, setEditRpInput] = useState<string>("");

  // 학년/반 대형 필터 브라우저 상태
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterClassNum, setFilterClassNum] = useState<number | null>(null);


  // 티어 및 RP 수동 설정 폼 상태
  const [inputBronze, setInputBronze] = useState(thresholds?.Bronze?.toString() ?? "0");
  const [inputSilver, setInputSilver] = useState(thresholds?.Silver?.toString() ?? "1000");
  const [inputGold, setInputGold] = useState(thresholds?.Gold?.toString() ?? "1200");
  const [inputPlatinum, setInputPlatinum] = useState(thresholds?.Platinum?.toString() ?? "1400");
  const [inputDiamond, setInputDiamond] = useState(thresholds?.Diamond?.toString() ?? "1600");

  const [inputWinDelta, setInputWinDelta] = useState(rpVariables?.winDelta?.toString() ?? "25");
  const [inputLoseDelta, setInputLoseDelta] = useState(rpVariables?.loseDelta?.toString() ?? "20");

  // 프리셋 선택 상태 (기본값 custom 또는 기존 로드값 분석)
  const [preset, setPreset] = useState<PresetType>(() => {
    const b = thresholds?.Bronze?.toString() ?? "0";
    const s = thresholds?.Silver?.toString() ?? "1000";
    const g = thresholds?.Gold?.toString() ?? "1200";
    const p = thresholds?.Platinum?.toString() ?? "1400";
    const d = thresholds?.Diamond?.toString() ?? "1600";
    const win = rpVariables?.winDelta?.toString() ?? "25";
    const lose = rpVariables?.loseDelta?.toString() ?? "20";
    return checkPreset(b, s, g, p, d, win, lose);
  });

  useEffect(() => {
    if (thresholds) {
      const b = thresholds.Bronze?.toString() ?? "0";
      const s = thresholds.Silver?.toString() ?? "1000";
      const g = thresholds.Gold?.toString() ?? "1200";
      const p = thresholds.Platinum?.toString() ?? "1400";
      const d = thresholds.Diamond?.toString() ?? "1600";
      setInputBronze(b);
      setInputSilver(s);
      setInputGold(g);
      setInputPlatinum(p);
      setInputDiamond(d);
      setPreset(checkPreset(b, s, g, p, d, inputWinDelta, inputLoseDelta));
    }
  }, [thresholds]);

  useEffect(() => {
    if (rpVariables) {
      const win = rpVariables.winDelta?.toString() ?? "25";
      const lose = rpVariables.loseDelta?.toString() ?? "20";
      setInputWinDelta(win);
      setInputLoseDelta(lose);
      setPreset(checkPreset(inputBronze, inputSilver, inputGold, inputPlatinum, inputDiamond, win, lose));
    }
  }, [rpVariables]);

  const handleSaveTitle = async () => {
    if (!localTitle.trim()) {
      return toast.error("리그 이름을 입력해 주세요.");
    }
    const savePromise = (async () => {
      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          undefined,
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
    const b = parseInt(inputBronze, 10);
    const s = parseInt(inputSilver, 10);
    const g = parseInt(inputGold, 10);
    const p = parseInt(inputPlatinum, 10);
    const d = parseInt(inputDiamond, 10);

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
      // 1. Save decay settings
      await saveDecaySettings(localDecayEnabled, decayDaysNum, decayAmountNum, localDecayTiers);

      // 2. Save thresholds and default RP variables (Diamond RP)
      if (onUpdateSettings) {
        await onUpdateSettings(
          { Bronze: b, Silver: s, Gold: g, Platinum: p, Diamond: d },
          { winDelta: winD, loseDelta: loseD }
        );
      }

      // 3. Save tier-specific RP settings
      if (onSaveLeagueSettings) {
        await onSaveLeagueSettings(
          localTitle,
          localBonuses,
          undefined,
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
          undefined,
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
          undefined,
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

  // 한 학급에 속한 학생들 목록 필터링
  const classFilteredStudents = useMemo(() => {
    if (filterGrade == null || filterClassNum == null) return [];
    return students
      .filter((s) => s.grade === filterGrade && s.classNum === filterClassNum)
      .sort((a, b) => a.number - b.number);
  }, [students, filterGrade, filterClassNum]);
  
  // 해당 학년에서 실제로 존재하는 반들을 추출
  const availableClassesForFilter = useMemo(() => {
    if (filterGrade == null) return [];
    const set = new Set<number>();
    students.filter((s) => s.grade === filterGrade).forEach((s) => set.add(s.classNum));
    return Array.from(set).sort((a, b) => a - b);
  }, [students, filterGrade]);

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) ?? null;
  }, [students, selectedStudentId]);

  // Handle select student
  const handleSelectStudent = (s: Student) => {
    setSelectedStudentId(s.id);
    setEditRpInput(s.rp.toString());
    setSearchQuery(""); // Clear search query after selection
    toast.info(`${s.name} 학생의 프로필을 로드했습니다.`);
  };

  // Search filtered students list for editor select
  const searchFilteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || `${s.grade}-${s.classNum}`.includes(q)
    );
  }, [students, searchQuery]);

  // Save manual RP changes
  const saveRpChanges = () => {
    if (!selectedStudent) return;
    const parsedRp = parseInt(editRpInput, 10);
    if (isNaN(parsedRp) || parsedRp < 0) {
      return toast.error("올바른 RP 점수 값을 입력해주세요 (0점 이상)");
    }
    onUpdateRP(selectedStudent.id, parsedRp);
    toast.success(`${selectedStudent.name} 학생의 RP를 ${parsedRp}점으로 수동 조정했습니다.`);
  };

  // Apply RP presets instantly
  const applyRpPreset = (delta: number) => {
    if (!selectedStudent) return;
    const nextRp = Math.max(0, selectedStudent.rp + delta);
    setEditRpInput(nextRp.toString());
    onUpdateRP(selectedStudent.id, nextRp);
    toast.success(`${selectedStudent.name} 학생의 RP를 ${delta > 0 ? "+" : ""}${delta} 조정했습니다. (${nextRp} RP)`);
  };

  // Student specific matches timeline
  const studentMatches = useMemo(() => {
    if (!selectedStudentId) return [];
    return matches
      .filter((m) => m.playerAId === selectedStudentId || m.playerBId === selectedStudentId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, selectedStudentId]);

  // Bulk NEIS commit
  const commit = async () => {
    if (parsed.rows.length === 0) return toast.error("등록할 학생이 없습니다");
    const { added, kept } = await onUpsert(parsed.rows);
    setText("");
    toast.success(`신규 ${added}명 등록, 기존 ${kept}명 전적 유지`);
  };

  // JSON download function
  const downloadJSON = () => {
    const sortedStudents = [...students].sort((a, b) => b.rp - a.rp);
    const backupObj = {
      students: sortedStudents.map((s) => ({
        id: s.id,
        grade: s.grade,
        classNum: s.classNum,
        number: s.number,
        name: s.name,
        gender: s.gender,
        rp: s.rp,
        recent: s.recent,
        wins: s.wins,
        losses: s.losses,
        demotionShields: s.demotionShields ?? 0,
        lastMatchDate: s.lastMatchDate ?? null,
        lastWinDate: s.lastWinDate ?? null,
        totalMatches: s.totalMatches ?? (s.wins + s.losses),
        currentStreak: s.currentStreak ?? 0,
        achievements: s.achievements ?? []
      })),
      matches: matches
    };
    
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sports_league_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("전체 데이터 JSON 백업 다운로드가 완료되었습니다!");
  };

  // JSON 백업 파일을 업로드하여 파싱 및 롤백 복원 수행
  const handleJSONRestoreUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonText = event.target?.result as string;
        if (!jsonText) return;

        const data = JSON.parse(jsonText);
        if (!data || !Array.isArray(data.students)) {
          return toast.error("JSON 파일에 유효한 학생(students) 데이터 배열이 없습니다.");
        }

        const parsedStudents: Student[] = data.students.map((s: any) => ({
          id: s.id || Math.random().toString(36).slice(2, 10),
          grade: Number(s.grade),
          classNum: Number(s.classNum),
          number: Number(s.number),
          name: String(s.name),
          gender: (s.gender === "M" || s.gender === "F") ? s.gender : "U",
          rp: Number(s.rp),
          recent: Array.isArray(s.recent) ? s.recent : [],
          wins: Number(s.wins),
          losses: Number(s.losses),
          demotionShields: s.demotionShields !== undefined ? Number(s.demotionShields) : 0,
          lastMatchDate: s.lastMatchDate ? String(s.lastMatchDate) : undefined,
          lastWinDate: s.lastWinDate ? String(s.lastWinDate) : undefined,
          totalMatches: s.totalMatches !== undefined ? Number(s.totalMatches) : (Number(s.wins) + Number(s.losses)),
          currentStreak: s.currentStreak !== undefined ? Number(s.currentStreak) : 0,
          achievements: Array.isArray(s.achievements) ? s.achievements : []
        }));

        const parsedMatches: Match[] = Array.isArray(data.matches) ? data.matches.map((m: any) => ({
          id: String(m.id),
          playerAId: String(m.playerAId),
          playerBId: String(m.playerBId),
          playerA2Id: m.playerA2Id ? String(m.playerA2Id) : undefined,
          playerB2Id: m.playerB2Id ? String(m.playerB2Id) : undefined,
          scoreA: Number(m.scoreA),
          scoreB: Number(m.scoreB),
          date: String(m.date),
          matchType: m.matchType,
          rpDeltaA: m.rpDeltaA !== undefined ? Number(m.rpDeltaA) : undefined,
          rpDeltaB: m.rpDeltaB !== undefined ? Number(m.rpDeltaB) : undefined,
          rpDeltaA2: m.rpDeltaA2 !== undefined ? Number(m.rpDeltaA2) : undefined,
          rpDeltaB2: m.rpDeltaB2 !== undefined ? Number(m.rpDeltaB2) : undefined,
          underdogBonusA: m.underdogBonusA !== undefined ? Number(m.underdogBonusA) : undefined,
          underdogBonusB: m.underdogBonusB !== undefined ? Number(m.underdogBonusB) : undefined,
          underdogBonusA2: m.underdogBonusA2 !== undefined ? Number(m.underdogBonusA2) : undefined,
          underdogBonusB2: m.underdogBonusB2 !== undefined ? Number(m.underdogBonusB2) : undefined,
          scoreDiffBonusA: m.scoreDiffBonusA !== undefined ? Number(m.scoreDiffBonusA) : undefined,
          scoreDiffBonusB: m.scoreDiffBonusB !== undefined ? Number(m.scoreDiffBonusB) : undefined,
          scoreDiffBonusA2: m.scoreDiffBonusA2 !== undefined ? Number(m.scoreDiffBonusA2) : undefined,
          scoreDiffBonusB2: m.scoreDiffBonusB2 !== undefined ? Number(m.scoreDiffBonusB2) : undefined,
          rivalBonusA: m.rivalBonusA !== undefined ? Number(m.rivalBonusA) : undefined,
          rivalBonusB: m.rivalBonusB !== undefined ? Number(m.rivalBonusB) : undefined,
          rivalBonusA2: m.rivalBonusA2 !== undefined ? Number(m.rivalBonusA2) : undefined,
          rivalBonusB2: m.rivalBonusB2 !== undefined ? Number(m.rivalBonusB2) : undefined,
          firstWinBonusA: m.firstWinBonusA !== undefined ? Number(m.firstWinBonusA) : undefined,
          firstWinBonusB: m.firstWinBonusB !== undefined ? Number(m.firstWinBonusB) : undefined,
          firstWinBonusA2: m.firstWinBonusA2 !== undefined ? Number(m.firstWinBonusA2) : undefined,
          firstWinBonusB2: m.firstWinBonusB2 !== undefined ? Number(m.firstWinBonusB2) : undefined,
          revengeBonusA: m.revengeBonusA !== undefined ? Number(m.revengeBonusA) : undefined,
          revengeBonusB: m.revengeBonusB !== undefined ? Number(m.revengeBonusB) : undefined,
          revengeBonusA2: m.revengeBonusA2 !== undefined ? Number(m.revengeBonusA2) : undefined,
          revengeBonusB2: m.revengeBonusB2 !== undefined ? Number(m.revengeBonusB2) : undefined,
        })) : [];

        if (parsedStudents.length === 0) {
          return toast.error("파싱 가능한 유효한 학생 데이터가 없습니다.");
        }

        setPendingRestoreData(parsedStudents);
        setPendingRestoreMatches(parsedMatches);
        setRestoreDialogOpen(true);
      } catch (err) {
        console.error("JSON restore parsing failed:", err);
        toast.error("JSON 백업 파일 로드하여 정적 분석하는 중에 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = ""; // Input 초기화
  };

  const handleOpenSeasonChangeModal = () => {
    setNewSeasonName(recommendedSeasonName);
    setIsSeasonChangeModalOpen(true);
  };

  const handleSeasonChangeSubmit = async () => {
    if (!newSeasonName.trim()) {
      return toast.error("시즌명을 입력해주세요.");
    }
    if (!onChangeSeason) {
      return toast.error("시즌 변경 기능이 지원되지 않는 세션입니다.");
    }

    setIsSeasonChangeLoading(true);
    try {
      const res = await onChangeSeason(newSeasonName.trim());
      if (res.success) {
        toast.success("새 시즌이 시작되었습니다!");
        setIsSeasonChangeModalOpen(false);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        toast.error(res.message || "새 시즌 시작 처리에 실패했습니다.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("오류가 발생했습니다: " + err.message);
    } finally {
      setIsSeasonChangeLoading(false);
    }
  };

  // Individual student reset check
  const handleStudentReset = () => {
    if (!selectedStudent) return;
    if (window.confirm(`정말로 [${selectedStudent.name}] 학생의 모든 전적(0승 0패, 1000 RP)을 초기화하시겠습니까? 이 학생이 치른 모든 경기 기록도 자동으로 삭제 및 처리됩니다.`)) {
      onResetStudent(selectedStudent.id);
      setEditRpInput("1000");
      toast.success(`${selectedStudent.name} 학생의 기록을 완전 초기화했습니다.`);
    }
  };

  // 보안 잠금 가드 렌더링 (원천 차단 및 무력화)
  // 이중 보안 잠금 화면 렌더링을 완전히 우회하고 즉시 메인 대시보드를 노출합니다.

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[600px] w-full text-foreground">
      {/* Left Sidebar Menu */}
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-2 bg-card/45 border border-border/40 rounded-2xl p-4 backdrop-blur shadow-lg">
        <div className="px-3 py-2">
          <h2 className="text-lg font-black text-neon-blue tracking-tight">교사 관리자 패널</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">리그 글로벌 설정 및 학생 데이터를 통제합니다.</p>
        </div>
        <div className="h-px bg-border/20 my-2" />
        
        {/* Menu Buttons */}
        <div className="flex flex-col gap-1">
          {[
            { id: "settings", label: "리그 글로벌 설정", icon: Settings, desc: "리그 이름, 티어, RP 규칙 설정" },
            { id: "studentRegister", label: "학생 등록", icon: UserPlus, desc: "나이스 명렬표 대량 등록" },
            { id: "studentManage", label: "개별 학생 관리", icon: User, desc: "학급 명단, RP 수정 및 삭제" },
            { id: "matchRecords", label: "리그 기록 관리", icon: Swords, desc: "전체 경기 조회, 점수 수정/삭제" },
            { id: "dataManage", label: "데이터 관리", icon: Database, desc: "JSON 백업 다운로드 및 복원" },
            { id: "seasonManage", label: "시즌 관리", icon: Calendar, desc: "시즌 초기화 및 신규 시즌 생성" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95 group",
                  isActive
                    ? "bg-neon-blue/15 text-neon-blue font-black border border-neon-blue/30 shadow-[0_0_12px_rgba(0,180,216,0.15)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
                )}
              >
                <Icon className={cn("size-5 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-neon-blue" : "text-muted-foreground group-hover:text-foreground")} />
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-none">{item.label}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 truncate leading-none">{item.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {activeTab === "settings" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 1. League Title Card */}
          <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block">1단계: 리그 이름 설정</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-bold">사용자 설정 활성화</span>
                  <button
                    type="button"
                    onClick={() => setIsTitleCustomOpen(!isTitleCustomOpen)}
                    className={cn(
                      "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                      isTitleCustomOpen ? "bg-neon-blue" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "size-4 rounded-full bg-white transition-transform shadow-sm",
                      isTitleCustomOpen ? "translate-x-3" : "translate-x-0"
                    )} />
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setIsTierCustomOpen(!isTierCustomOpen)}
                    className={cn(
                      "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                      isTierCustomOpen ? "bg-neon-blue" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "size-4 rounded-full bg-white transition-transform shadow-sm",
                      isTierCustomOpen ? "translate-x-3" : "translate-x-0"
                    )} />
                  </button>
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
                          value={
                            activeTierTab === "Bronze" ? inputBronze :
                            activeTierTab === "Silver" ? inputSilver :
                            activeTierTab === "Gold" ? inputGold :
                            activeTierTab === "Platinum" ? inputPlatinum :
                            inputDiamond
                          }
                          onChange={(e) => {
                            setPreset("custom");
                            const val = e.target.value;
                            if (activeTierTab === "Bronze") setInputBronze(val);
                            else if (activeTierTab === "Silver") setInputSilver(val);
                            else if (activeTierTab === "Gold") setInputGold(val);
                            else if (activeTierTab === "Platinum") setInputPlatinum(val);
                            else setInputDiamond(val);
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
                              setInputBronze(val.Bronze.toString());
                              setInputSilver(val.Silver.toString());
                              setInputGold(val.Gold.toString());
                              setInputPlatinum(val.Platinum.toString());
                              setInputDiamond(val.Diamond.toString());
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
                        <button
                          type="button"
                          onClick={handleToggleDecay}
                          className={cn(
                            "w-10 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                            localDecayEnabled ? "bg-amber-500" : "bg-muted"
                          )}
                        >
                          <div className={cn(
                            "size-5 rounded-full bg-white transition-transform shadow-sm",
                            localDecayEnabled ? "translate-x-4" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <div className="flex justify-between items-center p-3 rounded-lg bg-background/20 border border-border/20">
                        <div>
                          <span className="text-[11px] font-bold text-foreground block">이 티어에서 감점 적용</span>
                          <span className="text-[9px] text-muted-foreground">이 티어에 해당하는 학생들에게 휴면 유저 감점을 개별 적용합니다.</span>
                        </div>
                        <button
                          type="button"
                          disabled={!localDecayEnabled}
                          onClick={() => {
                            if (!localDecayEnabled) return;
                            const checked = localDecayTiers.includes(activeTierTab);
                            const nextTiers = checked
                              ? localDecayTiers.filter(t => t !== activeTierTab)
                              : [...localDecayTiers, activeTierTab];
                            setLocalDecayTiers(nextTiers);
                          }}
                          className={cn(
                            "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                            localDecayTiers.includes(activeTierTab) && localDecayEnabled ? "bg-amber-500" : "bg-muted",
                            !localDecayEnabled && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div className={cn(
                            "size-4 rounded-full bg-white transition-transform shadow-sm",
                            localDecayTiers.includes(activeTierTab) && localDecayEnabled ? "translate-x-3" : "translate-x-0"
                          )} />
                        </button>
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
                  <button
                    type="button"
                    onClick={() => setIsBonusCustomOpen(!isBonusCustomOpen)}
                    className={cn(
                      "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                      isBonusCustomOpen ? "bg-neon-blue" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "size-4 rounded-full bg-white transition-transform shadow-sm",
                      isBonusCustomOpen ? "translate-x-3" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>

              {isBonusCustomOpen && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    
                    {/* 1. firstWin */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">🌟 오늘의 첫 승</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, firstWinEnabled: !prev.firstWinEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.firstWinEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.firstWinEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Input
                          type="number"
                          value={localDynamicBonuses.firstWinRp}
                          disabled={!localDynamicBonuses.firstWinEnabled}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicBonuses(prev => ({ ...prev, firstWinRp: isNaN(val) ? 0 : val }));
                          }}
                          className="w-16 h-7 text-center font-mono font-bold bg-background/50 border-border/30 text-neon-blue p-0"
                        />
                        <span className="text-[10px] text-muted-foreground">RP 추가</span>
                      </div>
                    </div>

                    {/* 2. revenge */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">😈 복수전 성공</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, revengeEnabled: !prev.revengeEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.revengeEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.revengeEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Input
                          type="number"
                          value={localDynamicBonuses.revengeRp}
                          disabled={!localDynamicBonuses.revengeEnabled}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicBonuses(prev => ({ ...prev, revengeRp: isNaN(val) ? 0 : val }));
                          }}
                          className="w-16 h-7 text-center font-mono font-bold bg-background/50 border-border/30 text-neon-blue p-0"
                        />
                        <span className="text-[10px] text-muted-foreground">RP 추가</span>
                      </div>
                    </div>

                    {/* 3. underdog */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">🛡️ 언더독 격파</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, underdogEnabled: !prev.underdogEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.underdogEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.underdogEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-muted-foreground font-bold block">1티어 차이</label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={localDynamicBonuses.underdogDiff1Rp ?? 5}
                              disabled={!localDynamicBonuses.underdogEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, underdogDiff1Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-10 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
                            />
                            <span className="text-[9px] text-muted-foreground">RP</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground font-bold block">2티어 차이</label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={localDynamicBonuses.underdogDiff2Rp ?? 10}
                              disabled={!localDynamicBonuses.underdogEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, underdogDiff2Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-10 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
                            />
                            <span className="text-[9px] text-muted-foreground">RP</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground font-bold block">3티어+ 차이</label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={localDynamicBonuses.underdogDiff3Rp ?? 15}
                              disabled={!localDynamicBonuses.underdogEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, underdogDiff3Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-10 h-7 text-center font-mono bg-background/50 border-border/30 p-0 text-neon-blue"
                            />
                            <span className="text-[9px] text-muted-foreground">RP</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. freshness */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">✨ 신선한 매치</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, freshnessEnabled: !prev.freshnessEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.freshnessEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.freshnessEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
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
                        <span>RP 추가</span>
                      </div>
                    </div>

                    {/* 5. streak */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">🔥 연승</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, streakEnabled: !prev.streakEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.streakEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.streakEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
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
                    </div>

                    {/* 6. greatMatch */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">⚔️ 명승부 보너스</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, greatMatchEnabled: !prev.greatMatchEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.greatMatchEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.greatMatchEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-background/20 p-2 rounded text-[10px] text-center space-y-1">
                          <span>1점차 (승/패)</span>
                          <div className="flex justify-center gap-1 mt-0.5">
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchWin1Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchWin1Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchLose1Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchLose1Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                          </div>
                        </div>
                        <div className="bg-background/20 p-2 rounded text-[10px] text-center space-y-1">
                          <span>2점차 (승/패)</span>
                          <div className="flex justify-center gap-1 mt-0.5">
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchWin2Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchWin2Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchLose2Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchLose2Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                          </div>
                        </div>
                        <div className="bg-background/20 p-2 rounded text-[10px] text-center space-y-1">
                          <span>3점차 (승/패)</span>
                          <div className="flex justify-center gap-1 mt-0.5">
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchWin3Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchWin3Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                            <Input
                              type="number"
                              value={localDynamicBonuses.greatMatchLose3Rp}
                              disabled={!localDynamicBonuses.greatMatchEnabled}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLocalDynamicBonuses(prev => ({ ...prev, greatMatchLose3Rp: isNaN(val) ? 0 : val }));
                              }}
                              className="w-8 h-6 text-center font-mono p-0 bg-background/50 border-border/30 text-neon-blue"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 7. lossComfort */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">🩹 꺾이지 않는 마음</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, lossComfortEnabled: !prev.lossComfortEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.lossComfortEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.lossComfortEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
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
                    </div>

                    {/* 8. willOfSteel */}
                    <div className="flex flex-col justify-between p-3 rounded-lg border border-border/20 bg-background/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">🔥 불굴의 의지</span>
                        <button
                          type="button"
                          onClick={() => setLocalDynamicBonuses(prev => ({ ...prev, willOfSteelEnabled: !prev.willOfSteelEnabled }))}
                          className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicBonuses.willOfSteelEnabled ? "bg-neon-blue" : "bg-muted")}
                        >
                          <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicBonuses.willOfSteelEnabled ? "translate-x-3" : "translate-x-0")} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                        <div>
                          <span>3연패 탈출</span>
                          <Input
                            type="number"
                            value={localDynamicBonuses.willOfSteel3Rp ?? 10}
                            disabled={!localDynamicBonuses.willOfSteelEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, willOfSteel3Rp: isNaN(val) ? 0 : val }));
                            }}
                            className="w-10 h-7 text-center mt-0.5 font-mono p-0 bg-background/50 border-border/30 text-neon-blue mx-auto"
                          />
                        </div>
                        <div>
                          <span>4연패 탈출</span>
                          <Input
                            type="number"
                            value={localDynamicBonuses.willOfSteel4Rp ?? 15}
                            disabled={!localDynamicBonuses.willOfSteelEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, willOfSteel4Rp: isNaN(val) ? 0 : val }));
                            }}
                            className="w-10 h-7 text-center mt-0.5 font-mono p-0 bg-background/50 border-border/30 text-neon-blue mx-auto"
                          />
                        </div>
                        <div>
                          <span>5연패+ 탈출</span>
                          <Input
                            type="number"
                            value={localDynamicBonuses.willOfSteel5Rp ?? 20}
                            disabled={!localDynamicBonuses.willOfSteelEnabled}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicBonuses(prev => ({ ...prev, willOfSteel5Rp: isNaN(val) ? 0 : val }));
                            }}
                            className="w-10 h-7 text-center mt-0.5 font-mono p-0 bg-background/50 border-border/30 text-neon-blue mx-auto"
                          />
                        </div>
                      </div>
                    </div>

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
                  <button
                    type="button"
                    onClick={() => setIsPenaltyCustomOpen(!isPenaltyCustomOpen)}
                    className={cn(
                      "w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0",
                      isPenaltyCustomOpen ? "bg-neon-blue" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "size-4 rounded-full bg-white transition-transform shadow-sm",
                      isPenaltyCustomOpen ? "translate-x-3" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>

              {isPenaltyCustomOpen && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between border-b border-border/30 pb-2">
                    <span className="text-[11px] font-bold text-foreground">패배 패널티 기능 전체 활성화</span>
                    <button
                      type="button"
                      onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.enabled ? "bg-rose-500" : "bg-muted")}
                    >
                      <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.enabled ? "translate-x-3" : "translate-x-0")} />
                    </button>
                  </div>

                  {localDynamicPenalties.enabled && (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  
                  {/* arrogance */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">👤 오만함의 대가 (2단계 아래에 패배)</span>
                      <button
                        type="button"
                        onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, arrogance: !prev.arrogance }))}
                        className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.arrogance ? "bg-rose-500" : "bg-muted")}
                      >
                        <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.arrogance ? "translate-x-3" : "translate-x-0")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-tier-gold block">골드</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.arrogance}
                          value={localDynamicPenalties.arroganceGold}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, arroganceGold: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-platinum block">플래티넘</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.arrogance}
                          value={localDynamicPenalties.arrogancePlatinum}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, arrogancePlatinum: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-diamond block">다이아</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.arrogance}
                          value={localDynamicPenalties.arroganceDiamond}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, arroganceDiamond: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  {/* crushing */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">💥 굴욕적 완패 (5점 차 이상 완패)</span>
                      <button
                        type="button"
                        onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, crushing: !prev.crushing }))}
                        className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.crushing ? "bg-rose-500" : "bg-muted")}
                      >
                        <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.crushing ? "translate-x-3" : "translate-x-0")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-tier-gold block">골드</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.crushing}
                          value={localDynamicPenalties.crushingGold}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, crushingGold: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-platinum block">플래티넘</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.crushing}
                          value={localDynamicPenalties.crushingPlatinum}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, crushingPlatinum: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-diamond block">다이아</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.crushing}
                          value={localDynamicPenalties.crushingDiamond}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, crushingDiamond: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  {/* revengeFail */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">😈 복수 허용 (상대 복수전 성공)</span>
                      <button
                        type="button"
                        onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, revengeFail: !prev.revengeFail }))}
                        className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.revengeFail ? "bg-rose-500" : "bg-muted")}
                      >
                        <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.revengeFail ? "translate-x-3" : "translate-x-0")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-tier-gold block">골드</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.revengeFail}
                          value={localDynamicPenalties.revengeAllowedGold}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, revengeAllowedGold: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-platinum block">플래티넘</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.revengeFail}
                          value={localDynamicPenalties.revengeAllowedPlatinum}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, revengeAllowedPlatinum: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-diamond block">다이아</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.revengeFail}
                          value={localDynamicPenalties.revengeAllowedDiamond}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, revengeAllowedDiamond: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  {/* championWeight */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">👑 챔피언의 무게 (패배 가중치)</span>
                      <button
                        type="button"
                        onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, championWeight: !prev.championWeight }))}
                        className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.championWeight ? "bg-rose-500" : "bg-muted")}
                      >
                        <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.championWeight ? "translate-x-3" : "translate-x-0")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-tier-gold block">골드</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.championWeight}
                          value={localDynamicPenalties.championGold}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, championGold: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-platinum block">플래티넘</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.championWeight}
                          value={localDynamicPenalties.championPlatinum}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, championPlatinum: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-tier-diamond block">다이아</label>
                        <Input
                          type="number"
                          disabled={!localDynamicPenalties.championWeight}
                          value={localDynamicPenalties.championDiamond}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setLocalDynamicPenalties(prev => ({ ...prev, championDiamond: isNaN(val) ? 0 : val }));
                          }}
                          className="h-7 text-center font-mono mt-0.5 p-0 bg-background/50 border-border/30 text-foreground"
                        />
                      </div>
                    </div>
                  </div>

                  {/* lossStreak / swamp */}
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-background/20 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">🐊 연패의 늪 (2연패 / 3연패↑ 추가 감점)</span>
                      <button
                        type="button"
                        onClick={() => setLocalDynamicPenalties(prev => ({ ...prev, lossStreak: !prev.lossStreak }))}
                        className={cn("w-8 h-5 rounded-full transition-colors relative flex items-center px-0.5", localDynamicPenalties.lossStreak ? "bg-rose-500" : "bg-muted")}
                      >
                        <div className={cn("size-4 rounded-full bg-white transition-transform shadow-sm", localDynamicPenalties.lossStreak ? "translate-x-3" : "translate-x-0")} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[9px]">
                      <div>
                        <span>골드 (2/3+연패)</span>
                        <div className="flex gap-1 mt-0.5">
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampGold2}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampGold2: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampGold3}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampGold3: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                        </div>
                      </div>
                      <div>
                        <span>플래 (2/3+연패)</span>
                        <div className="flex gap-1 mt-0.5">
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampPlatinum2}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampPlatinum2: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampPlatinum3}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampPlatinum3: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                        </div>
                      </div>
                      <div>
                        <span>다이아 (2/3+연패)</span>
                        <div className="flex gap-1 mt-0.5">
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampDiamond2}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampDiamond2: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                          <Input
                            type="number"
                            disabled={!localDynamicPenalties.lossStreak}
                            value={localDynamicPenalties.swampDiamond3}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setLocalDynamicPenalties(prev => ({ ...prev, swampDiamond3: isNaN(val) ? 0 : val }));
                            }}
                            className="h-7 text-center font-mono p-0 bg-background/50 border-border/30 text-foreground w-8"
                          />
                        </div>
                      </div>
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
        </div>
      )}

      {/* 3.9. All Match Records Integrated Management Section (전체 경기 기록 통합 관리) */}
      {activeTab === "matchRecords" && (
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl relative overflow-hidden">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-neon-blue">
            <Swords className="size-5 animate-pulse" />
            <h3 className="font-black text-lg">리그 기록 관리</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-muted-foreground/85">
            리그에 기록된 모든 매치 데이터를 조회하고, 경기 점수를 소급 수정하거나 완전 삭제하여 RP 및 전적을 안전하게 롤백 복원합니다. (태블릿 환경 최적화)
          </p>
        </div>
            {/* Category Selector Tabs & Inputs for Dynamic Loading/Filtering */}
        <div className="mb-5 space-y-3">
          <div className="p-1 bg-muted/40 border border-border/20 rounded-xl flex flex-wrap gap-1.5 w-full md:w-max">
            <button
              onClick={() => {
                setMatchFilterType("recent");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "recent"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Swords className="size-3.5" />
              최근 20경기
            </button>
            <button
              onClick={() => {
                setMatchFilterType("student");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "student"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Search className="size-3.5" />
              학생 이름 검색
            </button>
            <button
              onClick={() => {
                setMatchFilterType("date");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "date"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Calendar className="size-3.5" />
              날짜 검색 (6/2 등)
            </button>
            <button
              onClick={() => {
                setMatchFilterType("class");
                setMatchSearchStudent("");
                setMatchSearchDate("");
                setMatchSearchGradeClass("");
                setAppliedSearchStudent("");
                setAppliedSearchDate("");
                setAppliedSearchGradeClass("");
              }}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                matchFilterType === "class"
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                  : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
              )}
            >
              <Users className="size-3.5" />
              학년·반 검색 (6-1 등)
            </button>
          </div>

          {/* Conditional search inputs with premium glass style */}
          {matchFilterType === "student" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 학생 이름을 입력하세요..."
                  value={matchSearchStudent}
                  onChange={(e) => setMatchSearchStudent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchStudent(matchSearchStudent);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchStudent && (
                  <button
                    onClick={() => {
                      setMatchSearchStudent("");
                      setAppliedSearchStudent("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchStudent(matchSearchStudent)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}

          {matchFilterType === "date" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 날짜를 입력하세요 (예: 6/2, 6월 2일)..."
                  value={matchSearchDate}
                  onChange={(e) => setMatchSearchDate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchDate(matchSearchDate);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchDate && (
                  <button
                    onClick={() => {
                      setMatchSearchDate("");
                      setAppliedSearchDate("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchDate(matchSearchDate)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}

          {matchFilterType === "class" && (
            <div className="flex gap-2 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="relative flex-1">
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/75" />
                <Input
                  type="text"
                  placeholder="조회할 학년-반을 입력하세요 (예: 6-1, 6)..."
                  value={matchSearchGradeClass}
                  onChange={(e) => setMatchSearchGradeClass(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAppliedSearchGradeClass(matchSearchGradeClass);
                    }
                  }}
                  className="pl-10 pr-16 h-10 border-border/50 bg-background/40 hover:bg-background/60 focus:bg-background/80 transition-all font-sans text-xs"
                />
                {matchSearchGradeClass && (
                  <button
                    onClick={() => {
                      setMatchSearchGradeClass("");
                      setAppliedSearchGradeClass("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2 py-1 rounded-md transition-colors"
                  >
                    지우기
                  </button>
                )}
              </div>
              <Button
                onClick={() => setAppliedSearchGradeClass(matchSearchGradeClass)}
                className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground font-bold h-10 px-4 shrink-0 transition-all active:scale-95 rounded-xl shadow-md font-sans text-xs"
              >
                검색
              </Button>
            </div>
          )}
        </div>

        {/* Matches table container with horizontal scroll for smaller screens / tablets */}
        <div className="overflow-x-auto rounded-xl border border-border/30 bg-muted/5">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
              <tr>
                <th className="px-4 py-3">경기 일시</th>
                <th className="px-4 py-3">대결 학생 A</th>
                <th className="px-4 py-3 text-center">점수</th>
                <th className="px-4 py-3">대결 학생 B</th>
                <th className="px-4 py-3">RP 및 획득 보상 변동 내역</th>
                <th className="px-4 py-3 text-right">관리 작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches && filteredMatches.length > 0 ? (
                filteredMatches.map((m) => {
                    const playerA = students.find((s) => s.id === m.playerAId) ?? {
                      name: "알 수 없는 학생",
                      grade: 0,
                      classNum: 0,
                      number: 0,
                      gender: "U" as Gender
                    };
                    const playerB = students.find((s) => s.id === m.playerBId) ?? {
                      name: "알 수 없는 학생",
                      grade: 0,
                      classNum: 0,
                      number: 0,
                      gender: "U" as Gender
                    };
                    const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
                    const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;

                    const aWon = m.scoreA > m.scoreB;
                    const matchDateStr = new Date(m.date).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    // Gather individual settings items to display as premium badges
                    const getMatchBonuses = (roleSuffix: "" | "2", isTeamA: boolean) => {
                      const bonuses = [];
                      const rival = isTeamA ? (roleSuffix === "" ? m.rivalBonusA : m.rivalBonusA2) : (roleSuffix === "" ? m.rivalBonusB : m.rivalBonusB2);
                      const firstWin = isTeamA ? (roleSuffix === "" ? m.firstWinBonusA : m.firstWinBonusA2) : (roleSuffix === "" ? m.firstWinBonusB : m.firstWinBonusB2);
                      const revenge = isTeamA ? (roleSuffix === "" ? m.revengeBonusA : m.revengeBonusA2) : (roleSuffix === "" ? m.revengeBonusB : m.revengeBonusB2);
                      const underdog = isTeamA ? (roleSuffix === "" ? m.underdogBonusA : m.underdogBonusA2) : (roleSuffix === "" ? m.underdogBonusB : m.underdogBonusB2);
                      const scoreDiff = isTeamA ? (roleSuffix === "" ? m.scoreDiffBonusA : m.scoreDiffBonusA2) : (roleSuffix === "" ? m.scoreDiffBonusB : m.scoreDiffBonusB2);
                      const margin = isTeamA ? (roleSuffix === "" ? m.marginBonusA : m.marginBonusA2) : (roleSuffix === "" ? m.marginBonusB : m.marginBonusB2);
                      const freshness = isTeamA ? (roleSuffix === "" ? m.freshnessBonusA : m.freshnessBonusA2) : (roleSuffix === "" ? m.freshnessBonusB : m.freshnessBonusB2);
                      const streak = isTeamA ? (roleSuffix === "" ? m.streakBonusA : m.streakBonusA2) : (roleSuffix === "" ? m.streakBonusB : m.streakBonusB2);
                      const comeback = isTeamA ? (roleSuffix === "" ? m.comebackBonusA : m.comebackBonusA2) : (roleSuffix === "" ? m.comebackBonusB : m.comebackBonusB2);

                      if (firstWin && firstWin > 0) bonuses.push(`🌟 오늘의 첫 승 (+${firstWin})`);
                      if (revenge && revenge > 0) bonuses.push(`😈 복수전 성공 (+${revenge})`);
                      if (underdog && underdog > 0) bonuses.push(`🛡️ 언더독 격파 (+${underdog})`);
                      const finalMargin = (margin ?? 0) + (scoreDiff ?? 0);
                      if (finalMargin > 0) bonuses.push(`🚀 압승 (+${finalMargin})`);
                      if (rival && rival > 0) bonuses.push(`⚔️ 라이벌 격파 (+${rival})`);
                      if (freshness && freshness > 0) bonuses.push(`✨ 신선한 매치 (+${freshness})`);
                      if (streak && streak > 0) bonuses.push(`🔥 연승 (+${streak})`);
                      if (comeback && comeback > 0) bonuses.push(`🩹 연패 탈출 (+${comeback})`);
                      return bonuses;
                    };
                    const bonusesA = getMatchBonuses("", true);
                    const bonusesA2 = playerA2 ? getMatchBonuses("2", true) : [];
                    const bonusesB = getMatchBonuses("", false);
                    const bonusesB2 = playerB2 ? getMatchBonuses("2", false) : [];

                    return (
                      <tr key={m.id} className="border-b border-border/20 hover:bg-accent/10 transition-colors">
                        {/* 1. Date */}
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{matchDateStr}</td>
                        
                        {/* 2. Player A */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <GenderMark gender={playerA.gender} className="size-3.5 text-[9px]" />
                              <span className={cn("font-bold", aWon && "text-neon-blue")}>{playerA.name}</span>
                              <span className="text-[10px] text-muted-foreground">({playerA.grade}-{playerA.classNum})</span>
                            </div>
                            {playerA2 && (
                              <div className="flex items-center gap-1.5 border-t border-border/10 pt-1">
                                <GenderMark gender={playerA2.gender} className="size-3.5 text-[9px]" />
                                <span className={cn("font-bold", aWon && "text-neon-blue")}>{playerA2.name}</span>
                                <span className="text-[10px] text-muted-foreground">({playerA2.grade}-{playerA2.classNum})</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. Score */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="font-mono font-bold bg-muted/60 px-2.5 py-1 rounded text-sm select-none">
                            <span className={cn(aWon ? "text-win" : "text-loss")}>{m.scoreA}</span>
                            <span className="text-muted-foreground mx-1">:</span>
                            <span className={cn(!aWon ? "text-win" : "text-loss")}>{m.scoreB}</span>
                          </span>
                        </td>

                        {/* 4. Player B */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <GenderMark gender={playerB.gender} className="size-3.5 text-[9px]" />
                              <span className={cn("font-bold", !aWon && "text-neon-blue")}>{playerB.name}</span>
                              <span className="text-[10px] text-muted-foreground">({playerB.grade}-{playerB.classNum})</span>
                            </div>
                            {playerB2 && (
                              <div className="flex items-center gap-1.5 border-t border-border/10 pt-1">
                                <GenderMark gender={playerB2.gender} className="size-3.5 text-[9px]" />
                                <span className={cn("font-bold", !aWon && "text-neon-blue")}>{playerB2.name}</span>
                                <span className="text-[10px] text-muted-foreground">({playerB2.grade}-{playerB2.classNum})</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. RP Deltas and Audited Bonuses */}
                        <td className="px-4 py-3 max-w-[240px] sm:max-w-xs md:max-w-md lg:max-w-lg">
                          <div className="space-y-1">
                            <div className="flex flex-col gap-1 text-[10px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("font-mono font-bold", aWon ? "text-win" : "text-loss")}>
                                  {playerA.name}: {m.rpDeltaA !== undefined ? (m.rpDeltaA > 0 ? `+${m.rpDeltaA}` : m.rpDeltaA) : 0} RP
                                </span>
                                {playerA2 && (
                                  <span className={cn("font-mono font-bold", aWon ? "text-win" : "text-loss")}>
                                    & {playerA2.name}: {m.rpDeltaA2 !== undefined ? (m.rpDeltaA2 > 0 ? `+${m.rpDeltaA2}` : m.rpDeltaA2) : 0} RP
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("font-mono font-bold", !aWon ? "text-win" : "text-loss")}>
                                  {playerB.name}: {m.rpDeltaB !== undefined ? (m.rpDeltaB > 0 ? `+${m.rpDeltaB}` : m.rpDeltaB) : 0} RP
                                </span>
                                {playerB2 && (
                                  <span className={cn("font-mono font-bold", !aWon ? "text-win" : "text-loss")}>
                                    & {playerB2.name}: {m.rpDeltaB2 !== undefined ? (m.rpDeltaB2 > 0 ? `+${m.rpDeltaB2}` : m.rpDeltaB2) : 0} RP
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Render visual badges for bonuses A */}
                            {bonusesA.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerA.name} 보상:</span>
                                {bonusesA.map((b, idx) => (
                                  <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Render visual badges for bonuses A2 */}
                            {bonusesA2.length > 0 && playerA2 && (
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerA2.name} 보상:</span>
                                {bonusesA2.map((b, idx) => (
                                  <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Render visual badges for bonuses B */}
                            {bonusesB.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerB.name} 보상:</span>
                                {bonusesB.map((b, idx) => (
                                  <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Render visual badges for bonuses B2 */}
                            {bonusesB2.length > 0 && playerB2 && (
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                <span className="text-[9px] text-muted-foreground font-semibold shrink-0">{playerB2.name} 보상:</span>
                                {bonusesB2.map((b, idx) => (
                                  <span key={idx} className="bg-neon-blue/10 text-neon-blue border border-neon-blue/20 text-[8px] font-bold px-1.5 py-0.5 rounded">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 6. Tablet Actions panel */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Score Edit Button */}
                            <Button
                              onClick={() => {
                                setEditingMatchId(m.id);
                                setEditScoreA(m.scoreA.toString());
                                setEditScoreB(m.scoreB.toString());
                              }}
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 rounded-lg border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all text-[11px] font-bold"
                              title="경기 점수 수정"
                            >
                              <Pencil className="size-3.5 mr-1" /> 수정
                            </Button>

                            {/* Record Delete & RP Rollback Button */}
                            <Button
                              onClick={() => {
                                const deltaWinner = aWon ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 25) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 25);
                                const deltaLoser = !aWon ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 20) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 20);

                                const vsText = playerB2 ? `VS ${playerB.name} & ${playerB2.name}` : `VS ${playerB.name}`;
                                const playersA = playerA2 ? `${playerA.name} & ${playerA2.name}` : playerA.name;
                                const playersB = playerB2 ? `${playerB.name} & ${playerB2.name}` : playerB.name;

                                if (window.confirm(`정말로 이 경기 기록(${vsText})을 삭제하시겠습니까?\n\n모든 참여 학생들의 RP가 경기 이전 상태로 완벽하게 롤백 복원됩니다.\n- ${playersA}: RP ${aWon ? "-" : "+"}${deltaWinner}\n- ${playersB}: RP ${!aWon ? "-" : "+"}${deltaLoser}`)) {
                                  onDeleteMatch(m.id);
                                  toast.success("경기 기록이 완벽히 삭제되었으며 참여 학생들의 RP 및 전적이 경기 이전으로 롤백 복구되었습니다!");
                                }
                              }}
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg active:scale-95 transition-all shrink-0"
                              title="이 경기 삭제 및 안전 롤백"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground font-medium bg-muted/5 font-sans text-xs">
                    {(() => {
                      if (matchFilterType === "recent") {
                        return "기록된 전체 경기 매치 내역이 전혀 존재하지 않습니다.";
                      }
                      
                      const hasApplied = 
                        (matchFilterType === "student" && appliedSearchStudent) ||
                        (matchFilterType === "date" && appliedSearchDate) ||
                        (matchFilterType === "class" && appliedSearchGradeClass);
                        
                      if (!hasApplied) {
                        return "검색어를 입력하고 '검색' 버튼(또는 엔터)을 누르면 매치 기록을 불러옵니다.";
                      }
                      
                      return "선택한 필터 조건과 일치하는 경기 기록이 존재하지 않습니다.";
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {/* 1. Class Control: Lock Switch */}
      {activeTab === "settings" && (
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
      )}

      {/* 2. Individual Student Management Dashboard */}
      {activeTab === "studentManage" && (
      <Card className="border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-neon-blue">
            <User className="size-5" />
            <h3 className="font-black text-lg">개별 학생 관리 대시보드</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            학생 이름을 검색하여 개별 프로필을 조회하고, RP 점수를 임의 수정하거나 과거 경기 내역을 추적하여 양방향 롤백(삭제)을 관리할 수 있습니다.
          </p>
        </div>

        {!selectedStudent && (
          <>
            {/* Student Search Box */}
            <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="관리하고 싶은 학생 이름을 입력하세요..."
            className="h-10 border-border/60 bg-background/60 pl-9 text-sm"
          />
          
          {/* Autocomplete Search Dropdown */}
          {searchQuery.trim() !== "" && (
            <Card className="absolute left-0 right-0 top-[44px] z-50 max-h-[220px] overflow-y-auto border border-border/80 bg-popover p-2 shadow-2xl backdrop-blur-xl">
              {searchFilteredStudents.length > 0 ? (
                <div className="space-y-1">
                  {searchFilteredStudents.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStudent(s)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent/80 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <GenderMark gender={s.gender} />
                        <span className="font-bold text-foreground">{s.name}</span>
                        <span className="text-xs text-muted-foreground">({s.grade}학년 {s.classNum}반 {s.number}번)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TierBadge rp={s.rp} thresholds={thresholds} />
                        <span className="font-mono text-xs text-neon-blue font-bold">{s.rp} RP</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">일치하는 학생을 찾을 수 없습니다.</div>
              )}
            </Card>
          )}
        </div>



        {/* Grade/Class Selector */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-5 mt-4 space-y-4">
          <div>
            <span className="text-xs text-neon-blue font-bold uppercase tracking-wider">학년 선택</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setFilterGrade(g);
                    setFilterClassNum(null);
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95",
                    filterGrade === g
                      ? "border-neon-blue bg-neon-blue/20 text-neon-blue shadow-[0_0_12px_rgba(0,180,216,0.25)]"
                      : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {g}학년
                </button>
              ))}
            </div>
          </div>

          {filterGrade != null && (
            <div className="animate-in fade-in duration-300">
              <span className="text-xs text-neon-green font-bold uppercase tracking-wider">반 선택</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((c) => availableClassesForFilter.includes(c)).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFilterClassNum(c)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95",
                      filterClassNum === c
                        ? "border-neon-green bg-neon-green/20 text-neon-green shadow-[0_0_12px_rgba(34,197,94,0.25)]"
                        : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c}반
                  </button>
                ))}
                {availableClassesForFilter.length === 0 && (
                  <span className="text-xs text-muted-foreground py-2 block">해당 학년에 등록된 학생이 없습니다. 명렬표를 등록해주세요.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Class Students Roster Grid Card */}
        {filterGrade != null && filterClassNum != null && (
          <div className="mt-5 pt-4 border-t border-border/30 animate-in fade-in duration-300">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider block mb-2">
              학급 명단 브라우저 ({filterGrade}학년 {filterClassNum}반 · {classFilteredStudents.length}명)
            </span>
            
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classFilteredStudents.map((s) => (
                <Card 
                  key={s.id} 
                  className={cn(
                    "p-4 border border-border/40 bg-background/40 hover:bg-accent/10 hover:border-neon-blue/40 transition-all duration-200 cursor-pointer flex items-center justify-between group relative overflow-hidden",
                    selectedStudentId === s.id && "border-neon-blue bg-neon-blue/5 shadow-[0_0_15px_rgba(0,180,216,0.1)]"
                  )}
                  onClick={() => handleSelectStudent(s)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-muted-foreground bg-muted/40 size-8 rounded-full flex items-center justify-center shrink-0">
                      {s.number}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <GenderMark gender={s.gender} />
                        <span>{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <TierBadge rp={s.rp} thresholds={thresholds} />
                        <span className="font-mono text-[11px] text-neon-blue font-bold">{s.rp} RP</span>
                      </div>
                    </div>
                  </div>

                  {/* Delete Student Button wrapped in AlertDialog trigger */}
                  <div className="flex items-center gap-1 relative z-20" onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-80 hover:opacity-100 transition-all"
                          title="선수 삭제"
                        >
                          <Trash2 className="size-4.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-destructive/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
                            <ShieldAlert className="size-5 shrink-0" /> 정말 학생을 삭제하시겠습니까?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
                            정말 <span className="font-black text-foreground">[{s.name}] ({s.grade}학년 {s.classNum}반 {s.number}번)</span> 학생의 모든 데이터를 영구 삭제하시겠습니까?<br /><br />
                            이 학생이 치른 <span className="font-bold text-destructive">모든 과거 경기 기록도 자동으로 제거</span>되며, 상대방 학생들의 승패와 RP 수치도 경기 전 상태로 부분 롤백됩니다. 이 작업은 되돌릴 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-6 gap-2">
                          <AlertDialogCancel className="font-bold border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all rounded-xl h-11 px-5">
                            취소
                          </AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => {
                              onDeleteStudent?.(s.id);
                              if (selectedStudentId === s.id) {
                                setSelectedStudentId(null);
                              }
                              toast.success(`[${s.name}] 학생 및 연계 경기 전적이 리그에서 성공적으로 완전 삭제되었습니다.`);
                            }}
                            className="font-black bg-destructive hover:bg-destructive/80 active:scale-95 transition-all text-white rounded-xl h-11 px-5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                          >
                            예, 안전 삭제합니다
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              ))}
              {classFilteredStudents.length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-muted-foreground border border-dashed border-border/30 rounded-xl bg-muted/5">
                  선택하신 학급에 등록된 학생이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}

        {/* Student Detail Panel */}
        {selectedStudent ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 목록으로 돌아가기 버튼 배치 */}
            <div className="flex justify-between items-center pb-2 border-b border-border/25">
              <Button
                variant="ghost"
                onClick={() => setSelectedStudentId(null)}
                className="h-9 px-3 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="size-4" /> 다른 학생 선택 (목록으로)
              </Button>
            </div>
            
            <div className="grid gap-6 md:grid-cols-5">
            
            {/* Profile Info & RP Adjuster (Left Side) */}
            <div className="md:col-span-2 space-y-4">
              <div className="rounded-xl border border-border/40 bg-muted/20 p-5 relative overflow-hidden">
                <div className="absolute right-4 top-4 opacity-15">
                  <User className="size-20 text-muted-foreground" />
                </div>
                
                <span className="text-xs text-muted-foreground font-semibold">
                  {selectedStudent.grade}학년 {selectedStudent.classNum}반 · {selectedStudent.number}번
                </span>
                
                <div className="mt-1 flex items-center gap-2 text-2xl font-black">
                  <GenderMark gender={selectedStudent.gender} />
                  {selectedStudent.name}
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <TierBadge rp={selectedStudent.rp} thresholds={thresholds} />
                  <span className="font-mono text-sm font-bold text-neon-blue">{selectedStudent.rp} RP</span>
                  <span className="text-xs text-muted-foreground">({selectedStudent.wins}승 {selectedStudent.losses}패)</span>
                </div>

                {/* 성별 수정 드롭다운 */}
                <div className="space-y-1.5 mt-3 pt-3 border-t border-border/20">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">성별 수정</label>
                  <select
                    value={selectedStudent.gender}
                    onChange={(e) => onUpdateGender?.(selectedStudent.id, e.target.value as Gender)}
                    className="w-full h-10 border border-border/50 bg-background/60 rounded-xl px-3 text-xs font-semibold focus-visible:ring-neon-blue transition-all"
                  >
                    <option value="M">남학생 (M)</option>
                    <option value="F">여학생 (F)</option>
                    <option value="U">미지정 (U)</option>
                  </select>
                </div>

                {/* 학생 삭제 버튼 */}
                <div className="mt-2.5">
                  <Button
                    onClick={() => {
                      if (window.confirm(`정말로 [${selectedStudent.name}] 학생을 완전히 삭제하시겠습니까? 이 학생이 치른 모든 경기 기록도 연쇄 삭제되며 롤백됩니다. 이 작업은 취소할 수 없습니다.`)) {
                        onDeleteStudent?.(selectedStudent.id);
                        setSelectedStudentId(null);
                        toast.success(`[${selectedStudent.name}] 학생이 성공적으로 삭제되었습니다.`);
                      }
                    }}
                    variant="destructive"
                    size="sm"
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold active:scale-95 transition-all"
                  >
                    <Trash2 className="mr-2 size-3.5" /> 학생 영구 삭제
                  </Button>
                </div>

                {/* Individual Student Reset Button */}
                <div className="mt-4 pt-3 border-t border-border/30">
                  <Button
                    onClick={handleStudentReset}
                    variant="destructive"
                    size="sm"
                    className="w-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 font-bold active:scale-95 transition-all"
                  >
                    <RotateCcw className="mr-2 size-3.5" /> 개인 데이터 초기화
                  </Button>
                </div>
              </div>

              {/* RP Editor */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
                <h4 className="text-sm font-bold mb-3 text-muted-foreground">RP 수동 조정 및 편집</h4>
                
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={editRpInput}
                    onChange={(e) => setEditRpInput(e.target.value)}
                    className="font-mono font-bold text-lg text-neon-blue bg-background/60"
                  />
                  <Button onClick={saveRpChanges} className="bg-neon-blue text-primary-foreground font-black px-4 hover:opacity-90">
                    <Save className="size-4 mr-1" /> 저장
                  </Button>
                </div>

                {/* Instant adjustment presets */}
                <div className="mt-4">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-2">실시간 빠른 미세 조정 (즉시 반영)</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[-50, -10, +10, +50].map((delta) => (
                      <button
                        key={delta}
                        onClick={() => applyRpPreset(delta)}
                        className={cn(
                          "py-1.5 text-xs font-mono font-bold rounded-lg border transition-all active:scale-95",
                          delta > 0 
                            ? "border-neon-green/40 bg-neon-green/5 text-neon-green hover:bg-neon-green/15" 
                            : "border-loss/40 bg-loss/5 text-loss hover:bg-loss/15"
                        )}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Match Logs (Right Side) */}
            <div className="md:col-span-3 space-y-3">
              <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                경기 내역 타임라인 <span className="font-mono text-xs rounded-full bg-muted/80 px-2 py-0.5 text-foreground">{studentMatches.length}</span>
              </h4>

              <div className="max-h-[340px] overflow-y-auto space-y-2 border border-border/30 rounded-xl p-3 bg-muted/10">
                {studentMatches.length > 0 ? (
                  studentMatches.map((m) => {
                    const isPlayerA = m.playerAId === selectedStudent.id;
                    const opponentId = isPlayerA ? m.playerBId : m.playerAId;
                    const opponent = students.find((s) => s.id === opponentId) ?? {
                      name: "알 수 없는 선수",
                      grade: 0,
                      classNum: 0,
                      number: 0,
                      gender: "U" as Gender
                    };

                    const scoreSelf = isPlayerA ? m.scoreA : m.scoreB;
                    const scoreOpp = isPlayerA ? m.scoreB : m.scoreA;
                    const isWin = scoreSelf > scoreOpp;
                    const matchDateStr = new Date(m.date).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <div key={m.id} className="flex items-center justify-between border border-border/30 bg-background/40 p-3 rounded-lg hover:border-border/60 transition-all gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "flex size-7 items-center justify-center rounded-full text-xs font-black select-none shrink-0",
                            isWin 
                              ? "bg-win/15 text-win ring-1 ring-win/30" 
                              : "bg-loss/15 text-loss ring-1 ring-loss/30"
                          )}>
                            {isWin ? "승" : "패"}
                          </span>
                          
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>VS</span>
                              <GenderMark gender={opponent.gender} className="size-3.5 text-[9px]" />
                              <span className="font-bold text-foreground">{opponent.name}</span>
                              <span>({opponent.grade}-{opponent.classNum})</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{matchDateStr}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm font-black tracking-wider text-muted-foreground shrink-0 bg-muted/40 px-2 py-0.5 rounded">
                            <span className={cn(isWin ? "text-win" : "text-loss")}>{scoreSelf}</span>
                            <span> : </span>
                            <span className={cn(!isWin ? "text-win" : "text-loss")}>{scoreOpp}</span>
                          </span>

                          {/* Bilateral rollback button */}
                          <Button
                            onClick={() => {
                              const deltaWinner = isPlayerA ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 25) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 25);
                              const deltaLoser = !isPlayerA ? (m.rpDeltaA !== undefined ? Math.abs(m.rpDeltaA) : 20) : (m.rpDeltaB !== undefined ? Math.abs(m.rpDeltaB) : 20);
                              
                              if (window.confirm(`정말로 이 경기(VS ${opponent.name}) 기록을 완벽히 삭제하고, 두 학생의 RP 변동 수치를 경기 이전 상태로 양방향 롤백하시겠습니까?\n\n- 승자: RP -${deltaWinner}, 1승 차감\n- 패자: RP +${deltaLoser}, 1패 차감`)) {
                                onDeleteMatch(m.id);
                                toast.success("경기 기록이 완벽히 삭제되었으며 두 학생의 RP가 경기 이전으로 안전하게 복구되었습니다!");
                              }
                            }}
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            title="이 경기 기록 삭제 및 양방향 롤백"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground">경기 내역이 전혀 존재하지 않습니다.</div>
                )}
              </div>
            </div>

          </div>
        </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/40 rounded-xl bg-muted/5">
            <User className="size-10 text-muted-foreground/60 mb-2" />
            <div className="text-xs text-muted-foreground">조회하고 싶은 학생을 검색창에 입력하여 선택해 주세요.</div>
          </div>
        )}
      </Card>
      )}

      {/* 3. JSON Backup Download & Collapsible NEIS Paste */}
      {activeTab === "dataManage" && (
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* JSON Backup Card */}
        <Card className="border-border/60 bg-card/60 p-5 backdrop-blur shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-neon-green">
              <Download className="size-5" />
              <h3 className="font-bold">전체 데이터 JSON 다운로드</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              현재 등록된 모든 선수들의 순위, 소속 학년/반/번호, 이름, 성별, 최종 RP 점수, 티어, 경기 승패 전적 기록 및 업적(Achievements), 연승(Streak) 정보와 전체 매치 기록을 담은 JSON 백업 파일을 생성하여 로컬 PC에 즉시 다운로드합니다.
            </p>
          </div>
          <Button
            onClick={downloadJSON}
            size="lg"
            className="mt-5 w-full bg-gradient-to-r from-neon-green to-tier-platinum text-primary-foreground font-black tracking-wide shadow-md active:scale-95 transition-all"
          >
            <Download className="mr-2 size-4" /> 전체 데이터 JSON 백업 내보내기
          </Button>
        </Card>

        {/* JSON Restore / Rollback Card */}
        <Card className="border-border/60 bg-card/60 p-5 backdrop-blur shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-destructive">
              <RotateCcw className="size-5" />
              <h3 className="font-bold text-foreground">JSON 업로드하여 데이터 롤백</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              교사가 이전에 백업해 둔 JSON 파일을 업로드하면, 해당 파일을 기반으로 전체 학생 명단과 RP, 전적 및 매치 로그 데이터를 완벽하게 해당 시점의 데이터로 롤백 복원합니다.
            </p>
          </div>
          <div className="mt-5">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleJSONRestoreUpload} 
              accept=".json" 
              className="hidden" 
              id="json-file-upload-input"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="lg"
              className="w-full bg-gradient-to-r from-destructive to-amber-600 text-white font-black tracking-wide shadow-md active:scale-95 transition-all"
            >
              <RotateCcw className="mr-2 size-4" /> JSON 데이터 롤백 복원
            </Button>
          </div>
        </Card>

      </div>
      )}

      {/* Bulk Upload panel (Conditional) */}
      {activeTab === "studentRegister" && (
        <Card className="border-border/60 bg-card/60 p-5 backdrop-blur shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-3">
            <h3 className="font-bold text-sm">학생 등록</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              엑셀이나 나이스(NEIS)의 명렬표에서 복사한 목록을 아래에 붙여넣으세요.<br />
              형식: <code className="text-foreground bg-muted px-1 rounded">학년 반 번호 이름 (성별)</code> (예: 5 1 1 홍길동 남)<br />
              성별은 생략 가능하며, 생략 시 미지정(U) 처리됩니다.
            </p>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`5\t1\t1\t홍길동\t남\n5\t1\t2\t김민지\t여`}
            className="min-h-[160px] resize-y border-border/60 bg-background/60 font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="rounded bg-muted/60 px-2 py-0.5">
              현재 등록 인원: <span className="font-bold text-foreground">{count}명</span>
            </span>
            <span className="rounded bg-neon-blue/15 px-2 py-0.5 text-neon-blue">
              인식된 행: <span className="font-bold">{parsed.rows.length}명</span>
            </span>
            {parsed.errors > 0 && (
              <span className="flex items-center gap-1 rounded bg-destructive/15 px-2 py-0.5 text-destructive">
                <AlertCircle className="size-3" /> 형식 불일치 (무시됨): {parsed.errors}줄
              </span>
            )}
          </div>

          {parsed.rows.length > 0 && (
            <Card className="overflow-hidden border-border/40 bg-card/40 p-0 mt-4">
              <div className="border-b border-border/40 px-4 py-2 text-xs font-semibold">파싱 결과 미리보기 ({parsed.rows.length}명)</div>
              <div className="max-h-[220px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left">#</th>
                      <th className="px-3 py-1.5 text-left">학년</th>
                      <th className="px-3 py-1.5 text-left">반</th>
                      <th className="px-3 py-1.5 text-left">번호</th>
                      <th className="px-3 py-1.5 text-left">이름</th>
                      <th className="px-3 py-1.5 text-left">성별</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.grade}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.classNum}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.number}</td>
                        <td className="px-3 py-1.5 font-medium">{r.name}</td>
                        <td className="px-3 py-1.5"><GenderMark gender={r.gender ?? "U"} className="size-3.5 text-[9px]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Button
            size="lg"
            onClick={commit}
            disabled={parsed.rows.length === 0}
            className="h-10 w-full mt-4 bg-gradient-to-r from-neon-green to-neon-blue font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            <Database className="mr-2 size-4" /> 명단 업로드 실행 ({parsed.rows.length}명)
          </Button>
        </Card>
      )}



      {/* 전체 경기 기록 통합 관리 섹션이 최상단으로 이동되었습니다. */}
      {/* Inline Score Edit Modal Overlaid (Radix Dialog style custom state overlay) */}
      {editingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-sm w-full border border-border/80 bg-background p-6 shadow-2xl rounded-2xl relative z-50 animate-in zoom-in-95 duration-200">
            <h4 className="text-base font-black mb-1 flex items-center gap-1.5 text-foreground">
              <Pencil className="size-4.5 text-neon-blue" /> 경기 세부 점수 수정
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              경기 결과를 수정하면 바뀐 점수를 기반으로 점수차 비례 보상 등의 보너스 및 최종 RP가 오차 없이 다시 자동 계산되어 두 학생에게 즉시 덮어씌워집니다.
            </p>

            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border/30 mb-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  A 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreA}
                  onChange={(e) => setEditScoreA(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  B 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreB}
                  onChange={(e) => setEditScoreB(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setEditingMatchId(null)}
                variant="outline"
                className="w-1/2 h-10 font-bold border-border/80 text-foreground rounded-xl"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSaveScoreEdit}
                className="w-1/2 h-10 font-black bg-neon-blue text-primary-foreground hover:opacity-90 rounded-xl"
              >
                저장 및 재계산
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 4. Danger Zone: Global Reset with Password Verification */}
      {activeTab === "seasonManage" && (
      <Card className="border border-destructive/40 bg-destructive/5 p-5 backdrop-blur shadow-lg space-y-6">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="size-5" />
          <h3 className="font-black text-base">위험 구역 (Danger Zone)</h3>
        </div>
        
        {/* 아카이브 백업 방식 새 시즌 시작 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xl">
            <h4 className="text-sm font-bold text-foreground">새 시즌 아카이브 시작 (추천)</h4>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              현재 리그의 전체 경기 결과와 학생 데이터를 지정된 명칭의 **아카이브 시트로 복제 및 안전 백업**한 뒤, 메인 리그를 초기 상태(1000 RP, 0승 0패)로 깔끔하게 리셋합니다.
            </p>
          </div>
          
          <div className="shrink-0 self-end sm:self-center">
            <Button
              onClick={handleOpenSeasonChangeModal}
              variant="destructive"
              className="bg-destructive font-black tracking-wide hover:bg-destructive/80 active:scale-95 transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)]"
            >
              <RotateCcw className="mr-2 size-4" /> 새 시즌 시작 (데이터 초기화)
            </Button>
          </div>
        </div>
      </Card>
      )}
      {isSeasonChangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full border border-destructive/30 bg-background p-6 shadow-2xl rounded-2xl relative z-50 animate-in zoom-in-95 duration-200">
            <h4 className="text-base font-black mb-2 flex items-center gap-1.5 text-destructive">
              <ShieldAlert className="size-5" /> 새 시즌 시작 및 데이터 초기화
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              새로운 시즌을 시작하시겠습니까? 현재 기록은 아카이브로 이동하고 메인 데이터는 초기화됩니다.
            </p>

            <div className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border/30 mb-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  새 시즌 이름
                </label>
                <Input
                  type="text"
                  value={newSeasonName}
                  onChange={(e) => setNewSeasonName(e.target.value)}
                  placeholder="예: 시즌2 또는 2026 2학기"
                  className="font-sans font-bold h-11 bg-background border-border/65 focus-visible:ring-destructive/50"
                  disabled={isSeasonChangeLoading}
                />
                <p className="text-[10px] text-muted-foreground">
                  (기존 백업 목록을 스캔하여 추천된 명칭이며, 자유롭게 커스텀 입력이 가능합니다.)
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setIsSeasonChangeModalOpen(false)}
                variant="outline"
                className="w-1/2 h-10 font-bold border-border/80 text-foreground rounded-xl"
                disabled={isSeasonChangeLoading}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSeasonChangeSubmit}
                className="w-1/2 h-10 font-black bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl flex items-center justify-center gap-1.5"
                disabled={isSeasonChangeLoading}
              >
                {isSeasonChangeLoading ? (
                  <>
                    <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>진행 중...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    <span>확인 (실행)</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* JSON 롤백 복원 경고 팝업 */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent className="border-destructive/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
              <ShieldAlert className="size-5 shrink-0" /> 데이터 복구 경고
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              기존 데이터가 모두 삭제되고 업로드한 JSON 백업 파일 기준으로 복구됩니다. 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel 
              onClick={() => {
                setRestoreDialogOpen(false);
                setPendingRestoreData(null);
                setPendingRestoreMatches(null);
              }}
              className="font-bold border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all rounded-xl h-11 px-5"
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (pendingRestoreData) {
                  onRestoreFromCSV?.(pendingRestoreData, pendingRestoreMatches || []);
                  toast.success("성공적으로 데이터가 JSON 백업에서 롤백되었습니다!");
                }
                setRestoreDialogOpen(false);
                setPendingRestoreData(null);
                setPendingRestoreMatches(null);
              }}
              className="font-black bg-destructive hover:bg-destructive/80 active:scale-95 transition-all text-white rounded-xl h-11 px-5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            >
              진행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </div>
    </div>
  );
}
