import React, { useEffect, useState, useCallback, useRef, useMemo, createContext, useContext } from "react";
import type { Student, Match, ScheduledMatch, Gender, TierName, TierSettings, DynamicBonuses, DynamicPenalties, TiersRecord, DecaySettingsRecord, MatchInputMode } from "./league-types";
import { studentKey, getTier, getTierSubdivision, getFullTierLabel, TIER_ORDER } from "./league-types";
import { toast } from "sonner";
import { supabase } from "../supabaseClient";
import { calculateMatchResult } from "@/domain/match-calculator";
import {
  apiGetUser,
  apiSignOut,
  apiFetchClass,
  apiFetchClassSettings,
  apiUpdateClassSettings,
  apiUpdateClassSettingsAndName,
  apiFetchMatches,
  apiInsertMatch,
  apiDeleteMatch,
  apiDeleteStudentMatches,
  apiInsertMatchesBulk,
  apiUpdateMatchWinnerLoser,
  apiFetchStudents,
  apiFetchStudentsPublic,
  apiUpdateStudentRp,
  apiResetStudentRp,
  apiUpdateStudentFields,
  apiInsertStudent,
  apiSoftDeleteStudent,
  apiFetchDeletedStudents,
  apiRestoreStudent,
  apiHardDeleteStudent,
  apiUpdateStudentInfo,
  apiDeleteClassStudents,
  apiInsertStudentsBulk,
  apiRestoreClassData,
  apiRecordMatchTransaction,
  apiClaimPlayer,
  apiSetPlayerLevel,
  apiSetMemberAdmin,
  apiTransferOwnership,
  apiSetCoOwner,
  apiListSeasons,
  apiStartNewSeason,
  apiFetchSeasonStandings,
  apiFetchSeasonStandingsPublic,
  apiRenameSeason,
  apiDeleteSeason,
  apiApplyDormancyDecay,
  apiFetchDecayLog,
  apiFetchScheduledMatches,
  apiCreateScheduledMatch,
  apiUpdateScheduledStatus,
  apiDeleteScheduledMatch,
  apiCreateReservation,
  apiLinkScheduledResult,
  apiUpdateReservationPlayers,
  apiTouchReservationNotify,
  apiSaveMatchBreakdown,
  apiCreateChallenge,
  apiRespondChallenge
} from "@/services/league-api";
import { notifyPlayers } from "@/services/push-send";
import {
  DEFAULT_TIERS,
  DEFAULT_DECAY_SETTINGS,
  DEFAULT_DYNAMIC_PENALTIES,
  DEFAULT_DYNAMIC_BONUSES,
  migrateSettings
} from "./settings-migration";
import { buildTitleIndex, TITLE_BY_ID } from "./title-calculator";

export type ActiveBonuses = {
  firstWin: boolean;
  revenge: boolean;
  underdog: boolean;
  scoreDiff: boolean;
  rival: boolean;
};

// 휴면 감점 미리보기 대상 1건
export type DecayTarget = {
  id: string;
  name: string;
  tier: TierName;
  rp: number;
  decayRp: number;   // 차감 예정량(현재 RP를 넘지 않도록 클램프)
  rpAfter: number;
  daysInactive: number;
  lastActive: string | null;
};

// 휴면 감점 로그 1행 (decay_log 테이블)
export type DecayLogRow = {
  id: string;
  league_id: string;
  batch_id: string;
  player_id: string | null;
  player_name: string | null;
  tier: string | null;
  rp_before: number | null;
  rp_after: number | null;
  decay_rp: number | null;
  season: string | null;
  applied_at: string;
};

const TIER_RANKING: Record<TierName, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5
};

// Local storage caching keys removed

function uid() {
  return crypto.randomUUID();
}



type UserSession = {
  loginId: string;
  role: "MASTER" | "TEACHER" | "STUDENT";
  schoolName: string;
  userName: string;
  studentId?: string;
  leagueName?: string;
} | null;

