import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "./TierBadge";
import { AddMemberForm } from "./AddMemberForm";
import { GenderMark } from "./GenderMark";
import { MatchResultModal, type MatchResultData, type PlayerResult } from "./MatchResultModal";
import { cn } from "@/lib/utils";
import { Trophy, X, Sparkles, User, Users, Crown, Award, Zap, RotateCcw, UserPlus, Lock, LockOpen, ChevronDown, Delete, Pencil } from "lucide-react";
import type { Student, Match, TierName } from "@/lib/league-types";
import { getTier, getTierSubdivision, TIER_ORDER, getFullTierLabel, isUnranked, schoolLabelCompact, schoolAxesOf } from "@/lib/league-types";
import { toast } from "sonner";
import { useLeagueStore } from "@/lib/league-store";
import { useLeagueTerms, useIsSchoolLeague, useGenderEnabled } from "@/lib/league-terms";
import { useSeedFromSession } from "@/lib/use-session-scope";

type Selection = { group: string | null; studentId: string | null };
// 레벨 "전체" 탭이 기본으로 열려 있도록 group을 ALL("__ALL__")로 초기화
const empty: Selection = { group: "__ALL__", studentId: null };

/** 폼의 "지금 상태"를 한 줄로 — 프리필이 채운 값과 그대로인지 비교하는 데만 쓴다. */
const slotSig = (
  a?: string | null,
  a2?: string | null,
  b?: string | null,
  b2?: string | null,
  sa?: number,
  sb?: number,
) => [a || "", a2 || "", b || "", b2 || "", sa || 0, sb || 0].join("|");

// 선수 표시 이름: 별명 우선, 없으면 이름
function playerLabel(s: Student): string {
  return s.nickname || s.name;
}

