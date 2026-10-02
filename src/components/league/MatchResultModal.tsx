import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TierBadge } from "./TierBadge";
import { GenderMark } from "./GenderMark";
import { cn } from "@/lib/utils";
import { Trophy, X, Sparkles, User, Users, Crown, Award, Zap, RotateCcw, UserPlus, Lock, LockOpen, ChevronDown, Delete, Pencil } from "lucide-react";
import type { TierName } from "@/lib/league-types";
import { getTier, getTierSubdivision, TIER_ORDER, getFullTierLabel, isUnranked } from "@/lib/league-types";

// 경기 결과 팝업(영수증). 저장소(store)를 쓰지 않는다 — 로그인 없는 학생 화면에서도 띄울 수 있게.
export type PlayerResult = {
  name: string;
  group: string | null;
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
  // 배치고사(언랭크): 이 경기까지 포함해도 배치가 끝나지 않았으면 티어·RP 비공개
  unranked: boolean;
  placementDone: number;
  placementNeed: number;
};

export type MatchResultData = {
  matchType: "single" | "double";
  winner: PlayerResult;
  winner2?: PlayerResult;
  loser: PlayerResult;
  loser2?: PlayerResult;
  aWon: boolean;
};


// SFX Player Placeholder Hook
function playSoundEffect(type: "victory" | "defeat" | "stamp" | "countup" | "total") {
  console.log(`[SFX Play] ${type}`);
  // Future expansion: hook up to local sound files (e.g. victory.mp3, stamp.mp3)
  // const audio = new Audio(`/sounds/${type}.mp3`);
  // audio.play().catch(() => {});
}

export function getTierDetails(tierName: string) {
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
}