function useLeagueStoreInternal() {
  const [hydrated, setHydrated] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<ScheduledMatch[]>([]);
  const loadScheduledRef = useRef<((classId: string) => void) | null>(null);
  const [title, setTitle] = useState<string>("2026 초등 리그전");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isClassOwner, setIsClassOwner] = useState<boolean>(false);
  const isClassOwnerRef = useRef(false);
  useEffect(() => { isClassOwnerRef.current = isClassOwner; }, [isClassOwner]);
  // 원조 방장 전용 판정 (소유권 위임·공동방장 관리·리그 삭제). isClassOwner는 공동방장 포함.
  const [isClassPrimaryOwner, setIsClassPrimaryOwner] = useState<boolean>(false);
  const isClassPrimaryOwnerRef = useRef(false);
  useEffect(() => { isClassPrimaryOwnerRef.current = isClassPrimaryOwner; }, [isClassPrimaryOwner]);
  // 관리 권한자: 소유자/공동관리자/기록원 — 선수·경기 관리 가능 (리그 글로벌 설정·시즌·복원은 소유자 전용)
  const [isClassManager, setIsClassManager] = useState<boolean>(false);
  const isClassManagerRef = useRef(false);
  useEffect(() => { isClassManagerRef.current = isClassManager; }, [isClassManager]);
  // 일반회원 포함 가입 여부 + 내 연동 선수
  const [isClassMember, setIsClassMember] = useState<boolean>(false);
  const isClassMemberRef = useRef(false);
  useEffect(() => { isClassMemberRef.current = isClassMember; }, [isClassMember]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  const [seasonList, setSeasonList] = useState<string[]>([]); // 과거 시즌 라벨만 (현재 시즌은 별도)
  const [currentSeason, setCurrentSeason] = useState<string>("시즌 1"); // 현재 활성 시즌의 실제 라벨
  const [currentViewSeason, setCurrentViewSeason] = useState<string>("현재 시즌");
  const currentViewSeasonRef = useRef(currentViewSeason);
  useEffect(() => {
    currentViewSeasonRef.current = currentViewSeason;
  }, [currentViewSeason]);

  // 3대 역할 로그인 세션 상태
  const [session, setSession] = useState<UserSession>(null);
  const [currentClassId, setCurrentClassId] = useState<string | null>(null);
  const currentClassIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentClassIdRef.current = currentClassId;
  }, [currentClassId]);
  // 관리자 세션 여부(소유자/공동관리자) — 과거 시즌 조회 시 실명 포함 여부 결정에 사용
  const isTeacherRef = useRef(false);
  const channelRef = useRef<any>(null);
  const loadClassDataRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const loadClassData = useCallback(async (classId: string, isBackground = false) => {
    loadClassDataRef.current = loadClassData;
    // 과거 시즌을 보는 중이면 백그라운드(실시간) 재로딩이 현재 시즌 데이터로 덮어쓰지 않도록 막는다.
    if (isBackground && currentViewSeasonRef.current !== "현재 시즌") return;
    if (!isBackground) setIsSyncing(true);
    try {
      // 1. Fetch class details
      const { data: classData, error: classErr } = await apiFetchClass(classId);
      if (classErr) throw classErr;

      // 권한 판별: 방장 = 원조 방장(owner_uid) + 공동방장(co_owner_uids)
      //            관리자 = 방장 + 공동관리자(admin_uids) / 일반회원 = member_uids(가입자)
      let isOwner = false;
      let isPrimaryOwner = false;
      let isManager = false;
      let isMember = false;
      let myUid: string | null = null;
      let authResolved = false;
      try {
        const { data: { user } } = await apiGetUser();
        if (user && classData) {
          authResolved = true;
          myUid = user.id;
          const uid = user.id;
          isPrimaryOwner = classData.owner_uid === uid;
          isOwner = isPrimaryOwner
            || (Array.isArray(classData.co_owner_uids) && classData.co_owner_uids.includes(uid));
          isManager = isOwner
            || (Array.isArray(classData.admin_uids) && classData.admin_uids.includes(uid));
          isMember = isManager
            || (Array.isArray(classData.member_uids) && classData.member_uids.includes(uid));
        }
      } catch (err) {
        console.warn("Failed to check owner uid inside loadClassData:", err);
      }
      // 백그라운드(실시간) 재로딩 중 인증이 일시적으로 실패하면 권한을 강등하지 말고 직전 권한 유지.
      if (!authResolved && isBackground) {
        isOwner = isClassOwnerRef.current;
        isPrimaryOwner = isClassPrimaryOwnerRef.current;
        isManager = isClassManagerRef.current;
        isMember = isClassMemberRef.current;
      }
      setIsClassOwner(isOwner);
      setIsClassPrimaryOwner(isPrimaryOwner);
      setIsClassManager(isManager);
      setIsClassMember(isMember);
      isClassOwnerRef.current = isOwner;
      isClassPrimaryOwnerRef.current = isPrimaryOwner;
      isClassManagerRef.current = isManager;
      isClassMemberRef.current = isMember;

      if (classData) {
        setTitle(classData.name);
        setOwnerUid(classData.owner_uid ?? "");
        setAdminUids(Array.isArray(classData.admin_uids) ? classData.admin_uids : []);
        setCoOwnerUids(Array.isArray(classData.co_owner_uids) ? classData.co_owner_uids : []);

        if (classData.settings) {
          const s = classData.settings;
          const migrated = migrateSettings(s);
          if (migrated) {
            if (migrated.tiers) setTiers(migrated.tiers);
            if (migrated.decaySettings) setDecaySettings(migrated.decaySettings);
            if (migrated.tierThresholds) setTierThresholds(migrated.tierThresholds);
            if (migrated.rpVariables) setRpVariables(migrated.rpVariables);
            if (migrated.decayEnabled !== undefined) setDecayEnabled(!!migrated.decayEnabled);
            if (migrated.decayDays !== undefined) setDecayDays(Number(migrated.decayDays));
            if (migrated.decayAmount !== undefined) setDecayAmount(Number(migrated.decayAmount));
            if (migrated.decayTiers !== undefined) setDecayTiers(migrated.decayTiers);
            if (migrated.lastDecayDate !== undefined) setLastDecayDate(migrated.lastDecayDate);
            if (migrated.decayApplied !== undefined && migrated.decayApplied) setDecayAppliedDates(migrated.decayApplied);
            if (migrated.tierSettings !== undefined) setTierSettings(migrated.tierSettings);
            if (migrated.dynamicBonuses !== undefined) setDynamicBonuses(migrated.dynamicBonuses);
             if (migrated.dynamicPenalties !== undefined) setDynamicPenalties(migrated.dynamicPenalties);
            if (migrated.activeBonuses !== undefined) setActiveBonuses(migrated.activeBonuses);
            if (migrated.matchInputMode !== undefined) setMatchInputMode(migrated.matchInputMode);
            if (migrated.placement) {
              setPlacementEnabled(!!migrated.placement.enabled);
              if (typeof migrated.placement.games === "number") setPlacementGames(migrated.placement.games);
            } else {
              setPlacementEnabled(false);
            }
          }
          // 레벨 체계는 마이그레이션 대상이 아니므로 settings에서 직접 읽음
          setLevelMode(s.levelMode === "preset" ? "preset" : "free");
          setLevels(Array.isArray(s.levels) ? s.levels : []);
          setSport(typeof s.sport === "string" ? s.sport : "");
        }
      }

      // 2. Fetch matches for this class — 현재 시즌 경기만 (과거 시즌은 changeViewSeason에서 별도 조회)
      const activeSeason = (classData?.settings?.season as string) || "시즌 1";
      setCurrentSeason(activeSeason);
      const { data: dbMatches, error: matchesErr } = await apiFetchMatches(classId, activeSeason);
      if (matchesErr) throw matchesErr;

      // Map Supabase matches to frontend Match structure
      const matchesList: Match[] = (dbMatches || []).map((m: any) => ({
        id: m.id,
        playerAId: m.winner_id,
        playerBId: m.loser_id,
        playerA2Id: m.winner2_id ?? undefined,
        playerB2Id: m.loser2_id ?? undefined,
        scoreA: m.winner_score ?? 21,
        scoreB: m.loser_score ?? 19,
        // playerA=winner_id 로 매핑되므로 승자 델타→A, 패자 델타→B 로 자동 정합.
        // 과거(마이그레이션 이전) 경기는 NULL → undefined 로 두어 deleteMatch fallback 이 동작.
        rpDeltaA: m.rp_delta_winner ?? undefined,
        rpDeltaB: m.rp_delta_loser ?? undefined,
        rpDeltaA2: m.rp_delta_winner2 ?? undefined,
        rpDeltaB2: m.rp_delta_loser2 ?? undefined,
        date: m.created_at || new Date().toISOString(),
        matchType: m.winner2_id ? "double" : "single",
        rpBreakdown: m.rp_breakdown ?? null
      }));

      // 3. Fetch students - 관리 권한자(소유자/공동관리자/기록원)는 실명 포함 조회
      const isTeacherSession = isManager;
      isTeacherRef.current = isTeacherSession;

      const studentsFetchResult = isTeacherSession
        ? await apiFetchStudents(classId)
        : await apiFetchStudentsPublic(classId);

      const { data: dbStudents, error: studentsErr } = studentsFetchResult;
      if (studentsErr) throw studentsErr;

      // Map Supabase students to frontend Student structure, computing stats on-the-fly
      const studentsList: Student[] = (dbStudents || []).map((s: any) => {
        const group = s.group_label ?? null;
        // name(표시)은 본명/닉네임/레벨 순으로 fallback
        const name = s.name || s.display_name || s.nickname || "이름없음";
        const gender = (s.gender || "U") as Gender;

        // Find matches for this student to compute derived stats
        // 복식: 파트너(playerA2Id/playerB2Id)도 승/패에 포함해야 함.
        const isWinnerSide = (m: Match) => m.playerAId === s.id || m.playerA2Id === s.id;
        const isLoserSide = (m: Match) => m.playerBId === s.id || m.playerB2Id === s.id;
        const studentMatches = matchesList
          .filter((m) => isWinnerSide(m) || isLoserSide(m))
          .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

        const wins = studentMatches.filter(isWinnerSide).length;
        const losses = studentMatches.filter(isLoserSide).length;

        // Last 5 matches form (W or L)
        const recent = studentMatches.slice(0, 5).map((m) => (isWinnerSide(m) ? "W" : "L"));

        // Current streak
        let currentStreak = 0;
        for (const m of studentMatches) {
          const won = isWinnerSide(m);
          if (currentStreak === 0) {
            currentStreak = won ? 1 : -1;
          } else if (currentStreak > 0) {
            if (won) currentStreak++;
            else break;
          } else {
            if (!won) currentStreak--;
            else break;
          }
        }

        return {
          id: s.id,
          league_id: s.league_id,
          userId: s.user_id ?? null,
          name,
          nickname: s.nickname ?? "",
          group,
          birthYear: s.birth_year ?? null,
          displayName: s.display_name ?? null,
          equippedTitle: s.equipped_title ?? null,
          gender,
          rp: s.rp || 1000,
          wins,
          losses,
          recent,
          currentStreak,
        };
      });

      // Sort students by RP descending
      studentsList.sort((a, b) => b.rp - a.rp);

      setStudents(studentsList);

      // 내 연동 선수 + 세션 역할: 관리자=TEACHER, 일반회원=STUDENT(연동 선수)
      const myPlayer = myUid ? studentsList.find((s) => s.userId === myUid) : null;
      setMyPlayerId(myPlayer?.id ?? null);
      if (myUid) {
        if (isManager) {
          setSession((prev) => prev ? { ...prev, role: "TEACHER", studentId: undefined } : prev);
        } else if (isMember) {
          setSession((prev) => prev ? { ...prev, role: "STUDENT", studentId: myPlayer?.id } : prev);
        }
      }

      // We reverse matches to show newest first in history
      const sortedMatches = [...matchesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMatches(sortedMatches);

      // 대진 호출(예정 경기) — 별도 테이블, RP/통계와 무관
      try {
        const { data: sched } = await apiFetchScheduledMatches(classId);
        setScheduledMatches((sched || []) as ScheduledMatch[]);
      } catch { /* 비치명적 */ }

      setCurrentClassId(classId);

      // 시즌 목록 채우기: ["현재 시즌", ...과거 시즌 라벨]
      try {
        const { data: seasons } = await apiListSeasons(classId);
        if (seasons) {
          const past = (seasons as any[])
            .filter((r) => !r.is_current)
            .map((r) => r.season as string)
            .filter(Boolean);
          setSeasonList(past);
        }
      } catch (err) {
        console.warn("Failed to load season list:", err);
      }

      // Realtime subscription setup
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase.channel(`class-realtime-${classId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `league_id=eq.${classId}` },
          () => {
            loadClassDataRef.current?.(classId, true);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `league_id=eq.${classId}` },
          () => {
            loadClassDataRef.current?.(classId, true);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "scheduled_matches", filter: `league_id=eq.${classId}` },
          () => {
            loadScheduledRef.current?.(classId);
          }
        )
        .subscribe();
      channelRef.current = channel;
    } catch (err: any) {
      console.error("Failed to load class data from Supabase:", err.message);
      toast.error("클래스 데이터를 불러오는데 실패했습니다: " + err.message);
    } finally {
      if (!isBackground) setIsSyncing(false);
      setHydrated(true);
    }
  }, []);

  // 리그전 커스텀 설정 상태 추가
  const [tiers, setTiers] = useState<TiersRecord>({ ...DEFAULT_TIERS });
  const [decaySettings, setDecaySettings] = useState<DecaySettingsRecord>({ ...DEFAULT_DECAY_SETTINGS });

  const [tierThresholds, setTierThresholds] = useState<Record<TierName, number>>({
    Bronze: 0,
    Silver: 1000,
    Gold: 1200,
    Platinum: 1400,
    Diamond: 1600
  });
  const [rpVariables, setRpVariables] = useState<{ winDelta: number; loseDelta: number }>({
    winDelta: 10,
    loseDelta: 20
  });

  const [tierSettings, setTierSettings] = useState<TierSettings>({
    Bronze: { winDelta: 20, loseDelta: 0 },
    Silver: { winDelta: 15, loseDelta: 5 },
    Gold: { winDelta: 15, loseDelta: 10 },
    Platinum: { winDelta: 10, loseDelta: 15 }
  });

  const [dynamicBonuses, setDynamicBonuses] = useState<DynamicBonuses>({
    ...DEFAULT_DYNAMIC_BONUSES
  });

  const [dynamicPenalties, setDynamicPenalties] = useState<DynamicPenalties>({
    ...DEFAULT_DYNAMIC_PENALTIES
  });

  const [activeBonuses, setActiveBonuses] = useState<ActiveBonuses>({
    firstWin: true,
    revenge: true,
    underdog: true,
    scoreDiff: true,
    rival: true
  });

  const [decayEnabled, setDecayEnabled] = useState<boolean>(false);
  const [decayDays, setDecayDays] = useState<number>(10);
  const [decayAmount, setDecayAmount] = useState<number>(5);
  const [decayTiers, setDecayTiers] = useState<TierName[]>(["Gold", "Platinum", "Diamond"]);
  const [lastDecayDate, setLastDecayDate] = useState<string>("");
  // 선수별 마지막 휴면 감점 적용일 (YYYY-MM-DD). 사이클당 1회 감점 판정의 기준 시점.
  const [decayAppliedDates, setDecayAppliedDates] = useState<Record<string, string>>({});

  // 경기 입력 방식 (관리자 제어). 기존 리그는 클럽형(관리자만) 기본값.
  const [matchInputMode, setMatchInputMode] = useState<MatchInputMode>("admin-only");
  // 배치고사(언랭크): 신규 회원은 N경기 전까지 티어 비공개
  const [placementEnabled, setPlacementEnabled] = useState<boolean>(false);
  const [placementGames, setPlacementGames] = useState<number>(3);
  // 레벨 체계 (구 구분조): preset=정의된 목록만 / free=자유 입력
  const [levelMode, setLevelMode] = useState<"preset" | "free">("free");
  const [levels, setLevels] = useState<{ name: string; description?: string }[]>([]);
  const [sport, setSport] = useState<string>("");
  // 권한 판정용: 리그 소유자/공동관리자 UID (선수 명단의 userId 와 대조)
  const [ownerUid, setOwnerUid] = useState<string>("");
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [coOwnerUids, setCoOwnerUids] = useState<string[]>([]);
  const matchInputModeRef = useRef<MatchInputMode>("admin-only");
  useEffect(() => { matchInputModeRef.current = matchInputMode; }, [matchInputMode]);

  const [promotionQueue, setPromotionQueue] = useState<{ isPromoted: boolean; newTier: string; studentName?: string }[]>([]);
  const promotionEvent = promotionQueue[0] || null;
  const setPromotionEvent = useCallback((event: { isPromoted: boolean; newTier: string; studentName?: string } | null) => {
    if (event === null) {
      setPromotionQueue((prev) => prev.slice(1));
    } else {
      setPromotionQueue((prev) => [...prev, event]);
    }
  }, []);

  // 4. 로그아웃 수행 함수
  const logoutUser = useCallback(() => {
    setSession(null);
    setStudents([]);
    setMatches([]);
    apiSignOut().then(() => {
      window.location.href = "/";
    });
  }, []);

  // 5. 초기 기동 시 세션 및 로컬 데이터 Hydration
  useEffect(() => {
    const initData = async () => {
      try {
        const { data: { user: supabaseUser } } = await apiGetUser();
        if (supabaseUser) {
          setSession({
            loginId: supabaseUser.id,
            role: "TEACHER",
            schoolName: "우리 클럽",
            userName: supabaseUser.email?.split("@")[0] || "관리자"
          });
        } else {
          setSession(null);
        }
      } catch (err) {
        console.warn("Failed to retrieve Supabase session in initData:", err);
      } finally {
        setHydrated(true);
      }
    };

    initData();
  }, []);


  // Helper to calculate loss streak before a certain match date
  const getLossStreakBeforeMatch = useCallback((studentId: string, matchDate: string, excludeMatchId?: string) => {
    const sMatches = matches
      .filter((m) => m.id !== excludeMatchId && new Date(m.date).getTime() < new Date(matchDate).getTime() && (m.playerAId === studentId || m.playerBId === studentId || m.playerA2Id === studentId || m.playerB2Id === studentId))
      .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
    let consecutiveLosses = 0;
    for (const m of sMatches) {
      const mIsA = m.playerAId === studentId || m.playerA2Id === studentId;
      const mAWon = m.scoreA > m.scoreB;
      const mWon = mIsA ? mAWon : !mAWon;
      if (!mWon) {
        consecutiveLosses++;
      } else {
        break;
      }
    }
    return consecutiveLosses;
  }, [matches]);

  // 경기 기록 및 동기화 (단식/복식 지원, 개별 보너스 연산 적용)
  const recordMatch = useCallback((
    playerAId: string, 
    playerBId: string, 
    scoreA: number, 
    scoreB: number,
    playerA2Id?: string,
    playerB2Id?: string,
    matchType: "single" | "double" = "single"
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    // 경기 입력 방식 게이트. admin-only면 관리자만 입력 가능.
    // free/peer-confirm/admin-approve는 Phase 1에선 모두 통과(승인형은 Phase 2에서 구현).
    if (matchInputModeRef.current === "admin-only" && !isClassManagerRef.current) {
      toast.error("이 리그는 관리자만 경기를 입력할 수 있습니다.");
      return;
    }
    if (playerAId === playerBId) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const aWon = scoreA > scoreB;

    const playerA = students.find((s) => s.id === playerAId);
    const playerB = students.find((s) => s.id === playerBId);
    const playerA2 = playerA2Id ? students.find((s) => s.id === playerA2Id) : null;
    const playerB2 = playerB2Id ? students.find((s) => s.id === playerB2Id) : null;

    const isPlayerAInvalid = !playerA || isNaN(playerA.rp) || typeof playerA.rp !== "number";
    const isPlayerBInvalid = !playerB || isNaN(playerB.rp) || typeof playerB.rp !== "number";
    const isPlayerA2Invalid = playerA2Id ? (!playerA2 || isNaN(playerA2.rp) || typeof playerA2.rp !== "number") : false;
    const isPlayerB2Invalid = playerB2Id ? (!playerB2 || isNaN(playerB2.rp) || typeof playerB2.rp !== "number") : false;

    if (isPlayerAInvalid || isPlayerBInvalid || isPlayerA2Invalid || isPlayerB2Invalid) {
      toast.error("선수 데이터가 완전히 동기화되지 않았습니다. 새로고침 후 다시 시도해주세요.", {
        id: "student-not-synced-error",
        duration: 5000
      });
      return;
    }

    // 오늘의 날짜 구하기 (로컬 타임존 반영)
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    const todayYmd = localToday.toISOString().split("T")[0];

    const matchId = uid();
    const matchDate = new Date().toISOString();

    const { playerStats, nextStudents, match, promotions } = calculateMatchResult({
      students,
      matches,
      playerAId,
      playerBId,
      scoreA,
      scoreB,
      playerA2Id,
      playerB2Id,
      matchType,
      tierThresholds,
      tiers,
      rpVariables,
      dynamicBonuses,
      dynamicPenalties,
      todayYmd,
      matchId,
      matchDate
    });

    const nextMatches = [match, ...matches];

    promotions.forEach((p) => {
      setPromotionEvent(p);
    });

    setMatches(nextMatches);
    setStudents(nextStudents);

    const rpChanges: Record<string, number> = {};
    playerStats.forEach((p) => {
      rpChanges[p.id] = p.delta;
    });

    const previousStudents = [...students];
    const previousMatches = [...matches];

    if (currentClassId) {
      const runSupabaseRecord = async () => {
        try {
          const winnerId = aWon ? playerAId : playerBId;
          const loserId = aWon ? playerBId : playerAId;
          const winner2Id = (aWon ? playerA2Id : playerB2Id) ?? null;
          const loser2Id = (aWon ? playerB2Id : playerA2Id) ?? null;
          const winnerScore = aWon ? scoreA : scoreB;
          const loserScore = aWon ? scoreB : scoreA;
          const playerUpdates = nextStudents
            .filter(s => s.id === playerAId || s.id === playerBId || s.id === playerA2Id || s.id === playerB2Id)
            .map(s => ({ id: s.id, rp: s.rp }));

          // 이 경기로 각 선수에게 실제 적용된 RP 변동(델타)을 승자/패자 기준으로 저장.
          // 롤백(deleteMatch)/편집이 이 값을 그대로 역산해 정확히 되돌린다.
          const deltaOf = (id: string | null | undefined) =>
            id ? (playerStats.find(p => p.id === id)?.delta ?? null) : null;

          await apiRecordMatchTransaction({
            classId: currentClassId,
            matchId,
            winnerId,
            loserId,
            playerUpdates,
            winner2Id,
            loser2Id,
            winnerScore,
            loserScore,
            rpDeltaWinner: deltaOf(winnerId),
            rpDeltaLoser: deltaOf(loserId),
            rpDeltaWinner2: deltaOf(winner2Id),
            rpDeltaLoser2: deltaOf(loser2Id)
          });
          toast.success("경기가 등록되었습니다!");
        } catch (err: any) {
          console.error("Failed to record match in Supabase:", err.message);
          toast.error("경기 등록에 실패하여 데이터가 원래대로 롤백되었습니다: " + err.message);
          setStudents(previousStudents);
          setMatches(previousMatches);
        } finally {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      };
      runSupabaseRecord();
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }

    return match;
  }, [students, matches, rpVariables, tierThresholds, currentClassId]);

  // 결과 영수증 스냅샷 저장 — record_match_transaction(RPC) 삽입이 커밋될 때까지 잠깐 재시도
  const saveMatchBreakdown = useCallback(async (matchId: string, breakdown: unknown): Promise<void> => {
    // 로컬 상태에도 즉시 반영(방금 기록한 경기를 바로 클릭해도 보이도록)
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, rpBreakdown: breakdown } : m)));
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from("matches").update({ rp_breakdown: breakdown }).eq("id", matchId).select("id");
      if (!error && data && data.length > 0) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    // 마지막 시도(실패해도 치명적 아님)
    await apiSaveMatchBreakdown(matchId, breakdown);
  }, []);

  // ── RP 복원: 경기 기록을 rp=1000부터 시간순 재생해 최종 상태를 다시 계산 ──
  const replayStudents = useCallback((): Student[] => {
    // 모든 현재 선수를 초기 상태(1000 RP·0승 0패·이력 없음)로 리셋
    let cur: Student[] = students.map((s) => ({
      ...s, rp: 1000, wins: 0, losses: 0, recent: [], currentStreak: 0,
      lastWinDate: undefined, lastMatchDate: undefined, totalMatches: 0,
    }));
    const idset = new Set(cur.map((s) => s.id));
    const ordered = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const past: Match[] = [];
    for (const m of ordered) {
      const refs = [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id].filter(Boolean) as string[];
      // 참조 선수가 하나라도 없으면(삭제 등) 안전하게 건너뜀
      if (refs.some((id) => !idset.has(id))) { past.push(m); continue; }
      const ymd = (m.date || "").split("T")[0] || new Date(m.date).toISOString().split("T")[0];
      const { nextStudents } = calculateMatchResult({
        students: cur,
        matches: past,
        playerAId: m.playerAId,
        playerBId: m.playerBId,
        playerA2Id: m.playerA2Id,
        playerB2Id: m.playerB2Id,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        matchType: m.matchType ?? (m.playerA2Id ? "double" : "single"),
        tierThresholds,
        tiers,
        rpVariables,
        dynamicBonuses,
        dynamicPenalties,
        todayYmd: ymd,
        matchId: m.id,
        matchDate: m.date,
      });
      cur = nextStudents;
      past.push(m);
    }
    return cur;
  }, [students, matches, tierThresholds, tiers, rpVariables, dynamicBonuses, dynamicPenalties]);

  // 복원 미리보기 — 저장 없이 현재 RP vs 재계산 RP 비교
  const recomputeRpPreview = useCallback(() => {
    const replayed = replayStudents();
    return students.map((s) => {
      const r = replayed.find((x) => x.id === s.id);
      return {
        id: s.id,
        name: s.displayName || s.name || s.nickname || "이름없음",
        before: s.rp,
        after: r ? r.rp : s.rp,
      };
    }).sort((a, b) => b.after - a.after);
  }, [students, replayStudents]);

  // 복원 실행 — 재계산된 RP를 DB에 저장 (방장·공동방장)
  const applyRecomputedRp = useCallback(async (): Promise<number> => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌은 복원할 수 없습니다 (읽기 전용).");
      return 0;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 방장·공동방장만 복원할 수 있습니다.");
      return 0;
    }
    if (!currentClassId) return 0;
    if (matches.length === 0) { toast.info("재생할 경기 기록이 없습니다."); return 0; }
    const replayed = replayStudents();
    const changed = replayed.filter((r) => {
      const s = students.find((x) => x.id === r.id);
      return s && s.rp !== r.rp;
    });
    try {
      setIsSyncing(true);
      for (const r of changed) await apiUpdateStudentRp(r.id, r.rp);
      toast.success(`RP 복원 완료: ${changed.length}명 재계산되었습니다.`, { duration: 5000 });
      await loadClassDataRef.current?.(currentClassId, true);
      return changed.length;
    } catch (e: any) {
      console.error("Failed to recompute RP:", e);
      toast.error("복원 실패: " + (e?.message ?? "알 수 없는 오류"));
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [replayStudents, students, matches, isClassOwner, currentClassId]);

  // 경기 삭제(롤백) 및 동기화
  const deleteMatch = useCallback(async (matchId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 선수·경기 관리 권한이 없습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const match = matches.find((m) => m.id === matchId);
    if (!match) {
      isSyncingRef.current = false;
      setIsSyncing(false);
      return;
    }

    const nextMatches = matches.filter((m) => m.id !== matchId);

    const playerAId = match.playerAId;
    const playerBId = match.playerBId;
    const playerA2Id = match.playerA2Id;
    const playerB2Id = match.playerB2Id;
    const aWon = match.scoreA > match.scoreB;

    const activePlayerIds = [playerAId, playerBId, playerA2Id, playerB2Id].filter(Boolean) as string[];

    const nextStudents = students.map((s) => {
      if (!activePlayerIds.includes(s.id)) return s;

      const isTeamA = s.id === playerAId || s.id === playerA2Id;
      const won = isTeamA ? aWon : !aWon;
      
      let rpDelta = 0;
      if (s.id === playerAId) {
        rpDelta = match.rpDeltaA !== undefined ? -match.rpDeltaA : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
      } else if (s.id === playerBId) {
        rpDelta = match.rpDeltaB !== undefined ? -match.rpDeltaB : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
      } else if (s.id === playerA2Id) {
        rpDelta = match.rpDeltaA2 !== undefined ? -match.rpDeltaA2 : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
      } else if (s.id === playerB2Id) {
        rpDelta = match.rpDeltaB2 !== undefined ? -match.rpDeltaB2 : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
      }
      const newRp = Math.max(0, s.rp + rpDelta);
      const newWins = Math.max(0, s.wins - (won ? 1 : 0));
      const newLosses = Math.max(0, s.losses - (won ? 0 : 1));

      const sMatches = nextMatches
        .filter((m) => m.playerAId === s.id || m.playerBId === s.id || m.playerA2Id === s.id || m.playerB2Id === s.id)
        .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
        .slice(0, 5);

      const newRecent = sMatches.map((m) => {
        const mIsA = m.playerAId === s.id || m.playerA2Id === s.id;
        const mAWon = m.scoreA > m.scoreB;
        const mWon = mIsA ? mAWon : !mAWon;
        return mWon ? "W" : "L";
      });

      return {
        ...s,
        rp: newRp,
        wins: newWins,
        losses: newLosses,
        recent: newRecent,
      };
    });

    const previousStudents = [...students];
    const previousMatches = [...matches];
    setMatches(nextMatches);
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        // Delete match from Supabase
        const { error: deleteErr } = await apiDeleteMatch(matchId);
        if (deleteErr) throw deleteErr;

        // Update affected students' RP in Supabase
        for (const s of nextStudents) {
          if (activePlayerIds.includes(s.id)) {
            await apiUpdateStudentRp(s.id, s.rp);
          }
        }
        toast.success("경기가 삭제되었습니다!");
      } catch (err: any) {
        console.error("Failed to delete match in Supabase:", err.message);
        toast.error("경기 삭제에 실패했습니다: " + err.message);
        setMatches(previousMatches);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, matches, rpVariables, currentClassId, isClassOwner]);

  // 개별 선수 전적 리셋 및 동기화
  const resetStudent = useCallback(async (studentId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const nextMatches = matches.filter(
      (m) => m.playerAId !== studentId && m.playerBId !== studentId && m.playerA2Id !== studentId && m.playerB2Id !== studentId
    );

    const playedOpponents = new Set<string>();
    matches.forEach((m) => {
      if (m.playerAId === studentId || m.playerA2Id === studentId) {
        if (m.playerBId) playedOpponents.add(m.playerBId);
        if (m.playerB2Id) playedOpponents.add(m.playerB2Id);
        const partnerId = m.playerAId === studentId ? m.playerA2Id : m.playerAId;
        if (partnerId) playedOpponents.add(partnerId);
      }
      if (m.playerBId === studentId || m.playerB2Id === studentId) {
        if (m.playerAId) playedOpponents.add(m.playerAId);
        if (m.playerA2Id) playedOpponents.add(m.playerA2Id);
        const partnerId = m.playerBId === studentId ? m.playerB2Id : m.playerBId;
        if (partnerId) playedOpponents.add(partnerId);
      }
    });

    const nextStudents = students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          rp: 1000,
          wins: 0,
          losses: 0,
          recent: [],
        };
      }

      if (playedOpponents.has(s.id)) {
        const sMatches = nextMatches
          .filter((m) => m.playerAId === s.id || m.playerBId === s.id || m.playerA2Id === s.id || m.playerB2Id === s.id)
          .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
          .slice(0, 5);

        const newRecent = sMatches.map((m) => {
          const mIsA = m.playerAId === s.id || m.playerA2Id === s.id;
          const mAWon = m.scoreA > m.scoreB;
          const mWon = mIsA ? mAWon : !mAWon;
          return mWon ? "W" : "L";
        });

        return {
          ...s,
          recent: newRecent,
        };
      }

      return s;
    });

    const previousStudents = [...students];
    const previousMatches = [...matches];
    setMatches(nextMatches);
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        // Reset player RP to 1000 in Supabase
        await apiResetStudentRp(studentId);
        
        // Delete player's matches from matches table
        await apiDeleteStudentMatches(studentId);

        // Update affected opponents' RP in Supabase
        for (const s of nextStudents) {
          if (playedOpponents.has(s.id)) {
            await apiUpdateStudentRp(s.id, s.rp);
          }
        }
        toast.success("선수의 전적이 초기화되었습니다!");
      } catch (err: any) {
        console.error("Failed to reset student in Supabase:", err.message);
        toast.error("전적 초기화에 실패했습니다: " + err.message);
        setMatches(previousMatches);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, matches, currentClassId, isClassOwner]);

  // (전체 데이터 초기화 기능은 제거됨 — 전원 리셋은 '새 시즌 시작'이 안전하게 대체.)

  // 관리자 관리자 수동 RP 수정 및 동기화
  const updateStudentRP = useCallback(async (studentId: string, nextRp: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const nextStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        rp: Math.max(0, nextRp),
      };
    });

    const previousStudents = [...students];
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        await apiUpdateStudentRp(studentId, Math.max(0, nextRp));
        toast.success("RP가 수정되었습니다.");
      } catch (err: any) {
        console.error("Failed to update student RP in Supabase:", err.message);
        toast.error("RP 수정에 실패했습니다: " + err.message);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, currentClassId, isClassOwner]);

  // 새로운 명렬표 대량 업서트 및 동기화
  const upsertStudents = useCallback(
    async (rows: { name?: string; nickname?: string | null; gender?: Gender; group?: string | null; birthYear?: number | null }[]) => {
      if (currentViewSeasonRef.current !== "현재 시즌") {
        toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
        return { added: 0, kept: 0 };
      }
      if (!isClassManagerRef.current) {
        toast.error("권한이 없습니다. 선수·경기 관리 권한이 없습니다.");
        return { added: 0, kept: 0 };
      }
      if (isSyncingRef.current) {
        toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
        return { added: 0, kept: 0 };
      }
      isSyncingRef.current = true;
      setIsSyncing(true);

      let added = 0, kept = 0;
      const keyOf = (x: { name?: string | null; group?: string | null }) => `${x.group ?? ""}|${x.name ?? ""}`;
      const byKey = new Map(students.map((s) => [keyOf(s), s]));
      const next: Student[] = [];
      const seenKeys = new Set<string>();
      for (const r of rows) {
        const k = keyOf({ name: r.name, group: r.group });
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        const exists = byKey.get(k);
        if (exists) {
          kept++;
          next.push({ ...exists, gender: r.gender ?? exists.gender });
        } else {
          added++;
          next.push({
            id: uid(),
            name: r.name ?? r.nickname ?? "",
            nickname: r.nickname ?? null,
            group: r.group ?? null,
            birthYear: r.birthYear ?? null,
            gender: r.gender ?? "U",
            rp: 1000,
            recent: [],
            wins: 0,
            losses: 0,
          });
        }
      }
      for (const s of students) {
        const k = studentKey(s);
        if (!seenKeys.has(k)) next.push(s);
      }
      
      const previousStudents = [...students];
      setStudents(next);

      if (currentClassId) {
        try {
          setIsSyncing(true);
          // Perform upserts into Supabase students table
          for (const r of rows) {
            const key = keyOf({ name: r.name, group: r.group });
            const exists = byKey.get(key);
            if (exists) {
              await apiUpdateStudentFields(exists.id, {
                name: r.name,
                nickname: r.nickname ?? null,
                group_label: r.group ?? null,
                birth_year: r.birthYear ?? null,
                gender: r.gender || 'U'
              });
            } else {
              const { data: insertedData, error: insertErr } = await apiInsertStudent(currentClassId, {
                name: r.name,
                nickname: r.nickname ?? null,
                group_label: r.group ?? null,
                birth_year: r.birthYear ?? null,
                gender: r.gender || 'U',
                rp: 1000
              });

              if (insertErr) throw insertErr;
              if (insertedData) {
                const idx = next.findIndex(s => keyOf(s) === key);
                if (idx !== -1) {
                  next[idx].id = insertedData.id;
                }
              }
            }
          }
          // Re-update local state with actual database UUIDs
          setStudents([...next]);
          toast.success("선수 명단이 업데이트되었습니다!");
        } catch (err: any) {
          console.error("Failed to upsert students in Supabase:", err.message);
          toast.error("명단 등록에 실패했습니다: " + err.message);
          setStudents(previousStudents);
          return { added: 0, kept: 0 };
        } finally {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      } else {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }

      return { added, kept };
    },
    [students, currentClassId, isClassOwner],
  );

  // 리그전 커스텀 설정 캘리브레이션 업데이트 함수
  const updateLeagueSettings = useCallback(async (thresholds: Record<TierName, number>, rpVars: { winDelta: number; loseDelta: number }) => {
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    setTierThresholds(thresholds);
    setRpVariables(rpVars);

    // Also update the local tiers state to stay in sync
    const nextTiers = {
      bronze: {
        threshold: thresholds.Bronze ?? 0,
        winRp: tierSettings?.Bronze?.winDelta ?? 20,
        loseRp: tierSettings?.Bronze?.loseDelta ?? 0
      },
      silver: {
        threshold: thresholds.Silver ?? 1000,
        winRp: tierSettings?.Silver?.winDelta ?? 15,
        loseRp: tierSettings?.Silver?.loseDelta ?? 5
      },
      gold: {
        threshold: thresholds.Gold ?? 1200,
        winRp: tierSettings?.Gold?.winDelta ?? 15,
        loseRp: tierSettings?.Gold?.loseDelta ?? 10
      },
      platinum: {
        threshold: thresholds.Platinum ?? 1400,
        winRp: tierSettings?.Platinum?.winDelta ?? 10,
        loseRp: tierSettings?.Platinum?.loseDelta ?? 15
      },
      diamond: {
        threshold: thresholds.Diamond ?? 1600,
        winRp: rpVars.winDelta ?? 10,
        loseRp: rpVars.loseDelta ?? 20
      }
    };
    setTiers(nextTiers);

    // 즉시 반영
    const sortedStudents = [...students].sort((a, b) => b.rp - a.rp);
    setStudents(sortedStudents);

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        
        const newSettings = {
          ...(currentClass?.settings || {}),
          tierThresholds: thresholds,
          rpVariables: rpVars,
          tiers: nextTiers
        };

        await apiUpdateClassSettings(currentClassId, newSettings);
        // 토스트는 호출측(AdminSettings)의 toast.promise에서 한 번만 처리. 여기선 조용히, 실패는 rethrow.
      } catch (err: any) {
        console.error("Failed to update settings in Supabase:", err.message);
        throw err;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, tierSettings, currentClassId, isClassOwner]);

  // 특정 선수의 성별 변경 및 구글 시트 동기화
  const updateStudentGender = useCallback(async (studentId: string, gender: Gender) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const nextStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      return { ...s, gender };
    });
    const previousStudents = [...students];
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        await apiUpdateStudentFields(studentId, { gender });
        toast.success("성별이 변경되었습니다.");
      } catch (err: any) {
        console.error("Failed to update student gender in Supabase:", err.message);
        toast.error("성별 변경에 실패했습니다: " + err.message);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, currentClassId, isClassOwner]);

  // 개별 선수 삭제 및 연쇄 삭제 & 전적 복구 롤백
  const deleteStudent = useCallback(async (studentId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const matchesToRemove = matches.filter((m) => m.playerAId === studentId || m.playerBId === studentId || m.playerA2Id === studentId || m.playerB2Id === studentId);
    const nextMatches = matches.filter((m) => m.playerAId !== studentId && m.playerBId !== studentId && m.playerA2Id !== studentId && m.playerB2Id !== studentId);

    // 1. 삭제할 선수 제외
    let nextStudents = students.filter((s) => s.id !== studentId);

    // 2. 삭제되는 경기들의 상대방 & 아군 파트너 전적 복구
    matchesToRemove.forEach((m) => {
      const aWon = m.scoreA > m.scoreB;
      const isPlayerA = m.playerAId === studentId || m.playerA2Id === studentId;
      
      const partnerId = isPlayerA 
        ? (m.playerAId === studentId ? m.playerA2Id : m.playerAId) 
        : (m.playerBId === studentId ? m.playerB2Id : m.playerBId);
        
      const oppIds = isPlayerA 
        ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[] 
        : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];

      const affectedPlayers = [
        ...oppIds.map(id => ({ id, isOpponent: true })),
        partnerId ? { id: partnerId, isOpponent: false } : null
      ].filter(Boolean) as { id: string; isOpponent: boolean }[];

      nextStudents = nextStudents.map((s) => {
        const affected = affectedPlayers.find(ap => ap.id === s.id);
        if (!affected) return s;

        let rpDelta = 0;
        const won = affected.isOpponent ? !isPlayerA : isPlayerA;
        
        if (s.id === m.playerAId) {
          rpDelta = m.rpDeltaA !== undefined ? -m.rpDeltaA : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
        } else if (s.id === m.playerBId) {
          rpDelta = m.rpDeltaB !== undefined ? -m.rpDeltaB : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
        } else if (s.id === m.playerA2Id) {
          rpDelta = m.rpDeltaA2 !== undefined ? -m.rpDeltaA2 : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
        } else if (s.id === m.playerB2Id) {
          rpDelta = m.rpDeltaB2 !== undefined ? -m.rpDeltaB2 : (won ? -rpVariables.winDelta : rpVariables.loseDelta);
        }

        const newRp = Math.max(0, s.rp + rpDelta);
        const newWins = Math.max(0, s.wins - (won ? 1 : 0));
        const newLosses = Math.max(0, s.losses - (won ? 0 : 1));

        return {
          ...s,
          rp: newRp,
          wins: newWins,
          losses: newLosses,
        };
      });
    });

    // 3. 상대방들의 recent 배열 재구성
    nextStudents = nextStudents.map((s) => {
      const sMatches = nextMatches
        .filter((m) => m.playerAId === s.id || m.playerBId === s.id || m.playerA2Id === s.id || m.playerB2Id === s.id)
        .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
        .slice(0, 5);

      const newRecent = sMatches.map((m) => {
        const mIsA = m.playerAId === s.id || m.playerA2Id === s.id;
        const mAWon = m.scoreA > m.scoreB;
        const mWon = mIsA ? mAWon : !mAWon;
        return mWon ? "W" : "L";
      });

      return {
        ...s,
        recent: newRecent,
      };
    });

    const previousStudents = [...students];
    const previousMatches = [...matches];
    setMatches(nextMatches);
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        // Soft Delete student in Supabase
        await apiSoftDeleteStudent(studentId);
        // Delete student's matches
        await apiDeleteStudentMatches(studentId);

        // Update affected partners/opponents RP in Supabase
        for (const s of nextStudents) {
          const isAffected = matchesToRemove.some(m => 
            m.playerAId === s.id || m.playerBId === s.id || m.playerA2Id === s.id || m.playerB2Id === s.id
          );
          if (isAffected) {
            await apiUpdateStudentRp(s.id, s.rp);
          }
        }
        toast.success("선수가 삭제되었습니다!");
      } catch (err: any) {
        console.error("Failed to delete student in Supabase:", err.message);
        toast.error("선수 삭제에 실패했습니다: " + err.message);
        setMatches(previousMatches);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, matches, rpVariables, currentClassId, isClassOwner]);

  // 특정 선수 정보 전체 수정 및 동기화
  const updateStudentInfo = useCallback(async (
    studentId: string,
    info: { name: string; nickname?: string | null; group?: string | null; gender: Gender; rp?: number; birthYear?: number | null }
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    // Update local state first (Optimistic)
    const nextStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        name: info.name,
        nickname: info.nickname ?? s.nickname,
        group: info.group ?? s.group,
        gender: info.gender,
        rp: info.rp !== undefined ? info.rp : s.rp,
        birthYear: info.birthYear !== undefined ? info.birthYear : s.birthYear
      };
    });
    const previousStudents = [...students];
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        const updatePayload: any = {
          name: info.name,
          nickname: info.nickname ?? null,
          group_label: info.group ?? null,
          gender: info.gender
        };
        if (info.rp !== undefined) {
          updatePayload.rp = info.rp;
        }
        if (info.birthYear !== undefined) {
          updatePayload.birth_year = info.birthYear;
        }
        const { error } = await apiUpdateStudentInfo(studentId, updatePayload);
        if (error) throw error;
        toast.success("선수 정보가 수정되었습니다.");
      } catch (err: any) {
        console.error("Failed to update student info in Supabase:", err.message);
        toast.error("선수 정보 수정에 실패했습니다: " + err.message);
        setStudents(previousStudents);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, currentClassId, isClassOwner]);

  // 일괄 선수 정보 수정 (엑셀형 편집 저장) — 한 번의 낙관적 갱신 + 병렬 저장
  const bulkUpdateStudents = useCallback(async (
    updates: { id: string; name?: string; nickname?: string | null; group?: string | null; gender?: Gender; rp?: number; birthYear?: number | null }[]
  ): Promise<boolean> => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return false;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 선수·경기 관리 권한이 없습니다.");
      return false;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    if (updates.length === 0) return true;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const previous = [...students];
    const byId = new Map(updates.map((u) => [u.id, u]));
    const next = students.map((s) => {
      const u = byId.get(s.id);
      if (!u) return s;
      return {
        ...s,
        name: u.name ?? s.name,
        nickname: u.nickname ?? s.nickname,
        group: u.group ?? s.group,
        gender: u.gender ?? s.gender,
        rp: u.rp ?? s.rp,
        birthYear: u.birthYear !== undefined ? u.birthYear : s.birthYear,
      };
    });
    setStudents(next);

    try {
      const results = await Promise.all(updates.map((u) => {
        const payload: any = {};
        if (u.name !== undefined) payload.name = u.name;
        if (u.nickname !== undefined) payload.nickname = u.nickname;
        if (u.group !== undefined) payload.group_label = u.group;
        if (u.gender !== undefined) payload.gender = u.gender;
        if (u.rp !== undefined) payload.rp = u.rp;
        if (u.birthYear !== undefined) payload.birth_year = u.birthYear;
        return apiUpdateStudentInfo(u.id, payload);
      }));
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;
      toast.success(`${updates.length}명의 정보를 저장했습니다.`);
      return true;
    } catch (err: any) {
      console.error("Bulk update failed:", err);
      toast.error("일괄 저장에 실패했습니다: " + (err.message || ""));
      setStudents(previous);
      return false;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, currentClassId, isClassOwner]);

  // 휴지통: 삭제된 선수 목록 조회
  const fetchDeletedStudents = useCallback(async (): Promise<{ id: string; name: string; nickname: string; group: string | null; rp: number }[]> => {
    const classId = currentClassIdRef.current;
    if (!classId) return [];
    const { data, error } = await apiFetchDeletedStudents(classId);
    if (error) {
      console.warn("Failed to fetch deleted students:", error);
      return [];
    }
    return ((data as any[]) || []).map((s) => ({
      id: s.id,
      name: s.name ?? "",
      nickname: s.nickname ?? "",
      group: s.group_label ?? null,
      rp: s.rp ?? 1000,
    }));
  }, []);

  // 휴지통: 선수 복원
  const restoreDeletedStudent = useCallback(async (studentId: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const classId = currentClassIdRef.current;
    if (!classId) return false;
    const { error } = await apiRestoreStudent(studentId);
    if (error) { toast.error("복원에 실패했습니다: " + error.message); return false; }
    toast.success("선수을 복원했습니다. (과거 경기 기록은 복구되지 않습니다)");
    await loadClassDataRef.current?.(classId);
    return true;
  }, [isClassOwner]);

  // 휴지통: 영구 삭제
  const hardDeleteStudent = useCallback(async (studentId: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const { error } = await apiHardDeleteStudent(studentId);
    if (error) { toast.error("영구 삭제에 실패했습니다: " + error.message); return false; }
    toast.success("선수을 영구 삭제했습니다.");
    return true;
  }, [isClassOwner]);

  // CSV 롤백 복원 액션
  const restoreFromCSV = useCallback(async (restoredStudents: Student[], restoredMatches: Match[]) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const previousStudents = [...students];
    const previousMatches = [...matches];
    setStudents(restoredStudents);
    setMatches(restoredMatches);

    if (currentClassId) {
      try {
        // 서버에서 원자적(트랜잭션)으로 삭제+삽입. 어느 한 행이라도 잘못되면 자동 롤백되어 원본 보존.
        const { data, error } = await apiRestoreClassData(currentClassId, restoredStudents, restoredMatches);
        if (error) throw error;

        const counts = (data as any) || {};
        toast.success(`복원 완료! (선수 ${counts.students ?? 0}명, 경기 ${counts.matches ?? 0}건)`);
        // 서버 기준으로 다시 로딩하여 화면과 DB를 일치시킨다.
        await loadClassDataRef.current?.(currentClassId);
      } catch (err: any) {
        console.error("Failed to restore data in Supabase:", err.message);
        toast.error("데이터 복구에 실패했습니다(원본은 그대로 유지됨): " + err.message);
        setStudents(previousStudents);
        setMatches(previousMatches);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, matches, currentClassId, isClassOwner]);

  // 관리자 통제형 휴면 강등 일괄 RP 차감 액션
  const bulkDecayRP = useCallback(async (inactiveDays: number, decayAmount: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return 0;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return 0;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return 0;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    let affectedCount = 0;
    const now = new Date().getTime();

    // 오늘 날짜 (YYYY-MM-DD, 로컬) — 감점 적용일 기록용
    const todayLocal = new Date(now - (new Date().getTimezoneOffset() * 60 * 1000));
    const todayStr = todayLocal.toISOString().split("T")[0];
    const nextApplied = { ...decayAppliedDates };

    const nextStudents = students.map((s) => {
      const studentTier = getTier(s.rp, tierThresholds);
      const tierKey = studentTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
      const setting = decaySettings[tierKey];

      if (!setting || !setting.enabled) return s;
      if (!s.lastMatchDate) return s;

      const limitDays = inactiveDays !== undefined ? inactiveDays : setting.inactiveDays;
      const amount = decayAmount !== undefined ? decayAmount : setting.decayRp;
      const msThreshold = limitDays * 24 * 60 * 60 * 1000;

      // 사이클당 1회: max(마지막 경기일, 마지막 감점일) 기준
      const lastMatchTime = new Date(s.lastMatchDate).getTime();
      const appliedStr = decayAppliedDates[s.id];
      const baseline = Math.max(lastMatchTime, appliedStr ? new Date(appliedStr).getTime() : 0);
      const elapsed = now - baseline;
      if (elapsed >= msThreshold) {
        affectedCount++;
        nextApplied[s.id] = todayStr;
        return {
          ...s,
          rp: Math.max(0, s.rp - amount),
        };
      }
      return s;
    });

    if (affectedCount > 0) {
      const previousStudents = [...students];
      setStudents(nextStudents);
      setDecayAppliedDates(nextApplied);

      if (currentClassId) {
        try {
          for (const s of nextStudents) {
            const prev = previousStudents.find((ps) => ps.id === s.id);
            if (prev && prev.rp !== s.rp) {
              await apiUpdateStudentRp(s.id, s.rp);
            }
          }
          // 감점 적용일 맵을 클래스 설정에 영속화
          try {
            const { data: currentClass } = await apiFetchClassSettings(currentClassId);
            await apiUpdateClassSettings(currentClassId, {
              ...(currentClass?.settings || {}),
              decayApplied: nextApplied
            });
          } catch (e) {
            console.warn("Failed to persist decayApplied map:", e);
          }
          toast.success(`휴면 강등 완료: ${affectedCount}명의 RP가 차감되었습니다.`);
        } catch (err: any) {
          console.error("Failed to apply decay in Supabase:", err.message);
          toast.error("휴면 강등 적용에 실패했습니다: " + err.message);
          setStudents(previousStudents);
        } finally {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      } else {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }

    return affectedCount;
  }, [students, matches, tierThresholds, decaySettings, decayAppliedDates, currentClassId, isClassOwner]);

  // 경기 점수 수정 및 보너스/RP 완벽 재계산 액션
  const updateMatchScore = useCallback(async (matchId: string, nextScoreA: number, nextScoreB: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    const playerAId = match.playerAId;
    const playerBId = match.playerBId;
    const playerA2Id = match.playerA2Id;
    const playerB2Id = match.playerB2Id;
    
    const oldAWon = match.scoreA > match.scoreB;
    const oldRpDeltaA = match.rpDeltaA ?? 0;
    const oldRpDeltaB = match.rpDeltaB ?? 0;
    const oldRpDeltaA2 = match.rpDeltaA2 ?? 0;
    const oldRpDeltaB2 = match.rpDeltaB2 ?? 0;

    const activePlayerIds = [playerAId, playerBId, playerA2Id, playerB2Id].filter(Boolean) as string[];

    // 1. Rollback old match stats for all active students to get their "pre-match" state
    const rolledBackStudents = students.map((s) => {
      if (!activePlayerIds.includes(s.id)) return s;

      const isTeamA = s.id === playerAId || s.id === playerA2Id;
      const oldWon = isTeamA ? oldAWon : !oldAWon;
      
      let oldDelta = 0;
      if (s.id === playerAId) oldDelta = oldRpDeltaA;
      else if (s.id === playerBId) oldDelta = oldRpDeltaB;
      else if (s.id === playerA2Id) oldDelta = oldRpDeltaA2;
      else if (s.id === playerB2Id) oldDelta = oldRpDeltaB2;

      // Rollback wins, losses, RP
      const newRp = Math.max(0, s.rp - oldDelta);
      const newWins = Math.max(0, s.wins - (oldWon ? 1 : 0));
      const newLosses = Math.max(0, s.losses - (oldWon ? 0 : 1));

      return {
        ...s,
        rp: newRp,
        wins: newWins,
        losses: newLosses,
      };
    });

    // 2. Perform recalculation using the rolled back students
    const aWon = nextScoreA > nextScoreB;
    
    const activePlayers = [
      { id: playerAId, role: "A" as const, isA: true },
      { id: playerA2Id, role: "A2" as const, isA: true },
      { id: playerBId, role: "B" as const, isA: false },
      { id: playerB2Id, role: "B2" as const, isA: false }
    ].filter((p) => p.id !== undefined && p.id !== "") as { id: string; role: "A" | "A2" | "B" | "B2"; isA: boolean }[];

    // precompute match-level freshness using past matches (excluding current match)
    let isFreshMatch = false;
    if (dynamicBonuses?.freshnessEnabled) {
      const teamAIds = [playerAId, playerA2Id].filter(Boolean) as string[];
      const teamBIds = [playerBId, playerB2Id].filter(Boolean) as string[];
      const gamesLimit = dynamicBonuses.freshnessGames || 5;
      const pastMatches = matches.filter((m) => m.id !== matchId);

      const teamAHasFacedTeamB = teamAIds.some((memberId) => {
        const memberMatches = pastMatches
          .filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId)
          .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
          .slice(-gamesLimit);
        return memberMatches.some((m) => {
          const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
          return teamBIds.some((bId) => mPlayers.includes(bId));
        });
      });

      const teamBHasFacedTeamA = teamBIds.some((memberId) => {
        const memberMatches = pastMatches
          .filter((m) => m.playerAId === memberId || m.playerBId === memberId || m.playerA2Id === memberId || m.playerB2Id === memberId)
          .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
          .slice(-gamesLimit);
        return memberMatches.some((m) => {
          const mPlayers = [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].filter(Boolean);
          return teamAIds.some((aId) => mPlayers.includes(aId));
        });
      });

      isFreshMatch = !teamAHasFacedTeamB && !teamBHasFacedTeamA;
    }

    // precompute if winning team got revenge
    const winningPlayerIds = aWon 
      ? [playerAId, playerA2Id].filter(Boolean) as string[]
      : [playerBId, playerB2Id].filter(Boolean) as string[];
    const losingPlayerIds = aWon
      ? [playerBId, playerB2Id].filter(Boolean) as string[]
      : [playerAId, playerA2Id].filter(Boolean) as string[];

    const winningTeamGotRevenge = winningPlayerIds.some((wId) => {
      if (!dynamicBonuses?.revengeEnabled) return false;
      const s = rolledBackStudents.find((st) => st.id === wId);
      if (!s) return false;
      const pastMatches = matches.filter((m) => m.id !== matchId);
      const sRecentMatches = pastMatches
        .filter((m) => m.playerAId === wId || m.playerBId === wId || m.playerA2Id === wId || m.playerB2Id === wId)
        .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
        .slice(-20);

      return sRecentMatches.some((m) => {
        const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
        const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
        const mAWon = m.scoreA > m.scoreB;
        
        const sIsOnA = mTeamA.includes(wId);
        const sIsOnB = mTeamB.includes(wId);
        
        if (sIsOnA) {
          const lost = !mAWon;
          const facedAnyOpp = mTeamB.some((oppId) => losingPlayerIds.includes(oppId));
          return lost && facedAnyOpp;
        }
        if (sIsOnB) {
          const lost = mAWon;
          const facedAnyOpp = mTeamA.some((oppId) => losingPlayerIds.includes(oppId));
          return lost && facedAnyOpp;
        }
        return false;
      });
    });

    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    const todayYmd = localToday.toISOString().split("T")[0];

    const playerStats = activePlayers.map((p) => {
      const student = rolledBackStudents.find((s) => s.id === p.id);
      if (!student) return null;

      const won = p.isA ? aWon : !aWon;
      const oppIds = p.isA 
        ? [playerBId, playerB2Id].filter(Boolean) as string[] 
        : [playerAId, playerA2Id].filter(Boolean) as string[];
      const opponents = rolledBackStudents.filter((s) => oppIds.includes(s.id));

      let underdogBonus = 0;
      let firstWinBonus = 0;
      let revengeBonus = 0;
      let freshnessBonus = 0;
      let streakBonus = 0;
      let mentoringBonus = 0;
      let greatMatchBonus = 0;
      let lossComfortBonus = 0;

      let arrogancePenalty = 0;
      let crushingPenalty = 0;
      let revengeAllowedPenalty = 0;
      let championPenalty = 0;
      let swampPenalty = 0;

      const playerTier = getTier(student.rp, tierThresholds);
      const tierKey = playerTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
      const baseWin = tiers[tierKey]?.winRp ?? 10;
      const baseLoss = tiers[tierKey]?.loseRp ?? 20;

      // freshness 계산 (승패 무관, 양팀 선수 전원 적용)
      if (dynamicBonuses?.freshnessEnabled && isFreshMatch) {
        freshnessBonus = dynamicBonuses.freshnessRp ?? 5;
      }

      // Copy chronological streak bonus from old match
      if (p.role === "A") {
        streakBonus = match.streakBonusA ?? 0;
      } else if (p.role === "A2") {
        streakBonus = match.streakBonusA2 ?? 0;
      } else if (p.role === "B") {
        streakBonus = match.streakBonusB ?? 0;
      } else if (p.role === "B2") {
        streakBonus = match.streakBonusB2 ?? 0;
      }

      let willOfSteelBonus = 0;
      if (won) {
        if (dynamicBonuses?.underdogEnabled && opponents.length > 0) {
          const TIER_NUM: Record<TierName, number> = { Bronze: 0, Silver: 1, Gold: 2, Platinum: 3, Diamond: 4 };
          const myTierNum = TIER_NUM[playerTier as TierName] ?? 0;
          const maxOppRp = Math.max(...opponents.map((o) => o.rp));
          const maxOppTier = getTier(maxOppRp, tierThresholds);
          const maxOppTierNum = TIER_NUM[maxOppTier] ?? 0;
          const tierDiff = maxOppTierNum - myTierNum;
          if (tierDiff === 1) {
            underdogBonus = dynamicBonuses.underdogDiff1Rp ?? 5;
          } else if (tierDiff === 2) {
            underdogBonus = dynamicBonuses.underdogDiff2Rp ?? 10;
          } else if (tierDiff >= 3) {
            underdogBonus = dynamicBonuses.underdogDiff3Rp ?? 15;
          }
        }

        if (dynamicBonuses?.firstWinEnabled) {
          firstWinBonus = student.lastWinDate !== todayYmd ? (dynamicBonuses.firstWinRp ?? 15) : 0;
        }

        if (dynamicBonuses?.revengeEnabled) {
          const pastMatches = matches.filter((m) => m.id !== matchId);
          const sRecentMatches = pastMatches
            .filter((m) => m.playerAId === student.id || m.playerBId === student.id || m.playerA2Id === student.id || m.playerB2Id === student.id)
            .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
            .slice(-20);

          const hasPastLoss = sRecentMatches.some((m) => {
            const mTeamA = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
            const mTeamB = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
            const mAWon = m.scoreA > m.scoreB;
            
            const sIsOnA = mTeamA.includes(student.id);
            const sIsOnB = mTeamB.includes(student.id);
            
            if (sIsOnA) {
              const lost = !mAWon;
              const facedAnyOpp = mTeamB.some((oppId) => oppIds.includes(oppId));
              return lost && facedAnyOpp;
            }
            if (sIsOnB) {
              const lost = mAWon;
              const facedAnyOpp = mTeamA.some((oppId) => oppIds.includes(oppId));
              return lost && facedAnyOpp;
            }
            return false;
          });
          revengeBonus = hasPastLoss ? (dynamicBonuses.revengeRp ?? 10) : 0;
        }

        if (dynamicBonuses?.greatMatchEnabled) {
          const scoreDiff = Math.abs(nextScoreA - nextScoreB);
          if (scoreDiff === 1) {
            greatMatchBonus = dynamicBonuses.greatMatchWin1Rp ?? 10;
          } else if (scoreDiff === 2) {
            greatMatchBonus = dynamicBonuses.greatMatchWin2Rp ?? 5;
          } else if (scoreDiff === 3) {
            greatMatchBonus = dynamicBonuses.greatMatchWin3Rp ?? 2;
          }
        }

        if (dynamicBonuses?.willOfSteelEnabled) {
          const preStreak = getLossStreakBeforeMatch(student.id, match.date, matchId);
          if (preStreak >= 3) {
            if (preStreak === 3) {
              willOfSteelBonus = dynamicBonuses.willOfSteel3Rp ?? 10;
            } else if (preStreak === 4) {
              willOfSteelBonus = dynamicBonuses.willOfSteel4Rp ?? 15;
            } else if (preStreak >= 5) {
              willOfSteelBonus = dynamicBonuses.willOfSteel5Rp ?? 20;
            }
          }
        }

        if (match.matchType === "double") {
          const partnerId = p.role === "A" ? playerA2Id : p.role === "A2" ? playerAId : p.role === "B" ? playerB2Id : playerBId;
          if (partnerId) {
            const partner = rolledBackStudents.find((s) => s.id === partnerId);
            if (partner) {
              const partnerTier = getTier(partner.rp, tierThresholds);
              const myTierRank = TIER_RANKING[playerTier] ?? 1;
              const partnerTierRank = TIER_RANKING[partnerTier] ?? 1;
              if (dynamicBonuses?.mentoring?.enabled) {
                const minGap = dynamicBonuses.mentoring.minTierGap ?? 1;
                const gap = Math.abs(myTierRank - partnerTierRank);
                if (gap >= minGap) {
                  if (myTierRank > partnerTierRank) {
                    mentoringBonus = dynamicBonuses.mentoring.mentorRp ?? 10;
                  } else if (myTierRank < partnerTierRank) {
                    mentoringBonus = dynamicBonuses.mentoring.menteeRp ?? 15;
                  }
                }
              }
            }
          }
        }
      } else {
        if (dynamicBonuses?.lossComfortEnabled) {
          const maxTier = dynamicBonuses.lossComfortMaxTier || "Silver";
          const maxTierRank = TIER_RANKING[maxTier] ?? 2;
          const playerTierRank = TIER_RANKING[playerTier] ?? 1;
          if (playerTierRank <= maxTierRank) {
            const preStreak = getLossStreakBeforeMatch(student.id, match.date, matchId);
            const currentLossStreak = preStreak + 1;
            if (currentLossStreak >= 2) {
              lossComfortBonus = dynamicBonuses.lossComfortRp ?? 5;
            }
          }
        }

        if (dynamicBonuses?.greatMatchEnabled) {
          const scoreDiff = Math.abs(nextScoreA - nextScoreB);
          if (scoreDiff === 1) {
            greatMatchBonus = dynamicBonuses.greatMatchLose1Rp ?? 5;
          } else if (scoreDiff === 2) {
            greatMatchBonus = dynamicBonuses.greatMatchLose2Rp ?? 2;
          } else if (scoreDiff === 3) {
            greatMatchBonus = dynamicBonuses.greatMatchLose3Rp ?? 0;
          }
        }

        const isGoldPlus = playerTier === "Gold" || playerTier === "Platinum" || playerTier === "Diamond";
        if (isGoldPlus && opponents.length > 0) {
          const playerTierRank = TIER_RANKING[playerTier] ?? 1;
          const maxOppRp = Math.max(...opponents.map((o) => o.rp));
          const maxOppTier = getTier(maxOppRp, tierThresholds);
          const maxOppTierRank = TIER_RANKING[maxOppTier] ?? 1;

          if (dynamicPenalties?.arrogance && playerTierRank - maxOppTierRank >= 2) {
            if (playerTier === "Gold") arrogancePenalty = dynamicPenalties.arroganceGold ?? 20;
            else if (playerTier === "Platinum") arrogancePenalty = dynamicPenalties.arrogancePlatinum ?? 30;
            else if (playerTier === "Diamond") arrogancePenalty = dynamicPenalties.arroganceDiamond ?? 40;
          }

          if (dynamicPenalties?.crushing && Math.abs(nextScoreA - nextScoreB) >= 5) {
            if (playerTier === "Gold") crushingPenalty = dynamicPenalties.crushingGold ?? 10;
            else if (playerTier === "Platinum") crushingPenalty = dynamicPenalties.crushingPlatinum ?? 15;
            else if (playerTier === "Diamond") crushingPenalty = dynamicPenalties.crushingDiamond ?? 20;
          }

          if (dynamicPenalties?.revengeFail && winningTeamGotRevenge) {
            if (playerTier === "Gold") revengeAllowedPenalty = dynamicPenalties.revengeAllowedGold ?? 10;
            else if (playerTier === "Platinum") revengeAllowedPenalty = dynamicPenalties.revengeAllowedPlatinum ?? 15;
            else if (playerTier === "Diamond") revengeAllowedPenalty = dynamicPenalties.revengeAllowedDiamond ?? 20;
          }

          if (dynamicPenalties?.championWeight) {
            if (playerTier === "Gold") championPenalty = dynamicPenalties.championGold ?? 5;
            else if (playerTier === "Platinum") championPenalty = dynamicPenalties.championPlatinum ?? 10;
            else if (playerTier === "Diamond") championPenalty = dynamicPenalties.championDiamond ?? 15;
          }

          if (dynamicPenalties?.lossStreak) {
            const preLossStreak = getLossStreakBeforeMatch(student.id, match.date, matchId);
            const currentLossStreak = preLossStreak + 1;
            if (currentLossStreak === 2) {
              if (playerTier === "Gold") swampPenalty = dynamicPenalties.swampGold2 ?? 5;
              else if (playerTier === "Platinum") swampPenalty = dynamicPenalties.swampPlatinum2 ?? 10;
              else if (playerTier === "Diamond") swampPenalty = dynamicPenalties.swampDiamond2 ?? 15;
            } else if (currentLossStreak >= 3) {
              if (playerTier === "Gold") swampPenalty = dynamicPenalties.swampGold3 ?? 10;
              else if (playerTier === "Platinum") swampPenalty = dynamicPenalties.swampPlatinum3 ?? 15;
              else if (playerTier === "Diamond") swampPenalty = dynamicPenalties.swampDiamond3 ?? 25;
            }
          }
        }
      }

      const delta = won 
        ? (baseWin + underdogBonus + freshnessBonus + streakBonus + greatMatchBonus + mentoringBonus + firstWinBonus + revengeBonus + willOfSteelBonus)
        : (-baseLoss + freshnessBonus + lossComfortBonus + greatMatchBonus - (arrogancePenalty + crushingPenalty + revengeAllowedPenalty + championPenalty + swampPenalty));

      return {
        id: student.id,
        role: p.role,
        isA: p.isA,
        won,
        delta,
        underdogBonus,
        scoreDiffBonus: 0,
        rivalBonus: 0,
        firstWinBonus,
        revengeBonus,
        freshnessBonus,
        streakBonus,
        comebackBonus: 0,
        marginBonus: 0,
        mentoringBonus,
        greatMatchBonus,
        lossComfortBonus,
        willOfSteelBonus,
        arrogancePenalty,
        crushingPenalty,
        revengeAllowedPenalty,
        championPenalty,
        swampPenalty
      };
    }).filter(Boolean) as {
      id: string;
      role: "A" | "A2" | "B" | "B2";
      isA: boolean;
      won: boolean;
      delta: number;
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
      greatMatchBonus: number;
      lossComfortBonus: number;
      willOfSteelBonus: number;
      arrogancePenalty: number;
      crushingPenalty: number;
      revengeAllowedPenalty: number;
      championPenalty: number;
      swampPenalty: number;
    }[];

    const statA = playerStats.find((p) => p.role === "A");
    const statB = playerStats.find((p) => p.role === "B");
    const statA2 = playerStats.find((p) => p.role === "A2");
    const statB2 = playerStats.find((p) => p.role === "B2");

    // 승리팀 중 실시간 승급 효과 감지 (복식 지원으로 여러 명 동시 승급 가능)
    const promotedPlayers = playerStats.filter((ps) => {
      if (!ps.won) return false;
      const s = rolledBackStudents.find((st) => st.id === ps.id);
      if (!s) return false;
      const finalRp = s.rp + ps.delta;
      const prevTier = getTier(s.rp, tierThresholds);
      const finalTier = getTier(finalRp, tierThresholds);
      const prevSub = getTierSubdivision(s.rp, tierThresholds);
      const finalSub = getTierSubdivision(finalRp, tierThresholds);
      
      const basePromoted = TIER_ORDER.indexOf(finalTier) < TIER_ORDER.indexOf(prevTier);
      const subPromoted = finalTier === prevTier && finalSub < prevSub;
      return basePromoted || subPromoted;
    });

    promotedPlayers.forEach((ps) => {
      const s = rolledBackStudents.find((st) => st.id === ps.id);
      if (s) {
        const finalRp = s.rp + ps.delta;
        const currentLabel = getFullTierLabel(finalRp, tierThresholds);
        setPromotionEvent({
          isPromoted: true,
          newTier: currentLabel,
          studentName: s.name
        });
      }
    });

    // 3. Construct the updated Match record
    const updatedMatch: Match = {
      ...match,
      scoreA: nextScoreA,
      scoreB: nextScoreB,
      rpDeltaA: statA?.delta,
      rpDeltaB: statB?.delta,
      rpDeltaA2: statA2?.delta,
      rpDeltaB2: statB2?.delta,
      underdogBonusA: statA?.underdogBonus ?? 0,
      underdogBonusB: statB?.underdogBonus ?? 0,
      underdogBonusA2: statA2?.underdogBonus ?? 0,
      underdogBonusB2: statB2?.underdogBonus ?? 0,
      scoreDiffBonusA: 0,
      scoreDiffBonusB: 0,
      scoreDiffBonusA2: 0,
      scoreDiffBonusB2: 0,
      rivalBonusA: 0,
      rivalBonusB: 0,
      rivalBonusA2: 0,
      rivalBonusB2: 0,
      firstWinBonusA: statA?.firstWinBonus ?? 0,
      firstWinBonusB: statB?.firstWinBonus ?? 0,
      firstWinBonusA2: statA2?.firstWinBonus ?? 0,
      firstWinBonusB2: statB2?.firstWinBonus ?? 0,
      revengeBonusA: statA?.revengeBonus ?? 0,
      revengeBonusB: statB?.revengeBonus ?? 0,
      revengeBonusA2: statA2?.revengeBonus ?? 0,
      revengeBonusB2: statB2?.revengeBonus ?? 0,
      marginBonusA: 0,
      marginBonusB: 0,
      marginBonusA2: 0,
      marginBonusB2: 0,
      mentoringBonusA: statA?.mentoringBonus ?? 0,
      mentoringBonusB: statB?.mentoringBonus ?? 0,
      mentoringBonusA2: statA2?.mentoringBonus ?? 0,
      mentoringBonusB2: statB2?.mentoringBonus ?? 0,
      greatMatchBonusA: statA?.greatMatchBonus,
      greatMatchBonusB: statB?.greatMatchBonus,
      greatMatchBonusA2: statA2?.greatMatchBonus,
      greatMatchBonusB2: statB2?.greatMatchBonus,
      lossComfortBonusA: statA?.lossComfortBonus,
      lossComfortBonusB: statB?.lossComfortBonus,
      lossComfortBonusA2: statA2?.lossComfortBonus,
      lossComfortBonusB2: statB2?.lossComfortBonus,
      arrogancePenaltyA: statA?.arrogancePenalty,
      arrogancePenaltyB: statB?.arrogancePenalty,
      arrogancePenaltyA2: statA2?.arrogancePenalty,
      arrogancePenaltyB2: statB2?.arrogancePenalty,
      crushingPenaltyA: statA?.crushingPenalty,
      crushingPenaltyB: statB?.crushingPenalty,
      crushingPenaltyA2: statA2?.crushingPenalty,
      crushingPenaltyB2: statB2?.crushingPenalty,
      revengeAllowedPenaltyA: statA?.revengeAllowedPenalty,
      revengeAllowedPenaltyB: statB?.revengeAllowedPenalty,
      revengeAllowedPenaltyA2: statA2?.revengeAllowedPenalty,
      revengeAllowedPenaltyB2: statB2?.revengeAllowedPenalty,
      championPenaltyA: statA?.championPenalty,
      championPenaltyB: statB?.championPenalty,
      championPenaltyA2: statA2?.championPenalty,
      championPenaltyB2: statB2?.championPenalty,
      swampPenaltyA: statA?.swampPenalty,
      swampPenaltyB: statB?.swampPenalty,
      swampPenaltyA2: statA2?.swampPenalty,
      swampPenaltyB2: statB2?.swampPenalty,
      willOfSteelBonusA: statA?.willOfSteelBonus,
      willOfSteelBonusB: statB?.willOfSteelBonus,
      willOfSteelBonusA2: statA2?.willOfSteelBonus,
      willOfSteelBonusB2: statB2?.willOfSteelBonus,
    };

    // 4. Update both students' stats with the new deltas
    const nextStudentsList = rolledBackStudents.map((s) => {
      if (!activePlayerIds.includes(s.id)) return s;

      const pStat = playerStats.find((p) => p.id === s.id);
      if (!pStat) return s;

      const won = pStat.won;
      const delta = pStat.delta;

      const preRp = s.rp;
      const nextRp = Math.max(0, preRp + delta);

      // Build new recent array
      const tempMatches = matches.map((m) => m.id === matchId ? updatedMatch : m);
      const sMatches = tempMatches
        .filter((m) => m.playerAId === s.id || m.playerBId === s.id || m.playerA2Id === s.id || m.playerB2Id === s.id)
        .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
        .slice(0, 5);

      const newRecent = sMatches.map((m) => {
        const mIsA = m.playerAId === s.id || m.playerA2Id === s.id;
        const mAWon = m.scoreA > m.scoreB;
        const mWon = mIsA ? mAWon : !mAWon;
        return mWon ? "W" : "L";
      });

      return {
        ...s,
        rp: nextRp,
        wins: s.wins + (won ? 1 : 0),
        losses: s.losses + (won ? 0 : 1),
        recent: newRecent,
        lastMatchDate: new Date().toISOString(),
        lastWinDate: won ? todayYmd : s.lastWinDate,
      };
    });

    const nextMatchesList = matches.map((m) => m.id === matchId ? updatedMatch : m);

    const previousStudents = [...students];
    setStudents(nextStudentsList);
    setMatches(nextMatchesList);

    if (currentClassId) {
      try {
        const nextAWon = nextScoreA > nextScoreB;
        const winnerId = nextAWon ? playerAId : playerBId;
        const loserId = nextAWon ? playerBId : playerAId;
        const winner2Id = (nextAWon ? match.playerA2Id : match.playerB2Id) ?? null;
        const loser2Id = (nextAWon ? match.playerB2Id : match.playerA2Id) ?? null;
        const winnerScore = nextAWon ? nextScoreA : nextScoreB;
        const loserScore = nextAWon ? nextScoreB : nextScoreA;

        // 재계산된 델타를 승자/패자 기준으로 함께 저장(승/패가 뒤바뀐 경우도 정합).
        const deltaOf = (id: string | null | undefined) =>
          id ? (playerStats.find((p) => p.id === id)?.delta ?? null) : null;

        const { error: updateErr } = await apiUpdateMatchWinnerLoser(matchId, winnerId, loserId, {
          winner2Id, loser2Id, winnerScore, loserScore,
          rpDeltaWinner: deltaOf(winnerId),
          rpDeltaLoser: deltaOf(loserId),
          rpDeltaWinner2: deltaOf(winner2Id),
          rpDeltaLoser2: deltaOf(loser2Id)
        });
        if (updateErr) throw updateErr;

        for (const s of nextStudentsList) {
          if (activePlayerIds.includes(s.id)) {
            const { error: studErr } = await apiUpdateStudentRp(s.id, s.rp);
            if (studErr) throw studErr;
          }
        }
        toast.success("경기 결과가 수정 및 재계산되었습니다.");
      } catch (err: any) {
        console.error("Failed to update match score in Supabase:", err.message);
        toast.error("경기 수정에 실패했습니다: " + err.message);
        setStudents(previousStudents);
        setMatches(matches);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [matches, students, tierThresholds, rpVariables, currentClassId, isClassOwner]);

  // 리그 커스텀 설정 통합 저장 (마스터 DB 동기화 포함)
  const saveLeagueSettings = useCallback(async (
    newTitle: string, 
    newBonuses: ActiveBonuses, 
    newTierSettings?: TierSettings,
    newDynamicBonuses?: DynamicBonuses,
    newDynamicPenalties?: DynamicPenalties
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 설정은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    setTitle(newTitle);
    setActiveBonuses(newBonuses);

    let finalTierSettings = tierSettings;
    if (newTierSettings) {
      finalTierSettings = newTierSettings;
      setTierSettings(newTierSettings);
    }

    let finalDynamicBonuses = dynamicBonuses;
    if (newDynamicBonuses) {
      finalDynamicBonuses = newDynamicBonuses;
      setDynamicBonuses(newDynamicBonuses);
    }

    let finalDynamicPenalties = dynamicPenalties;
    if (newDynamicPenalties) {
      const isEnabled = !!newDynamicPenalties.enabled;
      finalDynamicPenalties = {
        ...newDynamicPenalties,
        arrogance: newDynamicPenalties.arrogance !== undefined ? !!newDynamicPenalties.arrogance : isEnabled,
        crushing: newDynamicPenalties.crushing !== undefined ? !!newDynamicPenalties.crushing : isEnabled,
        revengeFail: newDynamicPenalties.revengeFail !== undefined ? !!newDynamicPenalties.revengeFail : isEnabled,
        championWeight: newDynamicPenalties.championWeight !== undefined ? !!newDynamicPenalties.championWeight : isEnabled,
        lossStreak: newDynamicPenalties.lossStreak !== undefined ? !!newDynamicPenalties.lossStreak : isEnabled
      };
      setDynamicPenalties(finalDynamicPenalties);
    }

    // Map tier settings to the new "tiers" structure
    const nextTiers = {
      bronze: {
        threshold: tierThresholds.Bronze ?? 0,
        winRp: finalTierSettings?.Bronze?.winDelta ?? 20,
        loseRp: finalTierSettings?.Bronze?.loseDelta ?? 0
      },
      silver: {
        threshold: tierThresholds.Silver ?? 1000,
        winRp: finalTierSettings?.Silver?.winDelta ?? 15,
        loseRp: finalTierSettings?.Silver?.loseDelta ?? 5
      },
      gold: {
        threshold: tierThresholds.Gold ?? 1200,
        winRp: finalTierSettings?.Gold?.winDelta ?? 15,
        loseRp: finalTierSettings?.Gold?.loseDelta ?? 10
      },
      platinum: {
        threshold: tierThresholds.Platinum ?? 1400,
        winRp: finalTierSettings?.Platinum?.winDelta ?? 10,
        loseRp: finalTierSettings?.Platinum?.loseDelta ?? 15
      },
      diamond: {
        threshold: tierThresholds.Diamond ?? 1600,
        winRp: rpVariables.winDelta ?? 10,
        loseRp: rpVariables.loseDelta ?? 20
      }
    };
    setTiers(nextTiers);

    // ⚠️ 휴면 감점(decaySettings)은 여기서 건드리지 않는다.
    // 과거엔 단일 decayAmount로 모든 티어를 재구성해 저장하면서 티어별 값이 통일되는 버그가 있었다.
    // decaySettings 저장은 saveDecaySettings()가 단독으로 책임진다.

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        
        const newSettings = {
          ...(currentClass?.settings || {}),
          activeBonuses: newBonuses,
          tierSettings: finalTierSettings,
          dynamicBonuses: finalDynamicBonuses,
          dynamicPenalties: finalDynamicPenalties,
          tiers: nextTiers
        };

        const { error: updateErr } = await apiUpdateClassSettingsAndName(
          currentClassId,
          newTitle,
          newSettings
        );
        
        if (updateErr) throw updateErr;
        // 토스트는 호출측(AdminSettings) toast.promise에서 한 번만 처리.
      } catch (err: any) {
        console.error("Failed to save league settings in Supabase:", err.message);
        throw err;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [tierThresholds, rpVariables, tierSettings, dynamicBonuses, dynamicPenalties, decayEnabled, decayDays, decayAmount, decayTiers, currentClassId, isClassOwner]);

  // 경기 입력 방식 저장 (소유자 전용).
  const saveMatchInputMode = useCallback(async (mode: MatchInputMode) => {
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    const prev = matchInputModeRef.current;
    setMatchInputMode(mode);

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        const newSettings = {
          ...(currentClass?.settings || {}),
          matchInputMode: mode
        };
        const { error: updateErr } = await apiUpdateClassSettings(currentClassId, newSettings);
        if (updateErr) throw updateErr;
        toast.success("경기 입력 방식이 저장되었습니다.");
      } catch (err: any) {
        console.error("Failed to save match input mode:", err.message);
        toast.error("경기 입력 방식 저장에 실패했습니다: " + err.message);
        setMatchInputMode(prev); // 롤백
      }
    }
  }, [currentClassId, isClassOwner]);

  // 배치고사(언랭크) 설정 저장 (소유자/공동방장)
  const savePlacement = useCallback(async (enabled: boolean, games: number) => {
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 방장만 이 작업을 수행할 수 있습니다.");
      return;
    }
    const prevE = placementEnabled, prevG = placementGames;
    setPlacementEnabled(enabled);
    setPlacementGames(games);
    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        const { error } = await apiUpdateClassSettings(currentClassId, {
          ...(currentClass?.settings || {}),
          placement: { enabled, games },
        });
        if (error) throw error;
        toast.success("배치고사 설정이 저장되었습니다.");
      } catch (err: any) {
        console.error("Failed to save placement:", err.message);
        toast.error("배치고사 설정 저장에 실패했습니다: " + err.message);
        setPlacementEnabled(prevE); setPlacementGames(prevG);
      }
    }
  }, [currentClassId, isClassOwner, placementEnabled, placementGames]);

  // 레벨 체계 저장 (관리자: 소유자/공동관리자). 이름/설명 수정·추가·삭제 + 체계 모드 변경.
  //  migrations: 레벨 rename/삭제 시 그 레벨이던 회원의 group_label 일괄 이전/정리.
  //    { from, to } — to=null 이면 정리(빈값).
  const saveLevels = useCallback(async (
    nextLevels: { name: string; description?: string }[],
    nextMode: "preset" | "free",
    migrations: { from: string; to: string | null }[] = []
  ) => {
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 관리자만 레벨을 수정할 수 있습니다.");
      return false;
    }
    const prevLevels = levels;
    const prevMode = levelMode;
    setLevels(nextLevels);
    setLevelMode(nextMode);
    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        const newSettings = {
          ...(currentClass?.settings || {}),
          levelMode: nextMode,
          levels: nextLevels,
        };
        const { error: updateErr } = await apiUpdateClassSettings(currentClassId, newSettings);
        if (updateErr) throw updateErr;
        // 회원 레벨 이전/정리
        for (const mig of migrations) {
          if (!mig.from || mig.from === mig.to) continue;
          const { error: migErr } = await apiSetPlayerLevel(currentClassId, mig.from, mig.to);
          if (migErr) throw migErr;
        }
        toast.success("레벨 체계가 저장되었습니다.");
        // 회원 레벨이 바뀌었으면 명단 재로딩
        if (migrations.length > 0) await loadClassDataRef.current?.(currentClassId, true);
        return true;
      } catch (err: any) {
        console.error("Failed to save levels:", err.message);
        toast.error("레벨 저장에 실패했습니다: " + err.message);
        setLevels(prevLevels); // 롤백
        setLevelMode(prevMode);
        return false;
      }
    }
    return true;
  }, [currentClassId, levels, levelMode]);

  // 멤버 ↔ 공동관리자 승격/강등 (소유자 전용). 구글 연동된 선수의 userId 기준.
  const setMemberAdmin = useCallback(async (uid: string, makeAdmin: boolean): Promise<boolean> => {
    if (!isClassOwnerRef.current) {
      toast.error("권한이 없습니다. 방장만 관리자 권한을 변경할 수 있습니다.");
      return false;
    }
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    const { error } = await apiSetMemberAdmin(cid, uid, makeAdmin);
    if (error) { toast.error("권한 변경에 실패했습니다: " + error.message); return false; }
    toast.success(makeAdmin ? "관리자로 승격했습니다." : "일반 멤버로 변경했습니다.");
    await loadClassDataRef.current?.(cid, true);
    return true;
  }, []);

  // 최고관리자(원조 방장) 위임 — 소유권 이전 후 본인은 공동방장으로 환원됨 (원조 방장 전용)
  const transferOwnership = useCallback(async (uid: string): Promise<boolean> => {
    if (!isClassPrimaryOwnerRef.current) {
      toast.error("권한이 없습니다. 원조 방장만 소유권을 위임할 수 있습니다.");
      return false;
    }
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    const { error } = await apiTransferOwnership(cid, uid);
    if (error) { toast.error("최고관리자 위임에 실패했습니다: " + error.message); return false; }
    toast.success("최고관리자를 위임했습니다. 본인은 공동방장으로 변경됩니다.");
    await loadClassDataRef.current?.(cid, true);
    return true;
  }, []);

  // 공동방장 지정/해제 — 원조 방장 전용
  const setCoOwner = useCallback(async (uid: string, make: boolean): Promise<boolean> => {
    if (!isClassPrimaryOwnerRef.current) {
      toast.error("권한이 없습니다. 원조 방장만 공동방장을 지정할 수 있습니다.");
      return false;
    }
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    const { error } = await apiSetCoOwner(cid, uid, make);
    if (error) { toast.error("공동방장 변경에 실패했습니다: " + error.message); return false; }
    toast.success(make ? "공동방장으로 지정했습니다." : "공동방장을 해제했습니다.");
    await loadClassDataRef.current?.(cid, true);
    return true;
  }, []);

  // Decay settings save function
  const saveDecaySettings = useCallback(async (enabled: boolean, days: number, amount: number, tiers: TierName[], perTierRp?: Partial<Record<TierName, number>>) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 설정은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    setDecayEnabled(enabled);
    setDecayDays(days);
    setDecayAmount(amount);
    setDecayTiers(tiers);

    const nextDecaySettings = {
      bronze: { enabled: enabled && tiers.includes("Bronze"), inactiveDays: days, decayRp: perTierRp?.Bronze ?? amount },
      silver: { enabled: enabled && tiers.includes("Silver"), inactiveDays: days, decayRp: perTierRp?.Silver ?? amount },
      gold: { enabled: enabled && tiers.includes("Gold"), inactiveDays: days, decayRp: perTierRp?.Gold ?? amount },
      platinum: { enabled: enabled && tiers.includes("Platinum"), inactiveDays: days, decayRp: perTierRp?.Platinum ?? amount },
      diamond: { enabled: enabled && tiers.includes("Diamond"), inactiveDays: days, decayRp: perTierRp?.Diamond ?? amount }
    };
    setDecaySettings(nextDecaySettings);

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        
        const newSettings = {
          ...(currentClass?.settings || {}),
          decayEnabled: enabled,
          decayDays: days,
          decayAmount: amount,
          decayTiers: tiers,
          decaySettings: nextDecaySettings
        };

        const { error: updateErr } = await apiUpdateClassSettings(currentClassId, newSettings);
        
        if (updateErr) throw updateErr;
        // 토스트는 호출측(AdminSettings) toast.promise에서 한 번만 처리.
      } catch (err: any) {
        console.error("Failed to save decay settings in Supabase:", err.message);
        throw err;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [currentClassId, isClassOwner]);

  // (자동 휴면 감점은 제거됨 — 운영진이 '휴면 감점' 탭에서 수동으로 실시한다.)

  // 휴면 감점 대상 미리보기 — matches에서 각 선수의 최근 활동일을 직접 계산해
  // 티어별 설정(enabled/inactiveDays/decayRp)과 사이클(마지막 감점일) 기준으로 판정.
  const previewDormancyDecay = useCallback((): DecayTarget[] => {
    const now = Date.now();
    // 선수별 최근 경기일시 (단·복식 4슬롯 모두 반영)
    const lastAct: Record<string, number> = {};
    for (const m of matches) {
      const t = new Date(m.date).getTime();
      if (isNaN(t)) continue;
      for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) {
        if (pid) lastAct[pid] = Math.max(lastAct[pid] ?? 0, t);
      }
    }
    const out: DecayTarget[] = [];
    for (const s of students) {
      const tier = getTier(s.rp, tierThresholds);
      const setting = decaySettings[tier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond'];
      if (!setting || !setting.enabled) continue;
      const lastMatchTime = lastAct[s.id] ?? 0;
      const appliedStr = decayAppliedDates[s.id];
      const lastAppliedTime = appliedStr ? new Date(appliedStr).getTime() : 0;
      const baseline = Math.max(lastMatchTime, lastAppliedTime);
      if (baseline === 0) continue; // 활동 기준점 없음 → 제외
      const elapsedMs = now - baseline;
      if (elapsedMs < setting.inactiveDays * 86400000) continue;
      const decayRp = Math.min(s.rp, setting.decayRp);
      if (decayRp <= 0) continue;
      out.push({
        id: s.id,
        name: s.displayName || s.name || s.nickname || "이름없음",
        tier,
        rp: s.rp,
        decayRp,
        rpAfter: Math.max(0, s.rp - decayRp),
        daysInactive: Math.floor(elapsedMs / 86400000),
        lastActive: lastMatchTime ? new Date(lastMatchTime).toISOString() : null,
      });
    }
    return out.sort((a, b) => b.daysInactive - a.daysInactive);
  }, [matches, students, decaySettings, tierThresholds, decayAppliedDates]);

  // 휴면 감점 수동 실시 — 미리보기 대상에 대해 RPC 일괄 차감 + 로그 기록 + 로컬 반영.
  const applyDormancyDecay = useCallback(async (): Promise<number> => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌은 휴면 감점을 실시할 수 없습니다 (읽기 전용).");
      return 0;
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 실시할 수 있습니다.");
      return 0;
    }
    if (!currentClassId) return 0;
    const targets = previewDormancyDecay();
    if (targets.length === 0) {
      toast.info("현재 휴면 감점 대상이 없습니다.");
      return 0;
    }

    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayStr = new Date(today.getTime() - offset * 60 * 1000).toISOString().split("T")[0];

    const entries = targets.map((t) => ({
      player_id: t.id,
      player_name: t.name,
      tier: t.tier,
      decay_rp: t.decayRp,
    }));

    try {
      setIsSyncing(true);
      const { error } = await apiApplyDormancyDecay(currentClassId, currentSeason, entries);
      if (error) throw error;

      // 로컬 RP 즉시 반영
      const deltaById: Record<string, number> = {};
      targets.forEach((t) => { deltaById[t.id] = t.decayRp; });
      setStudents((prev) => prev.map((s) =>
        deltaById[s.id] ? { ...s, rp: Math.max(0, s.rp - deltaById[s.id]) } : s
      ));

      // 사이클 기준(감점일) 영속화
      const nextApplied = { ...decayAppliedDates };
      targets.forEach((t) => { nextApplied[t.id] = todayStr; });
      setDecayAppliedDates(nextApplied);
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        await apiUpdateClassSettings(currentClassId, {
          ...(currentClass?.settings || {}),
          decayApplied: nextApplied,
          lastDecayDate: todayStr,
        });
        setLastDecayDate(todayStr);
      } catch (e) {
        console.warn("Failed to persist decayApplied:", e);
      }

      toast.success(`휴면 감점 완료: ${targets.length}명의 RP를 차감했습니다.`, { duration: 5000 });
      return targets.length;
    } catch (e: any) {
      console.error("Failed to apply dormancy decay:", e);
      toast.error("휴면 감점 실패: " + (e?.message ?? "알 수 없는 오류"));
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [previewDormancyDecay, isClassOwner, currentClassId, currentSeason, decayAppliedDates]);

  // 휴면 감점 내역 조회
  const fetchDecayLog = useCallback(async (): Promise<DecayLogRow[]> => {
    if (!currentClassId) return [];
    const { data, error } = await apiFetchDecayLog(currentClassId);
    if (error) {
      console.warn("Failed to fetch decay log:", error);
      return [];
    }
    return (data || []) as DecayLogRow[];
  }, [currentClassId]);

  // ── 대진 호출(예정 경기) ──────────────────────────────
  const loadScheduled = useCallback(async (classId: string) => {
    try {
      const { data } = await apiFetchScheduledMatches(classId);
      setScheduledMatches((data || []) as ScheduledMatch[]);
    } catch { /* 비치명적 */ }
  }, []);
  useEffect(() => { loadScheduledRef.current = loadScheduled; }, [loadScheduled]);

  // 대진 추가 (운영진) — waiting 상태로 저장
  const createScheduledMatch = useCallback(async (payload: {
    matchType: "single" | "double";
    playerAId: string; playerBId: string;
    playerA2Id?: string | null; playerB2Id?: string | null;
    court?: string | null;
  }): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    const { error } = await apiCreateScheduledMatch({ classId: cid, ...payload });
    if (error) { toast.error("대진 추가 실패: " + error.message); return false; }
    await loadScheduled(cid);
    toast.success("대진을 추가했습니다.");
    return true;
  }, [loadScheduled]);

  // 입장 호출 (waiting → called) — 해당 회원 화면에 실시간 배너
  const callScheduledMatch = useCallback(async (id: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const cid = currentClassIdRef.current;
    const m = scheduledMatches.find((x) => x.id === id);
    const { error } = await apiUpdateScheduledStatus(id, "called");
    if (error) { toast.error("호출 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    if (m) {
      // 예약(player_ids) / 관리자 대진(슬롯) 양쪽 참가자에게 입장 알림
      const parts = (m.player_ids?.length
        ? m.player_ids
        : [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id]).filter(Boolean) as string[];
      notifyPlayers(parts, {
        title: "🏸 경기 입장!", body: "운영진이 대진을 배정했어요. 코트로 입장하세요.",
        url: cid ? `/class/${cid}` : "/", tag: `sched-${id}`,
      });
    }
    toast.success("입장 호출을 보냈습니다.");
    return true;
  }, [loadScheduled, scheduledMatches]);

  // 대진 제거 (완료/취소) — 행 삭제
  const removeScheduledMatch = useCallback(async (id: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const cid = currentClassIdRef.current;
    const { error } = await apiDeleteScheduledMatch(id);
    if (error) { toast.error("삭제 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    return true;
  }, [loadScheduled]);

  // 예약할 수 있는 권한: 관리자 또는 (자율 입력 모드에서) 연동된 회원
  const canReserve = () => isClassManagerRef.current || (matchInputModeRef.current !== "admin-only" && !!myPlayerId);

  // 한 사람이 동시에 참여 가능한 예약 최대 개수
  const RESERVATION_MAX = 3;
  const partsOfRow = (m: ScheduledMatch): string[] =>
    ((m.player_ids?.length ? m.player_ids : [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id]).filter(Boolean)) as string[];
  const activeReservationCount = (pid: string): number =>
    scheduledMatches.filter((m) => (m.status === "waiting" || m.status === "called") && partsOfRow(m).includes(pid)).length;
  const nameOf = (pid: string) => { const s = students.find((x) => x.id === pid); return s ? (s.nickname || s.name) : "회원"; };

  // 인원 소집 예약 생성 — 참가자에게만 푸시
  const createReservation = useCallback(async (payload: {
    playerIds: string[]; matchType?: "single" | "double"; court?: string | null;
  }): Promise<boolean> => {
    if (!canReserve()) { toast.error("예약 권한이 없습니다."); return false; }
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    if (payload.playerIds.length < 2) { toast.error("참가자를 2명 이상 선택하세요."); return false; }
    // 관리자는 본인 미포함 예약 허용, 일반 회원은 본인이 포함된 경기만 예약 가능
    if (!isClassManagerRef.current && (!myPlayerId || !payload.playerIds.includes(myPlayerId))) {
      toast.error("본인이 포함된 경기만 예약할 수 있습니다."); return false;
    }
    // 한 사람 최대 3개 예약 제한
    const over = payload.playerIds.find((pid) => activeReservationCount(pid) >= RESERVATION_MAX);
    if (over) { toast.error(`${nameOf(over)}님은 이미 예약 ${RESERVATION_MAX}개에 참여 중이에요.`); return false; }
    const { error } = await apiCreateReservation({ classId: cid, ...payload });
    if (error) { toast.error("예약 실패: " + error.message); return false; }
    await loadScheduled(cid);
    notifyPlayers(payload.playerIds, {
      title: "🏸 경기 예약!", body: "경기가 예약됐어요. 코트로 모이세요.",
      url: `/class/${cid}`, tag: `resv-${Date.now()}`,
    });
    toast.success("경기를 예약했습니다.");
    return true;
  }, [loadScheduled, myPlayerId]);

  // 예약 취소
  const cancelReservation = useCallback(async (id: string): Promise<boolean> => {
    if (!canReserve()) { toast.error("권한이 없습니다."); return false; }
    // 관리자는 아무 예약이나 취소, 일반 회원은 본인이 참가한 예약만 취소
    if (!isClassManagerRef.current) {
      const m = scheduledMatches.find((x) => x.id === id);
      const parts = m ? ((m.player_ids?.length
        ? m.player_ids
        : [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id]).filter(Boolean) as string[]) : [];
      if (!myPlayerId || !parts.includes(myPlayerId)) { toast.error("본인이 참가한 예약만 취소할 수 있습니다."); return false; }
    }
    const cid = currentClassIdRef.current;
    const { error } = await apiDeleteScheduledMatch(id);
    if (error) { toast.error("취소 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    return true;
  }, [loadScheduled, myPlayerId, scheduledMatches]);

  // 예약을 실제 경기 결과에 연결 + 참가자에게 결과 푸시
  const linkReservationResult = useCallback(async (
    reservationId: string, matchId: string, participantIds: string[], summary: string,
  ): Promise<void> => {
    const cid = currentClassIdRef.current;
    // 낙관적 제거: 결과 입력 즉시 예약 목록에서 사라지게 한다.
    setScheduledMatches((prev) => prev.filter((m) => m.id !== reservationId));
    const { error } = await apiLinkScheduledResult(reservationId, matchId);
    if (error) { console.warn("[reservation] link failed", error); toast.error("예약 완료 처리 실패: " + error.message); }
    if (cid) await loadScheduled(cid);
    notifyPlayers(participantIds, {
      title: "🏁 경기 결과 등록!", body: summary || "경기 결과가 등록됐어요. 확인해 보세요.",
      // 푸시를 누르면 그 경기의 결과 창이 바로 뜨도록 match id 전달
      url: cid ? `/class/${cid}?tab=matches&match=${matchId}` : "/", tag: `resv-result-${reservationId}`,
    });
  }, [loadScheduled]);

  // 예약에서 나가기(내 이름만 제거) — 1명 이하만 남으면 예약 삭제
  const leaveReservation = useCallback(async (id: string): Promise<boolean> => {
    if (!myPlayerId) return false;
    const cid = currentClassIdRef.current;
    const m = scheduledMatches.find((x) => x.id === id);
    if (!m) return false;
    const ids = partsOfRow(m).filter((x) => x !== myPlayerId);
    const { error } = ids.length <= 1
      ? await apiDeleteScheduledMatch(id)
      : await apiUpdateReservationPlayers(id, ids);
    if (error) { toast.error("나가기 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    toast.success(ids.length <= 1 ? "예약에서 나갔어요. (인원이 부족해 예약이 취소됐어요)" : "예약에서 나갔어요.");
    return true;
  }, [loadScheduled, myPlayerId, scheduledMatches]);

  // 예약에 참가(내 이름 추가) / 관리자가 타인 추가
  const joinReservation = useCallback(async (id: string, playerId?: string): Promise<boolean> => {
    const cid = currentClassIdRef.current;
    const pid = playerId ?? myPlayerId;
    if (!pid) { toast.error("연동된 선수가 없어요."); return false; }
    // 타인 추가는 관리자만
    if (playerId && playerId !== myPlayerId && !isClassManagerRef.current) { toast.error("다른 사람은 관리자만 추가할 수 있어요."); return false; }
    const m = scheduledMatches.find((x) => x.id === id);
    if (!m) return false;
    const ids = partsOfRow(m);
    if (ids.includes(pid)) { toast.error("이미 이 예약에 참가 중이에요."); return false; }
    if (activeReservationCount(pid) >= RESERVATION_MAX) { toast.error(`${nameOf(pid)}님은 이미 예약 ${RESERVATION_MAX}개에 참여 중이에요.`); return false; }
    const { error } = await apiUpdateReservationPlayers(id, [...ids, pid]);
    if (error) { toast.error("참가 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    toast.success("예약에 참가했어요.");
    return true;
  }, [loadScheduled, myPlayerId, scheduledMatches, students]);

  // 예약 참가자에게 '지금 코트로' 알림 — 1분 쿨다운, 발신자 기록(전원 사용 가능)
  const notifyReservation = useCallback(async (id: string): Promise<boolean> => {
    const cid = currentClassIdRef.current;
    const m = scheduledMatches.find((x) => x.id === id);
    if (!m) return false;
    if (m.notified_at && Date.now() - new Date(m.notified_at).getTime() < 60_000) {
      toast.error("방금 알림을 보냈어요. 1분 뒤에 다시 보낼 수 있어요."); return false;
    }
    const parts = partsOfRow(m);
    await apiTouchReservationNotify(id, myPlayerId ?? null);
    if (cid) await loadScheduled(cid);
    notifyPlayers(parts, {
      title: "🏸 지금 코트로!", body: `${myPlayerId ? nameOf(myPlayerId) : "누군가"}님이 경기 알림을 보냈어요.`,
      url: cid ? `/class/${cid}?tab=matches` : "/", tag: `resv-call-${id}`,
    });
    toast.success("알림을 보냈어요.");
    return true;
  }, [loadScheduled, myPlayerId, scheduledMatches, students]);

  // 도전장 보내기 (회원) — 내 연동 선수가 상대를 지목
  const createChallenge = useCallback(async (targetPlayerId: string): Promise<boolean> => {
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    if (!myPlayerId) { toast.error("연동된 선수가 없어 도전장을 보낼 수 없습니다."); return false; }
    if (myPlayerId === targetPlayerId) { toast.error("자신에게는 도전할 수 없습니다."); return false; }
    // 이미 진행 중인 도전장/예약(대기·호출)에 두 사람이 함께 있으면 중복 방지
    const dup = scheduledMatches.some((m) => {
      if (!(m.status === "challenge" || m.status === "waiting" || m.status === "called")) return false;
      const parts = ((m.player_ids?.length ? m.player_ids : [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id]).filter(Boolean)) as string[];
      return parts.includes(myPlayerId) && parts.includes(targetPlayerId);
    });
    if (dup) { toast.error("이미 이 상대와 진행 중인 도전장/예약이 있어요."); return false; }
    const { error } = await apiCreateChallenge({ classId: cid, challengerId: myPlayerId, targetId: targetPlayerId });
    if (error) { toast.error("도전장 전송 실패: " + error.message); return false; }
    await loadScheduled(cid);
    notifyPlayers([targetPlayerId], {
      title: "⚔️ 도전장 도착!", body: "당신에게 도전장이 왔습니다. 받아들이시겠어요?",
      url: `/class/${cid}`, tag: `chal-${targetPlayerId}`,
    });
    toast.success("도전장을 보냈습니다! ⚔️");
    return true;
  }, [myPlayerId, loadScheduled, scheduledMatches]);

  // 도전장 응답 (지목당한 회원) — 수락(입장)/거절
  const respondChallenge = useCallback(async (id: string, accept: boolean): Promise<boolean> => {
    const cid = currentClassIdRef.current;
    const m = scheduledMatches.find((x) => x.id === id);
    const { error } = await apiRespondChallenge(id, accept);
    if (error) { toast.error("응답 실패: " + error.message); return false; }
    if (cid) await loadScheduled(cid);
    if (accept && m) notifyPlayers([m.player_a_id, m.player_a2_id], {
      title: "⚔️ 도전 수락!", body: "상대가 도전을 수락했어요. 코트로 입장하세요.",
      url: cid ? `/class/${cid}` : "/", tag: `chal-accept-${id}`,
    });
    toast.success(accept ? "도전을 수락했습니다. 입장하세요!" : "도전을 거절했습니다.");
    return true;
  }, [loadScheduled, scheduledMatches]);

  // 호칭 인덱스: 이번 시즌 데이터로 리그 전체 호칭 보유 현황을 한 번에 계산
  const titleIndex = useMemo(
    () => buildTitleIndex(students, matches, tierThresholds),
    [students, matches, tierThresholds]
  );

  // 특정 선수가 획득한 호칭 id 목록
  const getEarnedTitles = useCallback(
    (studentId: string): string[] => Array.from(titleIndex.earnedByStudent.get(studentId) ?? []),
    [titleIndex]
  );

  // 선수의 '장착한 대표 호칭' — 단, 지금도 그 조건을 만족할 때만 유효(경쟁형은 주인이 바뀌므로)
  const getEquippedTitle = useCallback((student: Student | null | undefined) => {
    if (!student?.equippedTitle) return null;
    const earned = titleIndex.earnedByStudent.get(student.id);
    if (!earned || !earned.has(student.equippedTitle)) return null;
    return TITLE_BY_ID[student.equippedTitle] ?? null;
  }, [titleIndex]);

  // 대표 호칭 장착/해제 (회원 본인) — null이면 미장착
  const equipTitle = useCallback(async (titleId: string | null): Promise<boolean> => {
    if (!myPlayerId) return false;
    if (titleId && !(titleIndex.earnedByStudent.get(myPlayerId)?.has(titleId))) {
      toast.error("아직 획득하지 않은 호칭입니다.");
      return false;
    }
    const prev = students;
    setStudents((list) => list.map((s) => s.id === myPlayerId ? { ...s, equippedTitle: titleId } : s));
    const { error } = await apiUpdateStudentFields(myPlayerId, { equipped_title: titleId });
    if (error) {
      setStudents(prev);
      toast.error("호칭 저장에 실패했어요.");
      return false;
    }
    toast.success(titleId ? "대표 호칭을 장착했어요." : "호칭을 해제했어요.");
    return true;
  }, [myPlayerId, titleIndex, students]);

  // 선수용 티어 승격 실시간 감지 감시자
  useEffect(() => {
    if (hydrated && session && session.role === "STUDENT" && session.studentId) {
      const student = students.find((s) => s.id === session.studentId);
      if (student) {
        const currentRp = student.rp;
        const currentTier = getTier(currentRp, tierThresholds);
        const currentSub = getTierSubdivision(currentRp, tierThresholds);
        const currentLabel = getFullTierLabel(currentRp, tierThresholds);

        const lastKnownRpStr = localStorage.getItem(`bdm.lastKnownRp.${session.studentId}`);
        if (lastKnownRpStr) {
          const lastRp = parseInt(lastKnownRpStr, 10);
          if (!isNaN(lastRp) && lastRp !== currentRp) {
            const lastTier = getTier(lastRp, tierThresholds);
            const lastSub = getTierSubdivision(lastRp, tierThresholds);
            
            const getRank = (t: TierName, s: number) => {
              const base = { Bronze: 10, Silver: 20, Gold: 30, Platinum: 40, Diamond: 50 }[t] ?? 10;
              return base + (5 - s);
            };

            // 이전 랭크보다 현재 랭크가 더 높으면 승급 이벤트 트리거
            if (getRank(currentTier, currentSub) > getRank(lastTier, lastSub)) {
              setPromotionEvent({ isPromoted: true, newTier: currentLabel });
            }
          }
        }
        // 최신 RP로 로컬 캐시 갱신
        localStorage.setItem(`bdm.lastKnownRp.${session.studentId}`, currentRp.toString());
      }
    }
  }, [students, hydrated, session, tierThresholds]);

  // 5. CHANGE_SEASON API 액션 메소드
  const changeSeason = useCallback(async (seasonName: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return { success: false, message: "Read-only mode" };
    }
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 방장·공동방장만 새 시즌을 시작할 수 있습니다.");
      return { success: false, message: "No permission" };
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return { success: false, message: "Syncing" };
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    if (!currentClassId) {
      toast.error("리그 정보가 없습니다.");
      isSyncingRef.current = false;
      setIsSyncing(false);
      return { success: false, message: "No classId" };
    }
    try {
      // 서버 RPC: 현재 순위 스냅샷 → 선수 RP/전적 초기화 → 시즌 라벨 변경 (한 트랜잭션)
      const { error: rpcErr } = await apiStartNewSeason(currentClassId, seasonName);
      if (rpcErr) throw rpcErr;

      // 새 시즌의 현재 데이터로 재로딩 (시즌 목록도 loadClassData 안에서 갱신됨)
      isSyncingRef.current = false;
      setIsSyncing(false);
      await loadClassDataRef.current?.(currentClassId);

      toast.success(`새 시즌 '${seasonName}'을(를) 시작했습니다. 이전 시즌 순위는 보관되었습니다.`);
      return { success: true };
    } catch (error: any) {
      console.error("Failed to start new season in Supabase:", error);
      toast.error(error.message || "새 시즌 시작에 실패했습니다.");
      isSyncingRef.current = false;
      setIsSyncing(false);
      return { success: false, message: error.message || "Database Error" };
    }
  }, [currentClassId, isClassOwner]);

  // 6. 과거 시즌 데이터 Fetch 액션 메소드
  const changeViewSeason = useCallback(async (seasonName: string) => {
    setCurrentViewSeason(seasonName);

    // "현재 시즌" 선택 시 라이브 데이터로 복귀
    if (seasonName === "현재 시즌") {
      if (currentClassIdRef.current) await loadClassDataRef.current?.(currentClassIdRef.current);
      return;
    }

    const classId = currentClassIdRef.current;
    if (!classId) return;

    setIsSyncing(true);
    try {
      // 과거 시즌: 보관된 최종 순위 + 해당 시즌 경기 조회 (읽기 전용으로 표시)
      // 관리자면 실명 포함(season_standings), 선수/익명이면 공개 RPC(실명 제외)
      const standingsPromise = isTeacherRef.current
        ? apiFetchSeasonStandings(classId, seasonName)
        : apiFetchSeasonStandingsPublic(classId, seasonName);
      const [{ data: standings }, { data: pastMatches }] = await Promise.all([
        standingsPromise,
        apiFetchMatches(classId, seasonName),
      ]);

      const matchesList: Match[] = (pastMatches || []).map((m: any) => ({
        id: m.id,
        playerAId: m.winner_id,
        playerBId: m.loser_id,
        playerA2Id: m.winner2_id ?? undefined,
        playerB2Id: m.loser2_id ?? undefined,
        scoreA: m.winner_score ?? 21,
        scoreB: m.loser_score ?? 19,
        date: m.created_at || new Date().toISOString(),
        matchType: (m.winner2_id ? "double" : "single") as "single" | "double",
      }));

      // 같은 선수가 여러 스냅샷 행으로 중복될 수 있어(과거 복귀 버그 등) player_id 기준 1행만 — 최고 RP 우선.
      const byPid = new Map<string, any>();
      for (const s of (standings || [])) {
        const pid = s.player_id ?? s.student_id;
        if (!pid) continue;
        const prev = byPid.get(pid);
        if (!prev || (s.rp ?? 0) > (prev.rp ?? 0)) byPid.set(pid, s);
      }
      const uniqueStandings = [...byPid.values()];

      const studentsList: Student[] = uniqueStandings.map((s: any) => {
        const pid = s.player_id ?? s.student_id;
        const group = s.group_label ?? null;
        const name = s.name || s.display_name || s.nickname || "이름없음";

        // 승패는 그 시즌 경기 기록에서 계산 (win_count 컬럼은 앱에서 갱신되지 않아 신뢰 불가)
        const myMatches = matchesList
          .filter((m) => m.playerAId === pid || m.playerBId === pid)
          .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
        const wins = myMatches.filter((m) => m.playerAId === pid).length;
        const losses = myMatches.filter((m) => m.playerBId === pid).length;
        const recent = myMatches.slice(0, 5).map((m) => (m.playerAId === pid ? "W" : "L"));

        return {
          id: pid,
          name,
          nickname: s.nickname ?? "",
          group,
          displayName: s.display_name ?? null,
          gender: (s.gender || "U") as Gender,
          rp: s.rp ?? 1000,
          wins,
          losses,
          recent,
          currentStreak: 0,
        };
      });
      studentsList.sort((a, b) => b.rp - a.rp);

      setStudents(studentsList);
      setMatches([...matchesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (err: any) {
      console.error("Failed to load past season data:", err);
      toast.error("과거 시즌 데이터를 불러오지 못했습니다.");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 7. 과거 시즌 관리 (관리자 전용) — 이름변경 / 삭제 / 명예의 전당
  //    (과거 시즌 "복귀"는 단일 RP 구조상 데이터가 꼬여 제거됨. 열람은 changeViewSeason으로 가능.)
  const renameSeason = useCallback(async (oldName: string, newName: string) => {
    const classId = currentClassIdRef.current;
    if (!classId) return { success: false };
    try {
      const { error } = await apiRenameSeason(classId, oldName, newName);
      if (error) throw error;
      await loadClassDataRef.current?.(classId);
      toast.success(`시즌 이름을 '${newName}'(으)로 변경했습니다.`);
      return { success: true };
    } catch (err: any) {
      toast.error(err.message || "시즌 이름 변경에 실패했습니다.");
      return { success: false, message: err.message };
    }
  }, []);

  const deleteSeason = useCallback(async (season: string, deleteMatches: boolean) => {
    const classId = currentClassIdRef.current;
    if (!classId) return { success: false };
    try {
      const { error } = await apiDeleteSeason(classId, season, deleteMatches);
      if (error) throw error;
      await loadClassDataRef.current?.(classId);
      toast.success(`'${season}' 시즌을 삭제했습니다.`);
      return { success: true };
    } catch (err: any) {
      toast.error(err.message || "시즌 삭제에 실패했습니다.");
      return { success: false, message: err.message };
    }
  }, []);

  // ── 일반 회원 셀프 참가 ──
  // 명단의 비어있는 닉네임에 내 계정 연동
  const claimPlayer = useCallback(async (playerId: string): Promise<boolean> => {
    const { error } = await apiClaimPlayer(playerId);
    if (error) { toast.error("연동에 실패했습니다: " + error.message); return false; }
    toast.success("닉네임에 연동되었습니다!");
    const cid = currentClassIdRef.current;
    if (cid) await loadClassDataRef.current?.(cid);
    return true;
  }, []);

  // 새 프로필을 만들어 내 계정에 연동
  const createMyPlayer = useCallback(async (profile: {
    nickname: string; gender: Gender; group?: string | null; birthYear?: number | null;
  }): Promise<boolean> => {
    const cid = currentClassIdRef.current;
    if (!cid) return false;
    const { data: { user } } = await apiGetUser();
    if (!user) { toast.error("로그인이 필요합니다."); return false; }
    const { error } = await apiInsertStudent(cid, {
      name: profile.nickname,
      nickname: profile.nickname,
      gender: profile.gender,
      group_label: profile.group ?? null,
      birth_year: profile.birthYear ?? null,
      user_id: user.id,
    });
    if (error) { toast.error("프로필 생성에 실패했습니다: " + error.message); return false; }
    toast.success("프로필이 만들어졌습니다!");
    await loadClassDataRef.current?.(cid);
    return true;
  }, []);

  return {
    hydrated, 
    currentClassId,
    loadClassData,
    students, 
    matches, 
    title, 
    setTitle, 
    matchInputMode,
    saveMatchInputMode,
    placementEnabled,
    placementGames,
    savePlacement,
    levelMode,
    levels,
    setLevels,
    saveLevels,
    sport,
    ownerUid,
    adminUids,
    coOwnerUids,
    isClassPrimaryOwner,
    setMemberAdmin,
    transferOwnership,
    setCoOwner,
    recordMatch,
    upsertStudents,
    deleteMatch,
    recomputeRpPreview,
    applyRecomputedRp,
    resetStudent,
    updateStudentRP,
    isSyncing,
    isClassOwner,
    isClassManager,
    isClassMember,
    myPlayerId,
    claimPlayer,
    createMyPlayer,
    session,
    logoutUser,
    tierThresholds,
    rpVariables,
    updateLeagueSettings,
    updateStudentGender,
    deleteStudent,
    updateStudentInfo,
    bulkUpdateStudents,
    fetchDeletedStudents,
    restoreDeletedStudent,
    hardDeleteStudent,
    restoreFromCSV,
    bulkDecayRP,
    updateMatchScore,
    activeBonuses,
    saveLeagueSettings,
    titleIndex,
    getEarnedTitles,
    getEquippedTitle,
    equipTitle,
    promotionEvent,
    setPromotionEvent,
    seasonList,
    currentSeason,
    changeSeason,
    currentViewSeason,
    changeViewSeason,
    renameSeason,
    deleteSeason,
    decayEnabled,
    setDecayEnabled,
    decayDays,
    setDecayDays,
    decayAmount,
    setDecayAmount,
    decayTiers,
    setDecayTiers,
    lastDecayDate,
    setLastDecayDate,
    decayAppliedDates,
    saveDecaySettings,
    previewDormancyDecay,
    applyDormancyDecay,
    fetchDecayLog,
    scheduledMatches,
    createScheduledMatch,
    callScheduledMatch,
    removeScheduledMatch,
    createReservation,
    cancelReservation,
    linkReservationResult,
    leaveReservation,
    joinReservation,
    notifyReservation,
    saveMatchBreakdown,
    createChallenge,
    respondChallenge,
    tierSettings,
    setTierSettings,
    dynamicBonuses,
    setDynamicBonuses,
    dynamicPenalties,
    setDynamicPenalties,
    tiers,
    setTiers,
    decaySettings,
    setDecaySettings
  };
}

type LeagueStoreType = ReturnType<typeof useLeagueStoreInternal>;

const LeagueStoreContext = createContext<LeagueStoreType | null>(null);

export function LeagueStoreProvider({ children }: { children: React.ReactNode }) {
  const store = useLeagueStoreInternal();
  return React.createElement(LeagueStoreContext.Provider, { value: store }, children);
}

export function useLeagueStore() {
  const context = useContext(LeagueStoreContext);
  if (!context) {
    throw new Error("useLeagueStore must be used within a LeagueStoreProvider");
  }
  return context;
}
