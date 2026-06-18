import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "./TierBadge";
import { GenderMark } from "./GenderMark";
import { cn } from "@/lib/utils";
import { Trophy, X, Sparkles, User, Users, Crown, Award, Zap, RotateCcw } from "lucide-react";
import type { Student, Match, TierName } from "@/lib/league-types";
import { getTier, getTierSubdivision, TIER_ORDER, getFullTierLabel } from "@/lib/league-types";
import { toast } from "sonner";
import { useLeagueStore } from "@/lib/league-store";

const GRADES = [1, 2, 3, 4, 5, 6];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Selection = { grade: number | null; classNum: number | null; studentId: string | null };
const empty: Selection = { grade: null, classNum: null, studentId: null };

type PlayerResult = {
  name: string;
  grade: number;
  classNum: number;
  number: number;
  gender: "M" | "F" | "U";
  prevRp: number;
  prevTier: string;
  finalRp: number;
  finalTier: string;
  promoted: boolean;
  score: number;
  rpDelta: number;
  // Stored bonuses
  underdogBonus: number;
  scoreDiffBonus: number;
  rivalBonus: number;
  firstWinBonus: number;
  revengeBonus: number;
  freshnessBonus: number;
  streakBonus: number;
  comebackBonus: number;
  marginBonus: number;
  mentoringBonus: number;
  greatMatchBonus?: number;
  lossComfortBonus?: number;
  willOfSteelBonus?: number;
  arrogancePenalty?: number;
  crushingPenalty?: number;
  revengeAllowedPenalty?: number;
  championPenalty?: number;
  swampPenalty?: number;
  baseWin: number;
  baseLoss: number;
  currentStreak?: number;
};

type MatchResultData = {
  matchType: "single" | "double";
  winner: PlayerResult;
  winner2?: PlayerResult;
  loser: PlayerResult;
  loser2?: PlayerResult;
  aWon: boolean;
};