// Helper to extract active bonuses for the receipt view
// Helper to extract active bonuses for the receipt view
export function getRewardItems(p: PlayerResult) {
  const items = [];
  
  // Base Victory RP
  if (p.baseWin > 0) {
    items.push({
      id: "baseWin",
      icon: "⚔️",
      label: "기본 승리",
      value: p.baseWin,
      desc: p.unranked ? "매치 승리" : `${getTierLabelInKorean(p.finalTier)} 티어 매치 승리`
    });
  }

  // Base Loss RP
  if (p.baseLoss > 0) {
    items.push({
      id: "baseLoss",
      icon: "⚔️",
      label: "기본 차감",
      value: -p.baseLoss,
      desc: p.unranked ? "매치 패배" : `${getTierLabelInKorean(p.finalTier)} 티어 매치 패배`
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
      label: "정상 결전",
      value: p.rivalBonus,
      desc: "같은 티어 이상의 강자를 꺾음 (플래티넘↑ 전용)"
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
      label: "캐리",
      value: p.mentoringBonus,
      desc: "낮은 티어 짝과 함께 승리 (플래티넘↑ 전용)"
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
}

export function MatchResultModal({ resultData, thresholds, genderEnabled, closeLabel, onClose }: {
  resultData: MatchResultData;
  thresholds?: Record<string, number>;
  genderEnabled: boolean;
  closeLabel: string;
  onClose: () => void;
}) {
  // eSports UI Animation & SFX States
  const [animationStep, setAnimationStep] = useState(-1);
  const [countUpProgress, setCountUpProgress] = useState(0);
  const [countUpDone, setCountUpDone] = useState(false);

  // Staggered reveal & count-up trigger timeline
  useEffect(() => {
    if (resultData) {
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
  }, [resultData]);

  // Player Receipt Component (defined inside RecordMatch to access animationStep, countUpProgress, etc. easily)
  const renderPlayerReceipt = (p: PlayerResult, rewards: ReturnType<typeof getRewardItems>) => {
    const isPromoted = p.promoted;
    const playerTierDetails = isPromoted ? getTierDetails(p.finalTier) : null;

    return (
      <div 
        className={cn(
          "relative overflow-hidden rounded-xl border p-5 flex flex-col justify-between h-full transition-all",
          isPromoted 
            ? `bg-surface-deep border-2 animate-glow-${p.finalTier.toLowerCase()}` 
            : "border-neon-blue/20 bg-surface-deep glow-primary animate-glow-pulse"
        )}
      >
        {/* Futuristic Grid Overlay inside card */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.12)_1px,transparent_1px)] bg-[size:12px_12px] pointer-events-none opacity-40" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-neon-blue/10 to-transparent transform rotate-45 translate-x-12 -translate-y-12 pointer-events-none" />

        {/* Player Header */}
        <div className="relative z-10 mb-4 pb-3 border-b border-surface-line flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              {genderEnabled && <GenderMark gender={p.gender} className="size-4 text-[10px]" />}
              <span className="text-base font-extrabold tracking-tight text-foreground">{p.name}</span>
              {isPromoted && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-full text-foreground font-extrabold text-[9px] px-2 py-0.5 animate-bounce shrink-0 shadow-lg",
                  p.finalTier === "Gold" ? "bg-gradient-to-r from-amber-500 to-orange-500" :
                  p.finalTier === "Platinum" ? "bg-gradient-to-r from-purple-500 to-indigo-500" :
                  p.finalTier === "Diamond" ? "bg-gradient-to-r from-neon-blue to-blue-500" :
                  "bg-gradient-to-r from-gray-500 to-slate-700"
                )}>
                  ▲ 승급! 🎉
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {p.group ? p.group : "선수"}
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className={cn(
              "text-[9px] font-black bg-background border px-2.5 py-0.5 rounded tracking-wider",
              isPromoted 
                ? `${playerTierDetails?.color} border-white/20` 
                : "text-neon-blue border-neon-blue/30"
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
                    "flex items-center justify-between p-2.5 rounded-lg border bg-surface-deep border-[#1c273e] transition-all duration-200",
                    isVisible 
                      ? cn("opacity-100 scale-100 animate-stamp-pop border-[#1c273e]", isPromoted ? "shadow-md" : "glow-primary") 
                      : "opacity-0 scale-150 pointer-events-none"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "flex items-center justify-center size-7 rounded border shrink-0",
                      isPromoted 
                        ? "bg-white/5 border-white/10 text-foreground" 
                        : "bg-neon-blue/10 border-neon-blue/20 text-neon-blue"
                    )}>
                      <span className="text-sm">{item.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate">{item.label}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-xs font-extrabold font-mono shrink-0",
                    isPromoted ? playerTierDetails?.color : "text-neon-blue"
                  )}>
                    +{item.value} RP
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Total RP Count-up Section */}
        <div className="relative z-10 mt-4 pt-3 border-t border-surface-line">
          <div className={cn(
            "flex items-center justify-between px-3 py-3 rounded-lg border",
            isPromoted 
              ? "bg-gradient-to-r from-card/30 via-[#101729] to-card/30" 
              : "bg-gradient-to-r from-neon-blue/30 via-[#101729] to-neon-blue/30 border-neon-blue/20"
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
                  isPromoted ? playerTierDetails?.color : "text-neon-blue"
                )}>
                  최종 {Math.min(10000, p.prevRp + Math.max(0, Math.floor(p.rpDelta * countUpProgress)))}
                </span>
              </div>
            </div>
            <div className={cn(
              "text-xl font-black font-mono tracking-tight",
              isPromoted ? `${playerTierDetails?.color}` : "text-neon-blue text-glow-blue",
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
      <div className="relative overflow-hidden rounded-xl border border-surface-line bg-surface-deep p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col justify-between h-full">
        {/* Grid Background Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.12)_1px,transparent_1px)] bg-[size:12px_12px] pointer-events-none opacity-40" />

        <div className="relative z-10 text-center text-xs font-black uppercase tracking-[0.2em] text-soft mb-4 pb-2 border-b border-surface-line">
          MATCH SUMMARY
        </div>

        {/* Score Visualizer */}
        <div className="relative z-10 flex items-center justify-center gap-6 py-4 mb-4 rounded-lg bg-surface-deep border border-surface-line max-w-xs mx-auto w-full">
          <div className="text-right flex flex-col items-center min-w-[70px]">
            <span className="text-[10px] text-[#8fa0c4] font-black truncate max-w-[80px]">{resultData.winner.name}</span>
            <span className="text-2xl font-black text-neon-blue font-mono mt-0.5">{resultData.winner.score}</span>
          </div>
          <div className="text-sm font-black text-[#4f6285] font-mono px-2 py-0.5 rounded bg-surface-deep border border-surface-line skew-x-[-12deg]">VS</div>
          <div className="text-left flex flex-col items-center min-w-[70px]">
            <span className="text-[10px] text-[#8fa0c4] font-black truncate max-w-[80px]">{resultData.loser.name}</span>
            <span className="text-2xl font-black text-loss font-mono mt-0.5">{resultData.loser.score}</span>
          </div>
        </div>

        {/* Player outcomes list */}
        <div className="relative z-10 space-y-2.5">
          {/* Winner 1 */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-deep border border-neon-blue/20 transition-all">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black text-neon-blue bg-surface-deep border border-neon-blue/30 px-1.5 py-0.5 rounded shrink-0">WIN</span>
              <span className="text-xs font-bold text-foreground truncate">{resultData.winner.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <TierBadge rp={resultData.winner.finalRp} />
              <span className="text-xs font-extrabold text-neon-blue font-mono">+{resultData.winner.rpDelta} RP</span>
            </div>
          </div>

          {/* Winner 2 (if doubles) */}
          {resultData.winner2 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-deep border border-neon-blue/20 transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black text-neon-blue bg-surface-deep border border-neon-blue/30 px-1.5 py-0.5 rounded shrink-0">WIN</span>
                <span className="text-xs font-bold text-foreground truncate">{resultData.winner2.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TierBadge rp={resultData.winner2.finalRp} />
                <span className="text-xs font-extrabold text-neon-blue font-mono">+{resultData.winner2.rpDelta} RP</span>
              </div>
            </div>
          )}

          {/* Loser 1 */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-deep border border-loss/20 transition-all">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black text-loss bg-surface-deep border border-loss/30 px-1.5 py-0.5 rounded shrink-0">LOSE</span>
              <span className="text-xs font-bold text-foreground truncate">{resultData.loser.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <TierBadge rp={resultData.loser.finalRp} />
              <span className="text-xs font-extrabold text-loss font-mono">{resultData.loser.rpDelta} RP</span>
            </div>
          </div>

          {/* Loser 2 (if doubles) */}
          {resultData.loser2 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-deep border border-loss/20 transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black text-loss bg-surface-deep border border-loss/30 px-1.5 py-0.5 rounded shrink-0">LOSE</span>
                <span className="text-xs font-bold text-foreground truncate">{resultData.loser2.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TierBadge rp={resultData.loser2.finalRp} />
                <span className="text-xs font-extrabold text-loss font-mono">{resultData.loser2.rpDelta} RP</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

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
              ? "border-loss/30 bg-surface-panel" 
              : isPromoted
                ? `bg-surface-deep border-neon-blue/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]`
                : "border-surface-line bg-surface-panel"
          )}
        >
          <div className="flex items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* 1. 기하학적 SVG 뱃지 (크기 축소: size={56}) — 언랭크는 티어 노출 방지 */}
              <div className="animate-scale-up-bounce shrink-0">
                {p.unranked ? (
                  <div className="flex size-14 items-center justify-center rounded-full border border-border/50 bg-surface-deep text-xl font-black text-muted-foreground">?</div>
                ) : (
                  <GeometricRankCrest tier={p.finalTier} rp={p.finalRp} thresholds={thresholds} isLosing={isLosing} size={56} />
                )}
              </div>
              
              <div className="min-w-0">
                {/* Player Name */}
                <div className="flex items-center gap-1">
                  {genderEnabled && <GenderMark gender={p.gender} className="size-3 text-[9px]" />}
                  <span className="text-sm font-extrabold text-foreground truncate">{p.name}</span>
                </div>
                
                {/* Group & Details */}
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  {p.group ? p.group : "선수"}
                </div>

                {/* Rank Info — 언랭크는 티어 대신 배치 진행도만, 그 외엔 티어 변동 표시 */}
                <div className="text-[10px] text-soft font-mono mt-0.5 flex items-center gap-1">
                  {p.unranked ? (
                    <span className="text-muted-foreground">배치 {p.placementDone}/{p.placementNeed}경기</span>
                  ) : (p.prevTier !== p.finalTier || prevSub !== finalSub) ? (
                    <>
                      <span>{getTierLabelInKorean(p.prevTier)} {prevSub}</span>
                      <span>➔</span>
                      <span className={isLosing ? "text-loss font-bold" : "text-neon-blue font-bold"}>
                        {getTierLabelInKorean(p.finalTier)} {finalSub}
                      </span>
                    </>
                  ) : (
                    <span>{getTierLabelInKorean(p.finalTier)} {finalSub}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              {p.unranked ? (
                // 언랭크: 획득 RP·최종 RP 비공개
                <>
                  <span className="text-base font-black font-mono tracking-tight text-muted-foreground/70">? RP</span>
                  <span className="text-[9px] text-muted-foreground font-mono mt-0.5">배치 완료 후 공개</span>
                </>
              ) : (
                <>
                  {/* RP Delta display */}
                  <span className={cn(
                    "text-base font-black font-mono tracking-tight",
                    isLosing
                      ? "text-loss"
                      : "text-win text-glow-emerald"
                  )}>
                    {p.rpDelta >= 0 ? `+${p.rpDelta}` : p.rpDelta} RP
                  </span>

                  {/* Subtext RP */}
                  <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
                    최종 {p.finalRp} RP
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Promotion/Demotion Alert inside the card */}
          {isPromoted && (
            <div className={cn(
              "relative z-10 text-[9px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 animate-pulse w-fit",
              isMajorRankChange 
                ? "bg-gradient-to-r from-neon-blue/20 to-blue-500/20 border border-neon-blue/35 text-neon-blue shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                : "bg-neon-blue/10 border border-neon-blue/10 text-neon-blue"
            )}>
              <Sparkles className="size-3 shrink-0" />
              <span>
                {isMajorRankChange
                  ? `티어 승급 달성! (${getTierLabelInKorean(p.finalTier)})`
                  : `${getTierLabelInKorean(p.finalTier)} ${finalSub}단계 도달!`
                }
              </span>
            </div>
          )}

          {!p.unranked && hasRankDown && (
            <div className="relative z-10 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-loss/10 border border-loss/20 text-loss flex items-center gap-1 w-fit">
              <span className="size-1 rounded-full bg-loss animate-ping" />
              <span>티어/단계 하락</span>
            </div>
          )}

          {/* Rewards list — 항목 클릭 시 설명 토글. 언랭크는 RP 합산 노출을 막기 위해 안내로 대체 */}
          {p.unranked ? (
            <div className="relative z-10 rounded-lg border border-dashed border-border/40 bg-surface-deep px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
              🎯 배치고사 진행 중 · 배치 {p.placementDone}/{p.placementNeed}경기 완료 시 티어·RP가 공개됩니다.
            </div>
          ) : (
            <RewardList rewards={rewards} isLosing={isLosing} />
          )}
        </div>
      );
    };

    return (
      <div className="fixed inset-0 z-[100] flex justify-center overflow-y-auto bg-background/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
        <div
          className={cn(
            "relative my-auto w-full max-w-5xl overflow-hidden border bg-surface-deep rounded-2xl p-4 md:p-6 flex flex-col items-center animate-in zoom-in duration-300",
            isRankUp ? `animate-glow-${promotedTier.toLowerCase()}` : "result-modal border-neon-blue/30 glow-primary animate-glow-pulse"
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


          {/* LOL Rank Result Layout: 2-Column Contrast View */}
          <div className="relative z-10 w-full flex flex-col md:flex-row items-stretch gap-4 md:gap-6 px-1 md:px-4 mt-1">
            
            {/* Left Panel: WINNERS (Cyan/Blue Theme) */}
            <div className="flex-1 rounded-2xl border border-neon-blue/30 bg-surface-deep shadow-[0_0_40px_rgba(6,182,212,0.15)] p-4 md:p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-neon-blue to-blue-500" />
              <div className="absolute -right-10 -top-10 size-40 bg-neon-blue/5 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3 border-b border-neon-blue/10 pb-2">
                  <span className="text-lg md:text-xl font-black text-neon-blue tracking-widest uppercase text-glow-blue animate-pulse">
                    VICTORY
                  </span>
                  <span className="text-xs font-black text-foreground bg-surface-deep border border-neon-blue/30 px-3 py-1 rounded-full uppercase tracking-wider">
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
              <div className="h-0.5 w-12 md:w-0.5 md:h-16 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-neon-blue to-transparent opacity-50" />
              
              {/* Winner Score */}
              <span className="text-3xl font-black text-neon-blue font-mono text-glow-blue animate-pulse">
                {resultData.winner.score}
              </span>
              
              <div className="size-10 rounded-full bg-surface-deep border border-neon-blue/40 flex items-center justify-center text-sm font-black text-neon-blue shadow-[0_0_15px_rgba(6,182,212,0.3)] skew-x-[-12deg]">
                VS
              </div>
              
              {/* Loser Score */}
              <span className="text-3xl font-black text-loss font-mono">
                {resultData.loser.score}
              </span>
              
              <div className="h-0.5 w-12 md:w-0.5 md:h-16 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-loss to-transparent opacity-50" />
            </div>

            {/* Right Panel: LOSERS (Red/Rose Theme) */}
            <div className="flex-1 rounded-2xl border border-loss/30 bg-surface-deep shadow-[0_0_40px_rgba(244,63,94,0.06)] p-4 md:p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-loss to-loss" />
              <div className="absolute -left-10 -top-10 size-40 bg-loss/5 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3 border-b border-loss/30 pb-2">
                  <span className="text-lg md:text-xl font-black text-loss tracking-widest uppercase">
                    DEFEAT
                  </span>
                  <span className="text-xs font-black text-muted-foreground bg-surface-deep border border-loss/30 px-3 py-1 rounded-full uppercase tracking-wider">
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
              onClick={onClose}
              className={cn(
                "result-close-btn h-12 px-12 text-foreground font-black uppercase tracking-widest active:scale-95 transition-all w-full sm:w-auto rounded-lg border",
                isRankUp
                  ? "bg-gradient-to-r from-win via-win to-win hover:from-win hover:to-win border-win/40 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                  : "bg-gradient-to-r from-neon-blue via-neon-blue to-neon-blue hover:from-neon-blue hover:to-neon-blue border-neon-blue/40 glow-primary"
              )}
            >
              {closeLabel}
            </Button>
          </div>

        </div>
      </div>
    );
}

// 보너스/패널티 목록 — 각 배지를 누르면 설명이 토글로 펼쳐지고 다시 누르면 접힘.
function RewardList({ rewards, isLosing }: {
  rewards: { id: string; icon: string; label: string; value: number; desc?: string }[];
  isLosing: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rewards || rewards.length === 0) return null;
  const openItem = open ? rewards.find((r) => r.id === open) : null;
  return (
    <div className={cn("relative z-10 border-t pt-2 mt-0.5", isLosing ? "border-loss/10" : "border-neon-blue/10")}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
        {isLosing ? "변동 상세 내역" : "획득 보너스"}
        <span className="ml-1 normal-case tracking-normal text-muted-foreground/60">· 항목을 누르면 설명</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {rewards.map((item) => {
          const isNegative = item.value < 0;
          const isOpen = open === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpen(isOpen ? null : item.id)}
              className={cn(
                "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border transition-all active:scale-95 cursor-pointer",
                isNegative ? "bg-loss/10 text-loss border-loss/20" : "bg-neon-blue/10 text-neon-blue border-neon-blue/20",
                isOpen && "ring-1 ring-inset ring-current"
              )}
            >
              <span>{item.icon} {item.label}</span>
              <span className={cn("font-mono", isNegative ? "text-loss" : "text-neon-blue")}>
                {isNegative ? "" : "+"}{item.value}
              </span>
            </button>
          );
        })}
      </div>
      {openItem?.desc && (
        <div className="mt-1.5 rounded-md border border-border/40 bg-surface-deep px-2 py-1.5 text-[10px] leading-relaxed text-soft animate-in fade-in slide-in-from-top-1 duration-150">
          <b className={cn(openItem.value < 0 ? "text-loss" : "text-neon-blue")}>{openItem.icon} {openItem.label}</b>
          <span className="mx-1 text-muted-foreground/50">—</span>
          {openItem.desc}
          <span className="ml-1 font-mono text-muted-foreground">({openItem.value < 0 ? "" : "+"}{openItem.value} RP)</span>
        </div>
      )}
    </div>
  );
}

export function getTierLabelInKorean(tier: string): string {
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
  
  // 패배: 완전 무채색(실버 오해) 대신 티어 색은 유지하고 채도·투명도만 낮춰 "패배" 표시.
  const filterCls = isLosing
    ? "saturate-50 opacity-70"
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
          "flex items-center justify-center rounded-lg border border-neon-blue/20 bg-surface-deep font-black text-xs text-neon-blue select-none uppercase tracking-tighter shrink-0",
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