export type { PlayerResult, MatchResultData } from "./MatchResultModal";
export function RecordMatch({
  students,
  onRecord,
  initials,
  onClearInitials,
  thresholds,
  rpVariables,
  onUpdateGender,
  lockedPlayerId,
  defaultPlayerId,
  presetResult,
  onCloseResult,
  onDirtyChange,
  queueHint,
  teamsLocked,
}: {
  /** 팀이 정해진 대진(대기열·운영진 대진)의 결과 입력 — 선수·경기 방식을 못 바꾼다. 바꾸기는 대기열에서. */
  teamsLocked?: boolean;
  students: Student[];
  /** 대기열에 줄이 있으면 빈 칸 안내가 대기열 [점수 넣기]를 가리킨다(직접 고르기는 대기열 밖 경기용). */
  queueHint?: boolean;
  lockedPlayerId?: string | null; // 설정 시 슬롯 A를 이 선수로 고정(일반회원 본인 경기 기록)
  /**
   * 슬롯 A에 미리 넣어 두는 선수(운영진 본인). 잠그지 않는다 — ✕로 빼면 남의 경기다.
   * 운영진은 남의 경기도 넣어야 해서 잠글 수 없었는데, 그러다 보니 자기 경기를 넣을
   * 때마다 명단에서 자기 이름을 찾아야 했다. 기본은 나, 아니면 ✕ 한 번.
   */
  defaultPlayerId?: string | null;
  // 설정 시 입력 폼 대신 저장된 결과(영수증)를 그대로 띄우는 '뷰 전용' 모드
  presetResult?: MatchResultData | null;
  onCloseResult?: () => void;
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
  /**
   * 사람이 직접 손댄 입력이 폼에 남아 있는지 알린다.
   * 부모가 대기열 줄로 폼을 덮어쓰기 전에 물어볼 수 있어야 해서 밖으로 흘린다.
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { isSyncing, placementEnabled, placementGames, genderEnabled, isClassOwner, saveMatchBreakdown, currentClassId, assignmentSession } = useLeagueStore();
  // 오늘 출석한 사람들 — 명단에서 맨 위로 올린다.
  const presentIds = useMemo(
    () => new Set(assignmentSession?.player_ids ?? []),
    [assignmentSession],
  );
  const terms = useLeagueTerms();
  const isSchool = useIsSchoolLeague();
  // 학교 리그는 대부분 1:1 매치 위주라 단식을 기본값으로 시작한다.
  const [matchType, setMatchType] = useState<"single" | "double">(isSchool ? "single" : "double");
  const [a, setA] = useState<Selection>(empty);
  const [a2, setA2] = useState<Selection>(empty);
  const [b, setB] = useState<Selection>(empty);
  const [b2, setB2] = useState<Selection>(empty);
  // 동시에 1개의 선수 선택 picker만 펼친다(모바일 가독성). null이면 모두 닫힘.
  const [activeSlot, setActiveSlot] = useState<"A" | "A2" | "B" | "B2" | null>(null);
  // 학교 리그 선수 선택 필터(학년/반). picker는 슬롯을 고를 때마다 새로 열리므로
  // 필터를 picker 안에 두면 복식에서 4번 모두 학년·반을 다시 골라야 했다. → 부모가 들고 유지한다.
  const [pickerFilter, setPickerFilter] = useSchoolPickerFilter(students, currentClassId, lockedPlayerId, isSchool);
  // 경기 방식 고정(개인 설정). 잠겨 있으면 그 방식으로 시작하고 토글이 잠긴다.
  const [lockedMatchType, setLockedMatchType] = useMatchTypeLock(currentClassId);
  useEffect(() => {
    if (lockedMatchType) setMatchType(lockedMatchType);
  }, [lockedMatchType]);
  // initials 처리(아래)는 잠금 값 변화로 재실행되면 안 되므로 ref로 읽는다.
  const lockedMatchTypeRef = useRef(lockedMatchType);
  lockedMatchTypeRef.current = lockedMatchType;
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  // 마지막으로 프리필이 채워 넣은 상태. 지금 폼이 이것과 같으면 "사람이 손대지 않았다".
  const appliedSigRef = useRef<string>("");
  // 점수는 실시간 집계가 아니라 경기가 끝난 뒤 최종 점수를 넣는다. 그래서 가감 버튼
  // 대신 숫자패드 한 벌을 두 팀이 함께 쓴다(팀마다 도구를 두면 화면의 대부분이
  // 도구로 차고, 같은 버튼이 두 번 나와 어느 쪽을 누르는지 헷갈렸다).
  // activeScore = 지금 숫자패드가 겨냥하는 팀.
  const [activeScore, setActiveScore] = useState<"A" | "B">("A");
  // 팀을 새로 고른 직후의 첫 숫자는 기존 값에 이어 붙이지 않고 갈아끼운다.
  // 21점이 들어 있는데 5를 누르면 215가 아니라 5가 되어야 한다.
  const [scoreFresh, setScoreFresh] = useState(true);
  const selectScore = (team: "A" | "B") => {
    setActiveScore(team);
    setScoreFresh(true);
  };
  const setActiveScoreValue = (v: number) => (activeScore === "A" ? setScoreA(v) : setScoreB(v));
  const activeScoreValue = activeScore === "A" ? scoreA : scoreB;
  const pressDigit = (d: number) => {
    // 세 자리를 넘길 일이 없다. 넘치면 그냥 무시해 오입력이 쌓이지 않게 한다.
    const next = scoreFresh ? d : activeScoreValue * 10 + d;
    if (next > 999) return;
    setActiveScoreValue(next);
    setScoreFresh(false);
  };
  const pressBackspace = () => {
    setActiveScoreValue(Math.floor(activeScoreValue / 10));
    setScoreFresh(false);
  };
  const pressClear = () => {
    setActiveScoreValue(0);
    setScoreFresh(true);
  };

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [resultData, setResultData] = useState<MatchResultData | null>(null);

  // 뷰 전용: 저장된 결과가 주어지면 입력 없이 곧바로 영수증 모달을 띄운다.
  useEffect(() => {
    if (presetResult) {
      setResultData(presetResult);
      setShowModal(true);
    }
  }, [presetResult]);

  // 성별 정보 누락 자동 완성을 위한 상태
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [genderTargetId, setGenderTargetId] = useState<string | null>(null);


  // Auto-populate recommended match selections when redirected
  useEffect(() => {
    if (initials) {
      const studentA = students.find((s) => s.id === initials.playerAId);
      const studentB = students.find((s) => s.id === initials.playerBId);
      if (studentA && studentB) {
        const type = initials.matchType || "single";
        setMatchType(type);
        // 매치 추천·예약에서 넘어온 방식은 명시적 의도이므로 개인 고정보다 우선한다.
        // 고정된 방식과 다르면 토글이 잠긴 채 다른 방식이 떠 있는 모순을 피하려고 고정을 푼다.
        if (lockedMatchTypeRef.current && lockedMatchTypeRef.current !== type) setLockedMatchType(null);
        setA({ group: studentA.group ?? null, studentId: studentA.id });
        setB({ group: studentB.group ?? null, studentId: studentB.id });

        if (type === "double" && initials.playerA2Id && initials.playerB2Id) {
          const studentA2 = students.find((s) => s.id === initials.playerA2Id);
          const studentB2 = students.find((s) => s.id === initials.playerB2Id);
          if (studentA2) {
            setA2({ group: studentA2.group ?? null, studentId: studentA2.id });
          } else {
            setA2(empty);
          }
          if (studentB2) {
            setB2({ group: studentB2.group ?? null, studentId: studentB2.id });
          } else {
            setB2(empty);
          }
        } else {
          setA2(empty);
          setB2(empty);
        }
        setScoreA(0);
        setScoreB(0);
        // 선수를 한두 명 고르던 중에 대기열의 [결과 입력]을 누르면 이름 선택창이 열린
        // 채로 남았다. 대진은 이미 다 찼는데 선택창이 그 위를 덮고 있어 등록 버튼이
        // 안 보였다 — 좁은 화면에서는 대진 자체도 접혀 있어 무슨 상황인지 알 수 없었다.
        // 큐에서 온 대진은 완성된 것이므로 고르던 자리는 닫는다.
        setActiveSlot(null);
        appliedSigRef.current = slotSig(
          initials.playerAId,
          type === "double" ? initials.playerA2Id : undefined,
          initials.playerBId,
          type === "double" ? initials.playerB2Id : undefined,
          0,
          0,
        );
        setPendingScroll(true);
      }
      onClearInitials?.();
    }
  }, [initials, students, onClearInitials, setLockedMatchType]);

  // 대기열에서 [결과 입력]을 누르면 이 폼으로 화면을 옮겨 준다.
  //
  // 스크롤을 부모(대기열)에서 하면 안 된다. 부모는 프리필을 예약한 직후
  // requestAnimationFrame 으로 스크롤했는데, 그 시점의 폼은 아직 비어 있다.
  // 채워지면서 폼이 길어져도 스크롤은 이미 정해둔 좌표로 가버리니, 어떨 땐
  // 키패드까지 내려가고 어떨 땐 이름에서 멈췄다. 그래서 프리필이 화면에 반영된
  // 뒤에 이 컴포넌트가 직접 옮긴다.
  //
  // 목표는 "폼 맨 위"가 아니라 "대진과 점수 묶음"이다. 폼 맨 위(block:"start")는
  // 페이지가 그만큼 길지 않아 애초에 도달할 수 없었고(142px 모자랐다), 그래서
  // 착지점이 페이지 높이에 따라 들쭉날쭉했다. block:"nearest" 는 이미 보이면
  // 움직이지 않고, 안 보이면 최소한만 움직여 선수 이름과 키패드를 함께 남긴다.
  // 이미 들어간 선수를 명단에서 눌렀을 때, 그 선수가 있는 자리를 잠깐 번쩍인다.
  const [bumpSlot, setBumpSlot] = useState<string | null>(null);
  const bumpTimer = useRef<number | null>(null);
  const flashSlot = (key: string) => {
    setBumpSlot(key);
    if (bumpTimer.current) window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => setBumpSlot(null), 1100);
  };
  useEffect(() => () => { if (bumpTimer.current) window.clearTimeout(bumpTimer.current); }, []);

  const [pendingScroll, setPendingScroll] = useState(false);
  const matchupRef = useRef<HTMLDivElement>(null);
  const readyToScore =
    !!a.studentId && !!b.studentId &&
    (matchType !== "double" || (!!a2.studentId && !!b2.studentId));
  useEffect(() => {
    if (!pendingScroll || !readyToScore) return;
    const el = matchupRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setPendingScroll(false);
  }, [pendingScroll, readyToScore]);

  // 프리필로 채워진 상태 그대로인지, 사람이 손을 댔는지 가른다.
  // 부모(대기열)가 이 폼을 덮어쓰기 전에 물어봐야 해서 밖으로 알린다.
  useEffect(() => {
    if (!onDirtyChange) return;
    const sig = slotSig(a.studentId, a2.studentId, b.studentId, b2.studentId, scoreA, scoreB);
    // 슬롯 A가 본인으로 고정됐거나(일반회원) 미리 채워진 경우(운영진)는 사람이 고른 게
    // 아니다. 이걸 "손댄 것"으로 치면 대기열 줄을 누를 때마다 덮어쓸지 묻게 된다.
    const autoA = lockedPlayerId ?? defaultPlayerId;
    const onlyLocked =
      !!autoA &&
      a.studentId === autoA &&
      !a2.studentId &&
      !b.studentId &&
      !b2.studentId &&
      !scoreA &&
      !scoreB;
    const touched = !!(a.studentId || a2.studentId || b.studentId || b2.studentId || scoreA || scoreB);
    onDirtyChange(touched && !onlyLocked && sig !== appliedSigRef.current);
  }, [a.studentId, a2.studentId, b.studentId, b2.studentId, scoreA, scoreB, lockedPlayerId, defaultPlayerId, onDirtyChange]);

  // 일반회원 본인 경기: 슬롯 A를 항상 본인으로 고정
  useEffect(() => {
    if (!lockedPlayerId) return;
    const me = students.find((s) => s.id === lockedPlayerId);
    if (me) setA({ group: me.group ?? null, studentId: me.id });
  }, [lockedPlayerId, students]);

  // 운영진 본인 경기: 폼이 비어 있을 때 슬롯 A에 본인을 미리 넣는다.
  // ✕로 뺐으면 이번 경기 동안은 다시 넣지 않는다 — 빼자마자 도로 들어오면 못 쓴다.
  // 등록이 끝나 폼이 새로 비면 다시 넣는다(다음 경기).
  const defaultDismissedRef = useRef(false);
  const formEmpty =
    !a.studentId && !a2.studentId && !b.studentId && !b2.studentId && !scoreA && !scoreB;
  useEffect(() => {
    if (!defaultPlayerId || lockedPlayerId || !formEmpty || defaultDismissedRef.current) return;
    const me = students.find((s) => s.id === defaultPlayerId);
    if (me) setA({ group: me.group ?? null, studentId: me.id });
  }, [defaultPlayerId, lockedPlayerId, formEmpty, students]);

  // A선수 또는 B선수 및 파트너 선택 시 성별이 "U"이거나 없을 때 모달 팝업 트리거 (성별을 안 쓰는 리그는 건너뜀)
  useEffect(() => {
    if (!genderEnabled) return;
    const activePlayerIds = [a.studentId, a2.studentId, b.studentId, b2.studentId].filter(Boolean) as string[];
    for (const id of activePlayerIds) {
      const student = students.find((s) => s.id === id);
      if (student && (student.gender === "U" || !student.gender)) {
        setGenderTargetId(student.id);
        setGenderModalOpen(true);
        return;
      }
    }
  }, [a.studentId, a2.studentId, b.studentId, b2.studentId, students, genderEnabled]);

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
      return toast.error("선수 데이터가 완전히 동기화되지 않았습니다. 새로고침 후 다시 시도해주세요.");
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
    // 등록 알림 토스트는 띄우지 않는다 — 바로 뜨는 결과 창이 같은 내용을 보여 준다.

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
      // 배치고사: 이 경기를 포함한 누적 경기 수가 배치 기준 미만이면 언랭크(티어·RP 비공개)
      const gamesAfter = student.wins + student.losses + 1;
      const unranked = placementEnabled && gamesAfter < placementGames;

      const basePromoted = TIER_ORDER.indexOf(finalTier) < TIER_ORDER.indexOf(prevTier);
      const subPromoted = finalTier === prevTier && finalSub < prevSub;
      // 언랭크 동안에는 승급 연출도 티어를 노출하므로 표시하지 않음
      const promoted = won && (basePromoted || subPromoted) && !unranked;

      const preStreak = student.currentStreak ?? 0;
      const currentStreak = won 
        ? (preStreak >= 0 ? preStreak + 1 : 1)
        : (preStreak <= 0 ? preStreak - 1 : -1);

      const baseWin = won ? (rpDelta - (underdogBonus + scoreDiffBonus + rivalBonus + firstWinBonus + revengeBonus + freshnessBonus + streakBonus + comebackBonus + marginBonus + mentoringBonus + greatMatchBonus + willOfSteelBonus)) : 0;
      const baseLoss = !won ? (-rpDelta + freshnessBonus + lossComfortBonus + greatMatchBonus - (arrogancePenalty + crushingPenalty + revengeAllowedPenalty + championPenalty + swampPenalty)) : 0;

      return {
        name: student.nickname || student.name,
        group: student.group ?? null,
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
        currentStreak,
        unranked,
        placementDone: gamesAfter,
        placementNeed: placementGames
      };
    };

    const w1 = aWon ? playerA : playerB;
    const w2 = aWon ? playerA2 : playerB2;
    const l1 = aWon ? playerB : playerA;
    const l2 = aWon ? playerB2 : playerA2;

    // 4. Set match result details for the modal
    const built: MatchResultData = {
      matchType,
      winner: getPlayerResult(w1, aWon ? "A" : "B", true, winnerScore),
      winner2: w2 ? getPlayerResult(w2, aWon ? "A2" : "B2", true, winnerScore) : undefined,
      loser: getPlayerResult(l1, aWon ? "B" : "A", false, loserScore),
      loser2: l2 ? getPlayerResult(l2, aWon ? "B2" : "A2", false, loserScore) : undefined,
      aWon,
    };
    setResultData(built);

    // 4-1. 결과 영수증을 DB에 저장 → 최근 경기 클릭 시 동일한 창으로 복원
    saveMatchBreakdown(matchObj.id, built);

    // 5. Open popup modal
    setShowModal(true);

    // 6. Reset name selectors and scores but retain grade & class selections
    defaultDismissedRef.current = false;   // 다음 경기 — 본인 미리 넣기를 다시 켠다
    setA({ group: a.group, studentId: null });
    setA2({ group: a2.group, studentId: null });
    setB({ group: b.group, studentId: null });
    setB2({ group: b2.group, studentId: null });
    setScoreA(0); 
    setScoreB(0);
    selectScore("A");
  };

  const handleUpdateGender = (gender: "M" | "F") => {
    if (genderTargetId) {
      onUpdateGender?.(genderTargetId, gender);
      setGenderModalOpen(false);
      setGenderTargetId(null);
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


  return (
    <div className="space-y-6">
      {/* 뷰 전용(presetResult) 모드에서는 입력 폼을 숨기고 결과 모달만 띄운다 */}
      {!presetResult && (<>
      {/* 단식 / 복식 경기 방식 선택 토글 — 자물쇠로 현재 방식을 고정할 수 있다(개인 설정) */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center rounded-xl bg-muted/40 p-1 border border-border/30 backdrop-blur">
          {([
            { type: "double" as const, icon: Users, label: "복식 (2:2)" },
            { type: "single" as const, icon: User, label: "단식 (1:1)" },
          ]).map(({ type, icon: Icon, label }) => {
            const selected = matchType === type;
            // 잠긴 방식이 아닌 쪽은 흐리게 + 비활성 — 무엇이 고정됐는지 그대로 보이게 둔다.
            const disabled = (!!lockedMatchType || !!teamsLocked) && !selected;
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => setMatchType(type)}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-black transition-all duration-200 flex items-center gap-2",
                  selected
                    ? "bg-gradient-to-r from-neon-blue to-tier-diamond text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground",
                  disabled && "opacity-40 cursor-not-allowed hover:text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!!lockedMatchType}
            title={lockedMatchType
              ? `${lockedMatchType === "double" ? "복식" : "단식"} 고정됨 — 눌러서 해제`
              : `${matchType === "double" ? "복식" : "단식"}으로 고정`}
            onClick={() => setLockedMatchType(lockedMatchType ? null : matchType)}
            className={cn(
              "ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 cursor-pointer",
              lockedMatchType
                ? "bg-neon-blue/15 text-neon-blue"
                : "text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {lockedMatchType ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </button>
        </div>
      </div>

      {(() => {
        const slots = {
          A:  { value: a,  set: setA,  player: playerA,  accent: "amber"  as const },
          A2: { value: a2, set: setA2, player: playerA2, accent: "amber"  as const },
          B:  { value: b,  set: setB,  player: playerB,  accent: "violet" as const },
          B2: { value: b2, set: setB2, player: playerB2, accent: "violet" as const },
        };
        const act = activeSlot ? slots[activeSlot] : null;
        const renderSlot = (key: "A" | "A2" | "B" | "B2", label: string) => {
          const sl = slots[key];
          const locked = !!teamsLocked || (!!lockedPlayerId && key === "A");
          const isDefaultMe = key === "A" && !!defaultPlayerId && sl.value.studentId === defaultPlayerId;
          return (
            <Slot
              accent={sl.accent}
              label={locked && !teamsLocked ? "나" : isDefaultMe ? `${label} · 나` : label}
              player={sl.player}
              active={activeSlot === key}
              locked={locked}
              onOpen={() => { if (!locked) setActiveSlot(activeSlot === key ? null : key); }}
              onClear={() => {
                if (locked) return;
                if (key === "A") defaultDismissedRef.current = true;
                sl.set(empty);
                if (activeSlot === key) setActiveSlot(null);
              }}
              thresholds={thresholds}
              placementEnabled={placementEnabled}
              placementGames={placementGames}
            />
          );
        };
        // 선수를 고르면 다음 빈 자리로 넘어간다. 네 자리가 다 차면 목록을 닫고
        // 오른쪽 칸이 점수 입력으로 바뀐다(단계 전환).
        const order: ("A" | "A2" | "B" | "B2")[] = matchType === "double" ? ["A", "A2", "B", "B2"] : ["A", "B"];
        const nextEmpty = (just: "A" | "A2" | "B" | "B2") =>
          order.find((k) => k !== just && !slots[k].value.studentId && !(k === "A" && !!lockedPlayerId)) ?? null;
        // 자리가 다 차야 점수가 의미를 갖는다. 그전에는 점수판을 내보내지 않는다.
        const allPicked = order.every((k) => !!slots[k].value.studentId);
        // 점수를 넣는 단계(좁은 화면)에서는 대진을 한 줄로 접는다.
        const collapseTeams = allPicked && !act;
        const teamEntries = (team: "A" | "B") =>
          order
            .filter((k) => k.startsWith(team))
            .map((k) => ({
              name: slots[k].player ? playerLabel(slots[k].player!) : "?",
              onEdit: () => { if (!teamsLocked) setActiveSlot(k); },
            }));
        // 명단에서 "이 선수 어디 있지?"를 답하는 데 쓰는 짧은 이름.
        const shortSlot = (k: "A" | "A2" | "B" | "B2") => {
          const team = k.startsWith("A") ? "팀 A" : "팀 B";
          if (matchType !== "double") return team;
          return `${team} · ${k.endsWith("2") ? "선수 2" : "선수 1"}`;
        };
        // 이미 대진에 들어간 선수 → 그 자리. 명단에서 중복 선택을 막는 데 쓴다.
        const takenInfo = new Map<string, { slot: string; label: string; accent: Accent }>();
        order.forEach((k) => {
          const id = slots[k].value.studentId;
          if (id) takenInfo.set(id, { slot: k, label: shortSlot(k), accent: slots[k].accent });
        });
        const stripTeams = (["A", "B"] as const).map((team) => ({
          title: team === "A" ? "팀 A" : "팀 B",
          accent: (team === "A" ? "amber" : "violet") as Accent,
          slots: order
            .filter((k) => k.startsWith(team))
            .map((k) => ({
              key: k,
              label: matchType === "double" ? (k.endsWith("2") ? "선수 2" : "선수 1") : (team === "A" ? "선수 A" : "선수 B"),
              name: slots[k].player ? playerLabel(slots[k].player!) : null,
            })),
        }));
        const slotTitle = (k: "A" | "A2" | "B" | "B2") => {
          const team = k.startsWith("A") ? "팀 A" : "팀 B";
          const who = matchType === "double"
            ? (k.endsWith("2") ? "선수 2" : "선수 1")
            : (k === "A" ? "선수 A" : "선수 B");
          return `${team} · ${who}`;
        };

        // 팀 바로 아래에 그 팀 점수판을 둔다 — 좁은 화면이든 넓은 화면이든 똑같이.
        //   좁은 화면: 팀 A → A 점수 → VS → 팀 B → B 점수 (위에서 아래로)
        //   넓은 화면: 1행에 팀 A · VS · 팀 B, 2행에 A 점수 · B 점수 (좌우로)
        // 선수와 점수가 같은 축에 놓여야 어느 칸이 어느 팀인지 한눈에 읽힌다.
        // (팀은 위아래, 점수는 좌우로 두었더니 축이 어긋나 헷갈렸다.)
        // 넓은 화면에서는 DOM 순서 대신 행·열을 직접 지정한다. 점수판 둘을 같은
        // 행에 묶어야 두 팀 블록의 높이가 달라져도 점수판 높이가 어긋나지 않는다.
        // 가운데 VS 칸은 폭을 고정한다(w-12) — 두 행의 열 폭을 같게 하려면 필요하다.
        // 선수 목록은 대진 아래 전체 폭에 펼친다 — 폭이 넓을수록 이름 찾기가 쉽다.
        // 좁은 화면: 한 번에 하나 — 슬롯을 누르면 대진이 접히고 선수 목록만 남는다.
        // 선수 목록을 별도 팝업으로 띄우지 않는 이유는, 동호회에서는 이 폼 자체가
        // 이미 팝업 안에 들어 있어 팝업이 겹치기 때문이다.
        // 등록 버튼은 전체 폭에 둔다 — 한쪽에 치우쳐 있으면 가로 화면에서
        // 눈에 잘 띄지 않는다.
        return (
          <div className="space-y-3">
          {teamsLocked && (
            <p className="text-center text-[11px] font-bold text-muted-foreground">정해진 팀이에요. 선수를 바꾸려면 대기열에서 고치세요.</p>
          )}
          <div
            ref={matchupRef}
            className={cn(
              // scroll-mb: 등록 버튼이 화면 아래에 붙어 떠 있는데(sticky) scrollIntoView 는
              // 그걸 모르고 화면 끝까지만 계산한다. 그대로 두면 숫자패드 마지막 줄이
              // 버튼 뒤에 가려진다. 바 높이(데스크톱 72px, 모바일은 요약줄까지 더 큼)에
              // 여유를 더해 그만큼 더 올라오게 한다.
              "scroll-mb-28 lg:scroll-mb-24",
              "space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-x-4 lg:gap-y-3 lg:space-y-0",
              act && "hidden lg:grid",
            )}
          >
            <div className="lg:col-start-1 lg:row-start-1">
              <div className={cn(collapseTeams && "hidden lg:block")}>
                <TeamBlock title="팀 A" accent="amber" cols={matchType === "double" ? 2 : 1}>
                  {renderSlot("A", matchType === "double" ? "선수 1" : "선수 A")}
                  {matchType === "double" && renderSlot("A2", "선수 2")}
                </TeamBlock>
              </div>
            </div>

            {allPicked && (
              <div className="lg:col-start-1 lg:row-start-2">
                <ScoreRow
                  title="팀 A"
                  accent="amber"
                  entries={teamEntries("A")}
                  value={scoreA}
                  selected={activeScore === "A"}
                  onSelect={() => selectScore("A")}
                  onDigit={pressDigit}
                  onBackspace={pressBackspace}
                  onClear={pressClear}
                />
              </div>
            )}

            <div className={cn(
              "text-center text-xl font-black text-muted-foreground lg:col-start-2 lg:row-start-1 lg:flex lg:h-full lg:w-12 lg:items-center lg:justify-center",
              collapseTeams && "hidden lg:flex",
            )}>VS</div>

            <div className="lg:col-start-3 lg:row-start-1">
              <div className={cn(collapseTeams && "hidden lg:block")}>
                <TeamBlock title="팀 B" accent="violet" cols={matchType === "double" ? 2 : 1}>
                  {renderSlot("B", matchType === "double" ? "선수 1" : "선수 B")}
                  {matchType === "double" && renderSlot("B2", "선수 2")}
                </TeamBlock>
              </div>
            </div>

            {allPicked && (
              <div className="lg:col-start-3 lg:row-start-2">
                <ScoreRow
                  title="팀 B"
                  accent="violet"
                  entries={teamEntries("B")}
                  value={scoreB}
                  selected={activeScore === "B"}
                  onSelect={() => selectScore("B")}
                  onDigit={pressDigit}
                  onBackspace={pressBackspace}
                  onClear={pressClear}
                />
              </div>
            )}


          </div>

          {act && activeSlot ? (
            <div className="flex min-h-0 flex-col gap-2">
              {/* 넓은 화면에는 대진이 그대로 보이니 띠가 필요 없다. */}
              <div className="lg:hidden">
                <LineupStrip
                  teams={stripTeams}
                  activeSlot={activeSlot}
                  bumpSlot={bumpSlot}
                  onJump={(k) => setActiveSlot(k as "A" | "A2" | "B" | "B2")}
                />
              </div>
              <PlayerPicker
                title={slotTitle(activeSlot)}
                taken={takenInfo}
                onTakenTap={flashSlot}
                presentIds={presentIds}
                onBack={() => setActiveSlot(null)}
                onClear={
                  act.value.studentId && !(activeSlot === "A" && !!lockedPlayerId)
                    ? () => {
                        if (activeSlot === "A") defaultDismissedRef.current = true;
                        act.set(empty);
                        setActiveSlot(null);
                      }
                    : undefined
                }
                students={students}
                accent={act.accent}
                group={act.value.group}
                onPick={(group, studentId) => {
                  const just = activeSlot;
                  act.set({ group, studentId });
                  setActiveSlot(nextEmpty(just));
                }}
                thresholds={thresholds}
                placementEnabled={placementEnabled}
                placementGames={placementGames}
                canAddMember={isClassOwner}
                filter={pickerFilter}
                onFilterChange={setPickerFilter}
              />
            </div>
          ) : !allPicked ? (
            <div className="flex min-h-[8rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 bg-card/30 p-6 text-center">
              <Users className="size-5 text-muted-foreground/70" />
              {queueHint ? (
                <>
                  <p className="text-xs font-bold text-foreground">
                    대기열에서 <span className="text-neon-blue">[점수 넣기]</span>를 누르면 한 번에 채워져요.
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">대기열에 없는 경기만 빈 자리를 눌러 고르세요.</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-muted-foreground">
                    {matchType === "double" ? "네 자리" : "두 자리"}를 모두 채우면 점수를 입력할 수 있어요.
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">비어 있는 자리를 눌러 {terms.member}를 고르세요.</p>
                </>
              )}
            </div>
          ) : null}

          {/* 스크롤 위치와 무관하게 바닥에 붙여 둔다. 그냥 두 칸 아래에 두면 세로가
              짧은 화면에서 접힌 아래로 밀려 보이지 않았다. */}
          {allPicked && !act && (
            <div className="sticky bottom-0 z-20 -mx-1 rounded-xl bg-background/85 px-1 py-2 backdrop-blur">
              <div className="mb-1.5 flex items-center justify-center gap-2 text-sm font-bold tabular-nums lg:hidden">
                <span className="truncate text-muted-foreground">{matchType === "double" ? "팀 A" : (playerA ? playerLabel(playerA) : "선수 A")}</span>
                <span className="font-mono text-lg text-amber-400">{scoreA}</span>
                <span className="text-muted-foreground/60">:</span>
                <span className="font-mono text-lg text-violet-400">{scoreB}</span>
                <span className="truncate text-muted-foreground">{matchType === "double" ? "팀 B" : (playerB ? playerLabel(playerB) : "선수 B")}</span>
              </div>
              <Button
              size="lg"
              onClick={submit}
              disabled={isSyncing}
              className="h-14 w-full bg-gradient-to-r from-neon-blue to-tier-diamond text-base font-bold text-primary-foreground glow-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
          )}
          </div>
        );
      })()}
      </>)}

      {/* Match Result Modal Popup */}
      {showModal && resultData && (
        <MatchResultModal
          resultData={resultData}
          thresholds={thresholds}
          genderEnabled={genderEnabled}
          closeLabel={presetResult ? "닫기" : onCloseResult ? "확인" : "확인 (다음 경기)"}
          onClose={() => {
            setShowModal(false);
            setResultData(null);
            onCloseResult?.();
          }}
        />
      )}

      {/* 성별 선택 팝업 — 이름 크게, 문구 한 줄, 버튼 둘 */}
      {genderModalOpen && genderTargetId && (() => {
        const targetStudent = students.find((s) => s.id === genderTargetId);
        if (!targetStudent) return null;
        return (
          <div className="fixed inset-0 z-[110] flex justify-center overflow-y-auto bg-background/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="relative my-auto w-full max-w-md border border-neon-blue/30 bg-background/95 rounded-2xl p-6 md:p-8 flex flex-col items-center animate-in zoom-in duration-300">
              <button
                onClick={handleCancelGender}
                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground hover:bg-muted/40 p-1.5 rounded-lg transition-all"
                title="취소"
              >
                <X className="size-5" />
              </button>

              <div className="mt-2 text-3xl font-black text-foreground text-center break-keep">
                {targetStudent.nickname || targetStudent.name}
              </div>
              <p className="mt-2 mb-6 text-base text-muted-foreground">성별을 선택해 주세요</p>

              <div className="grid grid-cols-2 gap-4 w-full">
                <button
                  onClick={() => handleUpdateGender("M")}
                  className="h-24 rounded-xl border border-neon-blue/40 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue text-3xl font-black transition-all active:scale-95"
                >
                  남
                </button>
                <button
                  onClick={() => handleUpdateGender("F")}
                  className="h-24 rounded-xl border border-loss/40 bg-loss/10 hover:bg-loss/20 text-loss text-3xl font-black transition-all active:scale-95"
                >
                  여
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 팀 색상(고대비): 팀A 파랑 / 팀B 빨강(loss)
const ACCENT = {
  amber: {
    text: "text-amber-400",
    border: "border-amber-500/60",
    soft: "border-amber-500/30 bg-amber-500/[0.06]",
    fill: "border-amber-500/60 bg-amber-500/10",
    band: "border-amber-500/40 bg-amber-500/15 text-amber-400",
    ring: "ring-amber-500/70",
  },
  violet: {
    text: "text-violet-400",
    border: "border-violet-500/60",
    soft: "border-violet-500/30 bg-violet-500/[0.06]",
    fill: "border-violet-500/60 bg-violet-500/10",
    band: "border-violet-500/40 bg-violet-500/15 text-violet-400",
    ring: "ring-violet-500/70",
  },
} as const;
type Accent = keyof typeof ACCENT;
const ALL_GROUP = "__ALL__";

type MatchType = "single" | "double";
const MATCH_TYPE_LOCK_KEY = "clg:matchTypeLock:";

/**
 * 경기 방식(단식/복식) 고정 — 기기별 개인 설정.
 * 한 리그에서 늘 같은 방식만 하는 경우가 많아, 매번 고르거나 잘못 눌러 바뀌는 걸 막는다.
 * 리그 전체 정책이 아니라 본인 화면에만 적용되므로 권한 검사 없이 누구나 켜고 끌 수 있다.
 */
function useMatchTypeLock(classId: string | null): [MatchType | null, (next: MatchType | null) => void] {
  const [locked, setLocked] = useState<MatchType | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!classId || typeof window === "undefined") return;
    if (seededFor.current === classId) return;
    seededFor.current = classId;
    try {
      const raw = window.localStorage.getItem(MATCH_TYPE_LOCK_KEY + classId);
      setLocked(raw === "single" || raw === "double" ? raw : null);
    } catch {
      setLocked(null);
    }
  }, [classId]);

  const update = useCallback((next: MatchType | null) => {
    setLocked(next);
    if (!classId || typeof window === "undefined") return;
    try {
      if (next) window.localStorage.setItem(MATCH_TYPE_LOCK_KEY + classId, next);
      else window.localStorage.removeItem(MATCH_TYPE_LOCK_KEY + classId);
    } catch {
      // 저장 실패(사생활 보호 모드 등)해도 이번 세션 동안은 잠금이 동작한다.
    }
  }, [classId]);

  return [locked, update];
}

/** 학교 리그 선수 선택 picker의 학년/반 필터. null = 전체. */
export type PickerFilter = { grade: number | null; classNum: number | null };
const EMPTY_FILTER: PickerFilter = { grade: null, classNum: null };
const PICKER_FILTER_KEY = "clg:pickerFilter:";

function readStoredFilter(classId: string | null): PickerFilter | null {
  if (!classId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PICKER_FILTER_KEY + classId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PickerFilter>;
    return {
      grade: typeof parsed.grade === "number" ? parsed.grade : null,
      classNum: typeof parsed.classNum === "number" ? parsed.classNum : null,
    };
  } catch {
    return null;
  }
}

/** 명단에 없는 학년/반이 남아 있으면(명단 변경·시즌 교체) 그 축만 전체로 되돌린다. */
function writeStoredFilter(classId: string, next: PickerFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PICKER_FILTER_KEY + classId, JSON.stringify(next));
  } catch {
    // 저장 실패(사생활 보호 모드 등)해도 화면 동작에는 지장이 없다.
  }
}

function sanitizeFilter(f: PickerFilter, students: Student[]): PickerFilter {
  const grade = f.grade != null && students.some((s) => s.grade === f.grade) ? f.grade : null;
  const classNum =
    f.classNum != null && students.some((s) => s.classNum === f.classNum && (grade == null || s.grade === grade))
      ? f.classNum
      : null;
  return { grade, classNum };
}

/**
 * 학년/반 필터를 슬롯 전환·재입력·새로고침 넘어서 기억한다.
 * 최초값은 (1) 이 리그에서 마지막으로 쓴 필터 (2) 본인(고정 슬롯) 학년·반 순으로 정한다.
 */
function useSchoolPickerFilter(
  students: Student[],
  classId: string | null,
  meId: string | null | undefined,
  enabled: boolean,
): [PickerFilter, (next: PickerFilter) => void] {
  const [filter, setFilter] = useState<PickerFilter>(EMPTY_FILTER);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !classId || students.length === 0) return;
    if (seededFor.current === classId) return;
    seededFor.current = classId;
    const me = meId ? students.find((s) => s.id === meId) : null;
    const seed = readStoredFilter(classId) ?? (me ? { grade: me.grade ?? null, classNum: me.classNum ?? null } : null);
    setFilter(seed ? sanitizeFilter(seed, students) : EMPTY_FILTER);
  }, [enabled, classId, students, meId]);

  // 수업이 시작되면 그 반으로 끌어온다. 교사 계정에는 저장된 필터가 옛 수업의 반이라
  // 매번 다시 고르게 만들었다 — 새 수업이 열렸다는 건 그보다 확실한 신호다.
  // 잠그지는 않는다: 새 수업일 때 한 번 끌어오고, 그 뒤 다른 반을 보러 가면 그대로 둔다.
  // 명단(props)이 아직 안 왔으면 sanitize 가 반을 통째로 떨어뜨린다. 세션 쪽 학생
  // 목록은 스토어에서 오므로 여기보다 먼저 준비될 수 있다 — 그때는 미룬다.
  useSeedFromSession("record-picker", enabled && !!classId && students.length > 0, (scope) => {
    // 저장값 시딩이 뒤늦게 돌아 이 값을 옛 반으로 되돌리지 못하게 같이 표시한다.
    seededFor.current = classId;
    const next = sanitizeFilter(scope, students);
    setFilter(next);
    // 저장까지 해 둔다. 수업 도중 새로고침해도 옛 반으로 돌아가지 않는다.
    if (classId) writeStoredFilter(classId, next);
  });

  const update = useCallback((next: PickerFilter) => {
    setFilter(next);
    if (!classId) return;
    writeStoredFilter(classId, next);
  }, [classId]);

  return [filter, update];
}

function TeamBlock({ title, accent, cols, children }: { title: string; accent: Accent; cols: number; children: React.ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className={cn("rounded-2xl border p-2.5 sm:p-3", a.soft)}>
      <div className={cn("mb-2 inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-black", a.band)}>{title}</div>
      <div className={cn("grid gap-2", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>{children}</div>
    </div>
  );
}

// 슬롯: 선택됨이면 컴팩트 카드, 비었으면 "선수 선택" 버튼

function Slot({ accent, label, player, active, locked, onOpen, onClear, thresholds, placementEnabled, placementGames }: {
  accent: Accent; label: string; player: Student | null; active: boolean; locked?: boolean;
  onOpen: () => void; onClear: () => void; thresholds?: Record<string, number>;
  placementEnabled: boolean; placementGames: number;
}) {
  const a = ACCENT[accent];
  const genderEnabled = useGenderEnabled();
  if (player) {
    return (
      <div className={cn("relative rounded-xl border p-3 text-center", a.fill, active && cn("ring-2 shadow-lg", a.ring))}>
        {locked ? (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-neon-blue/20 px-1.5 py-0.5 text-[10px] font-bold text-neon-blue">나</span>
        ) : (
          <button onClick={onClear} title="선수 변경" className="absolute top-1.5 right-1.5 rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-foreground/70 hover:text-foreground cursor-pointer">✕</button>
        )}
        <div className="text-[10px] text-muted-foreground">{label}{player.group ? ` · ${player.group}` : ""}</div>
        <div className="mt-1.5 flex items-center justify-center gap-1.5 min-w-0">
          {genderEnabled && <GenderMark gender={player.gender} className="size-4 text-[10px] shrink-0" />}
          <span className={cn("team-name truncate text-lg sm:text-xl font-black leading-tight", a.text)}>{playerLabel(player)}</span>
        </div>
        <div className="mt-2 flex justify-center"><TierBadge rp={player.rp} thresholds={thresholds} unranked={isUnranked(player, placementEnabled, placementGames)} /></div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen}
      className={cn(
        "flex min-h-[5rem] flex-col items-center justify-center rounded-xl border p-4 text-center transition-all active:scale-95 cursor-pointer",
        // 지금 고르는 중인 자리는 점선이 아니라 실선 + 링으로 또렷하게 구분한다.
        // 연한 점선끼리는 어느 자리를 채우는 중인지 알아볼 수가 없다.
        active
          ? cn(a.fill, a.text, a.ring, "ring-2 ring-offset-0 shadow-lg")
          : "border-dashed border-border/50 text-muted-foreground hover:border-border",
      )}>
      <span className="text-xl leading-none">＋</span>
      <span className="mt-1 text-xs font-bold">{label}</span>
      {active && <span className="mt-0.5 text-[10px] font-black opacity-80">고르는 중</span>}
    </button>
  );
}

// 선수 선택 picker: 검색 → 레벨 칩 → 선수 목록 (한 번에 1개만 펼쳐짐)
function PlayerPicker({ students, accent, group, onPick, thresholds, placementEnabled, placementGames, canAddMember, filter, onFilterChange, title, onBack, onClear, taken, onTakenTap, presentIds }: {
  students: Student[]; accent: Accent; group: string | null;
  onPick: (group: string, studentId: string) => void; thresholds?: Record<string, number>;
  placementEnabled: boolean; placementGames: number; canAddMember?: boolean;
  // 학년/반 필터는 부모가 소유한다(슬롯을 옮겨도 유지되도록).
  filter: PickerFilter; onFilterChange: (next: PickerFilter) => void;
  /** 지금 채우는 자리 이름 — 도구줄에 함께 놓는다. */
  title?: string;
  /** 대진으로 돌아가기 */
  onBack?: () => void;
  /** 이 자리를 비운다. 이미 선수가 들어 있을 때만 준다. */
  onClear?: () => void;
  /** 이미 대진에 들어간 선수 → 어느 자리에 있는지. 중복 선택을 막고 그 자리를 알려준다. */
  taken?: Map<string, { slot: string; label: string; accent: Accent }>;
  /** 이미 들어간 선수를 눌렀을 때. 대진 띠의 그 자리를 번쩍이게 하는 데 쓴다. */
  onTakenTap?: (slot: string) => void;
  /** 오늘 출석한 사람들. 명단 맨 위로 올린다 — 안 온 사람 사이에서 찾게 하지 않는다. */
  presentIds?: Set<string>;
}) {
  const terms = useLeagueTerms();
  const isSchool = useIsSchoolLeague();
  const genderEnabled = useGenderEnabled();
  const a = ACCENT[accent];
  const [search, setSearch] = useState("");
  const [grp, setGrp] = useState<string>(group ?? ALL_GROUP);
  const [addOpen, setAddOpen] = useState(false);
  // 이미 들어간 선수를 눌렀을 때 그 카드만 잠깐 흔든다. 토스트나 팝업을 띄우면
  // 선수를 고르는 동안 떠 있는 목록 위에 층이 하나 더 쌓인다.
  const [shakeId, setShakeId] = useState<string | null>(null);
  // 범위를 다 고르고 나면 칩을 접는다. 선수 목록이 세로로 눌리는 걸 막기 위해서다.
  // 지난번에 고른 범위가 남아 있으면(새로고침 등) 처음부터 접힌 채로 연다.
  const [filtersOpen, setFiltersOpen] = useState(
    () => !(isSchool ? (filter.grade != null || filter.classNum != null) : !!group),
  );
  // school 리그: 레벨(급수) 대신 학년/반으로 좁힌다. 상태는 부모(RecordMatch)가 유지한다.
  const gradeF = filter.grade;
  const classF = filter.classNum;

  const activeGroups = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => { if (s.group) set.add(s.group); });
    return Array.from(set).sort((x, y) => x.localeCompare(y, "ko"));
  }, [students]);

  // school: 명단 구성에 맞춘 학년/반 축.
  // 값이 한 종류뿐이면(학급 리그처럼) 그 축은 필터로도 라벨로도 의미가 없어 숨긴다.
  const axes = useMemo(() => schoolAxesOf(students), [students]);
  const activeGrades = axes.varyGrade ? axes.grades : [];
  // 반 칩은 선택된 학년 안에서만 추린다.
  const activeClasses = useMemo(() => {
    if (!axes.varyClass) return [];
    const set = new Set<number>();
    students.forEach((s) => {
      if (s.classNum == null) return;
      if (gradeF != null && s.grade !== gradeF) return;
      set.add(s.classNum);
    });
    return Array.from(set).sort((x, y) => x - y);
  }, [students, gradeF, axes.varyClass]);

  // 도구줄에 띄울 현재 범위 요약 — 접었을 때 무엇으로 좁혀져 있는지 알 수 있어야 한다.
  const scopeLabel = isSchool
    ? [gradeF != null ? `${gradeF}학년` : null, classF != null ? `${classF}반` : null].filter(Boolean).join(" ") || "전체"
    : (grp === ALL_GROUP ? "전체" : grp);

  // 필터로 이미 고정된 축은 카드에 다시 적을 필요가 없다. 4반만 보는 중이면 번호만 있으면 된다.
  const labelAxes = useMemo(
    () => ({
      ...axes,
      varyGrade: axes.varyGrade && gradeF == null,
      varyClass: axes.varyClass && classF == null,
    }),
    [axes, gradeF, classF],
  );

  const roster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => (isSchool
        ? ((gradeF == null || s.grade === gradeF) && (classF == null || s.classNum === classF))
        : (grp === ALL_GROUP ? true : (s.group ?? null) === grp)))
      .filter((s) => {
        if (!q) return true;
        const n = (s.name || "").toLowerCase();
        const nk = (s.nickname || "").toLowerCase();
        return n.includes(q) || nk.includes(q);
      })
      .sort((x, y) => {
        // 출석한 사람이 먼저다. 결과를 넣는 건 거의 언제나 지금 여기 있는 사람이라,
        // 안 온 스무 명 사이에서 찾게 두면 매번 헛손질이 된다. 그 안에서는 원래 순서.
        if (presentIds && presentIds.size > 0) {
          const px = presentIds.has(x.id) ? 0 : 1;
          const py = presentIds.has(y.id) ? 0 : 1;
          if (px !== py) return px - py;
        }
        return (isSchool
          ? ((x.grade ?? 0) - (y.grade ?? 0)) || ((x.classNum ?? 0) - (y.classNum ?? 0)) || ((x.studentNo ?? 0) - (y.studentNo ?? 0))
          : 0) || (x.nickname || x.name).localeCompare(y.nickname || y.name, "ko");
      });
  }, [students, grp, search, isSchool, gradeF, classF, presentIds]);
  // 출석자와 그 외 사이에 선을 긋는다. 순서만 바꾸면 왜 이 순서인지 알 수 없다.
  const presentCount = presentIds && presentIds.size > 0 ? roster.filter((s) => presentIds.has(s.id)).length : 0;
  const showDivider = presentCount > 0 && presentCount < roster.length;

  return (
    <Card className={cn("flex h-full min-h-0 flex-col border p-3 backdrop-blur", a.border)}>
      {/* 제목·범위·검색·되돌아가기를 한 줄에 묶는다. 각각 한 줄씩 차지하면
          정작 선수 목록이 볼 자리가 없다. */}
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        {/* 좁은 화면에서는 감춘다 — 바로 위 대진 띠가 "지금 어느 자리인지"를
            훨씬 크게 보여주고, 375px 도구줄에 자리도 없다. */}
        {title && <span className={cn("hidden shrink-0 text-xs font-black lg:inline", a.text)}>{title}</span>}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          title="범위 바꾸기"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2 py-1 text-[11px] font-bold text-foreground transition-all hover:border-neon-blue/50 active:scale-95 cursor-pointer"
        >
          {scopeLabel}
          <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", filtersOpen && "rotate-180")} />
        </button>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={terms.nameLabel}
          className="h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-deep px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-neon-blue/60 focus:outline-none"
        />
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-lg border border-loss/40 bg-loss/10 px-2 py-1 text-[11px] font-bold text-loss transition-all hover:bg-loss/20 active:scale-95 cursor-pointer"
          >
            자리 비우기
          </button>
        )}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-lg border border-border/60 bg-card/60 px-2 py-1 text-[11px] font-bold text-muted-foreground transition-all hover:text-foreground active:scale-95 cursor-pointer"
          >
            대진으로
          </button>
        )}
      </div>
      {!filtersOpen ? null : isSchool ? (
        // 학년을 고른 다음에 그 학년의 반이 열린다. 학년과 반을 같은 크기로 나란히 두면
        // 같은 위계로 읽히고, 반이 10개만 돼도 줄이 넘쳐 화면을 잡아먹는다.
        <div className="shrink-0 space-y-2">
          {activeGrades.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <Chip active={gradeF === null} accent={accent} onClick={() => { onFilterChange({ grade: null, classNum: null }); setFiltersOpen(false); }}>전체 학년</Chip>
              {activeGrades.map((g) => (
                <Chip key={g} active={gradeF === g} accent={accent} onClick={() => { onFilterChange({ grade: g, classNum: null }); if (!axes.varyClass) setFiltersOpen(false); }}>{g}학년</Chip>
              ))}
            </div>
          )}
          {/* 학년 축이 없는 리그(한 학년만 있는 경우)에는 반을 바로 연다. */}
          {(gradeF !== null || activeGrades.length === 0) && activeClasses.length > 0 && (
            <div className="ml-2 border-l-2 border-border/50 pl-2">
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 xl:grid-cols-11">
                <Chip size="sm" active={classF === null} accent={accent} onClick={() => { onFilterChange({ grade: gradeF, classNum: null }); setFiltersOpen(false); }}>전체</Chip>
                {activeClasses.map((c) => (
                  <Chip key={c} size="sm" active={classF === c} accent={accent} onClick={() => { onFilterChange({ grade: gradeF, classNum: c }); setFiltersOpen(false); }}>{c}반</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-7">
          <Chip active={grp === ALL_GROUP} accent={accent} onClick={() => { setGrp(ALL_GROUP); setFiltersOpen(false); }}>전체</Chip>
          {activeGroups.map((g) => (
            <Chip key={g} active={grp === g} accent={accent} onClick={() => { setGrp(g); setFiltersOpen(false); }}>{g}</Chip>
          ))}
        </div>
      )}
      {/* 명단이 길어도 이 칸 안에서만 스크롤한다(페이지가 따라 내려가지 않도록). */}
      <div className="mt-1 grid max-h-[55vh] min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(max(5.5rem,calc((100%_-_2rem)/5)),1fr))] gap-2 overflow-y-auto pr-1 lg:max-h-[46vh] lg:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] lg:gap-2.5">
        {roster.map((s, idx) => {
          const divider = showDivider && idx === presentCount ? (
            <div key="__absent" className="col-span-full mt-1 flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
              <span className="h-px flex-1 bg-border/60" />
              오늘 안 온 사람
              <span className="h-px flex-1 bg-border/60" />
            </div>
          ) : null;
          // 이미 대진에 들어간 선수는 그 팀 색으로 잠근다. 같은 사람을 두 자리에
          // 넣는 건 언제나 잘못된 입력인데, 지금까지는 네 명을 다 고르고 점수까지
          // 넣은 뒤 등록할 때에야 걸렸다.
          const here = taken?.get(s.id);
          const ta = here ? ACCENT[here.accent] : null;
          return (
          <React.Fragment key={s.id}>
          {divider}
          <button
            type="button"
            aria-disabled={!!here}
            onClick={() => {
              if (here) {
                // 막되 이유를 말해 준다 — 카드를 흔들고, 위 띠의 그 자리를 번쩍인다.
                setShakeId(s.id);
                window.setTimeout(() => setShakeId((cur) => (cur === s.id ? null : cur)), 450);
                onTakenTap?.(here.slot);
                return;
              }
              onPick(grp, s.id);
            }}
            className={cn(
              "relative flex min-h-[4.75rem] w-full min-w-0 flex-col lg:min-h-[6.25rem] items-center justify-between overflow-hidden rounded-lg border px-1.5 pt-6 pb-2.5 text-center transition-all lg:px-2 lg:pt-8 lg:pb-3 cursor-pointer",
              here
                ? cn("border-2", ta!.border, ta!.soft)
                : "border-border/60 bg-surface-deep hover:border-neon-blue/60 hover:bg-accent/40",
              shakeId === s.id && "animate-shake",
            )}
          >
            {(isSchool ? schoolLabelCompact(s, labelAxes) : s.group) && (
              <span className="absolute top-1 left-1.5 max-w-[70%] truncate text-left font-mono text-[10px] text-soft lg:text-sm">{isSchool ? schoolLabelCompact(s, labelAxes) : s.group}</span>
            )}
            {genderEnabled && <GenderMark gender={s.gender} className="absolute top-1 right-1.5 size-3.5 text-[9px] shrink-0 lg:size-4 lg:text-[10px]" />}
            <div className="flex w-full min-w-0 flex-grow items-center justify-center">
              <span className={cn("w-full truncate text-center text-sm font-bold lg:text-xl", here ? ta!.text : "text-strong")}>{playerLabel(s)}</span>
            </div>
            <div className="mt-1.5 flex w-full shrink-0 justify-center">
              {here ? (
                // 이미 들어간 선수에게 티어는 지금 필요한 정보가 아니다.
                // 그 자리에 "어디에 있는지"를 대신 놓는다.
                <span className={cn("max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-black", ta!.band)}>{here.label}</span>
              ) : (
                <TierBadge rp={s.rp} thresholds={thresholds} unranked={isUnranked(s, placementEnabled, placementGames)} />
              )}
            </div>
          </button>
          </React.Fragment>
          );
        })}
        {roster.length === 0 && !canAddMember && (
          <span className="col-span-full block py-2 text-xs text-muted-foreground">선수가 없습니다</span>
        )}
        {canAddMember && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex min-h-[4.75rem] w-full flex-col items-center justify-center gap-1 lg:min-h-[6.25rem] rounded-lg border border-dashed border-neon-blue/40 bg-surface-deep px-2 py-2.5 text-center text-neon-blue transition-all hover:border-neon-blue/70 hover:bg-neon-blue/5 active:scale-95 cursor-pointer"
          >
            <UserPlus className="size-5" />
            <span className="text-xs font-bold">{terms.member} 추가</span>
          </button>
        )}
      </div>

      {/* 회원 추가 팝업 — 관리자 전용. 추가된 회원은 목록에 나타남(자동 선택 안 함). */}
      {addOpen && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setAddOpen(false)}>
          <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-black text-foreground flex items-center gap-1.5"><UserPlus className="size-4 text-neon-blue" /> {terms.member} 추가</span>
              <button type="button" onClick={() => setAddOpen(false)} title="닫기" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-panel hover:text-foreground transition-all">
                <X className="size-5" />
              </button>
            </div>
            <AddMemberForm onAdded={() => setAddOpen(false)} className="bg-surface-deep" />
          </div>
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

function Chip({ active, accent, onClick, children, size = "md" }: { active: boolean; accent: "amber" | "violet"; onClick: () => void; children: React.ReactNode; size?: "md" | "sm" }) {
  const activeCls = accent === "amber"
    ? "border-amber-500 bg-amber-500/20 text-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
    : "border-violet-500 bg-violet-500/20 text-violet-400 shadow-[0_0_18px_rgba(139,92,246,0.35)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border font-black transition-all active:scale-95 flex items-center justify-center shadow-md cursor-pointer",
        size === "sm" ? "h-8 text-xs rounded-lg" : "h-12 text-sm",
        active ? activeCls : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-muted/30",
      )}
    >
      {children}
    </button>
  );
}

