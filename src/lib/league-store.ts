import React, { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import type { Student, Match, Gender, TierName, TierSettings, DynamicBonuses, DynamicPenalties, TiersRecord, DecaySettingsRecord, Achievement } from "./league-types";
import { studentKey, getTier, getTierSubdivision, getFullTierLabel, TIER_ORDER } from "./league-types";
import { toast } from "sonner";
import { supabase } from "../supabaseClient";
import { calculateMatchResult } from "./match-calculator";
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
  apiDeleteClassMatches,
  apiInsertMatchesBulk,
  apiUpdateMatchWinnerLoser,
  apiFetchStudents,
  apiFetchStudentsPublic,
  apiUpdateStudentRp,
  apiResetStudentRp,
  apiResetAllClassStudentsRp,
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
  apiFetchClassSecret,
  apiUpdateClassSecret,
  apiListSeasons,
  apiStartNewSeason,
  apiFetchSeasonStandings,
  apiFetchSeasonStandingsPublic,
  apiRestoreSeason,
  apiRenameSeason,
  apiDeleteSeason
} from "./league-api";
import {
  DEFAULT_TIERS,
  DEFAULT_DECAY_SETTINGS,
  DEFAULT_DYNAMIC_PENALTIES,
  DEFAULT_DYNAMIC_BONUSES,
  migrateSettings
} from "./settings-migration";
import { calculateAchievements as calculateAchievementsPure } from "./achievement-calculator";