export function RecordMatch({
  students,
  onRecord,
  initials,
  onClearInitials,
  thresholds,
  rpVariables,
  onUpdateGender,
}: {
  students: Student[];
  onRecord: (
    playerAId: string, 
    playerBId: string, 
    scoreA: number, 
    scoreB: number, 
    playerA2Id?: string, 
    playerB2Id?: string, 
    matchType?: "single" | "double"
  ) => Match | undefined;
  initials?: {
    playerAId: string;
    playerBId: string;
    playerA2Id?: string;
    playerB2Id?: string;
    matchType?: "single" | "double";
  } | null;
  onClearInitials?: () => void;
  thresholds?: Record<string, number>;
  rpVariables?: { winDelta: number; loseDelta: number };
  onUpdateGender?: (studentId: string, gender: "M" | "F" | "U") => void;
}) {
  const { isSyncing } = useLeagueStore();
  const [matchType, setMatchType] = useState<"single" | "double">("single");
  const [a, setA] = useState<Selection>(empty);
  const [a2, setA2] = useState<Selection>(empty);
  const [b, setB] = useState<Selection>(empty);
  const [b2, setB2] = useState<Selection>(empty);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [resultData, setResultData] = useState<MatchResultData | null>(null);

  // 성별 정보 누락 자동 완성을 위한 상태
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [genderTargetId, setGenderTargetId] = useState<string | null>(null);

  // eSports UI Animation & SFX States
  const [animationStep, setAnimationStep] = useState(-1);
  const [countUpProgress, setCountUpProgress] = useState(0);
  const [countUpDone, setCountUpDone] = useState(false);

  // SFX Player Placeholder Hook
  const playSoundEffect = (type: "victory" | "defeat" | "stamp" | "countup" | "total") => {
    console.log(`[SFX Play] ${type}`);
    // Future expansion: hook up to local sound files (e.g. victory.mp3, stamp.mp3)
    // const audio = new Audio(`/sounds/${type}.mp3`);
    // audio.play().catch(() => {});
  };

  const getTierDetails = (tierName: string) => {
    if (tierName === "Diamond") {
      return {
        color: "text-tier-diamond text-glow-blue",
        glow: "shadow-[0_0_60px_rgba(0,240,255,0.6)] bg-tier-diamond/10 border-tier-diamond/40",
        label: "다이아몬드",
        bgStyle: "from-tier-diamond/25 via-background/10 to-tier-diamond/5",
        colorHex: "#00F0FF",
        icon: <Crown className="size-16 drop-shadow-[0_0_15px_rgba(0,240,255,0.8)] text-tier-diamond" />
      };
    }
    if (tierName === "Platinum") {
      return {
        color: "text-tier-platinum text-glow-purple",
        glow: "shadow-[0_0_60px_rgba(168,85,247,0.6)] bg-tier-platinum/10 border-tier-platinum/40",
        label: "플래티넘",
        bgStyle: "from-tier-platinum/25 via-background/10 to-tier-platinum/5",
        colorHex: "#A855F7",
        icon: <Award className="size-16 drop-shadow-[0_0_15px_rgba(168,85,247,0.8)] text-tier-platinum" />
      };
    }
    if (tierName === "Gold") {
      return {
        color: "text-tier-gold text-glow-gold",
        glow: "shadow-[0_0_60px_rgba(245,158,11,0.6)] bg-tier-gold/10 border-tier-gold/40",
        label: "골드",
        bgStyle: "from-tier-gold/25 via-background/10 to-tier-gold/5",
        colorHex: "#FFD700",
        icon: <Trophy className="size-16 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)] text-tier-gold" />
      };
    }
    if (tierName === "Silver") {
      return {
        color: "text-tier-silver text-glow-silver",
        glow: "shadow-[0_0_60px_rgba(148,163,184,0.5)] bg-tier-silver/10 border-tier-silver/40",
        label: "실버",
        bgStyle: "from-tier-silver/25 via-background/10 to-tier-silver/5",
        colorHex: "#94A3B8",
        icon: <Zap className="size-16 drop-shadow-[0_0_15px_rgba(148,163,184,0.7)] text-tier-silver" />
      };
    }
    return {
      color: "text-tier-bronze text-glow-bronze",
      glow: "shadow-[0_0_60px_rgba(180,83,9,0.5)] bg-tier-bronze/10 border-tier-bronze/40",
      label: "브론즈",
      bgStyle: "from-tier-bronze/25 via-background/10 to-tier-bronze/5",
      colorHex: "#D97706",
      icon: <Award className="size-16 drop-shadow-[0_0_15px_rgba(180,83,9,0.7)] text-tier-bronze" />
    };
  };

  // Helper to extract active bonuses for the receipt view
  const getRewardItems = (p: PlayerResult) => {
    const items = [];
    
    // Base Victory RP
    if (p.baseWin > 0) {
      items.push({
        id: "baseWin",
        icon: "⚔️",
        label: "기본 승리",
        value: p.baseWin,
        desc: `${p.finalTier} 티어 매치 승리`
      });
    }

    // Base Loss RP
    if (p.baseLoss > 0) {
      items.push({
        id: "baseLoss",
        icon: "⚔️",
        label: "기본 차감",
        value: -p.baseLoss,
        desc: `${p.finalTier} 티어 매치 패배`
      });
    }
    
    // Day's First Win
    if (p.firstWinBonus > 0) {
      items.push({
        id: "firstWinBonus",
        icon: "🌟",
        label: "오늘의 첫 승",
        value: p.firstWinBonus,
        desc: "오늘 첫 매치 승리 달성!"
      });
    }

    // Revenge match win
    if (p.revengeBonus > 0) {
      items.push({
        id: "revengeBonus",
        icon: "😈",
        label: "복수전 성공",
        value: p.revengeBonus,
        desc: "이전 패배 설욕 성공!"
      });
    }

    // Underdog Match Win
    if (p.underdogBonus > 0) {
      items.push({
        id: "underdogBonus",
        icon: "🛡️",
        label: "언더독 격파",
        value: p.underdogBonus,
        desc: "더 높은 티어의 상대 매칭 극복!"
      });
    }

    // Rival Win
    if (p.rivalBonus > 0) {
      items.push({
        id: "rivalBonus",
        icon: "⚔️",
        label: "라이벌 격파",
        value: p.rivalBonus,
        desc: "동등한 라이벌 매치 승리!"
      });
    }

    // Freshness / Diversity Match Win (미매칭)
    if (p.freshnessBonus > 0) {
      items.push({
        id: "freshnessBonus",
        icon: "✨",
        label: "신선한 매치",
        value: p.freshnessBonus,
        desc: "최근 경기 내 미매칭 상대와 경기!"
      });
    }

    // Win Streak
    if (p.streakBonus > 0) {
      const streakCount = p.currentStreak ?? 0;
      let streakLabel = "연승";
      if (streakCount === 3) {
        streakLabel = "🔥 3연승 폭주";
      } else if (streakCount === 4) {
        streakLabel = "🔥 4연승 무쌍";
      } else if (streakCount >= 5) {
        streakLabel = `🔥 ${streakCount}연승 지배`;
      } else {
        streakLabel = `🔥 ${streakCount}연승`;
      }

      items.push({
        id: "streakBonus",
        icon: "🔥",
        label: streakLabel,
        value: p.streakBonus,
        desc: "연승 흐름을 유지하며 승리!"
      });
    }

    // Comeback (연패 컴백)
    if (p.comebackBonus > 0) {
      items.push({
        id: "comebackBonus",
        icon: "🔥",
        label: "연패 탈출",
        value: p.comebackBonus,
        desc: "연패 사슬 절단 성공!"
      });
    }

    // Margin Win (압승)
    if (p.marginBonus > 0) {
      items.push({
        id: "marginBonus",
        icon: "🚀",
        label: "압승",
        value: p.marginBonus,
        desc: "점수 차이로 완벽한 압승 달성!"
      });
    }

    // Mentoring Match Win
    if (p.mentoringBonus > 0) {
      items.push({
        id: "mentoringBonus",
        icon: "🤝",
        label: "멘토링",
        value: p.mentoringBonus,
        desc: "하위 티어 파트너와 완벽한 협동!"
      });
    }

    // Great Match Bonus
    if (p.greatMatchBonus && p.greatMatchBonus > 0) {
      items.push({
        id: "greatMatchBonus",
        icon: "🔥",
        label: "명승부 보너스",
        value: p.greatMatchBonus,
        desc: "최종 1~2점 차 아슬아슬한 승리!"
      });
    }

    // Loss Comfort Bonus (꺾이지 않는 마음)
    if (p.lossComfortBonus && p.lossComfortBonus > 0) {
      items.push({
        id: "lossComfortBonus",
        icon: "🩹",
        label: "꺾이지 않는 마음",
        value: p.lossComfortBonus,
        desc: "연패 시 위로 보너스 제공"
      });
    }

    // Will of Steel (불굴의 의지)
    if (p.willOfSteelBonus && p.willOfSteelBonus > 0) {
      items.push({
        id: "willOfSteelBonus",
        icon: "🔥",
        label: "불굴의 의지",
        value: p.willOfSteelBonus,
        desc: "연패 사슬을 끊고 극적인 승리 달성!"
      });
    }

    // Arrogance Penalty
    if (p.arrogancePenalty && p.arrogancePenalty > 0) {
      items.push({
        id: "arrogancePenalty",
        icon: "🦅",
        label: "오만함의 대가",
        value: -p.arrogancePenalty,
        desc: "상대 최고 티어가 2단계 이상 낮을 때 패배"
      });
    }

    // Crushing Penalty
    if (p.crushingPenalty && p.crushingPenalty > 0) {
      items.push({
        id: "crushingPenalty",
        icon: "💀",
        label: "굴욕적 완패",
        value: -p.crushingPenalty,
        desc: "점수 차이가 5점 이상으로 패배"
      });
    }

    // Revenge Allowed Penalty
    if (p.revengeAllowedPenalty && p.revengeAllowedPenalty > 0) {
      items.push({
        id: "revengeAllowedPenalty",
        icon: "⚔️",
        label: "복수 허용",
        value: -p.revengeAllowedPenalty,
        desc: "상대에게 복수전 보너스를 허용하며 패배"
      });
    }

    // Champion Penalty
    if (p.championPenalty && p.championPenalty > 0) {
      items.push({
        id: "championPenalty",
        icon: "👑",
        label: "챔피언의 무게",
        value: -p.championPenalty,
        desc: "골드 이상 티어 패배 기본 차감"
      });
    }

    // Swamp Penalty
    if (p.swampPenalty && p.swampPenalty > 0) {
      items.push({
        id: "swampPenalty",
        icon: "🕸️",
        label: "연패의 늪",
        value: -p.swampPenalty,
        desc: "골드 이상 티어 연패 가중 패널티"
      });
    }

    return items;
  };

  // Staggered reveal & count-up trigger timeline
  useEffect(() => {
    if (showModal && resultData) {
      // 1. Reset states
      setAnimationStep(-1);
      setCountUpProgress(0);
      setCountUpDone(false);

      // Play victory sound
      playSoundEffect("victory");

      const w1Items = getRewardItems(resultData.winner);
      const w2Items = resultData.winner2 ? getRewardItems(resultData.winner2) : [];
      const totalSteps = Math.max(w1Items.length, w2Items.length);

      const startCountUp = () => {
        playSoundEffect("countup");
        let progress = 0;
        const duration = 600; // ms
        const intervalTime = 30; // ms
        const step = intervalTime / duration;

        const timer = setInterval(() => {
          progress = Math.min(1, progress + step);
          setCountUpProgress(progress);

          if (progress >= 1) {
            clearInterval(timer);
            setCountUpDone(true);
            playSoundEffect("total");
          }
        }, intervalTime);
      };

      if (totalSteps === 0) {
        setAnimationStep(0);
        startCountUp();
        return;
      }

      let currentStep = -1;
      const interval = setInterval(() => {
        currentStep += 1;
        setAnimationStep(currentStep);
        playSoundEffect("stamp");

        if (currentStep >= totalSteps - 1) {
          clearInterval(interval);
          const delayTimeout = setTimeout(() => {
            startCountUp();
          }, 350);
          return () => clearTimeout(delayTimeout);
        }
      }, 300);

      return () => {
        clearInterval(interval);
      };
    }
  }, [showModal, resultData]);

  // Auto-populate recommended match selections when redirected
  useEffect(() => {
    if (initials) {
      const studentA = students.find((s) => s.id === initials.playerAId);
      const studentB = students.find((s) => s.id === initials.playerBId);
      if (studentA && studentB) {
        const type = initials.matchType || "single";
        setMatchType(type);
        setA({ grade: studentA.grade, classNum: studentA.classNum, studentId: studentA.id });
        setB({ grade: studentB.grade, classNum: studentB.classNum, studentId: studentB.id });
        
        if (type === "double" && initials.playerA2Id && initials.playerB2Id) {
          const studentA2 = students.find((s) => s.id === initials.playerA2Id);
          const studentB2 = students.find((s) => s.id === initials.playerB2Id);
          if (studentA2) {
            setA2({ grade: studentA2.grade, classNum: studentA2.classNum, studentId: studentA2.id });
          } else {
            setA2(empty);
          }
          if (studentB2) {
            setB2({ grade: studentB2.grade, classNum: studentB2.classNum, studentId: studentB2.id });
          } else {
            setB2(empty);
          }
        } else {
          setA2(empty);
          setB2(empty);
        }
        setScoreA(0);
        setScoreB(0);
      }
      onClearInitials?.();
    }
  }, [initials, students, onClearInitials]);

  // A선수 또는 B선수 및 파트너 선택 시 성별이 "U"이거나 없을 때 모달 팝업 트리거
  useEffect(() => {
    const activePlayerIds = [a.studentId, a2.studentId, b.studentId, b2.studentId].filter(Boolean) as string[];
    for (const id of activePlayerIds) {
      const student = students.find((s) => s.id === id);
      if (student && (student.gender === "U" || !student.gender)) {
        setGenderTargetId(student.id);
        setGenderModalOpen(true);
        return;
      }
    }
  }, [a.studentId, a2.studentId, b.studentId, b2.studentId, students]);

  const playerA = students.find((s) => s.id === a.studentId) ?? null;
  const playerB = students.find((s) => s.id === b.studentId) ?? null;
  const playerA2 = matchType === "double" ? (students.find((s) => s.id === a2.studentId) ?? null) : null;
  const playerB2 = matchType === "double" ? (students.find((s) => s.id === b2.studentId) ?? null) : null;

  const submit = () => {
    const playerAId = playerA?.id;
    const playerBId = playerB?.id;
    const playerA2Id = playerA2?.id;
    const playerB2Id = playerB2?.id;

    // 1차 검증 (Pre-flight Validation): 타입 및 누락 여부 확인
    if (matchType === "single") {
      if (!playerAId || !playerBId || typeof scoreA !== "number" || isNaN(scoreA) || typeof scoreB !== "number" || isNaN(scoreB)) {
        toast.error("입력된 데이터에 오류가 있습니다. 다시 확인해 주세요.");
        return;
      }
    } else {
      if (!playerAId || !playerA2Id || !playerBId || !playerB2Id || typeof scoreA !== "number" || isNaN(scoreA) || typeof scoreB !== "number" || isNaN(scoreB)) {
        toast.error("입력된 데이터에 오류가 있습니다. 다시 확인해 주세요.");
        return;
      }
    }

    if (matchType === "single") {
      if (!playerA || !playerB) return toast.error("두 선수를 모두 선택해주세요");
      if (playerA.id === playerB.id) return toast.error("같은 선수끼리 경기할 수 없습니다");
    } else {
      if (!playerA || !playerA2 || !playerB || !playerB2) {
        return toast.error("복식 경기 등록을 위해 4명의 선수를 모두 선택해주세요");
      }
      const selectedIds = [playerA.id, playerA2.id, playerB.id, playerB2.id];
      const uniqueIds = new Set(selectedIds);
      if (uniqueIds.size < 4) {
        return toast.error("같은 선수를 여러 자리에 중복 선택할 수 없습니다");
      }
    }

    if (scoreA === scoreB) return toast.error("무승부는 등록할 수 없습니다");

    // Validate if selected students actually exist in the students list and have valid RP values
    const isPlayerAInvalid = !playerA || isNaN(playerA.rp) || typeof playerA.rp !== "number";
    const isPlayerBInvalid = !playerB || isNaN(playerB.rp) || typeof playerB.rp !== "number";
    const isPlayerA2Invalid = matchType === "double" ? (!playerA2 || isNaN(playerA2.rp) || typeof playerA2.rp !== "number") : false;
    const isPlayerB2Invalid = matchType === "double" ? (!playerB2 || isNaN(playerB2.rp) || typeof playerB2.rp !== "number") : false;

    if (isPlayerAInvalid || isPlayerBInvalid || isPlayerA2Invalid || isPlayerB2Invalid) {
      return toast.error("학생 데이터가 완전히 동기화되지 않았습니다. 새로고침 후 다시 시도해주세요.");
    }

    const aWon = scoreA > scoreB;
    const winnerScore = aWon ? scoreA : scoreB;
    const loserScore = aWon ? scoreB : scoreA;

    // 2. Save to store and capture match object with calculated deltas
    const matchObj = onRecord(
      playerA.id, 
      playerB.id, 
      scoreA, 
      scoreB,
      playerA2?.id || undefined,
      playerB2?.id || undefined,
      matchType
    );
    if (!matchObj) return;

    const winnerNameText = matchType === "double" 
      ? `${aWon ? playerA.name : playerB.name} & ${aWon ? playerA2!.name : playerB2!.name}`
      : `${aWon ? playerA.name : playerB.name}`;
    toast.success(`${winnerNameText} 팀 승리! 결과가 등록되었습니다.`);

    // 3. Extract exact custom deltas & bonuses calculated in league-store
    const getPlayerResult = (student: Student, role: "A" | "A2" | "B" | "B2", won: boolean, score: number): PlayerResult => {
      const prevRp = student.rp;
      let rpDelta = 0;
      let underdogBonus = 0;
      let scoreDiffBonus = 0;
      let rivalBonus = 0;
      let firstWinBonus = 0;
      let revengeBonus = 0;
      let freshnessBonus = 0;
      let streakBonus = 0;
      let comebackBonus = 0;
      let marginBonus = 0;
      let mentoringBonus = 0;
      let greatMatchBonus = 0;
      let lossComfortBonus = 0;
      let willOfSteelBonus = 0;
      let arrogancePenalty = 0;
      let crushingPenalty = 0;
      let revengeAllowedPenalty = 0;
      let championPenalty = 0;
      let swampPenalty = 0;

      if (role === "A") {
        rpDelta = matchObj.rpDeltaA ?? 0;
        underdogBonus = matchObj.underdogBonusA ?? 0;
        scoreDiffBonus = matchObj.scoreDiffBonusA ?? 0;
        rivalBonus = matchObj.rivalBonusA ?? 0;
        firstWinBonus = matchObj.firstWinBonusA ?? 0;
        revengeBonus = matchObj.revengeBonusA ?? 0;
        freshnessBonus = matchObj.freshnessBonusA ?? 0;
        streakBonus = matchObj.streakBonusA ?? 0;
        comebackBonus = matchObj.comebackBonusA ?? 0;
        marginBonus = matchObj.marginBonusA ?? 0;
        mentoringBonus = matchObj.mentoringBonusA ?? 0;
        greatMatchBonus = matchObj.greatMatchBonusA ?? 0;
        lossComfortBonus = matchObj.lossComfortBonusA ?? 0;
        willOfSteelBonus = matchObj.willOfSteelBonusA ?? 0;
        arrogancePenalty = matchObj.arrogancePenaltyA ?? 0;
        crushingPenalty = matchObj.crushingPenaltyA ?? 0;
        revengeAllowedPenalty = matchObj.revengeAllowedPenaltyA ?? 0;
        championPenalty = matchObj.championPenaltyA ?? 0;
        swampPenalty = matchObj.swampPenaltyA ?? 0;
      } else if (role === "A2") {
        rpDelta = matchObj.rpDeltaA2 ?? 0;
        underdogBonus = matchObj.underdogBonusA2 ?? 0;
        scoreDiffBonus = matchObj.scoreDiffBonusA2 ?? 0;
        rivalBonus = matchObj.rivalBonusA2 ?? 0;
        firstWinBonus = matchObj.firstWinBonusA2 ?? 0;
        revengeBonus = matchObj.revengeBonusA2 ?? 0;
        freshnessBonus = matchObj.freshnessBonusA2 ?? 0;
        streakBonus = matchObj.streakBonusA2 ?? 0;
        comebackBonus = matchObj.comebackBonusA2 ?? 0;
        marginBonus = matchObj.marginBonusA2 ?? 0;
        mentoringBonus = matchObj.mentoringBonusA2 ?? 0;
        greatMatchBonus = matchObj.greatMatchBonusA2 ?? 0;
        lossComfortBonus = matchObj.lossComfortBonusA2 ?? 0;
        willOfSteelBonus = matchObj.willOfSteelBonusA2 ?? 0;
        arrogancePenalty = matchObj.arrogancePenaltyA2 ?? 0;
        crushingPenalty = matchObj.crushingPenaltyA2 ?? 0;
        revengeAllowedPenalty = matchObj.revengeAllowedPenaltyA2 ?? 0;
        championPenalty = matchObj.championPenaltyA2 ?? 0;
        swampPenalty = matchObj.swampPenaltyA2 ?? 0;
      } else if (role === "B") {
        rpDelta = matchObj.rpDeltaB ?? 0;
        underdogBonus = matchObj.underdogBonusB ?? 0;
        scoreDiffBonus = matchObj.scoreDiffBonusB ?? 0;
        rivalBonus = matchObj.rivalBonusB ?? 0;
        firstWinBonus = matchObj.firstWinBonusB ?? 0;
        revengeBonus = matchObj.revengeBonusB ?? 0;
        freshnessBonus = matchObj.freshnessBonusB ?? 0;
        streakBonus = matchObj.streakBonusB ?? 0;
        comebackBonus = matchObj.comebackBonusB ?? 0;
        marginBonus = matchObj.marginBonusB ?? 0;
        mentoringBonus = matchObj.mentoringBonusB ?? 0;
        greatMatchBonus = matchObj.greatMatchBonusB ?? 0;
        lossComfortBonus = matchObj.lossComfortBonusB ?? 0;
        willOfSteelBonus = matchObj.willOfSteelBonusB ?? 0;
        arrogancePenalty = matchObj.arrogancePenaltyB ?? 0;
        crushingPenalty = matchObj.crushingPenaltyB ?? 0;
        revengeAllowedPenalty = matchObj.revengeAllowedPenaltyB ?? 0;
        championPenalty = matchObj.championPenaltyB ?? 0;
        swampPenalty = matchObj.swampPenaltyB ?? 0;
      } else if (role === "B2") {
        rpDelta = matchObj.rpDeltaB2 ?? 0;
        underdogBonus = matchObj.underdogBonusB2 ?? 0;
        scoreDiffBonus = matchObj.scoreDiffBonusB2 ?? 0;
        rivalBonus = matchObj.rivalBonusB2 ?? 0;
        firstWinBonus = matchObj.firstWinBonusB2 ?? 0;
        revengeBonus = matchObj.revengeBonusB2 ?? 0;
        freshnessBonus = matchObj.freshnessBonusB2 ?? 0;
        streakBonus = matchObj.streakBonusB2 ?? 0;
        comebackBonus = matchObj.comebackBonusB2 ?? 0;
        marginBonus = matchObj.marginBonusB2 ?? 0;
        mentoringBonus = matchObj.mentoringBonusB2 ?? 0;
        greatMatchBonus = matchObj.greatMatchBonusB2 ?? 0;
        lossComfortBonus = matchObj.lossComfortBonusB2 ?? 0;
        willOfSteelBonus = matchObj.willOfSteelBonusB2 ?? 0;
        arrogancePenalty = matchObj.arrogancePenaltyB2 ?? 0;
        crushingPenalty = matchObj.crushingPenaltyB2 ?? 0;
        revengeAllowedPenalty = matchObj.revengeAllowedPenaltyB2 ?? 0;
        championPenalty = matchObj.championPenaltyB2 ?? 0;
        swampPenalty = matchObj.swampPenaltyB2 ?? 0;
      }

      const finalRp = Math.max(0, prevRp + rpDelta);
      const prevTier = getTier(prevRp, thresholds);
      const finalTier = getTier(finalRp, thresholds);

      const prevSub = getTierSubdivision(prevRp, thresholds);
      const finalSub = getTierSubdivision(finalRp, thresholds);
      const basePromoted = TIER_ORDER.indexOf(finalTier) < TIER_ORDER.indexOf(prevTier);
      const subPromoted = finalTier === prevTier && finalSub < prevSub;
      const promoted = won && (basePromoted || subPromoted);

      const preStreak = student.currentStreak ?? 0;
      const currentStreak = won 
        ? (preStreak >= 0 ? preStreak + 1 : 1)
        : (preStreak <= 0 ? preStreak - 1 : -1);

      const baseWin = won ? (rpDelta - (underdogBonus + scoreDiffBonus + rivalBonus + firstWinBonus + revengeBonus + freshnessBonus + streakBonus + comebackBonus + marginBonus + mentoringBonus + greatMatchBonus + willOfSteelBonus)) : 0;
      const baseLoss = !won ? (-rpDelta + freshnessBonus + lossComfortBonus + greatMatchBonus - (arrogancePenalty + crushingPenalty + revengeAllowedPenalty + championPenalty + swampPenalty)) : 0;

      return {
        name: student.realName || student.name,
        grade: student.grade,
        classNum: student.classNum,
        number: student.number,
        gender: student.gender,
        prevRp,
        prevTier,
        finalRp,
        finalTier,
        promoted,
        score,
        rpDelta,
        underdogBonus,
        scoreDiffBonus,
        rivalBonus,
        firstWinBonus,
        revengeBonus,
        freshnessBonus,
        streakBonus,
        comebackBonus,
        marginBonus,
        mentoringBonus,
        greatMatchBonus,
        lossComfortBonus,
        willOfSteelBonus,
        arrogancePenalty,
        crushingPenalty,
        revengeAllowedPenalty,
        championPenalty,
        swampPenalty,
        baseWin,
        baseLoss,
        currentStreak
      };
    };

    const w1 = aWon ? playerA : playerB;
    const w2 = aWon ? playerA2 : playerB2;
    const l1 = aWon ? playerB : playerA;
    const l2 = aWon ? playerB2 : playerA2;

    // 4. Set match result details for the modal
    setResultData({
      matchType,
      winner: getPlayerResult(w1, aWon ? "A" : "B", true, winnerScore),
      winner2: w2 ? getPlayerResult(w2, aWon ? "A2" : "B2", true, winnerScore) : undefined,
      loser: getPlayerResult(l1, aWon ? "B" : "A", false, loserScore),
      loser2: l2 ? getPlayerResult(l2, aWon ? "B2" : "A2", false, loserScore) : undefined,
      aWon,
    });

    // 5. Open popup modal
    setShowModal(true);

    // 6. Reset name selectors and scores but retain grade & class selections
    setA({ grade: a.grade, classNum: a.classNum, studentId: null });
    setA2({ grade: a2.grade, classNum: a2.classNum, studentId: null });
    setB({ grade: b.grade, classNum: b.classNum, studentId: null });
    setB2({ grade: b2.grade, classNum: b2.classNum, studentId: null });
    setScoreA(0); 
    setScoreB(0);
  };

  const handleUpdateGender = (gender: "M" | "F") => {
    if (genderTargetId) {
      onUpdateGender?.(genderTargetId, gender);
      setGenderModalOpen(false);
      setGenderTargetId(null);
      toast.success("선수의 성별이 정상 등록되었습니다!");
    }
  };

  const handleCancelGender = () => {
    if (genderTargetId) {
      if (a.studentId === genderTargetId) setA((prev) => ({ ...prev, studentId: null }));
      if (a2.studentId === genderTargetId) setA2((prev) => ({ ...prev, studentId: null }));
      if (b.studentId === genderTargetId) setB((prev) => ({ ...prev, studentId: null }));
      if (b2.studentId === genderTargetId) setB2((prev) => ({ ...prev, studentId: null }));
    }
    setGenderModalOpen(false);
    setGenderTargetId(null);
    toast.warning("성별을 입력하지 않아 선수 선택이 취소되었습니다.");
  };

  // Player Receipt Component (defined inside RecordMatch to access animationStep, countUpProgress, etc. easily)
  const renderPlayerReceipt = (p: PlayerResult, rewards: ReturnType<typeof getRewardItems>) => {
    const isPromoted = p.promoted;
    const playerTierDetails = isPromoted ? getTierDetails(p.finalTier) : null;

    return (
      <div 
        className={cn(
          "relative overflow-hidden rounded-xl border p-5 flex flex-col justify-between h-full transition-all",
          isPromoted 
            ? `bg-[#090d16]/95 border-2 animate-glow-${p.finalTier.toLowerCase()}` 
            : "border-cyan-500/20 bg-[#090d16]/95 shadow-[0_0_30px_rgba(0,180,216,0.1)] animate-glow-pulse"
        )}
      >
        {/* Futuristic Grid Overlay inside card */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.12)_1px,transparent_1px)] bg-[size:12px_12px] pointer-events-none opacity-40" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/10 to-transparent transform rotate-45 translate-x-12 -translate-y-12 pointer-events-none" />

        {/* Player Header */}
        <div className="relative z-10 mb-4 pb-3 border-b border-[#1b253b] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <GenderMark gender={p.gender} className="size-4 text-[10px]" />
              <span className="text-base font-extrabold tracking-tight text-white">{p.name}</span>
              {isPromoted && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-full text-white font-extrabold text-[9px] px-2 py-0.5 animate-bounce shrink-0 shadow-lg",
                  p.finalTier === "Gold" ? "bg-gradient-to-r from-amber-500 to-orange-500" :
                  p.finalTier === "Platinum" ? "bg-gradient-to-r from-purple-500 to-indigo-500" :
                  p.finalTier === "Diamond" ? "bg-gradient-to-r from-cyan-500 to-blue-500" :
                  "bg-gradient-to-r from-gray-500 to-slate-700"
                )}>
                  ▲ 승급! 🎉
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {p.grade > 0 ? `${p.grade}학년 ${p.classNum}반` : "선수"}
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className={cn(
              "text-[9px] font-black bg-background border px-2.5 py-0.5 rounded tracking-wider",
              isPromoted 
                ? `${playerTierDetails?.color} border-white/20` 
                : "text-cyan-400 border-cyan-500/30"
            )}>
              WINNER
            </span>
          </div>
        </div>

        {/* Rewards List (Receipt Items) */}
        <div className="relative z-10 space-y-2.5 my-2 flex-grow">
          {rewards.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">획득 내역이 없습니다.</div>
          ) : (
            rewards.map((item, idx) => {
              const isVisible = animationStep >= idx;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg border bg-[#0d1222]/80 border-[#1c273e] transition-all duration-200",
                    isVisible 
                      ? cn("opacity-100 scale-100 animate-stamp-pop border-[#1c273e]", isPromoted ? "shadow-md" : "shadow-[0_0_10px_rgba(0,180,216,0.05)]") 
                      : "opacity-0 scale-150 pointer-events-none"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "flex items-center justify-center size-7 rounded border shrink-0",
                      isPromoted 
                        ? "bg-white/5 border-white/10 text-white" 
                        : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                    )}>
                      <span className="text-sm">{item.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.label}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-xs font-extrabold font-mono shrink-0",
                    isPromoted ? playerTierDetails?.color : "text-cyan-400"
                  )}>
                    +{item.value} RP
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Total RP Count-up Section */}
        <div className="relative z-10 mt-4 pt-3 border-t border-[#1b253b]">
          <div className={cn(
            "flex items-center justify-between px-3 py-3 rounded-lg border",
            isPromoted 
              ? "bg-gradient-to-r from-card/30 via-[#101729] to-card/30" 
              : "bg-gradient-to-r from-cyan-950/30 via-[#101729] to-cyan-950/30 border-cyan-500/20"
          )}
            style={isPromoted && playerTierDetails ? { borderColor: playerTierDetails.colorHex + '30' } : undefined}
          >
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider">최종 RP</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground font-mono">기존 {p.prevRp}</span>
                <span className="text-[9px] text-muted-foreground">➔</span>
                <span className={cn(
                  "text-[10px] font-bold font-mono",
                  isPromoted ? playerTierDetails?.color : "text-cyan-400"
                )}>
                  최종 {Math.min(10000, p.prevRp + Math.max(0, Math.floor(p.rpDelta * countUpProgress)))}
                </span>
              </div>
            </div>
            <div className={cn(
              "text-xl font-black font-mono tracking-tight",
              isPromoted ? `${playerTierDetails?.color}` : "text-cyan-400 text-glow-blue",
              countUpDone && "scale-105 transition-all duration-300"
            )}
              style={isPromoted && playerTierDetails ? { textShadow: `0 0 12px ${playerTierDetails.colorHex}` } : undefined}
            >
              +{Math.max(0, Math.floor(p.rpDelta * countUpProgress))} RP
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMatchSummary = () => {
    if (!resultData) return null;
    return (
      <div className="relative overflow-hidden rounded-xl border border-[#1b253b] bg-[#070a12]/95 p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col justify-between h-full">
        {/* Grid Background Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.12)_1px,transparent_1px)] bg-[size:12px_12px] pointer-events-none opacity-40" />

        <div className="relative z-10 text-center text-xs font-black uppercase tracking-[0.2em] text-[#5b6f95] mb-4 pb-2 border-b border-[#1b253b]">
          MATCH SUMMARY
        </div>

        {/* Score Visualizer */}
        <div className="relative z-10 flex items-center justify-center gap-6 py-4 mb-4 rounded-lg bg-[#0e1322] border border-[#172036] max-w-xs mx-auto w-full">
          <div className="text-right flex flex-col items-center min-w-[70px]">
            <span className="text-[10px] text-[#8fa0c4] font-black truncate max-w-[80px]">{resultData.winner.name}</span>
            <span className="text-2xl font-black text-cyan-400 font-mono mt-0.5">{resultData.winner.score}</span>
          </div>
          <div className="text-sm font-black text-[#4f6285] font-mono px-2 py-0.5 rounded bg-[#090c15] border border-[#1b253b] skew-x-[-12deg]">VS</div>
          <div className="text-left flex flex-col items-center min-w-[70px]">
            <span className="text-[10px] text-[#8fa0c4] font-black truncate max-w-[80px]">{resultData.loser.name}</span>
            <span className="text-2xl font-black text-rose-500 font-mono mt-0.5">{resultData.loser.score}</span>
          </div>
        </div>

        {/* Player outcomes list */}
        <div className="relative z-10 space-y-2.5">
          {/* Winner 1 */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 transition-all">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black text-cyan-400 bg-cyan-950 border border-cyan-500/30 px-1.5 py-0.5 rounded shrink-0">WIN</span>
              <span className="text-xs font-bold text-white truncate">{resultData.winner.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <TierBadge rp={resultData.winner.finalRp} />
              <span className="text-xs font-extrabold text-cyan-400 font-mono">+{resultData.winner.rpDelta} RP</span>
            </div>
          </div>

          {/* Winner 2 (if doubles) */}
          {resultData.winner2 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black text-cyan-400 bg-cyan-950 border border-cyan-500/30 px-1.5 py-0.5 rounded shrink-0">WIN</span>
                <span className="text-xs font-bold text-white truncate">{resultData.winner2.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TierBadge rp={resultData.winner2.finalRp} />
                <span className="text-xs font-extrabold text-cyan-400 font-mono">+{resultData.winner2.rpDelta} RP</span>
              </div>
            </div>
          )}

          {/* Loser 1 */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/10 border border-rose-500/20 transition-all">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black text-rose-400 bg-rose-950 border border-rose-500/30 px-1.5 py-0.5 rounded shrink-0">LOSE</span>
              <span className="text-xs font-bold text-white truncate">{resultData.loser.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <TierBadge rp={resultData.loser.finalRp} />
              <span className="text-xs font-extrabold text-rose-500 font-mono">{resultData.loser.rpDelta} RP</span>
            </div>
          </div>

          {/* Loser 2 (if doubles) */}
          {resultData.loser2 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/10 border border-rose-500/20 transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black text-rose-400 bg-rose-950 border border-rose-500/30 px-1.5 py-0.5 rounded shrink-0">LOSE</span>
                <span className="text-xs font-bold text-white truncate">{resultData.loser2.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TierBadge rp={resultData.loser2.finalRp} />
                <span className="text-xs font-extrabold text-rose-500 font-mono">{resultData.loser2.rpDelta} RP</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 단식 / 복식 경기 방식 선택 토글 */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-xl bg-muted/40 p-1 border border-border/30 backdrop-blur">
          <button
            type="button"
            onClick={() => setMatchType("single")}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-black transition-all duration-200 flex items-center gap-2",
              matchType === "single"
                ? "bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="size-4" />
            단식 (1:1)
          </button>
          <button
            type="button"
            onClick={() => setMatchType("double")}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-black transition-all duration-200 flex items-center gap-2",
              matchType === "double"
                ? "bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="size-4" />
      복식 (2:2)
          </button>
        </div>
      </div>

      <div className={cn(
        "grid gap-4 items-start",
        matchType === "double" 
          ? "md:grid-cols-2 lg:grid-cols-4" 
          : "md:grid-cols-2"
      )}>
        <PlayerSelector 
          label={matchType === "double" ? "팀 A(선수1)" : "선수 A"} 
          accent="blue" 
          students={students} 
          value={a} 
          onChange={setA} 
          player={playerA} 
          thresholds={thresholds}
        />
        {matchType === "double" && (
          <PlayerSelector 
            label="팀 A(선수2)" 
            accent="blue" 
            students={students} 
            value={a2} 
            onChange={setA2} 
            player={playerA2} 
            thresholds={thresholds}
          />
        )}
        <PlayerSelector 
          label={matchType === "double" ? "팀 B(선수1)" : "선수 B"} 
          accent="green" 
          students={students} 
          value={b} 
          onChange={setB} 
          player={playerB} 
          thresholds={thresholds}
        />
        {matchType === "double" && (
          <PlayerSelector 
            label="팀 B(선수2)" 
            accent="green" 
            students={students} 
            value={b2} 
            onChange={setB2} 
            player={playerB2} 
            thresholds={thresholds}
          />
        )}
      </div>

      <Card className="border-border/60 bg-card/60 p-6 backdrop-blur">
        <div className="mb-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">스코어보드</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <ScorePad 
            name={matchType === "double" 
              ? "팀 A" 
              : ((playerA?.realName || playerA?.name) ?? "선수 A")
            } 
            value={scoreA} 
            onChange={setScoreA} 
            accent="blue" 
          />
          <div className="pt-12 text-center text-3xl font-black text-muted-foreground">VS</div>
          <ScorePad 
            name={matchType === "double" 
              ? "팀 B" 
              : ((playerB?.realName || playerB?.name) ?? "선수 B")
            } 
            value={scoreB} 
            onChange={setScoreB} 
            accent="green" 
          />
        </div>
      </Card>

      <Button
        size="lg"
        onClick={submit}
        disabled={isSyncing}
        className="h-14 w-full bg-gradient-to-r from-neon-blue to-tier-diamond text-base font-bold text-primary-foreground shadow-[0_0_32px_oklch(0.78_0.18_230/0.4)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSyncing ? (
          <>
            <span className="mr-2 size-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            경기 결과 등록 중...
          </>
        ) : (
          <>
            <Trophy className="mr-2 size-5" /> 경기 결과 등록
          </>
        )}
      </Button>

      {/* Match Result Modal Popup */}
      {showModal && resultData && (() => {
        const w1Rewards = getRewardItems(resultData.winner);
        const w2Rewards = resultData.winner2 ? getRewardItems(resultData.winner2) : [];
        const l1Rewards = getRewardItems(resultData.loser);
        const l2Rewards = resultData.loser2 ? getRewardItems(resultData.loser2) : [];
        const isDoubles = !!resultData.winner2;
        const isRankUp = resultData.winner.promoted || (resultData.winner2?.promoted ?? false);
        const promotedTier = (resultData.winner.promoted ? resultData.winner.finalTier : (resultData.winner2?.promoted ? resultData.winner2.finalTier : resultData.winner.finalTier)) as TierName;
        const details = getTierDetails(promotedTier);

        const renderLolPlayerCard = (p: PlayerResult, rewards: any[], isLosing: boolean) => {
          const isPromoted = p.promoted;
          const finalSub = getTierSubdivision(p.finalRp, thresholds);
          const prevSub = getTierSubdivision(p.prevRp, thresholds);
          const isMajorRankChange = p.prevTier !== p.finalTier;
          const hasRankDown = TIER_ORDER.indexOf(p.finalTier as TierName) > TIER_ORDER.indexOf(p.prevTier as TierName) || 
                             (p.prevTier === p.finalTier && finalSub > prevSub);

          return (
            <div 
              className={cn(
                "relative overflow-hidden rounded-xl border p-3 md:p-3.5 flex flex-col justify-between gap-2.5 transition-all duration-300",
                isLosing 
                  ? "border-rose-950/40 bg-black/40" 
                  : isPromoted
                    ? `bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]`
                    : "border-cyan-950/40 bg-black/40"
              )}
            >
              <div className="flex items-center justify-between gap-2 relative z-10">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* 1. 기하학적 SVG 뱃지 (크기 축소: size={56}) */}
                  <div className="animate-scale-up-bounce shrink-0">
                    <GeometricRankCrest tier={p.finalTier} rp={p.finalRp} thresholds={thresholds} isLosing={isLosing} size={56} />
                  </div>
                  
                  <div className="min-w-0">
                    {/* Player Name */}
                    <div className="flex items-center gap-1">
                      <GenderMark gender={p.gender} className="size-3 text-[9px]" />
                      <span className="text-sm font-extrabold text-white truncate">{p.name}</span>
                    </div>
                    
                    {/* Class & Details */}
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {p.grade > 0 ? `${p.grade}학년 ${p.classNum}반` : "선수"} · {p.number}번
                    </div>

                    {/* Rank Info (e.g. 실버 4 -> 실버 3) */}
                    <div className="text-[10px] text-gray-300 font-mono mt-0.5 flex items-center gap-1">
                      <span>{getTierLabelInKorean(p.prevTier)} {prevSub}</span>
                      <span>➔</span>
                      <span className={isLosing ? "text-rose-400 font-bold" : "text-cyan-400 font-bold"}>
                        {getTierLabelInKorean(p.finalTier)} {finalSub}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  {/* RP Delta display */}
                  <span className={cn(
                    "text-base font-black font-mono tracking-tight",
                    isLosing 
                      ? "text-rose-500" 
                      : "text-emerald-400 text-glow-emerald"
                  )}>
                    {p.rpDelta >= 0 ? `+${p.rpDelta}` : p.rpDelta} RP
                  </span>
                  
                  {/* Subtext RP */}
                  <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
                    최종 {p.finalRp} RP
                  </span>
                </div>
              </div>

              {/* Promotion/Demotion Alert inside the card */}
              {isPromoted && (
                <div className={cn(
                  "relative z-10 text-[9px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 animate-pulse w-fit",
                  isMajorRankChange 
                    ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/35 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                    : "bg-cyan-500/10 border border-cyan-500/10 text-cyan-300"
                )}>
                  <Sparkles className="size-3 shrink-0" />
                  <span>
                    {isMajorRankChange 
                      ? `티어 승급 달성! (${getTierLabelInKorean(p.finalTier)})` 
                      : `${getTierLabelInKorean(p.finalTier)} ${finalSub}단계 상승!`
                    }
                  </span>
                </div>
              )}

              {hasRankDown && (
                <div className="relative z-10 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-1 w-fit">
                  <span className="size-1 rounded-full bg-rose-500 animate-ping" />
                  <span>티어/단계 하락</span>
                </div>
              )}

              {/* Rewards list (compacted and stylish inline badges) */}
              {rewards.length > 0 && (
                <div className={cn(
                  "relative z-10 border-t pt-2 mt-0.5",
                  isLosing ? "border-rose-500/10" : "border-cyan-500/10"
                )}>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                    {isLosing ? "변동 상세 내역" : "획득 보너스"}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rewards.map((item) => {
                      const isNegative = item.value < 0;
                      return (
                        <div 
                          key={item.id} 
                          className={cn(
                            "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border",
                            isNegative 
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/20" 
                              : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                          )}
                        >
                          <span>{item.icon} {item.label}</span>
                          <span className={cn(
                            "font-mono",
                            isNegative ? "text-rose-400" : "text-cyan-400"
                          )}>
                            {isNegative ? "" : "+"}{item.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div 
              className={cn(
                "relative w-full max-w-5xl overflow-hidden border bg-[#06080f] rounded-2xl p-4 md:p-6 flex flex-col items-center animate-in zoom-in duration-300",
                isRankUp ? `animate-glow-${promotedTier.toLowerCase()}` : "border-cyan-500/30 shadow-[0_0_60px_rgba(0,180,216,0.2)] animate-glow-pulse"
              )}
            >
              {/* Embedded custom CSS */}
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes scale-up-bounce {
                  0% {
                    transform: scale(0.3);
                    opacity: 0;
                  }
                  70% {
                    transform: scale(1.12);
                  }
                  100% {
                    transform: scale(1);
                    opacity: 1;
                  }
                }
                .animate-scale-up-bounce {
                  animation: scale-up-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                @keyframes stamp-pop {
                  0% {
                    transform: scale(2.2);
                    filter: brightness(2.5) blur(3px);
                    opacity: 0;
                  }
                  60% {
                    transform: scale(0.96);
                    filter: brightness(1.2);
                  }
                  100% {
                    transform: scale(1);
                    filter: brightness(1);
                    opacity: 1;
                  }
                }
                .animate-stamp-pop {
                  animation: stamp-pop 0.24s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                }
                @keyframes glow-pulse {
                  0%, 100% {
                    box-shadow: 0 0 15px rgba(0, 180, 216, 0.15), inset 0 0 15px rgba(0, 180, 216, 0.05);
                    border-color: rgba(0, 180, 216, 0.2);
                  }
                  50% {
                    box-shadow: 0 0 30px rgba(0, 180, 216, 0.4), inset 0 0 25px rgba(0, 180, 216, 0.15);
                    border-color: rgba(0, 180, 216, 0.5);
                  }
                }
                .animate-glow-pulse {
                  animation: glow-pulse 3s infinite ease-in-out;
                }
                @keyframes text-glow-victory {
                  0%, 100% {
                    text-shadow: 0 0 15px rgba(0, 180, 216, 0.5), 0 0 30px rgba(0, 180, 216, 0.2);
                  }
                  50% {
                    text-shadow: 0 0 25px rgba(0, 180, 216, 0.8), 0 0 45px rgba(0, 180, 216, 0.4);
                  }
                }
                .animate-glow-victory {
                  animation: text-glow-victory 2.5s infinite ease-in-out;
                }
                
                @keyframes glow-bronze {
                  0%, 100% {
                    box-shadow: 0 0 20px rgba(180, 83, 9, 0.25), inset 0 0 15px rgba(180, 83, 9, 0.05);
                    border-color: rgba(180, 83, 9, 0.35);
                  }
                  50% {
                    box-shadow: 0 0 50px rgba(180, 83, 9, 0.65), inset 0 0 25px rgba(180, 83, 9, 0.15);
                    border-color: rgba(180, 83, 9, 0.75);
                  }
                }
                .animate-glow-bronze {
                  animation: glow-bronze 3s infinite ease-in-out;
                }
                @keyframes glow-silver {
                  0%, 100% {
                    box-shadow: 0 0 20px rgba(148, 163, 184, 0.25), inset 0 0 15px rgba(148, 163, 184, 0.05);
                    border-color: rgba(148, 163, 184, 0.35);
                  }
                  50% {
                    box-shadow: 0 0 50px rgba(148, 163, 184, 0.65), inset 0 0 25px rgba(148, 163, 184, 0.15);
                    border-color: rgba(148, 163, 184, 0.75);
                  }
                }
                .animate-glow-silver {
                  animation: glow-silver 3s infinite ease-in-out;
                }
                @keyframes glow-gold {
                  0%, 100% {
                    box-shadow: 0 0 20px rgba(245, 158, 11, 0.25), inset 0 0 15px rgba(245, 158, 11, 0.05);
                    border-color: rgba(245, 158, 11, 0.35);
                  }
                  50% {
                    box-shadow: 0 0 50px rgba(245, 158, 11, 0.7), inset 0 0 25px rgba(245, 158, 11, 0.18);
                    border-color: rgba(245, 158, 11, 0.8);
                  }
                }
                .animate-glow-gold {
                  animation: glow-gold 3s infinite ease-in-out;
                }
                @keyframes glow-platinum {
                  0%, 100% {
                    box-shadow: 0 0 20px rgba(168, 85, 247, 0.25), inset 0 0 15px rgba(168, 85, 247, 0.05);
                    border-color: rgba(168, 85, 247, 0.35);
                  }
                  50% {
                    box-shadow: 0 0 50px rgba(168, 85, 247, 0.7), inset 0 0 25px rgba(168, 85, 247, 0.18);
                    border-color: rgba(168, 85, 247, 0.8);
                  }
                }
                .animate-glow-platinum {
                  animation: glow-platinum 3s infinite ease-in-out;
                }
                @keyframes glow-diamond {
                  0%, 100% {
                    box-shadow: 0 0 20px rgba(0, 240, 255, 0.25), inset 0 0 15px rgba(0, 240, 255, 0.05);
                    border-color: rgba(0, 240, 255, 0.35);
                  }
                  50% {
                    box-shadow: 0 0 50px rgba(0, 240, 255, 0.7), inset 0 0 25px rgba(0, 240, 255, 0.18);
                    border-color: rgba(0, 240, 255, 0.8);
                  }
                }
                .animate-glow-diamond {
                  animation: glow-diamond 3s infinite ease-in-out;
                }
                
                @keyframes text-glow-rankup {
                  0%, 100% {
                    text-shadow: 0 0 15px currentColor, 0 0 30px rgba(255,255,255,0.2);
                  }
                  50% {
                    text-shadow: 0 0 30px currentColor, 0 0 50px rgba(255,255,255,0.4);
                  }
                }
                .animate-glow-rankup {
                  animation: text-glow-rankup 2.5s infinite ease-in-out;
                }

                @keyframes pulse-light {
                  0%, 100% {
                    filter: brightness(1);
                  }
                  50% {
                    filter: brightness(1.15);
                  }
                }
                .animate-pulse-light {
                  animation: pulse-light 2s infinite ease-in-out;
                }

                /* Custom thin scrollbar styles for player lists */
                .modal-scroll-container::-webkit-scrollbar {
                  width: 5px;
                }
                .modal-scroll-container::-webkit-scrollbar-track {
                  background: transparent;
                }
                .modal-scroll-container::-webkit-scrollbar-thumb {
                  background: rgba(6, 182, 212, 0.25);
                  border-radius: 9999px;
                }
                .modal-scroll-container::-webkit-scrollbar-thumb:hover {
                  background: rgba(6, 182, 212, 0.45);
                }
                .modal-scroll-container-rose::-webkit-scrollbar-thumb {
                  background: rgba(244, 63, 94, 0.25);
                }
                .modal-scroll-container-rose::-webkit-scrollbar-thumb:hover {
                  background: rgba(244, 63, 94, 0.45);
                }
              ` }} />

              {/* Background tech grids / sparkles */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.15)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-30" />
              <div className="absolute -top-40 -left-40 size-96 rounded-full blur-[120px] pointer-events-none transition-all duration-500" style={{ backgroundColor: isRankUp ? details.colorHex + '20' : 'rgba(6, 182, 212, 0.1)' }} />
              <div className="absolute -bottom-40 -right-40 size-96 rounded-full blur-[120px] pointer-events-none transition-all duration-500" style={{ backgroundColor: isRankUp ? details.colorHex + '20' : 'rgba(6, 182, 212, 0.1)' }} />

              {/* Header Title Banner */}
              {(() => {
                const majorPromotions = [resultData.winner, resultData.winner2]
                  .filter(Boolean)
                  .filter(p => p!.promoted && p!.prevTier !== p!.finalTier);

                const minorPromotions = [resultData.winner, resultData.winner2]
                  .filter(Boolean)
                  .filter(p => p!.promoted && p!.prevTier === p!.finalTier);

                if (majorPromotions.length > 0) {
                  const p = majorPromotions[0]!;
                  const tierNameK = getTierLabelInKorean(p.finalTier);
                  const details = getTierDetails(p.finalTier as TierName);
                  
                  return (
                    <div className="relative z-10 flex flex-col items-center text-center mb-4 shrink-0 animate-scale-up-bounce">
                      <div className={cn(
                        "relative flex size-16 items-center justify-center rounded-full border bg-background/90 shadow-[0_0_30px_rgba(255,255,255,0.15)] mb-2 shrink-0",
                        details.glow
                      )}>
                        <div className="absolute inset-0 rounded-full bg-current opacity-15 animate-ping pointer-events-none" />
                        <div className="scale-100">
                          <GeometricRankCrest tier={p.finalTier} rp={p.finalRp} thresholds={thresholds} size={48} />
                        </div>
                      </div>
                      <h2 className={cn(
                        "text-2xl md:text-3xl font-black uppercase tracking-[0.2em] mb-1 animate-glow-rankup",
                        details.color
                      )}>
                        TIER UPGRADE!
                      </h2>
                      <p className="text-xs text-white max-w-lg leading-relaxed font-black bg-[#0c1a2e]/60 px-5 py-1.5 rounded-full border border-cyan-500/20 shadow-lg">
                        🎉 축하합니다! <span className={details.color}>{p.name}</span> 선수가 <span className={details.color}>{tierNameK}</span> 티어로 승급했습니다! 🎉
                      </p>
                    </div>
                  );
                }

                if (minorPromotions.length > 0) {
                  const p = minorPromotions[0]!;
                  const finalSub = getTierSubdivision(p.finalRp, thresholds);
                  const tierNameK = getTierLabelInKorean(p.finalTier);
                  
                  return (
                    <div className="relative z-10 flex flex-col items-center text-center mb-4 shrink-0 animate-scale-up-bounce">
                      <div className="flex size-10 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)] mb-2 shrink-0">
                        <Sparkles className="size-5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
                      </div>
                      <h2 className="text-xl md:text-2xl font-black uppercase tracking-[0.2em] text-cyan-400 animate-glow-victory mb-1">
                        DIVISION UP
                      </h2>
                      <p className="text-[11px] text-gray-300 font-bold bg-[#09101f] px-4 py-1.5 rounded-full border border-border/30 shadow-lg">
                        실력이 상승하여 <span className="text-cyan-400 font-black">{p.name}</span> 선수가 <span className="text-cyan-300 font-black">{tierNameK} {finalSub}</span> 단계에 도달했습니다.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="relative z-10 flex flex-col items-center text-center mb-4 shrink-0 animate-scale-up-bounce">
                    <div className="flex size-10 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-[0_0_20px_rgba(0,180,216,0.3)] mb-2 shrink-0">
                      <Trophy className="size-5 text-cyan-400 animate-bounce" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-[0.25em] text-white animate-glow-victory mb-0.5">
                      MATCH RECORDED
                    </h2>
                    <p className="text-[10px] text-[#5b6f95] max-w-md leading-relaxed uppercase tracking-wider">
                      포인트 변동 내역 및 획득 결과
                    </p>
                  </div>
                );
              })()}

              {/* LOL Rank Result Layout: 2-Column Contrast View */}
              <div className="relative z-10 w-full flex flex-col md:flex-row items-stretch gap-4 md:gap-6 px-1 md:px-4 mt-1">
                
                {/* Left Panel: WINNERS (Cyan/Blue Theme) */}
                <div className="flex-1 rounded-2xl border border-cyan-500/30 bg-[#041121]/90 shadow-[0_0_40px_rgba(6,182,212,0.15)] p-4 md:p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 to-blue-500" />
                  <div className="absolute -right-10 -top-10 size-40 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 border-b border-cyan-500/10 pb-2">
                      <span className="text-lg md:text-xl font-black text-cyan-400 tracking-widest uppercase text-glow-blue animate-pulse">
                        VICTORY
                      </span>
                      <span className="text-xs font-black text-white bg-cyan-950 border border-cyan-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
                        {isDoubles 
                          ? (resultData.aWon ? "팀 A" : "팀 B") 
                          : "WINNER"
                        }
                      </span>
                    </div>

                    {/* Winners list */}
                    <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1.5 modal-scroll-container">
                      {/* Winner 1 */}
                      {renderLolPlayerCard(resultData.winner, w1Rewards, false)}
                      {/* Winner 2 */}
                      {isDoubles && resultData.winner2 && (
                        renderLolPlayerCard(resultData.winner2, w2Rewards, false)
                      )}
                    </div>
                  </div>
                </div>

                {/* VS Center Divider with Scores */}
                <div className="flex md:flex-col items-center justify-center gap-3 py-4 md:py-0 shrink-0 select-none">
                  <div className="h-0.5 w-12 md:w-0.5 md:h-16 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-cyan-500 to-transparent opacity-50" />
                  
                  {/* Winner Score */}
                  <span className="text-3xl font-black text-cyan-400 font-mono text-glow-blue animate-pulse">
                    {resultData.winner.score}
                  </span>
                  
                  <div className="size-10 rounded-full bg-[#0a0f1d] border border-cyan-500/40 flex items-center justify-center text-sm font-black text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] skew-x-[-12deg]">
                    VS
                  </div>
                  
                  {/* Loser Score */}
                  <span className="text-3xl font-black text-rose-500 font-mono">
                    {resultData.loser.score}
                  </span>
                  
                  <div className="h-0.5 w-12 md:w-0.5 md:h-16 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-rose-500 to-transparent opacity-50" />
                </div>

                {/* Right Panel: LOSERS (Red/Rose Theme) */}
                <div className="flex-1 rounded-2xl border border-rose-950/30 bg-[#1c0d12]/90 shadow-[0_0_40px_rgba(244,63,94,0.06)] p-4 md:p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-700 to-red-500" />
                  <div className="absolute -left-10 -top-10 size-40 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 border-b border-rose-950/20 pb-2">
                      <span className="text-lg md:text-xl font-black text-rose-500 tracking-widest uppercase">
                        DEFEAT
                      </span>
                      <span className="text-xs font-black text-muted-foreground bg-rose-950/20 border border-rose-950 px-3 py-1 rounded-full uppercase tracking-wider">
                        {isDoubles 
                          ? (resultData.aWon ? "팀 B" : "팀 A") 
                          : "LOSER"
                        }
                      </span>
                    </div>

                    {/* Losers list */}
                    <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1.5 modal-scroll-container modal-scroll-container-rose">
                      {/* Loser 1 */}
                      {renderLolPlayerCard(resultData.loser, l1Rewards, true)}
                      {/* Loser 2 */}
                      {isDoubles && resultData.loser2 && (
                        renderLolPlayerCard(resultData.loser2, l2Rewards, true)
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Confirmation Close Button */}
              <div className="relative z-10 w-full mt-6 flex justify-center shrink-0">
                <Button
                  onClick={() => {
                    setShowModal(false);
                    setResultData(null);
                  }}
                  className={cn(
                    "h-12 px-12 text-white font-black uppercase tracking-widest active:scale-95 transition-all w-full sm:w-auto rounded-lg border",
                    isRankUp 
                      ? "bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 border-emerald-400/40 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                      : "bg-gradient-to-r from-cyan-600 via-cyan-500 to-cyan-600 hover:from-cyan-500 hover:to-cyan-400 border-cyan-400/40 shadow-[0_0_25px_rgba(0,180,216,0.35)]"
                  )}
                >
                  확인 (다음 경기)
                </Button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 성별 정보 보완 팝업창 (LoL 테크니컬 디자인 다크모드) */}
      {genderModalOpen && genderTargetId && (() => {
        const targetStudent = students.find((s) => s.id === genderTargetId);
        if (!targetStudent) return null;
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-md overflow-hidden border border-neon-blue/30 bg-background/95 rounded-2xl p-6 md:p-8 shadow-[0_0_50px_rgba(0,180,216,0.2)] flex flex-col items-center animate-in zoom-in duration-300">
              {/* Grid Background Effect */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.2)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />
              
              {/* Close Button */}
              <button 
                onClick={handleCancelGender}
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground hover:bg-muted/40 p-1.5 rounded-lg transition-all"
                title="취소 및 뒤로가기"
              >
                <X className="size-5" />
              </button>

              {/* Title & Info */}
              <div className="relative z-10 flex flex-col items-center text-center w-full">
                <div className="flex size-14 items-center justify-center rounded-full bg-neon-blue/15 border border-neon-blue/30 text-neon-blue shadow-[0_0_30px_rgba(0,180,216,0.3)] mb-4 animate-pulse">
                  <Sparkles className="size-6 text-neon-blue" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-wider text-glow-blue text-neon-blue mb-1">
                  선수 성별 정보 보완
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
                  <span className="font-bold text-foreground">[{targetStudent.name}]</span> 선수의 성별 정보(M/F)가 지정되지 않았습니다.<br />
                  리그 경기 결과를 등록하기 위해 성별을 입력해주세요.
                </p>
              </div>

              {/* Gender Selection Grid */}
              <div className="relative z-10 grid grid-cols-2 gap-4 w-full">
                {/* Male Option */}
                <button
                  onClick={() => handleUpdateGender("M")}
                  className="flex flex-col items-center justify-center p-5 rounded-xl border border-neon-blue/30 bg-neon-blue/5 hover:bg-neon-blue/15 hover:border-neon-blue/60 transition-all active:scale-95 group shadow-[0_0_15px_rgba(0,180,216,0.05)]"
                >
                  <span className="text-4xl mb-2 group-hover:animate-bounce">♂</span>
                  <span className="text-sm font-black text-neon-blue tracking-wider">남성 (M)</span>
                  <span className="text-[10px] text-muted-foreground mt-1">Male Athlete</span>
                </button>

                {/* Female Option */}
                <button
                  onClick={() => handleUpdateGender("F")}
                  className="flex flex-col items-center justify-center p-5 rounded-xl border border-loss/30 bg-loss/5 hover:bg-loss/15 hover:border-loss/60 transition-all active:scale-95 group shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                >
                  <span className="text-4xl mb-2 group-hover:animate-bounce text-loss">♀</span>
                  <span className="text-sm font-black text-loss tracking-wider">여성 (F)</span>
                  <span className="text-[10px] text-muted-foreground mt-1">Female Athlete</span>
                </button>
              </div>

              {/* Notice Footer */}
              <p className="relative z-10 text-[10px] text-muted-foreground mt-6 text-center leading-relaxed">
                입력하신 성별 데이터는 로컬 브라우저 캐시는 물론,<br />
                교사 전용 구글 스프레드시트 클라우드 데이터베이스에 실시간 영속 동기화됩니다.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PlayerSelector({
  label, accent, students, value, onChange, player, thresholds,
}: {
  label: string;
  accent: "blue" | "green";
  students: Student[];
  value: Selection;
  onChange: (s: Selection) => void;
  player: Student | null;
  thresholds?: Record<string, number>;
}) {
  const accentCls = accent === "blue"
    ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue shadow-[0_0_14px_oklch(0.78_0.18_230/0.35)]"
    : "border-neon-green/60 bg-neon-green/15 text-neon-green shadow-[0_0_14px_oklch(0.85_0.22_150/0.35)]";

  const headerCls = accent === "blue" ? "text-neon-blue" : "text-neon-green";

  const activeGrades = useMemo(() => {
    const set = new Set<number>();
    students.forEach((s) => {
      if (s.grade) set.add(s.grade);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [students]);

  const classes = useMemo(() => {
    if (value.grade == null) return [];
    const set = new Set<number>();
    students.filter((s) => s.grade === value.grade).forEach((s) => set.add(s.classNum));
    return Array.from(set).sort((a, b) => a - b);
  }, [students, value.grade]);

  const roster = useMemo(() => {
    if (value.grade == null || value.classNum == null) return [];
    return students
      .filter((s) => s.grade === value.grade && s.classNum === value.classNum)
      .sort((a, b) => a.number - b.number);
  }, [students, value.grade, value.classNum]);

  return (
    <Card className="border-border/60 bg-card/60 p-5 backdrop-blur h-auto">
      <div className="mb-4 flex items-center justify-between">
        <h3 className={cn("text-sm font-bold uppercase tracking-wider", headerCls)}>{label}</h3>
        {player && (
          <button
            onClick={() => onChange({ grade: value.grade, classNum: value.classNum, studentId: null })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-[0_0_12px_rgba(225,29,72,0.35)] transition-all active:scale-95 cursor-pointer"
          >
            <X className="size-3.5" /> 선수 다시 선택
          </button>
        )}
      </div>

      {player ? (
        <div className={cn("rounded-lg border p-4", accentCls)}>
          <div className="text-xs opacity-80">{player.grade}학년 {player.classNum}반 · {player.number}번</div>
          <div className="mt-1 flex items-center gap-2 text-xl sm:text-2xl font-black min-w-0">
            <GenderMark gender={player.gender} className="size-5 text-xs shrink-0" />
            <span className="whitespace-nowrap truncate flex-1">{player.realName || player.name}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TierBadge rp={player.rp} thresholds={thresholds} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Step n={1} title="학년">
            <div className="grid grid-cols-3 gap-2.5 mt-2 w-full">
              {activeGrades.map((g) => (
                <Chip key={g} active={value.grade === g} accent={accent} onClick={() => onChange({ grade: g, classNum: null, studentId: null })}>
                  {g}학년
                </Chip>
              ))}
            </div>
          </Step>
          {value.grade != null && (
            <Step n={2} title="반">
              <div className="grid grid-cols-3 gap-2.5 mt-2 w-full">
                {classes.map((c) => (
                  <Chip key={c} active={value.classNum === c} accent={accent} onClick={() => onChange({ ...value, classNum: c, studentId: null })}>
                    {c}반
                  </Chip>
                ))}
                {classes.length === 0 && <span className="text-xs text-muted-foreground block py-2">학생이 없습니다</span>}
              </div>
            </Step>
          )}
          {value.classNum != null && (
            <Step n={3} title="선수 선택">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {roster.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onChange({ ...value, studentId: s.id })}
                    className="relative rounded-lg border border-border/60 bg-[#0e1322]/80 px-2 pt-6 pb-2.5 text-center transition-all hover:border-neon-blue/60 hover:bg-accent/40 flex flex-col items-center justify-between h-auto min-h-[4.75rem] w-full overflow-hidden cursor-pointer"
                  >
                    {/* 1. 좌측 상단 번호 */}
                    <span className="absolute top-1 left-1.5 text-[10px] text-gray-500 font-mono">
                      {s.number}번
                    </span>

                    {/* 2. 우측 상단 성별 아이콘 */}
                    <GenderMark 
                      gender={s.gender} 
                      className="absolute top-1 right-1.5 size-3.5 text-[9px] shrink-0" 
                    />
                    
                    {/* 3. 정중앙 이름 배치 */}
                    <div className="flex-grow flex items-center justify-center w-full min-w-0">
                      <span className="text-base font-bold text-white break-keep text-center w-full">
                        {s.realName || s.name}
                      </span>
                    </div>

                    {/* 4. 하단 티어 뱃지 단독 배치 */}
                    <div className="flex justify-center mt-1.5 w-full shrink-0">
                      <TierBadge rp={s.rp} thresholds={thresholds} />
                    </div>
                  </button>
                ))}
              </div>
            </Step>
          )}
        </div>
      )}
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-2xl font-extrabold text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, accent, onClick, children }: { active: boolean; accent: "blue" | "green"; onClick: () => void; children: React.ReactNode }) {
  const activeCls = accent === "blue"
    ? "border-neon-blue bg-neon-blue/20 text-neon-blue shadow-[0_0_18px_rgba(0,180,216,0.35)]"
    : "border-neon-green bg-neon-green/20 text-neon-green shadow-[0_0_18px_rgba(34,197,94,0.35)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full h-12 rounded-xl border text-sm font-black transition-all active:scale-95 flex items-center justify-center shadow-md cursor-pointer",
        active ? activeCls : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-muted/30",
      )}
    >
      {children}
    </button>
  );
}

function ScorePad({ name, value, onChange, accent }: { name: string; value: number; onChange: (v: number) => void; accent: "blue" | "green" }) {
  const colorText = accent === "blue" ? "text-neon-blue text-glow-blue" : "text-neon-green";
  const plusCls = accent === "blue"
    ? "border-neon-blue/50 bg-neon-blue/10 text-neon-blue hover:bg-neon-blue/20"
    : "border-neon-green/50 bg-neon-green/10 text-neon-green hover:bg-neon-green/20";
  const minusCls = "border-loss/40 bg-loss/10 text-loss hover:bg-loss/20";
  const set = (delta: number) => onChange(Math.max(0, value + delta));

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center">
      <div className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{name}</div>
      <div className={cn("my-3 font-mono text-6xl font-black tabular-nums", colorText)}>{value}</div>
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {[1, 5, 10].map((d) => (
            <QuickBtn key={`p${d}`} className={plusCls} onClick={() => set(d)}>+{d}</QuickBtn>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 5, 10].map((d) => (
            <QuickBtn key={`m${d}`} className={minusCls} onClick={() => set(-d)}>-{d}</QuickBtn>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(0)}
          className="mt-2.5 h-9 w-full text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 border-none transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-[0_0_14px_rgba(245,158,11,0.35)] cursor-pointer"
        >
          <RotateCcw className="size-3.5" /> 0으로 초기화
        </Button>
      </div>
    </div>
  );
}

function QuickBtn({ className, onClick, children }: { className?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border py-2.5 font-mono text-lg font-black tabular-nums transition-all active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

function getTierLabelInKorean(tier: string): string {
  const map: Record<string, string> = {
    Bronze: "브론즈",
    Silver: "실버",
    Gold: "골드",
    Platinum: "플래티넘",
    Diamond: "다이아몬드"
  };
  return map[tier] || tier;
}

function GeometricRankCrest({ 
  tier, 
  rp, 
  thresholds, 
  isLosing,
  size = 80
}: { 
  tier: string; 
  rp: number; 
  thresholds?: Record<string, number>; 
  isLosing?: boolean; 
  size?: number;
}) {
  const finalTier = tier as TierName;
  const sub = getTierSubdivision(rp, thresholds);
  
  const filterCls = isLosing 
    ? "grayscale opacity-40 brightness-75" 
    : "animate-pulse hover:scale-115 transition-transform duration-300";

  const shadowCls = isLosing
    ? "drop-shadow-none"
    : finalTier === "Diamond"
      ? "drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]"
      : finalTier === "Gold"
        ? "drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]"
        : "drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]";

  // State to handle image load error
  const [hasError, setHasError] = useState(false);

  // If there's an error loading the image, fall back to a styled text fallback
  if (hasError) {
    return (
      <div 
        style={{ width: size, height: size }}
        className={cn(
          "flex items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-950/20 font-black text-xs text-cyan-400 select-none uppercase tracking-tighter shrink-0",
          filterCls
        )}
      >
        {tier.substring(0, 4)}
      </div>
    );
  }

  return (
    <img
      src={`/assets/tiers/${tier.toLowerCase()}.png`}
      alt={`${tier} Rank`}
      onError={() => setHasError(true)}
      className={cn(
        "object-contain shrink-0", 
        shadowCls,
        filterCls
      )}
      style={{
        width: size,
        height: size,
      }}
    />
  );
}