// 팀 한 줄 = 이름 + 그 팀 점수. 점수 숫자를 누르면 아래 숫자패드가 그 팀을 겨냥한다.
// 이름과 점수를 한 줄에 합친 이유: 팀마다 점수판을 따로 두었더니 도구가 화면의
// 대부분을 차지하고, 정작 누가 몇 점인지가 묻혔다.
// 넓은 화면에는 위에 선수 카드가 그대로 있으므로 이 줄의 이름은 숨긴다.
function ScoreRow({ title, accent, entries, value, selected, onSelect, onDigit, onBackspace, onClear }: {
  title: string;
  accent: Accent;
  entries: { name: string; onEdit: () => void }[];
  value: number;
  selected: boolean;
  onSelect: () => void;
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onClear: () => void;
}) {
  const a = ACCENT[accent];
  // 숫자패드를 지금 입력 중인 팀 안에 넣는다. 팀마다 한 벌씩 두면 화면에 숫자 버튼이
  // 24개가 되고, 가운데에 따로 두면 점수 칸이 숫자 하나만 담은 빈 상자로 남았다.
  // 펼쳐진 쪽이 곧 "지금 입력 중"이라, 어느 팀 차례인지 따로 안내할 필요도 없다.
  // 반대편을 누르면 이쪽이 접히므로 "입력 완료" 판정도 필요 없다.
  //
  // 숫자만 누를 수 있으면 표적이 너무 작다. 칸 전체를 누르면 그 팀이 선택되게 하고,
  // 이름만 예외로 둔다(이름은 선수 교체라 목적이 다르다).
  // <button>으로 감싸면 그 안에 이름·숫자 버튼이 들어가 버려서 div + role="button"으로 만든다.
  return (
    <div
      role="button"
      tabIndex={selected ? -1 : 0}
      aria-pressed={selected}
      title={`${title} 점수 입력하기`}
      onClick={selected ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!selected && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-xl border p-2 transition-all lg:p-3",
        // 두 팀은 대등한 한 쌍으로 보여야 한다. 고르지 않은 쪽 테두리를 30%로
        // 두었더니 상자가 배경에 묻혀 숫자만 허공에 뜬 것처럼 보였다. 테두리는
        // 양쪽 다 세우고, "지금 입력 중"은 링과 배경 농도로만 가른다.
        selected ? cn(a.fill, "ring-2", a.ring) : cn(a.border, "bg-transparent cursor-pointer hover:brightness-95"),
      )}
    >
      <div className="flex items-center gap-2 lg:flex-col lg:gap-1">
        <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-black lg:text-xs", a.band)}>{title}</span>
        {/* 이름을 누르면 그 자리를 다시 고른다 — 접혀 있어도 수정 경로는 열어 둔다.
            칸 전체가 점수 선택이므로 이름 클릭은 위로 새어 나가지 않게 막는다.
            (넓은 화면은 위에 선수 카드가 그대로 있어 이 줄이 필요 없다.)

            이름을 한 줄에 나란히 두면 48px 숫자가 폭을 먼저 가져가 이름 하나당
            80px밖에 안 남아 잘렸다. 세로로 쌓으면 두 배를 쓰므로 안 잘린다.
            밑줄(점선)은 "누를 수 있음"이 아니라 주석처럼 읽혀 이름을 격하시켰다 —
            빼고, 수정 가능하다는 신호는 연필 아이콘 하나로 모은다. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 lg:hidden">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            {entries.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  e.onEdit();
                }}
                className="min-w-0 max-w-full truncate text-base font-bold leading-snug text-foreground transition-opacity active:scale-95 active:opacity-70 cursor-pointer"
              >
                {e.name}
              </button>
            ))}
          </div>
          <Pencil className="size-3.5 shrink-0 text-muted-foreground/70" />
        </div>
        <span className={cn("shrink-0 px-3 font-mono text-5xl font-black leading-none tabular-nums lg:w-full lg:px-0 lg:text-center lg:text-7xl", a.text)}>
          {value}
        </span>
      </div>

      {selected ? (
        // 키패드 안에서의 클릭이 칸 바깥으로 새어 나가지 않게 막는다.
        // 1~9는 3×3으로 둔다. 전화기·계산기·키보드 넘버패드가 모두 이 배열이라
        // 찾지 않고 손이 기억한 자리로 누를 수 있다. 한 줄에 4개씩 끊어 놓았더니
        // 어디에도 없는 배열이 되어 매번 눈으로 훑어야 했다.
        // 0은 1~9 다음에 오는 마지막 숫자이자 가장 자주 누르는 키라 엄지가 닿기 쉬운
        // 오른쪽 아래에 둔다. 반대로 지우기·초기화는 잘못 눌리면 곤란하니 위로 보낸다.
        // 화면 폭에 따라 배열을 바꾸지 않는다 — 태블릿과 폰을 오가도 손가락 기억이 남는다.
        // 넓은 화면에서 폭을 안 막으면 키가 161×48(3.35:1)까지 늘어나 숫자패드가
        // 아니라 버튼 열두 개로 보인다. 3×3 배열을 고른 이유가 "전화기와 같은 모양이라
        // 손이 기억한다"였으니 모양이 깨지면 그 이득이 사라진다.
        // 맞춰야 할 건 키의 모양(가로세로비)이지 절대 크기가 아니다. 48px 높이는
        // 손가락 최소 터치 크기에서 나온 값이라 좁은 화면의 제약인데, 그대로 두었더니
        // 547px 상자에 320px 키패드가 놓여 좌우로 113px씩 비었다. 넓은 화면에서는
        // 비율(약 1.56:1)을 지킨 채 키 자체를 키운다.
        <div className="mt-2 grid grid-cols-4 gap-1.5 lg:mx-auto lg:mt-3 lg:max-w-[26rem]" onClick={(e) => e.stopPropagation()}>
          {[1, 2, 3].map((d) => (
            <KeyBtn key={d} onClick={() => onDigit(d)}>{d}</KeyBtn>
          ))}
          <KeyBtn onClick={onBackspace} muted title="한 자리 지우기">
            <Delete className="size-5" />
          </KeyBtn>
          {[4, 5, 6].map((d) => (
            <KeyBtn key={d} onClick={() => onDigit(d)}>{d}</KeyBtn>
          ))}
          <KeyBtn onClick={onClear} muted title="0으로 초기화">
            <RotateCcw className="size-5" />
          </KeyBtn>
          {[7, 8, 9, 0].map((d) => (
            <KeyBtn key={d} onClick={() => onDigit(d)}>{d}</KeyBtn>
          ))}
        </div>
      ) : (
        // 칸 아무 데나 눌러도 열리지만, 눌린다는 걸 알려 주는 표시가 필요하다.
        <div className="mt-1 text-center lg:mt-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2 py-1 text-[11px] font-bold text-muted-foreground">
            <Pencil className="size-3" /> 다시 입력
          </span>
        </div>
      )}
    </div>
  );
}

function KeyBtn({ onClick, children, muted, title }: { onClick: () => void; children: React.ReactNode; muted?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        // 손가락으로 눌러야 하니 높이를 넉넉히 준다. 넓은 화면은 터치 최소 크기에
        // 매일 이유가 없어 키를 키운다 — 글자도 숫자(72px)에 눌리지 않게 함께 키운다.
        "flex h-12 items-center justify-center rounded-lg border font-mono text-xl font-black tabular-nums transition-all active:scale-95 cursor-pointer lg:h-16 lg:text-2xl",
        muted
          // 회색 위 회색이면 눈에 안 들어온다. 지우기·초기화는 경고색으로 구분한다.
          ? "border-loss/40 bg-loss/10 text-loss hover:bg-loss/20"
          : "border-border/60 bg-surface-deep text-strong hover:border-neon-blue/60 hover:bg-accent/40",
      )}
    >
      {children}
    </button>
  );
}




// 점수를 넣는 동안 좁은 화면에서 대진을 한 줄로 접어 두는 띠. 선수 카드를 그대로
// 두면 점수판 두 개가 한 화면에 안 들어와, 한쪽 점수만 넣고 등록해 버리기 쉽다.
// 이름을 누르면 그 자리를 다시 고를 수 있어 접어도 수정 경로는 막히지 않는다.

// 선수를 고르는 동안 좁은 화면에 남겨 두는 대진 띠.
//
// 지금까지 좁은 화면에서는 명단이 열리면 대진이 통째로 숨겨졌다. 그래서 선수를
// 눌러도 명단은 그대로고 — 스크롤 위치도 검색어도 유지되니 화면이 문자 그대로
// 똑같아 보였다 — 바뀌는 건 왼쪽 위 11px 제목뿐이라, 내가 누른 건지 알 수 없었다.
// 이 띠가 있으면 탭 한 번에 두 군데가 반응한다: 명단의 그 카드가 팀 색으로 잠기고,
// 여기에 이름이 박히며, 강조가 다음 자리로 옮겨간다.
function LineupStrip({ teams, activeSlot, bumpSlot, onJump }: {
  teams: {
    title: string;
    accent: Accent;
    slots: { key: string; label: string; name: string | null }[];
  }[];
  activeSlot: string | null;
  /** 이미 들어간 선수를 명단에서 눌렀을 때 번쩍일 자리. */
  bumpSlot: string | null;
  onJump: (key: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {teams.map((t) => {
        const a = ACCENT[t.accent];
        return (
          <div key={t.title} className={cn("flex items-center gap-2 rounded-xl border px-2 py-1.5", a.soft)}>
            <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-black", a.band)}>{t.title}</span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {t.slots.map((sl, i) => (
                <span key={sl.key} className="flex min-w-0 flex-1 items-center gap-1.5">
                  {i > 0 && <span className="shrink-0 text-xs text-muted-foreground/50">·</span>}
                  <button
                    type="button"
                    onClick={() => onJump(sl.key)}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-lg border px-2 py-1 text-sm font-bold transition-all active:scale-95 cursor-pointer",
                      sl.name ? cn(a.fill, a.text) : "border-dashed border-border/60 bg-card/40 text-muted-foreground",
                      // 지금 고르는 자리를 링으로 세운다 — "다음은 여기"가 한눈에 보여야 한다.
                      activeSlot === sl.key && cn("ring-2", a.ring),
                      bumpSlot === sl.key && "animate-flash",
                    )}
                  >
                    {sl.name ?? sl.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