export type ActiveBonuses = {
  firstWin: boolean;
  revenge: boolean;
  underdog: boolean;
  scoreDiff: boolean;
  rival: boolean;
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
  const [title, setTitle] = useState<string>("2026 초등 리그전");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isClassOwner, setIsClassOwner] = useState<boolean>(false);
  // 관리 권한자: 소유자/공동관리자/기록원 — 학생·경기 관리 가능 (리그 글로벌 설정·시즌·복원은 소유자 전용)
  const [isClassManager, setIsClassManager] = useState<boolean>(false);
  const isClassManagerRef = useRef(false);
  useEffect(() => { isClassManagerRef.current = isClassManager; }, [isClassManager]);
  const [teacherAccessCode, setTeacherAccessCode] = useState<string>("");
  // 화면 잠금: 태블릿을 학생에게 맡길 때 순위표/관리자 탭을 리그 코드로 잠근다. (독립 토글)
  const [lockLeaderboard, setLockLeaderboard] = useState<boolean>(false);
  const [lockAdmin, setLockAdmin] = useState<boolean>(false);
  const lockLeaderboardRef = useRef(false);
  const lockAdminRef = useRef(false);
  useEffect(() => { lockLeaderboardRef.current = lockLeaderboard; }, [lockLeaderboard]);
  useEffect(() => { lockAdminRef.current = lockAdmin; }, [lockAdmin]);
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
  // 교사 세션 여부(소유자/공동관리자) — 과거 시즌 조회 시 실명 포함 여부 결정에 사용
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

      // 권한 판별: 소유자(owner) / 관리자(owner|co_admin|scorekeeper)
      let isOwner = false;
      let isManager = false;
      try {
        const { data: { user } } = await apiGetUser();
        if (user && classData) {
          const uid = user.id;
          isOwner = classData.owner_uid === uid;
          isManager = isOwner
            || (Array.isArray(classData.co_admin_uids) && classData.co_admin_uids.includes(uid))
            || (Array.isArray(classData.scorekeeper_uids) && classData.scorekeeper_uids.includes(uid));
        }
      } catch (err) {
        console.warn("Failed to check owner uid inside loadClassData:", err);
      }
      setIsClassOwner(isOwner);
      setIsClassManager(isManager);
      isClassManagerRef.current = isManager;

      if (classData) {
        setTitle(classData.class_name);
        
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
            // 잠금 설정 로드 (구버전 kioskLockEnabled 단일값도 호환)
            setLockLeaderboard(!!(migrated.lockLeaderboard ?? migrated.kioskLockEnabled));
            setLockAdmin(!!(migrated.lockAdmin ?? migrated.kioskLockEnabled));
            if (migrated.tierSettings !== undefined) setTierSettings(migrated.tierSettings);
            if (migrated.dynamicBonuses !== undefined) setDynamicBonuses(migrated.dynamicBonuses);
             if (migrated.dynamicPenalties !== undefined) setDynamicPenalties(migrated.dynamicPenalties);
            if (migrated.activeBonuses !== undefined) setActiveBonuses(migrated.activeBonuses);
          }
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
        scoreA: 21,
        scoreB: 19,
        date: m.created_at || new Date().toISOString(),
        matchType: "single"
      }));

      // 3. Fetch students - 관리 권한자(소유자/공동관리자/기록원)는 실명 포함 조회
      const isTeacherSession = isManager;
      isTeacherRef.current = isTeacherSession;

      // class_secrets 조회 추가 (교사 세션일 때만 RLS 우회하여 안전 조회)
      let fetchedAccessCode = "";
      if (isTeacherSession) {
        try {
          const { data: secretData, error: secretErr } = await apiFetchClassSecret(classId);
          if (!secretErr && secretData) {
            fetchedAccessCode = secretData.admin_code;
          }
        } catch (err) {
          console.warn("Failed to fetch class secret in loadClassData:", err);
        }
      }
      setTeacherAccessCode(fetchedAccessCode);

      const studentsFetchResult = isTeacherSession 
        ? await apiFetchStudents(classId)
        : await apiFetchStudentsPublic(classId);

      const { data: dbStudents, error: studentsErr } = studentsFetchResult;
      if (studentsErr) throw studentsErr;

      // Map Supabase students to frontend Student structure, computing stats on-the-fly
      const studentsList: Student[] = (dbStudents || []).map((s: any) => {
        const grade = s.grade ?? 0;
        const classNum = s.class_number ?? 0;
        const number = s.student_no ?? 0;
        // name은 display_name을 기본으로 하되, 없을 경우 fallback으로 포맷팅
        const name = s.display_name || (s.nickname ?? `${grade}-${classNum}-${number}번`);
        const gender = (s.gender || "U") as Gender;

        // Find matches for this student to compute derived stats
        const studentMatches = matchesList
          .filter((m) => m.playerAId === s.id || m.playerBId === s.id)
          .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

        const wins = studentMatches.filter((m) => m.playerAId === s.id).length;
        const losses = studentMatches.filter((m) => m.playerBId === s.id).length;

        // Last 5 matches form (W or L)
        const recent = studentMatches.slice(0, 5).map((m) => (m.playerAId === s.id ? "W" : "L"));

        // Current streak
        let currentStreak = 0;
        for (const m of studentMatches) {
          const won = m.playerAId === s.id;
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
          grade,
          classNum,
          number,
          name,
          realName: s.real_name ?? "",
          nickname: s.nickname ?? "",
          gender,
          rp: s.rp || 1000,
          wins,
          losses,
          recent,
          currentStreak,
          demotionShields: 3
        };
      });

      // Sort students by RP descending
      studentsList.sort((a, b) => b.rp - a.rp);

      setStudents(studentsList);

      // We reverse matches to show newest first in history
      const sortedMatches = [...matchesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMatches(sortedMatches);

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
          { event: "*", schema: "public", table: "students", filter: `class_id=eq.${classId}` },
          () => {
            loadClassDataRef.current?.(classId, true);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `class_id=eq.${classId}` },
          () => {
            loadClassDataRef.current?.(classId, true);
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
  // 학생별 마지막 휴면 감점 적용일 (YYYY-MM-DD). 사이클당 1회 감점 판정의 기준 시점.
  const [decayAppliedDates, setDecayAppliedDates] = useState<Record<string, string>>({});

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
            schoolName: "우리 학교",
            userName: supabaseUser.email?.split("@")[0] || "교사"
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
      toast.error("학생 데이터가 완전히 동기화되지 않았습니다. 새로고침 후 다시 시도해주세요.", {
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
          const playerUpdates = nextStudents
            .filter(s => s.id === playerAId || s.id === playerBId || s.id === playerA2Id || s.id === playerB2Id)
            .map(s => ({ id: s.id, rp: s.rp }));

          await apiRecordMatchTransaction({
            classId: currentClassId,
            matchId,
            winnerId,
            loserId,
            playerUpdates
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

  // 경기 삭제(롤백) 및 동기화
  const deleteMatch = useCallback(async (matchId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 학생·경기 관리 권한이 없습니다.");
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

  // 개별 학생 전적 리셋 및 동기화
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

  // 시즌 전체 초기화 및 동기화
  const resetAllData = useCallback(async () => {
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

    const nextMatches: Match[] = [];
    const nextStudents = students.map((s) => ({
      ...s,
      rp: 1000,
      wins: 0,
      losses: 0,
      recent: [],
    }));

    const previousStudents = [...students];
    const previousMatches = [...matches];
    setMatches(nextMatches);
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        // Delete all matches of this class
        await apiDeleteClassMatches(currentClassId);
        // Reset all students' RP to 1000
        await apiResetAllClassStudentsRp(currentClassId);
        toast.success("전체 데이터가 초기화되었습니다!");
      } catch (err: any) {
        console.error("Failed to reset all data in Supabase:", err.message);
        toast.error("전체 초기화에 실패했습니다: " + err.message);
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

  // 교사 관리자 수동 RP 수정 및 동기화
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
    async (rows: { grade: number; classNum: number; number: number; name: string; gender?: Gender }[]) => {
      if (currentViewSeasonRef.current !== "현재 시즌") {
        toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
        return { added: 0, kept: 0 };
      }
      if (!isClassManagerRef.current) {
        toast.error("권한이 없습니다. 학생·경기 관리 권한이 없습니다.");
        return { added: 0, kept: 0 };
      }
      if (isSyncingRef.current) {
        toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
        return { added: 0, kept: 0 };
      }
      isSyncingRef.current = true;
      setIsSyncing(true);

      let added = 0, kept = 0;
      const byKey = new Map(students.map((s) => [studentKey(s), s]));
      const next: Student[] = [];
      const seenKeys = new Set<string>();
      for (const r of rows) {
        const k = studentKey({ grade: r.grade, classNum: r.classNum, number: r.number, name: r.name, realName: r.name });
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
            grade: r.grade,
            classNum: r.classNum,
            number: r.number,
            name: `${r.grade}-${r.classNum}-${r.number}번`,
            realName: r.name,
            gender: r.gender ?? "U",
            rp: 1000,
            recent: [],
            wins: 0,
            losses: 0,
            demotionShields: 3,
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
            const key = studentKey({ grade: r.grade, classNum: r.classNum, number: r.number, name: r.name, realName: r.name });
            const exists = byKey.get(key);
            if (exists) {
              await apiUpdateStudentFields(exists.id, {
                grade: r.grade,
                class_number: r.classNum,
                student_no: r.number,
                real_name: r.name,
                gender: r.gender || 'U'
              });
            } else {
              const { data: insertedData, error: insertErr } = await apiInsertStudent(currentClassId, {
                grade: r.grade,
                class_number: r.classNum,
                student_no: r.number,
                real_name: r.name,
                gender: r.gender || 'U',
                rp: 1000
              });
              
              if (insertErr) throw insertErr;
              if (insertedData) {
                const idx = next.findIndex(s => studentKey(s) === key);
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
        
        toast.success("리그 설정이 저장되었습니다!");
      } catch (err: any) {
        console.error("Failed to update settings in Supabase:", err.message);
        toast.error("설정 저장에 실패했습니다: " + err.message);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [students, tierSettings, currentClassId, isClassOwner]);

  // 특정 학생의 성별 변경 및 구글 시트 동기화
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

  // 개별 학생 삭제 및 연쇄 삭제 & 전적 복구 롤백
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

    // 1. 삭제할 학생 제외
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

  // 특정 학생 정보 전체 수정 및 동기화
  const updateStudentInfo = useCallback(async (
    studentId: string,
    info: { grade: number; classNum: number; number: number; name: string; gender: Gender; rp?: number }
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
      const display_name = s.nickname || `${info.grade}-${info.classNum}-${info.number}번`;
      return {
        ...s,
        grade: info.grade,
        classNum: info.classNum,
        number: info.number,
        name: display_name,
        realName: info.name, // info.name is real name input
        gender: info.gender,
        rp: info.rp !== undefined ? info.rp : s.rp
      };
    });
    const previousStudents = [...students];
    setStudents(nextStudents);

    if (currentClassId) {
      try {
        const updatePayload: any = {
          grade: info.grade,
          class_number: info.classNum,
          student_no: info.number,
          real_name: info.name,
          gender: info.gender
        };
        if (info.rp !== undefined) {
          updatePayload.rp = info.rp;
        }
        const { error } = await apiUpdateStudentInfo(studentId, updatePayload);
        if (error) throw error;
        toast.success("학생 정보가 수정되었습니다.");
      } catch (err: any) {
        console.error("Failed to update student info in Supabase:", err.message);
        toast.error("학생 정보 수정에 실패했습니다: " + err.message);
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

  // 일괄 학생 정보 수정 (엑셀형 편집 저장) — 한 번의 낙관적 갱신 + 병렬 저장
  const bulkUpdateStudents = useCallback(async (
    updates: { id: string; real_name?: string; student_no?: number; gender?: Gender; rp?: number }[]
  ): Promise<boolean> => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return false;
    }
    if (!isClassManagerRef.current) {
      toast.error("권한이 없습니다. 학생·경기 관리 권한이 없습니다.");
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
      const number = u.student_no ?? s.number;
      return {
        ...s,
        number,
        realName: u.real_name ?? s.realName,
        gender: u.gender ?? s.gender,
        rp: u.rp ?? s.rp,
        name: s.nickname || `${s.grade}-${s.classNum}-${number}번`,
      };
    });
    setStudents(next);

    try {
      const results = await Promise.all(updates.map((u) => {
        const payload: any = {};
        if (u.real_name !== undefined) payload.real_name = u.real_name;
        if (u.student_no !== undefined) payload.student_no = u.student_no;
        if (u.gender !== undefined) payload.gender = u.gender;
        if (u.rp !== undefined) payload.rp = u.rp;
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

  // 휴지통: 삭제된 학생 목록 조회
  const fetchDeletedStudents = useCallback(async (): Promise<{ id: string; realName: string; nickname: string; grade: number; classNum: number; number: number; rp: number }[]> => {
    const classId = currentClassIdRef.current;
    if (!classId) return [];
    const { data, error } = await apiFetchDeletedStudents(classId);
    if (error) {
      console.warn("Failed to fetch deleted students:", error);
      return [];
    }
    return ((data as any[]) || []).map((s) => ({
      id: s.id,
      realName: s.real_name ?? "",
      nickname: s.nickname ?? "",
      grade: s.grade ?? 0,
      classNum: s.class_number ?? 0,
      number: s.student_no ?? 0,
      rp: s.rp ?? 1000,
    }));
  }, []);

  // 휴지통: 학생 복원
  const restoreDeletedStudent = useCallback(async (studentId: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const classId = currentClassIdRef.current;
    if (!classId) return false;
    const { error } = await apiRestoreStudent(studentId);
    if (error) { toast.error("복원에 실패했습니다: " + error.message); return false; }
    toast.success("학생을 복원했습니다. (과거 경기 기록은 복구되지 않습니다)");
    await loadClassDataRef.current?.(classId);
    return true;
  }, [isClassOwner]);

  // 휴지통: 영구 삭제
  const hardDeleteStudent = useCallback(async (studentId: string): Promise<boolean> => {
    if (!isClassManagerRef.current) { toast.error("권한이 없습니다."); return false; }
    const { error } = await apiHardDeleteStudent(studentId);
    if (error) { toast.error("영구 삭제에 실패했습니다: " + error.message); return false; }
    toast.success("학생을 영구 삭제했습니다.");
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
        toast.success(`복원 완료! (학생 ${counts.students ?? 0}명, 경기 ${counts.matches ?? 0}건)`);
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

  // 교사 통제형 휴면 강등 일괄 RP 차감 액션
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
      const preTier = getTier(preRp, tierThresholds);
      const preTierRank = TIER_RANKING[preTier] ?? 1;

      let nextRp = preRp + delta;
      let nextShields = s.demotionShields ?? 0;

      if (won) {
        const tentativeTier = getTier(nextRp, tierThresholds);
        const tentativeTierRank = TIER_RANKING[tentativeTier] ?? 1;
        if (tentativeTierRank > preTierRank) {
          nextShields = 3; // 승급 시 3회 완충
        }
        nextRp = Math.max(0, nextRp);
      } else {
        const minThreshold = tierThresholds[preTier] ?? 0;
        if (nextRp < minThreshold && preTier !== "Bronze") {
          if (nextShields >= 1) {
            nextRp = minThreshold;
            nextShields = nextShields - 1;
          } else {
            nextRp = Math.max(0, nextRp);
          }
        } else {
          nextRp = Math.max(0, nextRp);
        }
      }

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
        demotionShields: nextShields,
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

        const { error: updateErr } = await apiUpdateMatchWinnerLoser(matchId, winnerId, loserId);
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

    // Map decay settings
    const nextDecaySettings = {
      bronze: { enabled: decayEnabled && decayTiers.includes("Bronze"), inactiveDays: decayDays, decayRp: decayAmount },
      silver: { enabled: decayEnabled && decayTiers.includes("Silver"), inactiveDays: decayDays, decayRp: decayAmount },
      gold: { enabled: decayEnabled && decayTiers.includes("Gold"), inactiveDays: decayDays, decayRp: decayAmount },
      platinum: { enabled: decayEnabled && decayTiers.includes("Platinum"), inactiveDays: decayDays, decayRp: decayAmount },
      diamond: { enabled: decayEnabled && decayTiers.includes("Diamond"), inactiveDays: decayDays, decayRp: decayAmount }
    };
    setDecaySettings(nextDecaySettings);

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        
        const newSettings = {
          ...(currentClass?.settings || {}),
          activeBonuses: newBonuses,
          tierSettings: finalTierSettings,
          dynamicBonuses: finalDynamicBonuses,
          dynamicPenalties: finalDynamicPenalties,
          tiers: nextTiers,
          decaySettings: nextDecaySettings
        };

        const { error: updateErr } = await apiUpdateClassSettingsAndName(
          currentClassId,
          newTitle,
          newSettings
        );
        
        if (updateErr) throw updateErr;
        toast.success("설정이 성공적으로 저장되었습니다!");
      } catch (err: any) {
        console.error("Failed to save league settings in Supabase:", err.message);
        toast.error("설정 저장에 실패했습니다: " + err.message);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [tierThresholds, rpVariables, tierSettings, dynamicBonuses, dynamicPenalties, decayEnabled, decayDays, decayAmount, decayTiers, currentClassId, isClassOwner]);

  // 화면 잠금 on/off 저장 (소유자 전용). which: 어떤 화면을 토글할지.
  const saveLockSetting = useCallback(async (which: "leaderboard" | "admin", enabled: boolean) => {
    if (!isClassOwner) {
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    const prevLeaderboard = lockLeaderboardRef.current;
    const prevAdmin = lockAdminRef.current;
    const nextLeaderboard = which === "leaderboard" ? enabled : prevLeaderboard;
    const nextAdmin = which === "admin" ? enabled : prevAdmin;
    if (which === "leaderboard") setLockLeaderboard(enabled); else setLockAdmin(enabled);

    if (currentClassId) {
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);
        const newSettings = {
          ...(currentClass?.settings || {}),
          lockLeaderboard: nextLeaderboard,
          lockAdmin: nextAdmin
        };
        const { error: updateErr } = await apiUpdateClassSettings(currentClassId, newSettings);
        if (updateErr) throw updateErr;
        toast.success(enabled ? "잠금이 켜졌습니다." : "잠금이 꺼졌습니다.");
      } catch (err: any) {
        console.error("Failed to save lock setting:", err.message);
        toast.error("잠금 설정 저장에 실패했습니다: " + err.message);
        // 롤백
        if (which === "leaderboard") setLockLeaderboard(prevLeaderboard); else setLockAdmin(prevAdmin);
      }
    }
  }, [currentClassId, isClassOwner]);

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
        toast.success("휴면 강등 설정이 저장되었습니다.");
      } catch (err: any) {
        console.error("Failed to save decay settings in Supabase:", err.message);
        toast.error("설정 저장에 실패했습니다: " + err.message);
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } else {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [currentClassId, isClassOwner]);

  // Client-side auto decay calculation & sync on mount (runs once per day)
  const checkAndApplyAutomaticDecay = useCallback(async () => {
    const isAnyDecayEnabled = Object.values(decaySettings).some((d) => d.enabled);
    if (!isAnyDecayEnabled) return;
    if (currentViewSeasonRef.current !== "현재 시즌") return;
    if (!currentClassId) return;

    // Get today's local date YYYY-MM-DD
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    const todayStr = localToday.toISOString().split("T")[0];

    if (lastDecayDate === todayStr) {
      console.log("Auto decay already processed for today:", todayStr);
      return;
    }

    const now = Date.now();
    const targetIds: string[] = [];
    const decayDeltas: Record<string, number> = {};

    students.forEach((s) => {
      const studentTier = getTier(s.rp, tierThresholds);
      const tierKey = studentTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
      const setting = decaySettings[tierKey];

      if (!setting || !setting.enabled) return;
      if (!s.lastMatchDate) return;

      // 사이클당 1회: 마지막 경기일과 마지막 감점일 중 더 최근 시점부터 기준일수가 지나야 감점.
      // (경기하면 lastMatchDate 갱신으로 리셋, 안 하면 감점 후 다시 기준일수 경과해야 다음 1회)
      const msThreshold = setting.inactiveDays * 24 * 60 * 60 * 1000;
      const lastMatchTime = new Date(s.lastMatchDate).getTime();
      const appliedStr = decayAppliedDates[s.id];
      const lastAppliedTime = appliedStr ? new Date(appliedStr).getTime() : 0;
      const baseline = Math.max(lastMatchTime, lastAppliedTime);
      const elapsed = now - baseline;
      if (elapsed >= msThreshold) {
        targetIds.push(s.id);
        decayDeltas[s.id] = setting.decayRp;
      }
    });

    if (targetIds.length === 0) {
      // Cooldown prevention: save lastDecayDate even if no targets found
      setLastDecayDate(todayStr);
      try {
        const { data: currentClass } = await apiFetchClassSettings(currentClassId);

        const newSettings = {
          ...(currentClass?.settings || {}),
          lastDecayDate: todayStr
        };

        await apiUpdateClassSettings(currentClassId, newSettings);
      } catch (e) {
        console.warn("Failed to save lastDecayDate to Supabase:", e);
      }
      return;
    }

    try {
      setIsSyncing(true);
      // Apply decay in Supabase + 학생별 감점일(decayApplied) 기록
      const nextApplied = { ...decayAppliedDates };
      for (const id of targetIds) {
        const s = students.find((st) => st.id === id);
        if (s) {
          const amount = decayDeltas[id] || 5;
          const nextRp = Math.max(0, s.rp - amount);
          await apiUpdateStudentRp(id, nextRp);
          nextApplied[id] = todayStr;
        }
      }

      // 로컬 학생 RP 즉시 반영 (리로드 전에도 카운트다운/리더보드 정합)
      setStudents((prev) => prev.map((s) =>
        targetIds.includes(s.id) ? { ...s, rp: Math.max(0, s.rp - (decayDeltas[s.id] || 5)) } : s
      ));
      setDecayAppliedDates(nextApplied);

      // Update class settings lastDecayDate + decayApplied
      const { data: currentClass } = await apiFetchClassSettings(currentClassId);

      const newSettings = {
        ...(currentClass?.settings || {}),
        lastDecayDate: todayStr,
        decayApplied: nextApplied
      };

      await apiUpdateClassSettings(currentClassId, newSettings);

      setLastDecayDate(todayStr);

      toast.success(`자동 휴면 차감 완료: 총 ${targetIds.length}명의 학생 RP가 각각 차감되었습니다.`, { duration: 5000 });
    } catch (e) {
      console.error("Failed executing automatic RP decay in Supabase:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [students, decaySettings, lastDecayDate, decayAppliedDates, currentClassId, tierThresholds]);

  // 학생용 '나의 업적' 자동 연산 함수 (Derived State)
  const calculateAchievements = useCallback((studentId: string): Achievement[] => {
    return calculateAchievementsPure(students, matches, tierThresholds, studentId);
  }, [students, matches, tierThresholds]);

  // 학생용 티어 승격 실시간 감지 감시자
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
      toast.error("권한이 없습니다. 클래스 개설자만 이 작업을 수행할 수 있습니다.");
      return { success: false, message: "No permission" };
    }
    if (isSyncingRef.current) {
      toast.warning("데이터가 동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      return { success: false, message: "Syncing" };
    }
    isSyncingRef.current = true;
    setIsSyncing(true);

    if (!currentClassId) {
      toast.error("학급 정보가 없습니다.");
      isSyncingRef.current = false;
      setIsSyncing(false);
      return { success: false, message: "No classId" };
    }
    try {
      // 서버 RPC: 현재 순위 스냅샷 → 학생 RP/전적 초기화 → 시즌 라벨 변경 (한 트랜잭션)
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
      // 교사면 실명 포함(season_standings), 학생/익명이면 공개 RPC(실명 제외)
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
        scoreA: 21,
        scoreB: 19,
        date: m.created_at || new Date().toISOString(),
        matchType: "single" as const,
      }));

      const studentsList: Student[] = (standings || []).map((s: any) => {
        const grade = s.grade ?? 0;
        const classNum = s.class_number ?? 0;
        const number = s.student_no ?? 0;
        const name = s.display_name || (s.nickname ?? `${grade}-${classNum}-${number}번`);

        // 승패는 그 시즌 경기 기록에서 계산 (win_count 컬럼은 앱에서 갱신되지 않아 신뢰 불가)
        const myMatches = matchesList
          .filter((m) => m.playerAId === s.student_id || m.playerBId === s.student_id)
          .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
        const wins = myMatches.filter((m) => m.playerAId === s.student_id).length;
        const losses = myMatches.filter((m) => m.playerBId === s.student_id).length;
        const recent = myMatches.slice(0, 5).map((m) => (m.playerAId === s.student_id ? "W" : "L"));

        return {
          id: s.student_id,
          grade,
          classNum,
          number,
          name,
          realName: s.real_name ?? "",
          nickname: s.nickname ?? "",
          gender: (s.gender || "U") as Gender,
          rp: s.rp ?? 1000,
          wins,
          losses,
          recent,
          currentStreak: 0,
          demotionShields: 3,
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

  // 7. 과거 시즌 관리 (교사 전용) — 복귀 / 이름변경 / 삭제 / 명예의 전당
  const restoreSeason = useCallback(async (targetSeason: string) => {
    const classId = currentClassIdRef.current;
    if (!classId) return { success: false };
    try {
      const { error } = await apiRestoreSeason(classId, targetSeason);
      if (error) throw error;
      setCurrentViewSeason("현재 시즌");
      await loadClassDataRef.current?.(classId);
      toast.success(`'${targetSeason}' 시즌으로 복귀했습니다. (이어서 진행)`);
      return { success: true };
    } catch (err: any) {
      toast.error(err.message || "시즌 복귀에 실패했습니다.");
      return { success: false, message: err.message };
    }
  }, []);

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

  return {
    hydrated, 
    currentClassId,
    loadClassData,
    students, 
    matches, 
    title, 
    setTitle, 
    teacherAccessCode,
    setTeacherAccessCode,
    lockLeaderboard,
    lockAdmin,
    saveLockSetting,
    recordMatch,
    upsertStudents,
    deleteMatch,
    resetStudent, 
    resetAllData, 
    updateStudentRP,
    isSyncing,
    isClassOwner,
    isClassManager,
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
    calculateAchievements,
    promotionEvent,
    setPromotionEvent,
    seasonList,
    currentSeason,
    changeSeason,
    currentViewSeason,
    changeViewSeason,
    restoreSeason,
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
    checkAndApplyAutomaticDecay,
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
