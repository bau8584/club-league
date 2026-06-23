import { useMemo, useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "./TierBadge";
import { GenderMark } from "./GenderMark";
import { cn } from "@/lib/utils";
import {
  Swords,
  Target,
  Sparkles,
  AlertCircle,
  X,
  Dices,
  Building2,
  ArrowRight,
  Users,
  RotateCcw,
  UserCheck,
  UserPlus,
  ChevronDown
} from "lucide-react";
import type { Student, Match } from "@/lib/league-types";
import { getTier } from "@/lib/league-types";
import { useLeagueStore } from "@/lib/league-store";
import { toast } from "sonner";

type Selection = { grade: number | null; classNum: number | null; studentId: string | null };

// 표시 이름 헬퍼: 별명 > 표시이름 > 본명
const displayNameOf = (s: Student) => s.displayName || s.nickname || s.name;
// 레벨 라벨 헬퍼 (미지정 시 표기)
const groupLabelOf = (s: Student) => s.group || "레벨 미지정";

// 예상 RP 미리보기 — 세련된 승/패 배지 (값은 예상 추정치)
function RpPreview({ win, loss }: { win: number; loss: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-sky-300 ring-1 ring-inset ring-sky-500/20">
        <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">승</span>
        <span className="font-mono text-xs font-bold tabular-nums">+{win}</span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-rose-300 ring-1 ring-inset ring-rose-500/20">
        <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">패</span>
        <span className="font-mono text-xs font-bold tabular-nums">{loss}</span>
      </span>
      <span className="text-[9px] text-soft">예상 추정치</span>
    </div>
  );
}

// 키워드 태그 — 클릭하면 아래에 설명이 펼쳐지는 아코디언
function TagAccordion({ tags, leading }: { tags: { label: string; style: string; desc: string }[]; leading?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {leading}
        {tags.map((tag) => (
          <button
            key={tag.label}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(open === tag.label ? null : tag.label); }}
            className={cn("inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-bold transition-all", tag.style, open === tag.label && "ring-1 ring-inset ring-white/40")}
          >
            {tag.label}
            <ChevronDown className={cn("size-2.5 transition-transform", open === tag.label && "rotate-180")} />
          </button>
        ))}
      </div>
      {open && (
        <div className="rounded-md border border-surface-line bg-surface-deep px-2.5 py-1.5 text-[10px] leading-relaxed text-strong animate-in fade-in slide-in-from-top-1 duration-150">
          {tags.find((t) => t.label === open)?.desc}
        </div>
      )}
    </div>
  );
}

const TIER_RANK_MAP: Record<string, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5
};

export function MatchRecommend({
  students,
  matches,
  onSelectRecommendedMatch,
  sel,
  onSelChange,
  mode,
  onModeChange,
  thresholds,
  onUpdateGender,
  isStudentView = false,
  isReadOnly = false,
}: {
  students: Student[];
  matches: Match[];
  onSelectRecommendedMatch: (
    playerAId: string,
    playerBId: string,
    playerA2Id?: string,
    playerB2Id?: string,
    matchType?: "single" | "double"
  ) => void;
  sel: Selection;
  onSelChange: (s: Selection) => void;
  // 동호회: "class" = 같은 레벨, "otherClass" = 다른 레벨 (기존 prop 시그니처 호환 유지)
  mode: "class" | "otherClass" | "otherGrade";
  onModeChange: (m: "class" | "otherClass" | "otherGrade") => void;
  targetGrade?: number | null;
  onTargetGradeChange?: (g: number | null) => void;
  targetClass?: number | null;
  onTargetClassChange?: (c: number | null) => void;
  thresholds?: Record<string, number>;
  onUpdateGender?: (studentId: string, gender: "M" | "F" | "U") => void;
  isStudentView?: boolean;
  isReadOnly?: boolean;
}) {
  const { dynamicBonuses, dynamicPenalties, tiers } = useLeagueStore();

  // Local states for MatchRecommend 2.0
  const [gameType, setGameType] = useState<"single" | "double">("double");
  const [selectedTeammateId, setSelectedTeammateId] = useState<string | null>(null);

  // 동호회: 다른 레벨 매칭 시 대상 레벨(문자열). 학년/반 숫자 prop 대신 로컬 상태로 관리.
  const [targetGroup, setTargetGroup] = useState<string | null>(null);

  // "다른 레벨"가 아닐 땐 대상 레벨 선택 해제
  useEffect(() => {
    if (mode !== "otherClass") setTargetGroup(null);
  }, [mode]);

  // Active analysis player profile
  const player = students.find((s) => s.id === sel.studentId) ?? null;

  // 성별 정보 누락 자동 완성을 위한 상태
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [genderTargetId, setGenderTargetId] = useState<string | null>(null);

  // A선수 선택 시 성별이 "U"이거나 없을 때 모달 팝업 트리거
  useEffect(() => {
    if (sel.studentId) {
      const selectedStudent = students.find((s) => s.id === sel.studentId);
      if (selectedStudent && (selectedStudent.gender === "U" || !selectedStudent.gender)) {
        setGenderTargetId(selectedStudent.id);
        setGenderModalOpen(true);
      }
    }
  }, [sel.studentId, students]);

  // 성별 보완 모달 트리거 (Teammate 선택 시에도 성별 체크)
  useEffect(() => {
    if (selectedTeammateId) {
      const partner = students.find((s) => s.id === selectedTeammateId);
      if (partner && (partner.gender === "U" || !partner.gender)) {
        setGenderTargetId(partner.id);
        setGenderModalOpen(true);
      }
    }
  }, [selectedTeammateId, students]);

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
      if (sel.studentId === genderTargetId) {
        onSelChange({ ...sel, studentId: null });
      }
      if (selectedTeammateId === genderTargetId) {
        setSelectedTeammateId(null);
      }
    }
    setGenderModalOpen(false);
    setGenderTargetId(null);
    toast.warning("성별을 입력하지 않아 선수 선택이 취소되었습니다.");
  };

  // 1. 레벨(group) 옵션 목록 — 선수 명단에 존재하는 distinct group 값
  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.group) set.add(s.group);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  // 선택 단계: 레벨별 선수 목록
  const groupsForSel = availableGroups;

  // 선택 UI용 로컬 레벨 상태 (null = 전체)
  const [pickGroup, setPickGroup] = useState<string | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  // 복식 팀원 직접 검색
  const [teammateSearch, setTeammateSearch] = useState("");

  const rosterForPickGroup = useMemo(() => {
    if (pickGroup == null) return [];
    return students
      .filter((s) => (s.group || null) === pickGroup)
      .sort((a, b) => b.rp - a.rp);
  }, [students, pickGroup]);

  // 경기기록 입력과 동일한 선택 UI용: 레벨(null=전체) + 닉네임 검색으로 필터
  const pickRoster = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return students
      .filter((s) => (pickGroup == null ? true : (s.group || null) === pickGroup))
      .filter((s) => {
        if (!q) return true;
        const n = (s.name || "").toLowerCase();
        const nk = (s.nickname || "").toLowerCase();
        return n.includes(q) || nk.includes(q);
      })
      .sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "ko"));
  }, [students, pickGroup, pickSearch]);

  // 랜덤 레벨 선택 (다른 레벨 도전)
  const handleRandomGroup = () => {
    if (!player) return;
    const otherGroups = availableGroups.filter((g) => g !== (player.group || null));
    if (otherGroups.length === 0) {
      toast.warning("도전할 수 있는 다른 레벨 데이터가 명단에 없습니다.");
      return;
    }
    const rand = otherGroups[Math.floor(Math.random() * otherGroups.length)];
    setTargetGroup(rand);
    toast.success(`🎲 주사위를 굴려 [${rand}] 레벨를 매칭 범위로 선택했습니다!`);
  };

  // Compile player matches histories
  const playerMatches = useMemo(() => {
    if (!player) return [];
    return matches
      .filter((m) => m.playerAId === player.id || m.playerBId === player.id || m.playerA2Id === player.id || m.playerB2Id === player.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [player, matches]);

  // Compile set of player's recent opponents (last 5 matches)
  const recentOpponentIds = useMemo(() => {
    const set = new Set<string>();
    if (!player) return set;
    playerMatches.slice(0, 5).forEach((m) => {
      const isOnTeamA = m.playerAId === player.id || m.playerA2Id === player.id;
      const oppIds = isOnTeamA
        ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[]
        : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
      oppIds.forEach(id => set.add(id));
    });
    return set;
  }, [player, playerMatches]);

  // Compile set of strict excluded opponents (last 2 matches opponents + self)
  const strictExcludedIds = useMemo(() => {
    const set = new Set<string>();
    if (!player) return set;
    set.add(player.id);
    playerMatches.slice(0, 2).forEach((m) => {
      const isOnTeamA = m.playerAId === player.id || m.playerA2Id === player.id;
      const oppIds = isOnTeamA
        ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[]
        : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
      oppIds.forEach(id => set.add(id));
    });
    return set;
  }, [player, playerMatches]);

  // helper function for calculating expected RP win/loss preview
  const getExpectedDelta = (
    subject: Student,
    opp1: Student,
    isWon: boolean,
    partner: Student | null = null,
    opp2: Student | null = null
  ): number => {
    const isDouble = partner !== null && opp2 !== null;
    const playerTier = getTier(subject.rp, thresholds);
    const tierKey = playerTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';

    const baseWin = tiers?.[tierKey]?.winRp ?? 10;
    const baseLoss = tiers?.[tierKey]?.loseRp ?? 20;

    const TIER_NUM: Record<string, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
    const myTierNum = TIER_NUM[playerTier] ?? 0;

    const maxOppRp = isDouble && opp2 ? Math.max(opp1.rp, opp2.rp) : opp1.rp;
    const maxOppTier = getTier(maxOppRp, thresholds);
    const maxOppTierNum = TIER_NUM[maxOppTier] ?? 0;
    const tierDiff = maxOppTierNum - myTierNum;

    if (isWon) {
      let bonus = 0;

      // Underdog victory check
      if (dynamicBonuses?.underdogEnabled) {
        if (tierDiff === 1) {
          bonus += dynamicBonuses.underdogDiff1Rp ?? 5;
        } else if (tierDiff === 2) {
          bonus += dynamicBonuses.underdogDiff2Rp ?? 10;
        } else if (tierDiff >= 3) {
          bonus += dynamicBonuses.underdogDiff3Rp ?? 15;
        }
      }

      // Freshness bonus
      const isFresh = !recentOpponentIds.has(opp1.id) && (!opp2 || !recentOpponentIds.has(opp2.id));
      if (dynamicBonuses?.freshnessEnabled && isFresh) {
        bonus += dynamicBonuses.freshnessRp ?? 5;
      }

      // Win streak bonus
      if (dynamicBonuses?.streakEnabled && playerTier !== "Platinum" && playerTier !== "Diamond") {
        const preStreak = subject.currentStreak ?? 0;
        const targetStreak = dynamicBonuses.streakWins ?? 3;
        if (preStreak + 1 >= targetStreak) {
          bonus += dynamicBonuses.streakRp ?? 10;
        }
      }

      // First Win of the day
      const today = new Date();
      const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (dynamicBonuses?.firstWinEnabled && subject.lastWinDate !== todayYmd) {
        bonus += dynamicBonuses.firstWinRp ?? 15;
      }

      // Revenge bonus
      if (dynamicBonuses?.revengeEnabled) {
        const sRecentMatches = playerMatches.slice(0, 20);
        const hasPastLoss = sRecentMatches.some((m) => {
          const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
          const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
          const mAWon = m.scoreA > m.scoreB;

          const sIsOnA = mTeamA.includes(subject.id);
          const sIsOnB = mTeamB.includes(subject.id);
          const lost = (sIsOnA && !mAWon) || (sIsOnB && mAWon);

          const oppIds = isDouble && opp2 ? [opp1.id, opp2.id] : [opp1.id];
          const facedAnyOpp = mTeamA.some(id => oppIds.includes(id)) || mTeamB.some(id => oppIds.includes(id));
          return lost && facedAnyOpp;
        });
        if (hasPastLoss) {
          bonus += dynamicBonuses.revengeRp ?? 10;
        }
      }

      // Will of Steel (불굴의 의지)
      if (dynamicBonuses?.willOfSteelEnabled) {
        const preStreak = subject.currentStreak ?? 0;
        if (preStreak <= -3) {
          const lossesCount = Math.abs(preStreak);
          if (lossesCount === 3) {
            bonus += dynamicBonuses.willOfSteel3Rp ?? 10;
          } else if (lossesCount === 4) {
            bonus += dynamicBonuses.willOfSteel4Rp ?? 15;
          } else if (lossesCount >= 5) {
            bonus += dynamicBonuses.willOfSteel5Rp ?? 20;
          }
        }
      }

      // Mentoring bonus
      if (isDouble && partner && dynamicBonuses?.mentoring?.enabled) {
        const partnerTier = getTier(partner.rp, thresholds);
        const myTierRank = TIER_RANK_MAP[playerTier] ?? 1;
        const partnerTierRank = TIER_RANK_MAP[partnerTier] ?? 1;
        const minGap = dynamicBonuses.mentoring.minTierGap ?? 1;
        const gap = Math.abs(myTierRank - partnerTierRank);
        if (gap >= minGap) {
          if (myTierRank > partnerTierRank) {
            bonus += dynamicBonuses.mentoring.mentorRp ?? 10;
          } else if (myTierRank < partnerTierRank) {
            bonus += dynamicBonuses.mentoring.menteeRp ?? 15;
          }
        }
      }

      // Great match bonus (hypothesized 1-point diff tight match victory)
      if (dynamicBonuses?.greatMatchEnabled) {
        bonus += dynamicBonuses.greatMatchWin1Rp ?? 10;
      }

      return baseWin + bonus;
    } else {
      let penalty = 0;

      // Freshness bonus (for loss too!)
      const isFresh = !recentOpponentIds.has(opp1.id) && (!opp2 || !recentOpponentIds.has(opp2.id));
      const freshnessBonus = (dynamicBonuses?.freshnessEnabled && isFresh) ? (dynamicBonuses.freshnessRp ?? 5) : 0;

      // Loss Comfort (꺾이지 않는 마음)
      let lossComfortBonus = 0;
      if (dynamicBonuses?.lossComfortEnabled) {
        const maxTier = dynamicBonuses.lossComfortMaxTier || "Gold";
        const maxTierRank = TIER_NUM[maxTier] ?? 2;
        if (myTierNum <= maxTierRank) {
          const preStreak = subject.currentStreak ?? 0;
          const currentLossStreak = preStreak <= 0 ? Math.abs(preStreak) + 1 : 1;
          if (currentLossStreak >= 2) {
            lossComfortBonus = dynamicBonuses.lossComfortRp ?? 5;
          }
        }
      }

      // Swamp penalty
      if (dynamicPenalties?.lossStreak) {
        const preStreak = subject.currentStreak ?? 0;
        const currentLossStreak = preStreak <= 0 ? Math.abs(preStreak) + 1 : 1;
        if (currentLossStreak >= 2) {
          if (currentLossStreak === 2) {
            if (playerTier === "Gold") penalty += dynamicPenalties.swampGold2 ?? 5;
            else if (playerTier === "Platinum") penalty += dynamicPenalties.swampPlatinum2 ?? 10;
            else if (playerTier === "Diamond") penalty += dynamicPenalties.swampDiamond2 ?? 15;
          } else if (currentLossStreak >= 3) {
            if (playerTier === "Gold") penalty += dynamicPenalties.swampGold3 ?? 10;
            else if (playerTier === "Platinum") penalty += dynamicPenalties.swampPlatinum3 ?? 15;
            else if (playerTier === "Diamond") penalty += dynamicPenalties.swampDiamond3 ?? 25;
          }
        }
      }

      // Champion Weight penalty
      if (dynamicPenalties?.championWeight) {
        if (playerTier === "Gold") penalty += dynamicPenalties.championGold ?? 5;
        else if (playerTier === "Platinum") penalty += dynamicPenalties.championPlatinum ?? 10;
        else if (playerTier === "Diamond") penalty += dynamicPenalties.championDiamond ?? 15;
      }

      // Arrogance penalty
      if (dynamicPenalties?.arrogance && myTierNum - maxOppTierNum >= 2) {
        if (playerTier === "Gold") penalty += dynamicPenalties.arroganceGold ?? 20;
        else if (playerTier === "Platinum") penalty += dynamicPenalties.arrogancePlatinum ?? 30;
        else if (playerTier === "Diamond") penalty += dynamicPenalties.arroganceDiamond ?? 40;
      }

      // Revenge Fail penalty (opponent successfully revenges)
      if (dynamicPenalties?.revengeFail) {
        const sRecentMatches = playerMatches.slice(0, 20);
        const opponentIds = isDouble && opp2 ? [opp1.id, opp2.id] : [opp1.id];
        const subjectWonPastMatch = sRecentMatches.some((m) => {
          const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
          const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
          const mAWon = m.scoreA > m.scoreB;

          const sIsOnA = mTeamA.includes(subject.id);
          const sIsOnB = mTeamB.includes(subject.id);
          const subjectWon = (sIsOnA && mAWon) || (sIsOnB && !mAWon);

          const facedAnyOpp = mTeamA.some(id => opponentIds.includes(id)) || mTeamB.some(id => opponentIds.includes(id));
          return subjectWon && facedAnyOpp;
        });
        if (subjectWonPastMatch) {
          if (playerTier === "Gold") penalty += dynamicPenalties.revengeAllowedGold ?? 10;
          else if (playerTier === "Platinum") penalty += dynamicPenalties.revengeAllowedPlatinum ?? 15;
          else if (playerTier === "Diamond") penalty += dynamicPenalties.revengeAllowedDiamond ?? 20;
        }
      }

      // Great match bonus (hypothesized 1-point diff tight match defeat)
      let greatMatchBonus = 0;
      if (dynamicBonuses?.greatMatchEnabled) {
        greatMatchBonus = dynamicBonuses.greatMatchLose1Rp ?? 5;
      }

      return -baseLoss + freshnessBonus + lossComfortBonus + greatMatchBonus - penalty;
    }
  };

  // ----------------------------------------------------
  // [단식 추천 엔진]
  // ----------------------------------------------------
  const singleRecommendations = useMemo(() => {
    if (!player || gameType !== "single") return [];

    // 매칭 범위는 레벨와 무관하게 전체 회원 대상 (본인/제외 대상만 제외)
    const candidates = students.filter((s) => !strictExcludedIds.has(s.id));

    const scored = candidates.map((candidate) => {
      let score = 100;

      const rpGap = Math.abs(candidate.rp - player.rp);

      // 1. RP proximity
      if (rpGap <= 150) {
        score += (150 - rpGap);
      } else {
        score -= (rpGap - 150) * 0.5;
      }

      // 3. Upward challenge incentive
      const rpDelta = candidate.rp - player.rp;
      if (rpDelta >= 10 && rpDelta <= 150) score += 40;

      // 4. Freshness
      const isRecentOpp = recentOpponentIds.has(candidate.id);
      if (!isRecentOpp) score += 40;

      // 5. Low activity candidate
      const totalMatches = candidate.wins + candidate.losses;
      if (totalMatches < 5) score += 25;

      // Tag determination
      const playerTier = getTier(player.rp, thresholds);
      const candidateTier = getTier(candidate.rp, thresholds);
      const playerTierIdx = TIER_RANK_MAP[playerTier] ?? 1;
      const candidateTierIdx = TIER_RANK_MAP[candidateTier] ?? 1;

      const tags: { label: string; style: string; desc: string }[] = [];

      if (!isRecentOpp) {
        tags.push({
          label: "🤝 새로운 인연",
          style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          desc: "최근 5경기 동안 만난 적이 없습니다. 승패 무관하게 신선도 보너스를 받습니다."
        });
      }
      if (candidateTierIdx - playerTierIdx >= 2) {
        tags.push({
          label: "🔥 언더독의 반란",
          style: "bg-rose-500/15 text-rose-400 border-rose-500/30",
          desc: "상대가 2티어 높습니다. 승리 시 막대한 보너스를 얻습니다."
        });
      }
      if (rpGap <= 80) {
        tags.push({
          label: "⚔️ 명승부 예상",
          style: "bg-neon-blue/15 text-neon-blue border-neon-blue/30",
          desc: "RP가 비슷하여 1~2점 차 접전이 예상됩니다."
        });
      }
      if (totalMatches < 5) {
        tags.push({
          label: "🌱 교류 환영",
          style: "bg-purple-500/15 text-purple-400 border-purple-500/30",
          desc: "최근 경기 수가 적은 회원입니다. 함께 플레이하며 리그를 활성화해주세요."
        });
      }

      return {
        student: candidate,
        score: Math.max(0, Math.round(score)),
        tags
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [player, students, gameType, strictExcludedIds, mode, targetGroup, thresholds, recentOpponentIds]);

  // ----------------------------------------------------
  // [복식 1단계: 팀원 추천 엔진]
  // ----------------------------------------------------
  const partnerRecommendations = useMemo(() => {
    if (!player || gameType !== "double") return [];

    // 파트너 후보: 레벨와 무관하게 본인 제외 전원. (추천은 점수순 정렬, 검색으로 직접 선택도 가능)
    const candidates = students.filter((s) => s.id !== player.id);

    // Partner history (last 5 double matches)
    const recentPartnerIds = new Set<string>();
    const doubleMatches = playerMatches.filter(m => m.matchType === "double");
    doubleMatches.slice(0, 5).forEach((m) => {
      const isOnTeamA = m.playerAId === player.id || m.playerA2Id === player.id;
      const partnerId = isOnTeamA
        ? (m.playerAId === player.id ? m.playerA2Id : m.playerAId)
        : (m.playerBId === player.id ? m.playerB2Id : m.playerBId);
      if (partnerId) recentPartnerIds.add(partnerId);
    });

    const scored = candidates.map((candidate) => {
      let score = 100;

      const playerTier = getTier(player.rp, thresholds);
      const candidateTier = getTier(candidate.rp, thresholds);
      const playerTierRank = TIER_RANK_MAP[playerTier] ?? 1;
      const partnerTierRank = TIER_RANK_MAP[candidateTier] ?? 1;

      // Mentoring bonus check
      const minGap = dynamicBonuses?.mentoring?.minTierGap ?? 1;
      const gap = Math.abs(playerTierRank - partnerTierRank);
      const isMentoring = !!(dynamicBonuses?.mentoring?.enabled && gap >= minGap);

      // Partner freshness
      const isFreshPartner = !recentPartnerIds.has(candidate.id);

      const tags: { label: string; style: string; desc: string }[] = [];

      if (isMentoring) {
        score += 50;
        tags.push({
          label: "🎓 멘토링 확정",
          style: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          desc: `티어 격차가 멘토링 조건(최소 ${minGap}단계)을 만족하여 승리 시 멘토링 보너스를 획득합니다.`
        });
      }

      if (isFreshPartner) {
        score += 40;
        tags.push({
          label: "✨ 신선한 파트너",
          style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          desc: "최근 경기 동안 같은 팀으로 호흡을 맞춘 적이 없는 파트너입니다."
        });
      }

      // Proximity index gap (balanced skill)
      const rpDiff = Math.abs(player.rp - candidate.rp);
      if (rpDiff <= 150) score += (150 - rpDiff) * 0.2;

      return {
        student: candidate,
        score: Math.max(0, Math.round(score)),
        tags
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }, [player, students, gameType, playerMatches, thresholds, dynamicBonuses]);

  // ----------------------------------------------------
  // [복식 2단계: 상대 팀 매칭 엔진]
  // ----------------------------------------------------
  const doubleOpponentRecommendations = useMemo(() => {
    if (!player || !selectedTeammateId || gameType !== "double") return [];

    const partner = students.find((s) => s.id === selectedTeammateId);
    if (!partner) return [];

    const ourCombinedRp = player.rp + partner.rp;

    // Opponent candidates pool — 레벨와 무관하게 전체 (본인/파트너 제외)
    const oppCandidates = students.filter((s) => s.id !== player.id && s.id !== partner.id);

    if (oppCandidates.length < 2) return [];

    // Generate opponent pairs
    const pairs: { o1: Student; o2: Student; combinedRp: number; rpGap: number; score: number; tags?: { label: string; style: string; desc: string }[] }[] = [];

    for (let i = 0; i < oppCandidates.length; i++) {
      for (let j = i + 1; j < oppCandidates.length; j++) {
        const o1 = oppCandidates[i];
        const o2 = oppCandidates[j];

        const combinedRp = o1.rp + o2.rp;
        const rpGap = Math.abs(ourCombinedRp - combinedRp);

        let score = 100;

        // RP gap penalty
        score -= rpGap * 1.5;

        // Freshness: check if either opponent has played against us recently
        const playedRecently = playerMatches.slice(0, 5).some((m) => {
          const ids = [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id];
          return ids.includes(o1.id) || ids.includes(o2.id);
        });
        if (!playedRecently) score += 35;

        // Balanced internal matchmaking
        const internalGap = Math.abs(o1.rp - o2.rp);
        if (internalGap <= 150) score += 20;

        // Tags
        const tags: { label: string; style: string; desc: string }[] = [];
        if (!playedRecently) {
          tags.push({
            label: "🤝 새로운 인연",
            style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            desc: "최근 5경기 동안 이 상대팀원과 만난 적이 없습니다. 승패 무관하게 신선도 보너스를 받습니다."
          });
        }

        const maxOppRp = Math.max(o1.rp, o2.rp);
        const maxOppTier = getTier(maxOppRp, thresholds);
        const myTier = getTier(player.rp, thresholds);
        const TIER_NUM: Record<string, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
        const myTierNum = TIER_NUM[myTier] ?? 0;
        const maxOppTierNum = TIER_NUM[maxOppTier] ?? 0;
        if (maxOppTierNum - myTierNum >= 2) {
          tags.push({
            label: "🔥 언더독의 반란",
            style: "bg-rose-500/15 text-rose-400 border-rose-500/30",
            desc: "상대 팀에 본인보다 2티어 이상 높은 강자가 포함되어 있습니다. 승리 시 막대한 보너스를 얻습니다."
          });
        }

        if (rpGap <= 40) {
          tags.push({
            label: "⚔️ 명승부 예상",
            style: "bg-neon-blue/15 text-neon-blue border-neon-blue/30",
            desc: "팀 합산 RP 격차가 40점 이하로 대등합니다. 치열한 접전이 예상됩니다."
          });
        }

        if (o1.wins + o1.losses < 5 || o2.wins + o2.losses < 5) {
          tags.push({
            label: "🌱 교류 환영",
            style: "bg-purple-500/15 text-purple-400 border-purple-500/30",
            desc: "최근 경기 수가 적은 회원이 포함된 팀입니다. 함께 플레이하며 리그를 활성화해주세요."
          });
        }

        pairs.push({
          o1,
          o2,
          combinedRp,
          rpGap,
          score: Math.max(0, Math.round(score)),
          tags
        });
      }
    }

    return pairs
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [player, selectedTeammateId, students, gameType, mode, targetGroup, playerMatches, thresholds, recentOpponentIds, dynamicBonuses]);

  const showPromptToSelect = useMemo(() => {
    if (!player) return false;
    return false;
  }, [player]);

  const selectedTeammate = useMemo(() => {
    return students.find((s) => s.id === selectedTeammateId) ?? null;
  }, [selectedTeammateId, students]);

  // 팀원 검색 필터 (추천 점수순은 유지하되, 닉네임으로 직접 찾아 선택 가능)
  const filteredPartners = useMemo(() => {
    const q = teammateSearch.trim().toLowerCase();
    if (!q) return partnerRecommendations;
    return partnerRecommendations.filter((c) => {
      const n = (c.student.name || "").toLowerCase();
      const nk = (c.student.nickname || "").toLowerCase();
      return n.includes(q) || nk.includes(q);
    });
  }, [partnerRecommendations, teammateSearch]);

  // 매칭 범위는 레벨와 무관하게 전체 회원
  const scopeLabel = "전체 회원";

  return (
    <div className="space-y-6">

      {/* 1. 회원 선택 (외곽 박스/제목 제거) */}
      <div className="space-y-4">
        {player && !isStudentView && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                onSelChange({ grade: sel.grade, classNum: sel.classNum, studentId: null });
                setSelectedTeammateId(null);
              }}
              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-soft hover:text-strong hover:bg-surface-panel border border-surface-line transition-all font-bold"
            >
              <RotateCcw className="size-3" /> 선수 초기화
            </button>
          </div>
        )}

        {/* Compact selectors (only visible if not student view) */}
        {!isStudentView && !player && (
          <div className="flex flex-col gap-3 bg-surface-panel p-3 sm:p-4 rounded-xl border border-surface-line">
            <div className="text-xs text-soft font-bold uppercase tracking-wider">매치 추천 대상 회원을 선택하세요</div>

            {/* 검색 (레벨 위) */}
            <input
              type="text"
              value={pickSearch}
              onChange={(e) => setPickSearch(e.target.value)}
              placeholder="닉네임 검색"
              className="w-full rounded-lg border border-border/60 bg-surface-deep px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-blue/60 focus:outline-none"
            />

            {/* 레벨 칩 (null = 전체) */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              <button
                type="button"
                onClick={() => { setPickGroup(null); onSelChange({ ...sel, studentId: null }); setSelectedTeammateId(null); }}
                className={cn(
                  "h-11 rounded-xl border text-sm font-black transition-all active:scale-95 flex items-center justify-center cursor-pointer",
                  pickGroup === null
                    ? "border-neon-blue bg-neon-blue/20 text-neon-blue glow-primary"
                    : "border-surface-line bg-surface-deep text-soft hover:text-strong"
                )}
              >전체</button>
              {groupsForSel.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setPickGroup(g); onSelChange({ ...sel, studentId: null }); setSelectedTeammateId(null); }}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-black transition-all active:scale-95 flex items-center justify-center cursor-pointer",
                    pickGroup === g
                      ? "border-neon-blue bg-neon-blue/20 text-neon-blue glow-primary"
                      : "border-surface-line bg-surface-deep text-soft hover:text-strong"
                  )}
                >{g}</button>
              ))}
            </div>

            {/* 선수 타일 */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {pickRoster.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelChange({ ...sel, studentId: s.id })}
                  className={cn(
                    "relative flex min-h-[4.75rem] w-full flex-col items-center justify-between overflow-hidden rounded-lg border px-2 pt-6 pb-2.5 text-center transition-all cursor-pointer",
                    sel.studentId === s.id
                      ? "border-neon-blue bg-neon-blue/10 glow-primary"
                      : "border-border/60 bg-surface-deep hover:border-neon-blue/60 hover:bg-accent/40"
                  )}
                >
                  {s.group && (
                    <span className="absolute top-1 left-1.5 max-w-[60%] truncate text-left font-mono text-[10px] text-soft">{s.group}</span>
                  )}
                  <GenderMark gender={s.gender} className="absolute top-1 right-1.5 size-3.5 text-[9px] shrink-0" />
                  <div className="flex w-full min-w-0 flex-grow items-center justify-center">
                    <span className="w-full break-keep text-center text-sm font-bold text-strong">{displayNameOf(s)}</span>
                  </div>
                  <div className="mt-1.5 flex w-full shrink-0 justify-center"><TierBadge rp={s.rp} thresholds={thresholds} /></div>
                </button>
              ))}
              {pickRoster.length === 0 && (
                <span className="col-span-full block py-2 text-xs text-soft">선수가 없습니다</span>
              )}
            </div>
          </div>
        )}


        {/* Profile Card if student view or player selected */}
        {player && (
          <div className="rounded-xl border border-neon-blue/40 bg-surface-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] text-soft font-semibold tracking-wider uppercase">
                {groupLabelOf(player)} · 회원
              </div>
              <div className="mt-1 flex items-center gap-2 text-xl font-black text-strong">
                <GenderMark gender={player.gender} className="size-5 text-[10px]" />
                {displayNameOf(player)}
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <TierBadge rp={player.rp} thresholds={thresholds} />
                <span className="font-mono text-xs text-neon-blue font-bold">{player.rp} RP</span>
                <span className="text-[10px] text-soft font-semibold">({player.wins}승 {player.losses}패)</span>
              </div>
            </div>

            {/* Game Mode select buttons */}
            <div className="flex flex-col gap-2 min-w-[200px]">
              <span className="text-[10px] text-soft font-bold block uppercase tracking-wider">경기 모드 선택</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setGameType("single");
                    setSelectedTeammateId(null);
                  }}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-lg border font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-1",
                    gameType === "single"
                      ? "border-neon-blue bg-neon-blue/10 text-neon-blue shadow"
                      : "border-surface-line bg-surface-deep text-soft hover:text-strong"
                  )}
                >
                  <Swords className="size-3.5" /> 단식 (1v1)
                </button>
                <button
                  onClick={() => setGameType("double")}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-lg border font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-1",
                    gameType === "double"
                      ? "border-neon-green bg-neon-green/10 text-neon-green shadow"
                      : "border-surface-line bg-surface-deep text-soft hover:text-strong"
                  )}
                >
                  <Users className="size-3.5" /> 복식 (2v2)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Flat Single match recommendations */}
      {player && gameType === "single" && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-soft">추천 라이벌</h4>

          {showPromptToSelect ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-surface-line bg-surface-deep">
              <AlertCircle className="size-10 text-soft mb-2" />
              <div className="text-sm font-bold text-strong">도전 타겟이 완벽히 설정되지 않았습니다.</div>
              <p className="text-xs text-soft mt-1 max-w-sm">
                상단 범위 필터에서 레벨를 선택하거나 🎲 랜덤 버튼을 눌러 지정해 주세요.
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-3">
              {singleRecommendations.length > 0 ? (
                singleRecommendations.map((rival, index) => {
                  const s = rival.student;
                  return (
                    <Card
                      key={s.id}
                      className="relative overflow-hidden border-surface-line bg-surface-panel p-5 backdrop-blur flex flex-col justify-between hover:border-neon-blue/50 hover:glow-primary hover:scale-[1.01] transition-all duration-300 group"
                    >
                      {/* Top Ranking Badge */}
                      <div className="absolute right-4 top-4 font-mono font-black text-3xl opacity-15 text-soft select-none group-hover:scale-110 transition-transform">
                        #{index + 1}
                      </div>

                      <div className="space-y-4">
                        {/* 프로필: 닉네임 옆에 레벨 · 티어 · 전적 */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
                          <GenderMark gender={s.gender} className="size-4 text-[9px] shrink-0" />
                          <span className="text-base font-black text-strong">{displayNameOf(s)}</span>
                          {s.group && <span className="text-[10px] text-soft">{s.group}</span>}
                          <TierBadge rp={s.rp} thresholds={thresholds} />
                          <span className="text-[10px] text-soft">{s.wins}승 {s.losses}패</span>
                        </div>

                        {/* RP 정보: RP값 + 예상 승/패(추정치) */}
                        {(() => {
                          const expectedWin = getExpectedDelta(player, s, true);
                          const expectedLoss = getExpectedDelta(player, s, false);
                          return (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
                              <span className="font-mono text-xs font-bold text-neon-blue">{s.rp} RP</span>
                              <RpPreview win={expectedWin} loss={expectedLoss} />
                            </div>
                          );
                        })()}

                        {/* 키워드 — 클릭 시 아래에 설명 펼침 */}
                        {rival.tags.length > 0 && <TagAccordion tags={rival.tags} />}
                      </div>

                      {/* Action Button */}
                      {isStudentView ? (
                        <div className="mt-5 w-full text-center py-2 rounded-lg border border-neon-blue/30 bg-neon-blue/5 text-neon-blue text-xs font-black tracking-wide">
                          추천 라이벌
                        </div>
                      ) : isReadOnly ? (
                        <div className="mt-5 w-full text-center py-2 rounded-lg border border-surface-line bg-surface-panel text-soft text-xs font-bold tracking-wide">
                          경기하기 (읽기 전용)
                        </div>
                      ) : (
                        <Button
                          onClick={() => onSelectRecommendedMatch(player.id, s.id, undefined, undefined, "single")}
                          className="mt-5 w-full bg-gradient-to-r from-neon-blue to-tier-diamond hover:opacity-90 text-slate-950 font-bold active:scale-[0.98] transition-all text-xs"
                        >
                          이 회원과 경기하기
                        </Button>
                      )}
                    </Card>
                  );
                })
              ) : (
                <Card className="col-span-3 flex flex-col items-center justify-center p-12 text-center border-dashed border-surface-line bg-surface-deep">
                  <AlertCircle className="size-10 text-soft mb-2" />
                  <div className="text-sm font-bold text-strong">추천할 수 있는 대전 상대가 없습니다.</div>
                  <p className="text-xs text-soft mt-1 max-w-sm">
                    지정된 범위에 등록된 다른 회원이 없거나 최근 2경기 이내에 치른 대결자 중복방지 필터링으로 인해 후보군이 비어 있습니다.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Double match wizard flow */}
      {player && gameType === "double" && (
        <div className="space-y-6">

          {/* Stage Progress bar */}
          <div className="flex items-center justify-center gap-2 max-w-md mx-auto py-2 bg-surface-panel rounded-full border border-surface-line shadow-sm">
            <span className={cn(
              "px-3 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1",
              selectedTeammateId == null
                ? "bg-neon-green/15 text-neon-green border border-neon-green/30"
                : "text-soft"
            )}>
              <span className="flex size-4 items-center justify-center rounded-full bg-surface-line text-[10px]">1</span>
              팀원 선택
            </span>
            <ArrowRight className="size-4 text-slate-700" />
            <span className={cn(
              "px-3 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1",
              selectedTeammateId != null
                ? "bg-neon-green/15 text-neon-green border border-neon-green/30"
                : "text-soft"
            )}>
              <span className="flex size-4 items-center justify-center rounded-full bg-surface-line text-[10px]">2</span>
              상대팀 매칭
            </span>
          </div>

          {/* Stage 1 Teammate selection view */}
          {selectedTeammateId == null ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-neon-green" />
                <h4 className="font-black text-base text-strong">👥 아군 팀원 선택</h4>
              </div>
              <p className="text-[11px] text-soft -mt-1">추천(점수순)에서 고르거나, 검색해서 원하는 팀원을 직접 선택하세요.</p>

              {/* 팀원 직접 검색 */}
              <input
                type="text"
                value={teammateSearch}
                onChange={(e) => setTeammateSearch(e.target.value)}
                placeholder="닉네임으로 팀원 검색"
                className="w-full rounded-lg border border-border/60 bg-surface-deep px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-green/60 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                {filteredPartners.length > 0 ? (
                  filteredPartners.map((cand) => {
                    const s = cand.student;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedTeammateId(s.id)}
                        className="group flex flex-col rounded-xl border border-surface-line bg-surface-panel p-3 text-left transition-all hover:border-neon-green/60 hover:bg-surface-panel active:scale-[0.98]"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <div className="truncate text-[9px] text-soft">{groupLabelOf(s)}</div>
                            <div className="mt-0.5 flex items-center gap-1 font-bold text-strong">
                              <GenderMark gender={s.gender} className="size-3.5 text-[8px] shrink-0" />
                              <span className="truncate">{displayNameOf(s)}</span>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] font-bold text-neon-green">{s.rp}</span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5">
                          <TierBadge rp={s.rp} thresholds={thresholds} />
                          <span className="text-[10px] text-soft">{s.wins}승 {s.losses}패</span>
                        </div>

                        {cand.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {cand.tags.map((tag) => (
                              <span
                                key={tag.label}
                                className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold border", tag.style)}
                                title={tag.desc}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 w-full rounded-lg border border-neon-green/20 bg-neon-green/5 py-1.5 text-center text-[11px] font-black text-neon-green transition-colors group-hover:border-neon-green/50 group-hover:bg-neon-green/10">
                          팀원으로 선택
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-2 md:col-span-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-line bg-surface-deep p-10 text-center">
                    <div className="text-sm font-bold text-strong">{teammateSearch.trim() ? "검색 결과가 없습니다." : "팀원 후보가 없습니다."}</div>
                    <p className="mt-1 text-xs text-soft">{teammateSearch.trim() ? "다른 닉네임으로 검색해 보세요." : "등록된 다른 회원이 없습니다."}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Stage 2 Opponent team auto matching view
            <div className="space-y-5">

              {/* Selected Teammate profile */}
              {selectedTeammate && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-neon-green/40 bg-neon-green/5 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-neon-green/15 border border-neon-green/30 text-neon-green shadow shrink-0">
                      <UserCheck className="size-5" />
                    </div>
                    <div>
                      <div className="text-[9px] text-soft font-bold uppercase tracking-wider">우리의 복식 팀원 확정</div>
                      <div className="text-sm font-black text-strong flex items-center gap-1.5 mt-0.5">
                        {displayNameOf(player)} & {displayNameOf(selectedTeammate)}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-soft">팀 합산 RP:</span>
                        <span className="font-mono text-xs text-neon-green font-bold">{player.rp + selectedTeammate.rp} RP</span>
                        <span className="text-soft">|</span>
                        <TierBadge rp={selectedTeammate.rp} thresholds={thresholds} />
                        <span className="text-[10px] text-soft">({displayNameOf(selectedTeammate)})</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedTeammateId(null)}
                    className="h-8 px-3.5 rounded-lg border border-surface-line bg-surface-deep text-soft hover:text-strong hover:bg-surface-panel text-xs font-black tracking-wide flex items-center gap-1 transition-all active:scale-95 shrink-0"
                  >
                    <RotateCcw className="size-3.5" /> 파트너 변경
                  </button>
                </div>
              )}

              {/* Opponent list */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-soft">상대팀 추천</h4>

                {showPromptToSelect ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-surface-line bg-surface-deep">
                    <AlertCircle className="size-10 text-soft mb-2" />
                    <div className="text-sm font-bold text-strong">도전 타겟이 완벽히 설정되지 않았습니다.</div>
                    <p className="text-xs text-soft mt-1 max-w-sm">
                      상단 범위 필터에서 레벨를 지정해 주세요.
                    </p>
                  </Card>
                ) : (
                  <div className="grid gap-5 md:grid-cols-3">
                    {doubleOpponentRecommendations.length > 0 ? (
                      doubleOpponentRecommendations.map((pair, index) => {
                        const ourCombined = player.rp + selectedTeammate!.rp;
                        const delta = pair.combinedRp - ourCombined;
                        const sign = delta > 0 ? `+${delta}` : `${delta}`;

                        // Analysis message
                        let analysis = "";
                        if (Math.abs(delta) <= 30) {
                          analysis = "합산 RP 격차가 30점 미만으로, 완벽히 대등하고 치열한 명승부가 예상되는 최고의 매칭입니다! ⚔️";
                        } else if (delta > 30) {
                          analysis = "상대 팀의 평균 전력이 약간 높습니다. 업셋을 달성하면 막대한 점수 상승을 노릴 수 있습니다! 🏆";
                        } else {
                          analysis = "우리가 전력상 우위에 있습니다. 팀워크를 발휘하여 방심하지 말고 승리를 확보하세요! 📈";
                        }

                        return (
                          <Card
                            key={`${pair.o1.id}-${pair.o2.id}`}
                            className="relative overflow-hidden border-surface-line bg-surface-panel p-5 backdrop-blur flex flex-col justify-between hover:border-neon-green/50 hover:shadow-[0_0_20px_rgba(34,197,94,0.06)] hover:scale-[1.01] transition-all duration-300 group"
                          >
                            <div className="absolute right-4 top-4 font-mono font-black text-3xl opacity-15 text-soft select-none group-hover:scale-110 transition-transform">
                              #{index + 1}
                            </div>

                            <div className="space-y-4">
                              {/* 키워드(추천 매칭팀 + 태그) — 클릭 시 아래에 설명 펼침 */}
                              <TagAccordion
                                leading={
                                  <span className="inline-flex items-center rounded bg-neon-green/15 text-neon-green border border-neon-green/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                    추천 매칭팀
                                  </span>
                                }
                                tags={pair.tags ?? []}
                              />

                              {/* 상대팀 닉네임 1행 */}
                              <div className="flex items-center gap-1.5 text-sm font-bold text-strong">
                                <GenderMark gender={pair.o1.gender} className="size-3.5 text-[8px] shrink-0" />
                                <span className="truncate">{displayNameOf(pair.o1)}</span>
                                <span className="text-soft shrink-0">&</span>
                                <GenderMark gender={pair.o2.gender} className="size-3.5 text-[8px] shrink-0" />
                                <span className="truncate">{displayNameOf(pair.o2)}</span>
                              </div>

                              {/* RP 정보 1행: 합산 · 격차 · 예상 승/패(추정치) */}
                              {(() => {
                                const expectedWin = getExpectedDelta(player, pair.o1, true, selectedTeammate, pair.o2);
                                const expectedLoss = getExpectedDelta(player, pair.o1, false, selectedTeammate, pair.o2);
                                return (
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-surface-line bg-surface-deep px-2.5 py-2 text-[11px]">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-soft">RP</span>
                                    <span className="text-soft">상대합산 <span className="font-mono font-bold text-strong">{pair.combinedRp}</span></span>
                                    <span className="text-soft">
                                      {delta === 0 ? (
                                        <span className="font-bold text-strong">우리와 동일</span>
                                      ) : (
                                        <>우리보다 <span className={cn("font-bold", delta > 0 ? "text-rose-400" : "text-emerald-400")}>{Math.abs(delta)} {delta > 0 ? "높음" : "낮음"}</span></>
                                      )}
                                    </span>
                                    <RpPreview win={expectedWin} loss={expectedLoss} />
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Action Trigger */}
                            {isStudentView ? (
                              <div className="mt-5 w-full text-center py-2 rounded-lg border border-neon-green/30 bg-neon-green/5 text-neon-green text-xs font-black tracking-wide">
                                추천 복식 라이벌
                              </div>
                            ) : isReadOnly ? (
                              <div className="mt-5 w-full text-center py-2 rounded-lg border border-surface-line bg-surface-panel text-soft text-xs font-bold tracking-wide">
                                경기하기 (읽기 전용)
                              </div>
                            ) : (
                              <Button
                                onClick={() => onSelectRecommendedMatch(player.id, pair.o1.id, selectedTeammate!.id, pair.o2.id, "double")}
                                className="mt-5 w-full bg-gradient-to-r from-neon-green to-emerald-400 hover:opacity-90 text-slate-950 font-bold active:scale-[0.98] transition-all text-xs"
                              >
                                이 팀과 경기하기
                              </Button>
                            )}
                          </Card>
                        );
                      })
                    ) : (
                      <Card className="col-span-3 flex flex-col items-center justify-center p-12 text-center border-dashed border-surface-line bg-surface-deep">
                        <AlertCircle className="size-10 text-soft mb-2" />
                        <div className="text-sm font-bold text-strong">매칭 가능한 상대 팀이 없습니다.</div>
                        <p className="text-xs text-soft mt-1 max-w-sm">
                          지정 범위 내에 등록된 회원이 부족하거나 팀원과 아군을 제외한 선수 데이터가 모자랍니다.
                        </p>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 성별 정보 보완 팝업창 (MatchRecommend) */}
      {genderModalOpen && genderTargetId && (() => {
        const targetStudent = students.find((s) => s.id === genderTargetId);
        if (!targetStudent) return null;
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-md overflow-hidden border border-neon-blue/30 bg-background/95 rounded-2xl p-6 md:p-8 glow-primary flex flex-col items-center animate-in zoom-in duration-300">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.2)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />

              <button
                onClick={handleCancelGender}
                className="absolute right-4 top-4 text-soft hover:text-strong hover:bg-surface-panel p-1.5 rounded-lg transition-all"
                title="취소 및 뒤로가기"
              >
                <X className="size-5" />
              </button>

              <div className="relative z-10 flex flex-col items-center text-center w-full">
                <div className="flex size-14 items-center justify-center rounded-full bg-neon-blue/15 border border-neon-blue/30 text-neon-blue glow-primary mb-4 animate-pulse">
                  <Sparkles className="size-6 text-neon-blue" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-wider text-neon-blue mb-1">
                  선수 성별 정보 보완
                </h3>
                <p className="text-xs text-soft max-w-sm mb-6 leading-relaxed">
                  <span className="font-bold text-strong">[{displayNameOf(targetStudent)}]</span> 회원의 성별 정보(M/F)가 지정되지 않았습니다.<br />
                  매치를 정확하게 추천하기 위해 성별을 입력해주세요.
                </p>
              </div>

              <div className="relative z-10 grid grid-cols-2 gap-4 w-full">
                <button
                  onClick={() => handleUpdateGender("M")}
                  className="flex flex-col items-center justify-center p-5 rounded-xl border border-neon-blue/30 bg-neon-blue/5 hover:bg-neon-blue/15 hover:border-neon-blue/60 transition-all active:scale-95 group glow-primary"
                >
                  <span className="text-4xl mb-2 group-hover:animate-bounce text-neon-blue">♂</span>
                  <span className="text-sm font-black text-neon-blue tracking-wider">남성 (M)</span>
                  <span className="text-[10px] text-soft mt-1">Male Athlete</span>
                </button>

                <button
                  onClick={() => handleUpdateGender("F")}
                  className="flex flex-col items-center justify-center p-5 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/15 hover:border-rose-500/60 transition-all active:scale-95 group shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                >
                  <span className="text-4xl mb-2 group-hover:animate-bounce text-rose-400">♀</span>
                  <span className="text-sm font-black text-rose-400 tracking-wider">여성 (F)</span>
                  <span className="text-[10px] text-soft mt-1">Female Athlete</span>
                </button>
              </div>

              <p className="relative z-10 text-[10px] text-soft mt-6 text-center leading-relaxed">
                입력하신 성별 데이터는 클라우드 데이터베이스에 실시간 영속 동기화됩니다.
              </p>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
