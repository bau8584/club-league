import React, { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import type { Student, Match, Gender, TierName, TierSettings, DynamicBonuses } from "./league-types";
import { studentKey, getTier, getTierSubdivision, getFullTierLabel, TIER_ORDER } from "./league-types";
import { toast } from "sonner";

export type Achievement = {
  id: string;
  name: string;
  description: string;
  tier: "Common" | "Rare" | "Epic" | "Legendary";
  currentValue: number;
  targetValue: number;
  isUnlocked: boolean;
};

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

const STUDENTS_KEY = "bdm.students.v2";
const MATCHES_KEY = "bdm.matches.v1";
const TITLE_KEY = "bdm.title.v1";
const LOCKED_KEY = "bdm.locked.v1";
const SETTINGS_KEY = "bdm.settings.v1";
const BONUSES_KEY = "bdm.bonuses.v1";
const TIER_SETTINGS_KEY = "bdm.tierSettings.v1";
const NEW_BONUSES_KEY = "bdm.bonuses_new.v1";

// 세션 영속 저장을 위한 로컬스토리지 키
const SESSION_KEY = "bdm.session.v1";
const OP_MODE_KEY = "bdm.opMode.v1";

const DECAY_ENABLED_KEY = "bdm.decay.enabled.v1";
const DECAY_DAYS_KEY = "bdm.decay.days.v1";
const DECAY_AMOUNT_KEY = "bdm.decay.amount.v1";
const DECAY_TIERS_KEY = "bdm.decay.tiers.v1";
const LAST_DECAY_DATE_KEY = "bdm.decay.last_date.v1";

// 마스터 DB 구글 Apps Script Web App API 주소
const MASTER_API_URL = "https://script.google.com/macros/s/AKfycbzcu1d1T8pHvzwvcPn2qPFIg8YtCQxsspvfQ6Koa-ie6wWE9UhEvtPzurK92SVeJEMvyQ/exec";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// 교사/학교 매핑 목록 로컬 캐싱 기능 (구글 시트 API 속도 개선)
async function getTeachersList(forceRefresh = false): Promise<any[]> {
  if (typeof window === "undefined") return [];
  const TEACHERS_CACHE_KEY = "bdm.teachers_list.cache";
  const TEACHERS_CACHE_TIME_KEY = "bdm.teachers_list.cache_time";
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간 캐싱

  if (!forceRefresh) {
    try {
      const cachedListStr = localStorage.getItem(TEACHERS_CACHE_KEY);
      const cachedTimeStr = localStorage.getItem(TEACHERS_CACHE_TIME_KEY);
      if (cachedListStr && cachedTimeStr) {
        const cachedTime = parseInt(cachedTimeStr, 10);
        if (Date.now() - cachedTime < CACHE_DURATION) {
          return JSON.parse(cachedListStr);
        }
      }
    } catch (e) {
      console.warn("Error reading teachers list cache:", e);
    }
  } else {
    // 만약 최근 5분 이내에 이미 네트워크에서 명단을 가져왔다면 강제 새로고침을 생략하여 불필요한 지연을 막습니다.
    try {
      const cachedTimeStr = localStorage.getItem(TEACHERS_CACHE_TIME_KEY);
      if (cachedTimeStr) {
        const cachedTime = parseInt(cachedTimeStr, 10);
        if (Date.now() - cachedTime < 5 * 60 * 1000) {
          const cachedListStr = localStorage.getItem(TEACHERS_CACHE_KEY);
          if (cachedListStr) {
            console.log("Recently fetched teachers list from network. Skipping force refresh cooldown.");
            return JSON.parse(cachedListStr);
          }
        }
      }
    } catch (e) {}
  }

  try {
    const teachersRes = await fetch(`${MASTER_API_URL}?action=GET_TEACHERS`);
    const teachersData = await teachersRes.json();
    if (teachersData.status === "success" && teachersData.teachers) {
      localStorage.setItem(TEACHERS_CACHE_KEY, JSON.stringify(teachersData.teachers));
      localStorage.setItem(TEACHERS_CACHE_TIME_KEY, Date.now().toString());
      return teachersData.teachers;
    }
  } catch (error) {
    console.error("Failed to fetch matching school list:", error);
  }

  // fallback to cached data if network request fails
  try {
    const cachedListStr = localStorage.getItem(TEACHERS_CACHE_KEY);
    if (cachedListStr) return JSON.parse(cachedListStr);
  } catch (e) {}

  return [];
}

const SEED_STUDENTS: Student[] = [
  { id: uid(), grade: 5, classNum: 1, number: 1,  name: "강서준", gender: "M", rp: 1320, recent: ["W","W","L","W","W"], wins: 8, losses: 3 },
  { id: uid(), grade: 5, classNum: 1, number: 2,  name: "김민재", gender: "M", rp: 1180, recent: ["L","W","W","L","W"], wins: 6, losses: 5 },
  { id: uid(), grade: 6, classNum: 2, number: 1,  name: "이지우", gender: "F", rp: 1620, recent: ["W","W","W","W","L"], wins: 12, losses: 2 },
  { id: uid(), grade: 6, classNum: 2, number: 2,  name: "박지성", gender: "M", rp: 1450, recent: ["W","L","W","W","W"], wins: 9, losses: 3 },
  { id: uid(), grade: 4, classNum: 3, number: 1,  name: "최서아", gender: "F", rp: 980,  recent: ["L","L","W","L","W"], wins: 3, losses: 6 },
  { id: uid(), grade: 3, classNum: 1, number: 1,  name: "정윤우", gender: "M", rp: 1050, recent: ["W","L","L","W","L"], wins: 4, losses: 5 },
  { id: uid(), grade: 6, classNum: 1, number: 1,  name: "강하윤", gender: "F", rp: 1530, recent: ["W","W","L","W","W"], wins: 10, losses: 4 },
  { id: uid(), grade: 5, classNum: 2, number: 1,  name: "윤도현", gender: "M", rp: 1210, recent: ["W","L","W","L","W"], wins: 7, losses: 5 },
  { id: uid(), grade: 5, classNum: 2, number: 2,  name: "이지민", gender: "F", rp: 1110, recent: ["L","W","L","W","L"], wins: 5, losses: 7 },
  { id: uid(), grade: 6, classNum: 1, number: 2,  name: "한주원", gender: "M", rp: 1390, recent: ["W","W","W","L","L"], wins: 8, losses: 4 },
  { id: uid(), grade: 6, classNum: 1, number: 3,  name: "김수아", gender: "F", rp: 1490, recent: ["W","L","W","W","W"], wins: 10, losses: 2 },
  { id: uid(), grade: 4, classNum: 1, number: 1,  name: "최예준", gender: "M", rp: 1020, recent: ["L","W","W","L","L"], wins: 4, losses: 6 },
  { id: uid(), grade: 4, classNum: 1, number: 2,  name: "박서윤", gender: "F", rp: 950,  recent: ["L","L","L","W","W"], wins: 2, losses: 8 },
  { id: uid(), grade: 3, classNum: 2, number: 1,  name: "송민우", gender: "M", rp: 1040, recent: ["W","L","W","L","W"], wins: 5, losses: 5 },
  { id: uid(), grade: 3, classNum: 2, number: 2,  name: "윤아린", gender: "F", rp: 920,  recent: ["L","L","W","L","L"], wins: 2, losses: 8 },
  { id: uid(), grade: 5, classNum: 3, number: 1,  name: "정민서", gender: "F", rp: 1250, recent: ["W","W","L","W","L"], wins: 7, losses: 5 },
  { id: uid(), grade: 5, classNum: 3, number: 2,  name: "조현우", gender: "M", rp: 1300, recent: ["W","W","W","L","W"], wins: 9, losses: 3 },
  { id: uid(), grade: 6, classNum: 3, number: 1,  name: "신지아", gender: "F", rp: 1580, recent: ["W","W","W","W","W"], wins: 13, losses: 1 },
  { id: uid(), grade: 6, classNum: 3, number: 2,  name: "유재희", gender: "M", rp: 1410, recent: ["L","W","W","W","L"], wins: 8, losses: 4 },
  { id: uid(), grade: 4, classNum: 2, number: 1,  name: "김하은", gender: "F", rp: 1070, recent: ["W","W","L","L","W"], wins: 6, losses: 4 },
  { id: uid(), grade: 4, classNum: 2, number: 2,  name: "임지우", gender: "M", rp: 1150, recent: ["W","L","W","W","L"], wins: 8, losses: 5 },
  { id: uid(), grade: 3, classNum: 3, number: 1,  name: "서준우", gender: "M", rp: 1010, recent: ["L","L","W","W","L"], wins: 3, losses: 6 },
  { id: uid(), grade: 3, classNum: 3, number: 2,  name: "오다인", gender: "F", rp: 980,  recent: ["W","L","L","L","W"], wins: 4, losses: 6 },
  { id: uid(), grade: 5, classNum: 1, number: 3,  name: "황지안", gender: "F", rp: 1220, recent: ["L","W","W","W","L"], wins: 7, losses: 5 },
  { id: uid(), grade: 5, classNum: 1, number: 4,  name: "박건우", gender: "M", rp: 1190, recent: ["W","L","L","W","W"], wins: 6, losses: 5 },
  { id: uid(), grade: 6, classNum: 2, number: 3,  name: "김태양", gender: "M", rp: 1350, recent: ["L","W","L","W","W"], wins: 7, losses: 5 },
  { id: uid(), grade: 6, classNum: 2, number: 4,  name: "송지효", gender: "F", rp: 1280, recent: ["W","L","W","L","L"], wins: 5, losses: 6 },
  { id: uid(), grade: 4, classNum: 3, number: 2,  name: "권은우", gender: "M", rp: 1120, recent: ["W","W","L","L","W"], wins: 6, losses: 5 },
  { id: uid(), grade: 4, classNum: 3, number: 3,  name: "윤채원", gender: "F", rp: 1050, recent: ["L","W","W","L","L"], wins: 4, losses: 6 },
  { id: uid(), grade: 5, classNum: 2, number: 3,  name: "백현우", gender: "M", rp: 1270, recent: ["W","L","W","W","W"], wins: 9, losses: 3 }
];

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

type UserSession = {
  loginId: string;
  role: "MASTER" | "TEACHER" | "STUDENT";
  schoolName: string;
  userName: string;
  scriptUrl: string;
  studentId?: string;
  leagueName?: string;
  settingsBonus?: string | Record<string, any>;
} | null;

function useLeagueStoreInternal() {
  const [hydrated, setHydrated] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [title, setTitle] = useState<string>("2026 초등 리그전");
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [seasonList, setSeasonList] = useState<string[]>([]);
  const [currentViewSeason, setCurrentViewSeason] = useState<string>("현재 시즌");
  const currentViewSeasonRef = useRef(currentViewSeason);
  useEffect(() => {
    currentViewSeasonRef.current = currentViewSeason;
  }, [currentViewSeason]);

  // 3대 역할 로그인 세션 상태
  const [session, setSession] = useState<UserSession>(null);
  const [opMode, setOpMode] = useState<"school" | "club">("school");

  // 이중 보안 모달을 위한 선생님 비밀번호(접근 코드) 전역 관리
  const [teacherAccessCode, setTeacherAccessCode] = useState<string>(() => {
    if (typeof window === "undefined") return "1234";
    return localStorage.getItem("bdm.teacherAccessCode.v1") || "1234";
  });

  // 리그전 커스텀 설정 상태 추가
  const [tierThresholds, setTierThresholds] = useState<Record<TierName, number>>({
    Bronze: 0,
    Silver: 1000,
    Gold: 1200,
    Platinum: 1400,
    Diamond: 1600
  });
  const [rpVariables, setRpVariables] = useState<{ winDelta: number; loseDelta: number }>({
    winDelta: 25,
    loseDelta: 20
  });

  const [tierSettings, setTierSettings] = useState<TierSettings>({
    Bronze: { winDelta: 25, loseDelta: 20 },
    Silver: { winDelta: 25, loseDelta: 20 },
    Gold: { winDelta: 25, loseDelta: 20 },
    Platinum: { winDelta: 25, loseDelta: 20 }
  });

  const [dynamicBonuses, setDynamicBonuses] = useState<DynamicBonuses>({
    freshnessEnabled: true,
    freshnessGames: 5,
    freshnessRp: 5,
    streakEnabled: true,
    streakWins: 3,
    streakRp: 10,
    comebackEnabled: true,
    comebackLosses: 3,
    comebackRp: 10,
    marginEnabled: true,
    marginDiff: 10,
    marginRp: 10,
    firstWinEnabled: true,
    firstWinRp: 15,
    revengeEnabled: true,
    revengeRp: 10,
    underdogEnabled: true,
    underdogPercent: 10,
    rivalEnabled: true,
    rivalRp: 5
  });

  const [activeBonuses, setActiveBonuses] = useState<ActiveBonuses>({
    firstWin: true,
    revenge: true,
    underdog: true,
    scoreDiff: true,
    rival: true
  });

  const [decayEnabled, setDecayEnabled] = useState<boolean>(false);
  const [decayDays, setDecayDays] = useState<number>(14);
  const [decayAmount, setDecayAmount] = useState<number>(10);
  const [decayTiers, setDecayTiers] = useState<TierName[]>(["Bronze", "Silver", "Gold", "Platinum"]);
  const [lastDecayDate, setLastDecayDate] = useState<string>("");

  const parseRemoteSettings = useCallback((data: any) => {
    if (data.leagueName) {
      setTitle(data.leagueName);
      saveJSON(TITLE_KEY, data.leagueName);
    }
    if (data.settings) {
      const s = data.settings;
      if (s.leagueName) {
        setTitle(s.leagueName);
        saveJSON(TITLE_KEY, s.leagueName);
      }
      if (s.decayEnabled !== undefined) {
        setDecayEnabled(!!s.decayEnabled);
        saveJSON(DECAY_ENABLED_KEY, !!s.decayEnabled);
      }
      if (s.decayDays !== undefined) {
        setDecayDays(Number(s.decayDays));
        saveJSON(DECAY_DAYS_KEY, Number(s.decayDays));
      }
      if (s.decayAmount !== undefined) {
        setDecayAmount(Number(s.decayAmount));
        saveJSON(DECAY_AMOUNT_KEY, Number(s.decayAmount));
      }
      if (s.decayTiers !== undefined) {
        const tiers = Array.isArray(s.decayTiers)
          ? s.decayTiers
          : typeof s.decayTiers === "string"
            ? s.decayTiers.split(",").map((t: string) => t.trim())
            : [];
        setDecayTiers(tiers);
        saveJSON(DECAY_TIERS_KEY, tiers);
      }
      if (s.tierSettings !== undefined) {
        setTierSettings(s.tierSettings);
        saveJSON(TIER_SETTINGS_KEY, s.tierSettings);
      }
      if (s.bonuses !== undefined) {
        const mergedBonuses = {
          freshnessEnabled: true,
          freshnessGames: 5,
          freshnessRp: 5,
          streakEnabled: true,
          streakWins: 3,
          streakRp: 10,
          comebackEnabled: true,
          comebackLosses: 3,
          comebackRp: 10,
          marginEnabled: true,
          marginDiff: 10,
          marginRp: 10,
          firstWinEnabled: true,
          firstWinRp: 15,
          revengeEnabled: true,
          revengeRp: 10,
          underdogEnabled: true,
          underdogPercent: 10,
          rivalEnabled: true,
          rivalRp: 5,
          ...s.bonuses
        };
        setDynamicBonuses(mergedBonuses);
        saveJSON(NEW_BONUSES_KEY, mergedBonuses);
      }
    }
    const lDecayDate = data.lastDecayDate || (data.settings && data.settings.lastDecayDate);
    if (lDecayDate) {
      setLastDecayDate(lDecayDate);
      saveJSON(LAST_DECAY_DATE_KEY, lDecayDate);
    }
  }, []);

  const [promotionQueue, setPromotionQueue] = useState<{ isPromoted: boolean; newTier: string; studentName?: string }[]>([]);
  const promotionEvent = promotionQueue[0] || null;
  const setPromotionEvent = useCallback((event: { isPromoted: boolean; newTier: string; studentName?: string } | null) => {
    if (event === null) {
      setPromotionQueue((prev) => prev.slice(1));
    } else {
      setPromotionQueue((prev) => [...prev, event]);
    }
  }, []);

  // 1-1. 전체 학생 동기화 (SYNC_ALL)
  const syncAllStudentsToGoogleSheets = useCallback(async (
    targetStudents: Student[],
    previousStudents?: Student[],
    isBackground = false
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return false;
    }
    if (!session || !session.scriptUrl) return true;
    if (!isBackground) setIsSyncing(true);

    try {
      const res = await fetch(session.scriptUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "SYNC_ALL",
          students: targetStudents
        })
      });

      if (res.status === 429 || res.status === 500 || res.status === 503) {
        throw new Error(`STATUS_${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "error") {
        throw new Error(data.message || "SYNC_ERROR");
      }

      toast.success("데이터베이스에 저장되었습니다.");
      return true;
    } catch (error) {
      console.error("Syncing all students to Google Sheets failed:", error);
      toast.error("서버 혼잡 또는 네트워크 오류로 학생 데이터 동기화에 실패했습니다.", {
        id: "sync-all-error",
        duration: 5000
      });

      // 동기화 실패 시 이전 상태로 복구
      if (previousStudents) {
        setStudents(previousStudents);
        saveJSON(STUDENTS_KEY, previousStudents);
      }
      return false;
    } finally {
      if (!isBackground) setIsSyncing(false);
    }
  }, [session]);

  // 1. 단일 경기 기록 서버 원장 동기화 (RECORD_LEDGER)
  const recordMatchToGoogleSheets = useCallback(async (
    match: Match,
    rpChanges: Record<string, number>,
    previousStudents?: Student[],
    previousMatches?: Match[]
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return false;
    }
    // 세션에 개인 scriptUrl이 없으면 동기화 생략 (로컬 저장만 적용 - 게스트 모드 포함)
    if (!session || !session.scriptUrl) return;

    try {
      const res = await fetch(session.scriptUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "RECORD_LEDGER",
          match,
          rpChanges,
          settings: {
            tierThresholds,
            rpVariables
          }
        })
      });

      if (res.status === 429 || res.status === 500 || res.status === 503) {
        throw new Error(`STATUS_${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "error") {
        throw new Error(data.message || "SYNC_ERROR");
      }

      console.log("Successfully recorded match to Google Sheets ledger!");
    } catch (error) {
      console.error("Recording match to Google Sheets failed:", error);

      // 서버 혼잡 또는 네트워크 오류 발생 시 즉시 알림 및 롤백
      toast.error("서버 혼잡 또는 네트워크 오류로 기록이 취소되었습니다. 다시 시도해주세요.", {
        id: "sync-lock-error",
        duration: 5000
      });

      // 동기화 실패 시 입력을 취소하기 위해 이전 상태로 즉시 롤백
      if (previousStudents) {
        setStudents(previousStudents);
        saveJSON(STUDENTS_KEY, previousStudents);
      }
      if (previousMatches) {
        setMatches(previousMatches);
        saveJSON(MATCHES_KEY, previousMatches);
      }
    }
  }, [session]);

  // 2. 로그인 수행 함수 (간편 로그인 시스템 도입 - 이메일/PW 제거, 동명이인 방지 추가)
  const loginUser = useCallback(async (
    schoolName: string, 
    accessCodeOrName: string, 
    role: "MASTER" | "TEACHER" | "STUDENT",
    studentGrade?: number,
    studentClass?: number
  ) => {
    const cleanedSchool = schoolName.trim();
    const cleanedCode = accessCodeOrName.trim();

    // A. 🎮 게스트(체험용) 모드 예외 처리 - 구글 통신 없이 즉시 로컬 실행 가동
    if (cleanedSchool.toLowerCase() === "guest" || cleanedSchool === "꿈나무 초등학교") {
      const guestSession = {
        loginId: "guest",
        role: "TEACHER" as const,
        schoolName: "꿈나무 초등학교 (체험용 스포츠 리그)",
        userName: "게스트 교사",
        scriptUrl: ""
      };
      setSession(guestSession);
      saveJSON(SESSION_KEY, guestSession);
      
      const localStudents = loadJSON<Student[] | null>(STUDENTS_KEY, null);
      if (!localStudents || localStudents.length < 20) {
        setStudents(SEED_STUDENTS);
        saveJSON(STUDENTS_KEY, SEED_STUDENTS);
      } else {
        setStudents(localStudents);
      }
      return { success: true };
    }

    setIsSyncing(true);
    try {
      // 1. 학생 로그인 시, 구글 마스터 DB의 등록된 교사/학교 목록을 조회하여 해당 학교의 구글 시트 scriptUrl을 동적으로 찾고 명단 최신화
      if (role === "STUDENT") {
        let schoolScriptUrl = "";
        try {
          let teachers = await getTeachersList();
          const normalizeSchool = (name: string) => name.replace(/(초등학교|중학교|고등학교|초등|중등|고등|학교|초|클럽|동호회|회)$/, "").trim().toLowerCase();
          const targetSchool = normalizeSchool(cleanedSchool);
          let matchedTeacher = teachers.find(
            (t: any) => 
              normalizeSchool(t.schoolName) === targetSchool || 
              normalizeSchool(t.loginId) === targetSchool
          );
          
          if (!matchedTeacher) {
            // 캐시 미스 시 강제 새로고침
            teachers = await getTeachersList(true);
            matchedTeacher = teachers.find(
              (t: any) => 
                normalizeSchool(t.schoolName) === targetSchool || 
                normalizeSchool(t.loginId) === targetSchool
            );
          }

          if (matchedTeacher) {
            if (matchedTeacher.scriptUrl) {
              schoolScriptUrl = matchedTeacher.scriptUrl;
            }
            if (matchedTeacher.settingsBonus) {
              try {
                const parsed = typeof matchedTeacher.settingsBonus === "string"
                  ? JSON.parse(matchedTeacher.settingsBonus)
                  : matchedTeacher.settingsBonus;
                if (parsed && parsed.opMode) {
                  setOpMode(parsed.opMode);
                  saveJSON(OP_MODE_KEY, parsed.opMode);
                }
              } catch (e) {
                console.warn("Failed to parse settingsBonus from matched teacher:", e);
              }
            }
          }
        } catch (err) {
          console.warn("Failed to retrieve matching school scriptUrl for student:", err);
        }

        let activeStudents = students;
        if (schoolScriptUrl) {
          try {
            const res = await fetch(schoolScriptUrl);
            const remoteData = await res.json();
            if (remoteData.status === "success" && remoteData.students) {
              const mappedStudents = remoteData.students.map((s: any) => ({
                ...s,
                grade: s.grade ? Number(s.grade) : 0,
                classNum: s.classNum ? Number(s.classNum) : 0,
                number: s.number ? Number(s.number) : 0
              }));
              activeStudents = mappedStudents;
              setStudents(mappedStudents);
              saveJSON(STUDENTS_KEY, mappedStudents);
              if (remoteData.matches) {
                setMatches(remoteData.matches);
                saveJSON(MATCHES_KEY, remoteData.matches);
              }
              if (remoteData.seasonList) {
                setSeasonList(remoteData.seasonList);
              }
              parseRemoteSettings(remoteData);
            }
          } catch (err) {
            console.warn("Failed fetching student roster from school scriptUrl:", err);
          }
        }

        if (activeStudents.length === 0) {
          const isGuest = cleanedSchool.toLowerCase() === "guest" || cleanedSchool === "꿈나무 초등학교";
          activeStudents = loadJSON<Student[]>(STUDENTS_KEY, isGuest ? SEED_STUDENTS : []);
        }

        // Get currently active opMode (either state or cached fallback)
        const currentOpMode = localStorage.getItem(OP_MODE_KEY) || opMode;

        const matchStudent = activeStudents.find((s) => 
          s.name === cleanedCode && 
          (currentOpMode === "club" || (
            (studentGrade === undefined || s.grade === studentGrade) &&
            (studentClass === undefined || s.classNum === studentClass)
          ))
        );

        if (matchStudent) {
          const studentSession = {
            loginId: "student_" + cleanedCode + "_" + matchStudent.id,
            role: "STUDENT" as const,
            schoolName: cleanedSchool,
            userName: cleanedCode,
            studentId: matchStudent.id,
            scriptUrl: schoolScriptUrl
          };
          setSession(studentSession);
          saveJSON(SESSION_KEY, studentSession);
          sessionStorage.setItem("bdm.just_logged_in", "true");
          return { success: true };
        } else {
          const msg = currentOpMode === "club"
            ? `${cleanedSchool} 명단에 '${cleanedCode}' 선수가 존재하지 않습니다. 관리자에게 문의하세요.`
            : `${cleanedSchool} 명단에 '${studentGrade}학년 ${studentClass}반 ${cleanedCode}' 학생이 존재하지 않습니다. 교사에게 문의하세요.`;
          return { success: false, message: msg };
        }
      }

      // 2. MASTER 최고 관리자 또는 TEACHER 로그인 시도 (마스터 API 통신)
      let loginIdToUse = role === "MASTER" ? cleanedSchool : cleanedSchool;

      if (role === "TEACHER") {
        // 교사의 경우, 학교명 입력이 단축어 또는 실제 schoolName 혹은 loginId 에 해당하는지 마스터 교사 목록에서 조회하여 실제 ID 매핑
        try {
          let teachers = await getTeachersList();
          const normalizeSchool = (name: string) => name.replace(/(초등학교|중학교|고등학교|초등|중등|고등|학교|초|클럽|동호회|회)$/, "").trim().toLowerCase();
          const targetSchool = normalizeSchool(cleanedSchool);
          let matchedTeacher = teachers.find(
            (t: any) => 
              normalizeSchool(t.schoolName) === targetSchool || 
              normalizeSchool(t.loginId) === targetSchool
          );

          if (!matchedTeacher) {
            // 캐시 미스 시 강제 새로고침
            teachers = await getTeachersList(true);
            matchedTeacher = teachers.find(
              (t: any) => 
                normalizeSchool(t.schoolName) === targetSchool || 
                normalizeSchool(t.loginId) === targetSchool
            );
          }

          if (matchedTeacher) {
            loginIdToUse = matchedTeacher.loginId;
          }
        } catch (err) {
          console.warn("Failed to retrieve matching teacher loginId from GET_TEACHERS, using cleanedSchool directly:", err);
        }
      }

      const response = await fetch(MASTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "LOGIN",
          loginId: loginIdToUse,
          password: cleanedCode,
          role
        })
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "error" && data.message && data.message.includes("혼잡")) {
        toast.error("다른 사용자가 로그인/등록 중입니다. 3초 후 다시 시도해주세요.", { id: "login-lock-error" });
        return { success: false, message: "다른 사용자가 로그인/등록 중입니다. 3초 후 다시 시도해주세요." };
      }
      
      if (data && data.status === "success" && data.user) {
        setSession(data.user);
        saveJSON(SESSION_KEY, data.user);
        if (role === "TEACHER" || role === "MASTER") {
          setTeacherAccessCode(cleanedCode);
          localStorage.setItem("bdm.teacherAccessCode.v1", cleanedCode);
        }
        
        if (data.user.leagueName) {
          setTitle(data.user.leagueName);
          saveJSON(TITLE_KEY, data.user.leagueName);
        }
        if (data.user.settingsBonus) {
          try {
            const parsed = typeof data.user.settingsBonus === "string" 
              ? JSON.parse(data.user.settingsBonus) 
              : data.user.settingsBonus;
            setActiveBonuses(parsed);
            if (parsed && parsed.opMode) {
              setOpMode(parsed.opMode);
              saveJSON(OP_MODE_KEY, parsed.opMode);
            }
            saveJSON(BONUSES_KEY, parsed);
          } catch (e) {
            console.error("Failed parsing settingsBonus from login response:", e);
          }
        }
        
        const isGuest = data.user.loginId === "guest" || data.user.schoolName?.includes("꿈나무");
        if (data.user.scriptUrl) {
          try {
            const remoteRes = await fetch(data.user.scriptUrl);
            const remoteData = await remoteRes.json();
            if (remoteData.status === "success") {
              const fetchedStudents = (remoteData.students || []).map((s: any) => ({
                ...s,
                grade: s.grade ? Number(s.grade) : 0,
                classNum: s.classNum ? Number(s.classNum) : 0,
                number: s.number ? Number(s.number) : 0
              }));
              setStudents(fetchedStudents);
              saveJSON(STUDENTS_KEY, fetchedStudents);
              const fetchedMatches = remoteData.matches || [];
              setMatches(fetchedMatches);
              saveJSON(MATCHES_KEY, fetchedMatches);
              if (remoteData.seasonList) {
                setSeasonList(remoteData.seasonList);
              }
              parseRemoteSettings(remoteData);
            } else {
              const defaultStudents = isGuest ? SEED_STUDENTS : [];
              setStudents(defaultStudents);
              saveJSON(STUDENTS_KEY, defaultStudents);
            }
          } catch (err) {
            console.warn("Could not download remote sheet data upon login. Using cached data:", err);
            const localStudents = loadJSON<Student[] | null>(STUDENTS_KEY, null);
            const isLocalSeed = localStudents && localStudents.length > 0 && localStudents[0].name === SEED_STUDENTS[0].name;
            if (!isGuest && isLocalSeed) {
              setStudents([]);
              saveJSON(STUDENTS_KEY, []);
            }
          }
        } else {
          const defaultStudents = isGuest ? SEED_STUDENTS : [];
          setStudents(defaultStudents);
          saveJSON(STUDENTS_KEY, defaultStudents);
          setMatches([]);
          saveJSON(MATCHES_KEY, []);
        }
        sessionStorage.setItem("bdm.just_logged_in", "true");
        return { success: true };
      } else {
        // [마스터 비밀번호 우회 로그인 검증]
        // 어떤 학교든지 교사 로그인 시, 입력된 비밀번호가 구글 마스터 DB의 MASTER 역할 비밀번호와 일치하면 로그인을 통과시켜 줍니다.
        if (role === "TEACHER") {
          let isMasterPassword = false;
          // 마스터 API 통신을 통해 입력된 비밀번호를 MASTER 계정("admin" 및 "MASTER")으로 병렬 로그인 시도하여 검증
          try {
            const masterLogins = ["admin", "MASTER"].map(async (loginId) => {
              try {
                const res = await fetch(MASTER_API_URL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "text/plain;charset=utf-8",
                  },
                  body: JSON.stringify({
                    action: "LOGIN",
                    loginId,
                    password: cleanedCode,
                    role: "MASTER"
                  })
                });
                const data = await res.json();
                return data.status === "success";
              } catch (e) {
                return false;
              }
            });
            const results = await Promise.all(masterLogins);
            isMasterPassword = results.some(Boolean);
          } catch (err) {
            console.warn("Failed master password parallel authentication check:", err);
          }

          if (isMasterPassword) {
            // 마스터 비밀번호로 확인된 경우: 
            // 1. 오프라인 대비 로컬 캐싱 저장
            localStorage.setItem("bdm.masterPassword.v1", cleanedCode);

            // 2. 마스터 API에서 교사 목록을 가져와 현재 학교(schoolName)가 등록되어 있는지 조회
            let schoolScriptUrl = "";
            let schoolUserName = "선생님 (마스터)";
            try {
              const teachersRes = await fetch(`${MASTER_API_URL}?action=GET_TEACHERS`);
              const teachersData = await teachersRes.json();
              if (teachersData.status === "success" && teachersData.teachers) {
                const normalizeSchool = (name: string) => name.replace(/(초등학교|중학교|고등학교|초등|중등|고등|학교|초|클럽|동호회|회)$/, "").trim().toLowerCase();
                const targetSchool = normalizeSchool(cleanedSchool);
                const matchedTeacher = teachersData.teachers.find(
                  (t: any) => 
                    normalizeSchool(t.schoolName) === targetSchool || 
                    normalizeSchool(t.loginId) === targetSchool
                );
                if (matchedTeacher) {
                  schoolScriptUrl = matchedTeacher.scriptUrl;
                  schoolUserName = matchedTeacher.userName;
                }
              }
            } catch (err) {
              console.warn("Failed to retrieve scriptUrl from teacher list via master password:", err);
            }

            const teacherSession = {
              loginId: "teacher_" + cleanedSchool,
              role: "TEACHER" as const,
              schoolName: cleanedSchool,
              userName: schoolUserName,
              scriptUrl: schoolScriptUrl
            };
            setSession(teacherSession);
            saveJSON(SESSION_KEY, teacherSession);
            setTeacherAccessCode(cleanedCode);
            localStorage.setItem("bdm.teacherAccessCode.v1", cleanedCode);

            // 구글 시트 연동 갱신 시도
            const isGuest = cleanedSchool.toLowerCase() === "guest" || cleanedSchool === "꿈나무 초등학교";
            if (schoolScriptUrl) {
              try {
                const remoteRes = await fetch(schoolScriptUrl);
                const remoteData = await remoteRes.json();
                if (remoteData.status === "success") {
                  const fetchedStudents = (remoteData.students || []).map((s: any) => ({
                    ...s,
                    grade: s.grade ? Number(s.grade) : 0,
                    classNum: s.classNum ? Number(s.classNum) : 0,
                    number: s.number ? Number(s.number) : 0
                  }));
                  setStudents(fetchedStudents);
                  saveJSON(STUDENTS_KEY, fetchedStudents);
                  const fetchedMatches = remoteData.matches || [];
                  setMatches(fetchedMatches);
                  saveJSON(MATCHES_KEY, fetchedMatches);
                  if (remoteData.seasonList) {
                    setSeasonList(remoteData.seasonList);
                  }
                  parseRemoteSettings(remoteData);
                } else {
                  const defaultStudents = isGuest ? SEED_STUDENTS : [];
                  setStudents(defaultStudents);
                  saveJSON(STUDENTS_KEY, defaultStudents);
                }
              } catch (err) {
                console.warn("Offline loading remote sheet data for school:", err);
                const localStudents = loadJSON<Student[] | null>(STUDENTS_KEY, null);
                const isLocalSeed = localStudents && localStudents.length > 0 && localStudents[0].name === SEED_STUDENTS[0].name;
                if (!isGuest && isLocalSeed) {
                  setStudents([]);
                  saveJSON(STUDENTS_KEY, []);
                }
              }
            } else {
              const defaultStudents = isGuest ? SEED_STUDENTS : [];
              setStudents(defaultStudents);
              saveJSON(STUDENTS_KEY, defaultStudents);
              setMatches([]);
              saveJSON(MATCHES_KEY, []);
            }
            sessionStorage.setItem("bdm.just_logged_in", "true");
            return { success: true };
          }
        }
        return { success: false, message: data.message || "로그인 인증 정보가 올바르지 않습니다." };
      }
    } catch (error) {
      console.warn("Master API login offline. Falling back to local validation:", error);
      // Offline fallback
      if (role === "TEACHER") {
        const cachedMasterPassword = localStorage.getItem("bdm.masterPassword.v1") || "admin1234";
        if (cleanedCode === cachedMasterPassword) {
          const teacherSession = {
            loginId: "teacher_" + cleanedSchool,
            role: "TEACHER" as const,
            schoolName: cleanedSchool,
            userName: "선생님 (오프라인 마스터)",
            scriptUrl: ""
          };
          setSession(teacherSession);
          saveJSON(SESSION_KEY, teacherSession);
          setTeacherAccessCode(cleanedCode);
          localStorage.setItem("bdm.teacherAccessCode.v1", cleanedCode);
          sessionStorage.setItem("bdm.just_logged_in", "true");
          return { success: true };
        } else {
          return { success: false, message: "교사 인증코드가 오프라인 상태에서 일치하지 않습니다." };
        }
      } else if (role === "STUDENT") {
        const isGuest = cleanedSchool.toLowerCase() === "guest" || cleanedSchool === "꿈나무 초등학교";
        const activeStudents = students.length > 0 ? students : loadJSON<Student[]>(STUDENTS_KEY, isGuest ? SEED_STUDENTS : []);
        const matchStudent = activeStudents.find((s) => 
          s.name === cleanedCode &&
          (studentGrade === undefined || s.grade === studentGrade) &&
          (studentClass === undefined || s.classNum === studentClass)
        );
        if (matchStudent) {
          const studentSession = {
            loginId: "student_" + cleanedCode + "_" + matchStudent.id,
            role: "STUDENT" as const,
            schoolName: cleanedSchool,
            userName: cleanedCode,
            studentId: matchStudent.id,
            scriptUrl: ""
          };
          setSession(studentSession);
          saveJSON(SESSION_KEY, studentSession);
          sessionStorage.setItem("bdm.just_logged_in", "true");
          return { success: true };
        }
      }
      return { success: false, message: "마스터 서버 통신 및 로컬 검증에 모두 실패했습니다." };
    } finally {
      setIsSyncing(false);
    }
  }, [students]);

  // 3. 신규 회원가입 수행 함수 (마스터 DB 등록 복원)
  const registerUser = useCallback(async (details: {
    loginId: string;
    password: string;
    role: "TEACHER" | "STUDENT";
    schoolName: string;
    userName: string;
    scriptUrl?: string;
    email?: string;
  }) => {
    setIsSyncing(true);
    try {
      const response = await fetch(MASTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "REGISTER",
          ...details
        })
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "error" && data.message && data.message.includes("혼잡")) {
        toast.error("다른 사용자가 로그인/등록 중입니다. 3초 후 다시 시도해주세요.", { id: "register-lock-error" });
        return { success: false, message: "다른 사용자가 로그인/등록 중입니다. 3초 후 다시 시도해주세요." };
      }

      if (data && data.status === "success") {
        return { success: true, message: data.message };
      } else {
        return { success: false, message: (data && data.message) || "가입 처리에 실패했습니다." };
      }
    } catch (error) {
      console.error("Registration request failed:", error);
      return { success: false, message: "마스터 가입 서버에 접속할 수 없습니다." };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 이메일 기반 비밀번호 자가 복구 기능 (GAS 연동)
  const recoverPassword = useCallback(async (schoolName: string, email: string) => {
    setIsSyncing(true);
    try {
      const response = await fetch(MASTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "RECOVER_PASSWORD",
          schoolName: schoolName.trim(),
          email: email.trim()
        })
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "error" && data.message && data.message.includes("혼잡")) {
        toast.error("다른 사용자가 요청 중입니다. 3초 후 다시 시도해주세요.", { id: "recover-lock-error" });
        return { success: false, message: "다른 사용자가 요청 중입니다. 3초 후 다시 시도해주세요." };
      }

      if (data && data.status === "success") {
        return { success: true, message: data.message || "비밀번호가 이메일로 자동 발송되었습니다." };
      } else {
        return { success: false, message: (data && data.message) || "해당 정보와 일치하는 계정을 찾을 수 없습니다." };
      }
    } catch (error) {
      console.error("Password recovery request failed:", error);
      return { success: false, message: "마스터 서버 통신 오류가 발생했습니다." };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 4. 로그아웃 수행 함수
  const logoutUser = useCallback(() => {
    setSession(null);
    saveJSON(SESSION_KEY, null);
    // 상태 초기화
    setStudents(SEED_STUDENTS);
    setMatches([]);
    saveJSON(STUDENTS_KEY, SEED_STUDENTS);
    saveJSON(MATCHES_KEY, []);
    setTeacherAccessCode("1234");
    localStorage.removeItem("bdm.teacherAccessCode.v1");
  }, []);

  // 5. 초기 기동 시 세션 및 로컬 데이터 Hydration
  useEffect(() => {
    const initData = async () => {
      // A. 교사 세션 로딩
      const cachedSession = loadJSON<UserSession>(SESSION_KEY, null);
      setSession(cachedSession);

      // B. 로컬 스토리지 리그 전적 로드
      const localStudents = loadJSON<Student[] | null>(STUDENTS_KEY, null);
      const localMatches = loadJSON<Match[]>(MATCHES_KEY, []);
      const localTitle = loadJSON<string>(TITLE_KEY, "2026 초등 리그전");
      const localLocked = loadJSON<boolean>(LOCKED_KEY, false);

      setDecayEnabled(loadJSON<boolean>(DECAY_ENABLED_KEY, false));
      setDecayDays(loadJSON<number>(DECAY_DAYS_KEY, 14));
      setDecayAmount(loadJSON<number>(DECAY_AMOUNT_KEY, 10));
      setDecayTiers(loadJSON<TierName[]>(DECAY_TIERS_KEY, ["Bronze", "Silver", "Gold", "Platinum"]));
      setLastDecayDate(loadJSON<string>(LAST_DECAY_DATE_KEY, ""));

      const localTierSettings = loadJSON<TierSettings | null>(TIER_SETTINGS_KEY, null);
      if (localTierSettings) setTierSettings(localTierSettings);

      const localNewBonuses = loadJSON<DynamicBonuses | null>(NEW_BONUSES_KEY, null);
      if (localNewBonuses) {
        setDynamicBonuses({
          freshnessEnabled: true,
          freshnessGames: 5,
          freshnessRp: 5,
          streakEnabled: true,
          streakWins: 3,
          streakRp: 10,
          comebackEnabled: true,
          comebackLosses: 3,
          comebackRp: 10,
          marginEnabled: true,
          marginDiff: 10,
          marginRp: 10,
          firstWinEnabled: true,
          firstWinRp: 15,
          revengeEnabled: true,
          revengeRp: 10,
          underdogEnabled: true,
          underdogPercent: 10,
          rivalEnabled: true,
          rivalRp: 5,
          ...(localNewBonuses as any)
        });
      }

      const isGuest = cachedSession?.loginId === "guest" || cachedSession?.schoolName?.includes("꿈나무");
      let activeStudents = localStudents !== null ? localStudents : SEED_STUDENTS;
      
      // If it is a real school session, but the local data is currently the SEED_STUDENTS (from a previous logout or guest state),
      // we must reset it to an empty list to avoid displaying the demo students in the new school.
      if (cachedSession && !isGuest) {
        const isLocalSeed = activeStudents.length > 0 && activeStudents[0].name === SEED_STUDENTS[0].name;
        if (isLocalSeed) {
          activeStudents = [];
          saveJSON(STUDENTS_KEY, []);
        }
      }

      setStudents(activeStudents);
      setMatches(localMatches);
      setTitle(localTitle);
      setIsLocked(localLocked);

      // 설정 로드
      const localSettings = loadJSON<{ thresholds: Record<TierName, number>; rpVars: { winDelta: number; loseDelta: number }; opMode?: "school" | "club" } | null>(SETTINGS_KEY, null);
      if (localSettings) {
        if (localSettings.thresholds) setTierThresholds(localSettings.thresholds);
        if (localSettings.rpVars) setRpVariables(localSettings.rpVars);
        if (localSettings.opMode) setOpMode(localSettings.opMode);
      }
      const cachedOpMode = localStorage.getItem(OP_MODE_KEY) as "school" | "club" | null;
      if (cachedOpMode) setOpMode(cachedOpMode);

      // 보너스 활성화 로드
      const localBonuses = loadJSON<ActiveBonuses | null>(BONUSES_KEY, null);
      if (localBonuses) {
        setActiveBonuses(localBonuses);
      }

      // 세션 기반 타이틀 및 설정 로드
      if (cachedSession) {
        if (cachedSession.leagueName) {
          setTitle(cachedSession.leagueName);
        }
        if (cachedSession.settingsBonus) {
          try {
            const parsed = typeof cachedSession.settingsBonus === "string" 
              ? JSON.parse(cachedSession.settingsBonus) 
              : cachedSession.settingsBonus;
            setActiveBonuses(parsed);
            if (parsed && parsed.opMode) {
              setOpMode(parsed.opMode);
              localStorage.setItem(OP_MODE_KEY, parsed.opMode);
            }
          } catch (e) {
            console.error("Failed to parse cached session bonuses:", e);
          }
        }
      }

      setHydrated(true);

      // C. 세션이 살아있는 경우 구글 시트 검증 및 연동 데이터 강제 최신화 (Source of Truth)
      if (cachedSession) {
        // 로그인 완료 직후 페이지 전환 등으로 인한 중복 Fetch 및 인증 요청 완벽 방지
        if (sessionStorage.getItem("bdm.just_logged_in") === "true") {
          sessionStorage.removeItem("bdm.just_logged_in");
          console.log("Skipping redundant init sync since user just logged in.");
          return;
        }

        const cachedCode = localStorage.getItem("bdm.teacherAccessCode.v1") || "";
        const needsVerification = (cachedSession.role === "TEACHER" || cachedSession.role === "MASTER") && cachedCode;

        setIsSyncing(true);

        const verifyPromise = (async () => {
          if (!needsVerification) return cachedSession;
          try {
            let loginIdToVerify = cachedSession.loginId;

            if (!loginIdToVerify && cachedSession.role === "TEACHER") {
              try {
                const teachers = await getTeachersList();
                const normalizeSchool = (name: string) => name.replace(/(초등학교|중학교|고등학교|초등|중등|고등|학교|초|클럽|동호회|회)$/, "").trim().toLowerCase();
                const targetSchool = normalizeSchool(cachedSession.schoolName);
                const matchedTeacher = teachers.find(
                  (t: any) => 
                    normalizeSchool(t.schoolName) === targetSchool || 
                    normalizeSchool(t.loginId) === targetSchool
                );
                if (matchedTeacher) {
                  loginIdToVerify = matchedTeacher.loginId;
                } else {
                  loginIdToVerify = cachedSession.schoolName;
                }
              } catch (e) {
                loginIdToVerify = cachedSession.schoolName;
              }
            }

            const verifyRes = await fetch(MASTER_API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "text/plain;charset=utf-8",
              },
              body: JSON.stringify({
                action: "LOGIN",
                loginId: loginIdToVerify,
                password: cachedCode,
                role: cachedSession.role
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyData.status !== "success" || !verifyData.user) {
              // 마스터 DB에서 비밀번호 불일치로 판정 -> 로컬 캐시 꼬임 방지를 위해 강제 로그아웃
              console.warn("Cached session validation failed (password changed in Google Sheets). Force logging out.");
              logoutUser();
              return null;
            } else {
              return verifyData.user;
            }
          } catch (err) {
            console.warn("Failed online-verifying cached session. Falling back to local cache:", err);
            return cachedSession;
          }
        })();

        const fetchSheetPromise = (async () => {
          if (!cachedSession.scriptUrl) return null;
          try {
            const response = await fetch(cachedSession.scriptUrl);
            const data = await response.json();
            return data;
          } catch (error) {
            console.warn("Could not sync with remote sheet on initialization. Local cache utilized:", error);
            return null;
          }
        })();

        try {
          const [verifiedUser, remoteData] = await Promise.all([verifyPromise, fetchSheetPromise]);

          if (verifiedUser) {
            // 최신 세션 정보 동기화
            setSession(verifiedUser);
            saveJSON(SESSION_KEY, verifiedUser);

            // 최신 구글 시트 데이터를 가져와 로컬 상태 강제 최신화
            if (remoteData && remoteData.status === "success") {
              if (remoteData.students) {
                const mappedStudents = remoteData.students.map((s: any) => ({
                  ...s,
                  grade: s.grade ? Number(s.grade) : 0,
                  classNum: s.classNum ? Number(s.classNum) : 0,
                  number: s.number ? Number(s.number) : 0
                }));
                setStudents(mappedStudents);
                saveJSON(STUDENTS_KEY, mappedStudents);
              }
              if (remoteData.matches) {
                setMatches(remoteData.matches);
                saveJSON(MATCHES_KEY, remoteData.matches);
              }
              
              parseRemoteSettings(remoteData);

              if (remoteData.settingsBonus) {
                try {
                  const parsed = typeof remoteData.settingsBonus === "string" 
                    ? JSON.parse(remoteData.settingsBonus) 
                    : remoteData.settingsBonus;
                  setActiveBonuses(parsed);
                  if (parsed && parsed.opMode) {
                    setOpMode(parsed.opMode);
                    localStorage.setItem(OP_MODE_KEY, parsed.opMode);
                  }
                  saveJSON(BONUSES_KEY, parsed);
                } catch (e) {
                  console.error("Failed parsing settingsBonus from remote GET:", e);
                }
              }
              if (remoteData.seasonList) {
                setSeasonList(remoteData.seasonList);
              }
              console.log("Google Sheets database synchronized on session load (Parallel)!");
            }
          }
        } catch (error) {
          console.error("Failed parallel initialization sync:", error);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    initData();
  }, []);

  // 로컬 영속 캐싱 리스너
  useEffect(() => { if (hydrated) saveJSON(STUDENTS_KEY, students); }, [students, hydrated]);
  useEffect(() => { if (hydrated) saveJSON(MATCHES_KEY, matches); }, [matches, hydrated]);
  useEffect(() => { if (hydrated) saveJSON(TITLE_KEY, title); }, [title, hydrated]);
  useEffect(() => { if (hydrated) saveJSON(LOCKED_KEY, isLocked); }, [isLocked, hydrated]);
  useEffect(() => { if (hydrated) saveJSON(SETTINGS_KEY, { thresholds: tierThresholds, rpVars: rpVariables }); }, [tierThresholds, rpVariables, hydrated]);
  useEffect(() => { if (hydrated) saveJSON(BONUSES_KEY, activeBonuses); }, [activeBonuses, hydrated]);

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
    if (playerAId === playerBId) return;
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

    // 복식/단식 참가 플레이어 목록 빌드
    const activePlayers = [
      { id: playerAId, role: "A" as const, isA: true },
      { id: playerA2Id, role: "A2" as const, isA: true },
      { id: playerBId, role: "B" as const, isA: false },
      { id: playerB2Id, role: "B2" as const, isA: false }
    ].filter((p) => p.id !== undefined && p.id !== "") as { id: string; role: "A" | "A2" | "B" | "B2"; isA: boolean }[];

    // 각 참가 학생별로 개별 RP 변동 및 보너스 계산
    const playerStats = activePlayers.map((p) => {
      const student = students.find((s) => s.id === p.id);
      if (!student) return null;

      const won = p.isA ? aWon : !aWon;
      const oppIds = p.isA 
        ? [playerBId, playerB2Id].filter(Boolean) as string[] 
        : [playerAId, playerA2Id].filter(Boolean) as string[];
      const opponents = students.filter((s) => oppIds.includes(s.id));

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

      const playerTier = getTier(student.rp, tierThresholds);
      const baseWin = playerTier !== "Diamond" 
        ? (tierSettings[playerTier as keyof TierSettings]?.winDelta ?? rpVariables.winDelta) 
        : rpVariables.winDelta;
      const baseLoss = playerTier !== "Diamond" 
        ? (tierSettings[playerTier as keyof TierSettings]?.loseDelta ?? rpVariables.loseDelta) 
        : rpVariables.loseDelta;

      if (won) {
        if (dynamicBonuses?.underdogEnabled && opponents.length > 0) {
          const playerTierRank = TIER_RANKING[playerTier] ?? 1;
          const maxOppRp = Math.max(...opponents.map((o) => o.rp));
          const maxOppTier = getTier(maxOppRp, tierThresholds);
          const maxOppTierRank = TIER_RANKING[maxOppTier] ?? 1;
          if (playerTierRank < maxOppTierRank) {
            underdogBonus = Math.max(0, Math.floor((maxOppRp - student.rp) * ((dynamicBonuses.underdogPercent ?? 10) / 100)));
          }
        }

        // 득점차 보너스는 폐지 (0점 처리)
        scoreDiffBonus = 0;

        if (dynamicBonuses?.rivalEnabled) {
          rivalBonus = opponents.some((o) => Math.abs(student.rp - o.rp) <= 20) ? (dynamicBonuses.rivalRp ?? 5) : 0;
        }

        if (dynamicBonuses?.firstWinEnabled) {
          firstWinBonus = student.lastWinDate !== todayYmd ? (dynamicBonuses.firstWinRp ?? 15) : 0;
        }

        if (dynamicBonuses?.revengeEnabled) {
          const hasPastLoss = matches.some((m) => {
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

        // A. 신선도 보너스 (Freshness)
        if (dynamicBonuses?.freshnessEnabled) {
          const lastNMatches = matches
            .filter((m) => m.playerAId === student.id || m.playerBId === student.id || m.playerA2Id === student.id || m.playerB2Id === student.id)
            .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
            .slice(0, dynamicBonuses.freshnessGames);
          
          const facedOpponent = lastNMatches.some((m) => {
            const mOppIds = ((m.playerAId === student.id || m.playerA2Id === student.id)
              ? [m.playerBId, m.playerB2Id].filter(Boolean)
              : [m.playerAId, m.playerA2Id].filter(Boolean)) as string[];
            return mOppIds.some((oppId) => oppIds.includes(oppId));
          });
          if (!facedOpponent) {
            freshnessBonus = dynamicBonuses.freshnessRp;
          }
        }

        // B. 연승 보너스 (Winning Streak)
        if (dynamicBonuses?.streakEnabled) {
          const preStreak = student.currentStreak ?? 0;
          if (preStreak + 1 >= dynamicBonuses.streakWins) {
            streakBonus = dynamicBonuses.streakRp;
          }
        }

        // C. 연패 컴백 보너스 (Comeback)
        if (dynamicBonuses?.comebackEnabled) {
          const sMatches = matches
            .filter((m) => m.playerAId === student.id || m.playerBId === student.id || m.playerA2Id === student.id || m.playerB2Id === student.id)
            .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
          
          let consecutiveLosses = 0;
          for (const m of sMatches) {
            const mIsA = m.playerAId === student.id || m.playerA2Id === student.id;
            const mAWon = m.scoreA > m.scoreB;
            const mWon = mIsA ? mAWon : !mAWon;
            if (!mWon) {
              consecutiveLosses++;
            } else {
              break;
            }
          }
          if (consecutiveLosses >= dynamicBonuses.comebackLosses) {
            comebackBonus = dynamicBonuses.comebackRp;
          }
        }

        // D. 압승 (단식/복식 통합 기준 적용) (Margin)
        if (dynamicBonuses?.marginEnabled) {
          const scoreDiff = Math.abs(scoreA - scoreB);
          if (scoreDiff >= dynamicBonuses.marginDiff) {
            marginBonus = dynamicBonuses.marginRp;
          }
        }

        // E. 멘토링 보너스 - 복식용 (Mentoring)
        if (matchType === "double") {
          const partnerId = p.role === "A" ? playerA2Id : p.role === "A2" ? playerAId : p.role === "B" ? playerB2Id : playerBId;
          if (partnerId) {
            const partner = students.find((s) => s.id === partnerId);
            if (partner) {
              const partnerTier = getTier(partner.rp, tierThresholds);
              const myTierRank = TIER_RANKING[playerTier] ?? 1;
              const partnerTierRank = TIER_RANKING[partnerTier] ?? 1;
              if (myTierRank > partnerTierRank) {
                mentoringBonus = 3; // +3 points mentoring bonus
              }
            }
          }
        }
      }

      const delta = won 
        ? (baseWin + underdogBonus + scoreDiffBonus + rivalBonus + firstWinBonus + revengeBonus + freshnessBonus + streakBonus + comebackBonus + marginBonus + mentoringBonus)
        : -baseLoss;

      return {
        id: student.id,
        role: p.role,
        isA: p.isA,
        won,
        delta,
        underdogBonus,
        scoreDiffBonus,
        rivalBonus,
        firstWinBonus,
        revengeBonus,
        freshnessBonus,
        streakBonus,
        comebackBonus,
        marginBonus,
        mentoringBonus
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
    }[];

    const statA = playerStats.find((p) => p.role === "A");
    const statB = playerStats.find((p) => p.role === "B");
    const statA2 = playerStats.find((p) => p.role === "A2");
    const statB2 = playerStats.find((p) => p.role === "B2");

    // 승리팀 중 실시간 승급 효과 감지 (복식 지원으로 여러 명 동시 승급 가능)
    const promotedPlayers = playerStats.filter((ps) => {
      if (!ps.won) return false;
      const s = students.find((st) => st.id === ps.id);
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
      const s = students.find((st) => st.id === ps.id);
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

    const match: Match = { 
      id: uid(), 
      playerAId, 
      playerBId, 
      playerA2Id,
      playerB2Id,
      scoreA, 
      scoreB, 
      date: new Date().toISOString(),
      matchType,
      rpDeltaA: statA?.delta,
      rpDeltaB: statB?.delta,
      rpDeltaA2: statA2?.delta,
      rpDeltaB2: statB2?.delta,
      underdogBonusA: statA?.underdogBonus,
      underdogBonusB: statB?.underdogBonus,
      underdogBonusA2: statA2?.underdogBonus,
      underdogBonusB2: statB2?.underdogBonus,
      scoreDiffBonusA: statA?.scoreDiffBonus,
      scoreDiffBonusB: statB?.scoreDiffBonus,
      scoreDiffBonusA2: statA2?.scoreDiffBonus,
      scoreDiffBonusB2: statB2?.scoreDiffBonus,
      rivalBonusA: statA?.rivalBonus,
      rivalBonusB: statB?.rivalBonus,
      rivalBonusA2: statA2?.rivalBonus,
      rivalBonusB2: statB2?.rivalBonus,
      firstWinBonusA: statA?.firstWinBonus,
      firstWinBonusB: statB?.firstWinBonus,
      firstWinBonusA2: statA2?.firstWinBonus,
      firstWinBonusB2: statB2?.firstWinBonus,
      revengeBonusA: statA?.revengeBonus,
      revengeBonusB: statB?.revengeBonus,
      revengeBonusA2: statA2?.revengeBonus,
      revengeBonusB2: statB2?.revengeBonus,
      freshnessBonusA: statA?.freshnessBonus,
      freshnessBonusB: statB?.freshnessBonus,
      freshnessBonusA2: statA2?.freshnessBonus,
      freshnessBonusB2: statB2?.freshnessBonus,
      streakBonusA: statA?.streakBonus,
      streakBonusB: statB?.streakBonus,
      streakBonusA2: statA2?.streakBonus,
      streakBonusB2: statB2?.streakBonus,
      comebackBonusA: statA?.comebackBonus,
      comebackBonusB: statB?.comebackBonus,
      comebackBonusA2: statA2?.comebackBonus,
      comebackBonusB2: statB2?.comebackBonus,
      marginBonusA: statA?.marginBonus,
      marginBonusB: statB?.marginBonus,
      marginBonusA2: statA2?.marginBonus,
      marginBonusB2: statB2?.marginBonus,
      mentoringBonusA: statA?.mentoringBonus,
      mentoringBonusB: statB?.mentoringBonus,
      mentoringBonusA2: statA2?.mentoringBonus,
      mentoringBonusB2: statB2?.mentoringBonus,
    };
    
    const nextMatches = [match, ...matches];

    const nextStudents = students.map((s) => {
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
          nextShields = 3; // 승급 시 방어막 3회 완충
        }
        nextRp = Math.max(0, nextRp);
      } else {
        const minThreshold = tierThresholds[preTier] ?? 0;
        if (nextRp < minThreshold && preTier !== "Bronze") {
          if (nextShields >= 1) {
            nextRp = minThreshold; // 강등 방어막 가동
            nextShields = nextShields - 1;
          } else {
            nextRp = Math.max(0, nextRp); // 방어막이 소진되어 강등
          }
        } else {
          nextRp = Math.max(0, nextRp);
        }
      }

      const preStreak = s.currentStreak ?? 0;
      const nextStreak = won 
        ? (preStreak >= 0 ? preStreak + 1 : 1)
        : (preStreak <= 0 ? preStreak - 1 : -1);

      return {
        ...s,
        rp: nextRp,
        wins: s.wins + (won ? 1 : 0),
        losses: s.losses + (won ? 0 : 1),
        recent: [(won ? "W" : "L") as "W" | "L", ...s.recent].slice(0, 5),
        demotionShields: nextShields,
        lastMatchDate: new Date().toISOString(),
        lastWinDate: won ? todayYmd : s.lastWinDate,
        currentStreak: nextStreak,
      };
    });

    setMatches(nextMatches);
    setStudents(nextStudents);

    const rpChanges: Record<string, number> = {};
    playerStats.forEach((p) => {
      rpChanges[p.id] = p.delta;
    });

    recordMatchToGoogleSheets(match, rpChanges, students, matches);

    return match;
  }, [students, matches, recordMatchToGoogleSheets, rpVariables, tierThresholds]);

  // 경기 삭제(롤백) 및 동기화
  const deleteMatch = useCallback(async (matchId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

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
    saveJSON(STUDENTS_KEY, nextStudents);
    saveJSON(MATCHES_KEY, nextMatches);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents, true);
  }, [students, matches, rpVariables, syncAllStudentsToGoogleSheets]);

  // 개별 학생 전적 리셋 및 동기화
  const resetStudent = useCallback(async (studentId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
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
    saveJSON(STUDENTS_KEY, nextStudents);
    saveJSON(MATCHES_KEY, nextMatches);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents);
  }, [students, matches, syncAllStudentsToGoogleSheets]);

  // 시즌 전체 초기화 및 동기화
  const resetAllData = useCallback(async () => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
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
    saveJSON(STUDENTS_KEY, nextStudents);
    saveJSON(MATCHES_KEY, nextMatches);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents);
  }, [students, matches, syncAllStudentsToGoogleSheets]);

  // 교사 관리자 수동 RP 수정 및 동기화
  const updateStudentRP = useCallback(async (studentId: string, nextRp: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    const nextStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        rp: Math.max(0, nextRp),
      };
    });

    const previousStudents = [...students];
    setStudents(nextStudents);
    saveJSON(STUDENTS_KEY, nextStudents);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents, true);
  }, [students, syncAllStudentsToGoogleSheets]);

  // 새로운 명렬표 대량 업서트 및 동기화
  const upsertStudents = useCallback(
    async (rows: { grade: number; classNum: number; number: number; name: string; gender?: Gender }[]) => {
      if (currentViewSeasonRef.current !== "현재 시즌") {
        toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
        return { added: 0, kept: 0 };
      }
      let added = 0, kept = 0;
      const byKey = new Map(students.map((s) => [studentKey(s), s]));
      const next: Student[] = [];
      const seenKeys = new Set<string>();
      for (const r of rows) {
        const k = studentKey(r);
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
            name: r.name,
            gender: r.gender ?? "U",
            rp: 1000,
            recent: [],
            wins: 0,
            losses: 0,
            demotionShields: 0,
          });
        }
      }
      for (const s of students) {
        const k = studentKey(s);
        if (!seenKeys.has(k)) next.push(s);
      }
      
      const previousStudents = [...students];
      setStudents(next);
      saveJSON(STUDENTS_KEY, next);

      await syncAllStudentsToGoogleSheets(next, previousStudents);

      return { added, kept };
    },
    [students, syncAllStudentsToGoogleSheets],
  );

  // 리그전 커스텀 설정 캘리브레이션 업데이트 함수
  const updateLeagueSettings = useCallback(async (thresholds: Record<TierName, number>, rpVars: { winDelta: number; loseDelta: number }) => {
    setTierThresholds(thresholds);
    setRpVariables(rpVars);

    // 즉시 반영
    // 이 코드는 시스템의 핵심인 점수 연산 로직이므로, 수정 즉시 SYNC_ALL을 통해 전체 학생 데이터를 최신 설정값 기반으로 재정렬할 수 있도록 해줘.
    const sortedStudents = [...students].sort((a, b) => b.rp - a.rp);
    setStudents(sortedStudents);
    saveJSON(STUDENTS_KEY, sortedStudents);

    await syncAllStudentsToGoogleSheets(sortedStudents, students, true);
  }, [students, syncAllStudentsToGoogleSheets]);

  // 특정 학생의 성별 변경 및 구글 시트 동기화
  const updateStudentGender = useCallback(async (studentId: string, gender: Gender) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    const nextStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      return { ...s, gender };
    });
    const previousStudents = [...students];
    setStudents(nextStudents);
    saveJSON(STUDENTS_KEY, nextStudents);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents, true);
  }, [students, syncAllStudentsToGoogleSheets]);

  // 개별 학생 삭제 및 연쇄 삭제 & 전적 복구 롤백
  const deleteStudent = useCallback(async (studentId: string) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
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
    saveJSON(STUDENTS_KEY, nextStudents);
    saveJSON(MATCHES_KEY, nextMatches);

    await syncAllStudentsToGoogleSheets(nextStudents, previousStudents, true);
  }, [students, matches, rpVariables, syncAllStudentsToGoogleSheets]);

  // CSV 롤백 복원 액션
  const restoreFromCSV = useCallback(async (restoredStudents: Student[], restoredMatches: Match[]) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    const previousStudents = [...students];
    const previousMatches = [...matches];
    setStudents(restoredStudents);
    setMatches(restoredMatches);
    saveJSON(STUDENTS_KEY, restoredStudents);
    saveJSON(MATCHES_KEY, restoredMatches);

    await syncAllStudentsToGoogleSheets(restoredStudents, previousStudents);
  }, [students, matches, syncAllStudentsToGoogleSheets]);

  // 교사 통제형 휴면 강등 일괄 RP 차감 액션
  const bulkDecayRP = useCallback(async (inactiveDays: number, decayAmount: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return 0;
    }
    let affectedCount = 0;
    const goldCutoff = tierThresholds.Gold ?? 1200;
    const now = new Date().getTime();
    const msThreshold = inactiveDays * 24 * 60 * 60 * 1000;

    const nextStudents = students.map((s) => {
      // Gold 등급 이상만 차감 대상
      if (s.rp < goldCutoff) return s;
      // 마지막 경기 전적이 존재하는 경우
      if (s.lastMatchDate) {
        const lastTime = new Date(s.lastMatchDate).getTime();
        const elapsed = now - lastTime;
        if (elapsed >= msThreshold) {
          affectedCount++;
          return {
            ...s,
            rp: Math.max(0, s.rp - decayAmount),
          };
        }
      }
      return s;
    });

    if (affectedCount > 0) {
      const previousStudents = [...students];
      setStudents(nextStudents);
      saveJSON(STUDENTS_KEY, nextStudents);
      await syncAllStudentsToGoogleSheets(nextStudents, previousStudents, true);
    }

    return affectedCount;
  }, [students, matches, tierThresholds, syncAllStudentsToGoogleSheets]);

  // 경기 점수 수정 및 보너스/RP 완벽 재계산 액션
  const updateMatchScore = useCallback(async (matchId: string, nextScoreA: number, nextScoreB: number) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 기록은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
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
      let scoreDiffBonus = 0;
      let rivalBonus = 0;
      let firstWinBonus = 0;
      let revengeBonus = 0;
      let marginBonus = 0;
      let mentoringBonus = 0;

      const playerTier = getTier(student.rp, tierThresholds);
      const baseWin = playerTier !== "Diamond" 
        ? (tierSettings[playerTier as keyof TierSettings]?.winDelta ?? rpVariables.winDelta) 
        : rpVariables.winDelta;
      const baseLoss = playerTier !== "Diamond" 
        ? (tierSettings[playerTier as keyof TierSettings]?.loseDelta ?? rpVariables.loseDelta) 
        : rpVariables.loseDelta;

      if (won) {
        if (dynamicBonuses?.underdogEnabled && opponents.length > 0) {
          const playerTierRank = TIER_RANKING[playerTier] ?? 1;
          const maxOppRp = Math.max(...opponents.map((o) => o.rp));
          const maxOppTier = getTier(maxOppRp, tierThresholds);
          const maxOppTierRank = TIER_RANKING[maxOppTier] ?? 1;
          if (playerTierRank < maxOppTierRank) {
            underdogBonus = Math.max(0, Math.floor((maxOppRp - student.rp) * ((dynamicBonuses.underdogPercent ?? 10) / 100)));
          }
        }

        // 득점차 보너스는 폐지 (0점 처리)
        scoreDiffBonus = 0;

        if (dynamicBonuses?.rivalEnabled) {
          rivalBonus = opponents.some((o) => Math.abs(student.rp - o.rp) <= 20) ? (dynamicBonuses.rivalRp ?? 5) : 0;
        }

        if (dynamicBonuses?.firstWinEnabled) {
          firstWinBonus = student.lastWinDate !== todayYmd ? (dynamicBonuses.firstWinRp ?? 15) : 0;
        }

        if (dynamicBonuses?.revengeEnabled) {
          const pastMatches = matches.filter((m) => m.id !== matchId);
          const hasPastLoss = pastMatches.some((m) => {
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

        // D. 압승 (단식/복식 통합 기준 적용) (Margin)
        if (dynamicBonuses?.marginEnabled) {
          const scoreDiff = Math.abs(nextScoreA - nextScoreB);
          if (scoreDiff >= dynamicBonuses.marginDiff) {
            marginBonus = dynamicBonuses.marginRp;
          }
        }

        // E. 멘토링 보너스 - 복식용 (Mentoring)
        if (match.matchType === "double") {
          const partnerId = p.role === "A" ? playerA2Id : p.role === "A2" ? playerAId : p.role === "B" ? playerB2Id : playerBId;
          if (partnerId) {
            const partner = rolledBackStudents.find((s) => s.id === partnerId);
            if (partner) {
              const partnerTier = getTier(partner.rp, tierThresholds);
              const myTierRank = TIER_RANKING[playerTier] ?? 1;
              const partnerTierRank = TIER_RANKING[partnerTier] ?? 1;
              if (myTierRank > partnerTierRank) {
                mentoringBonus = 3;
              }
            }
          }
        }
      }

      const delta = won 
        ? (baseWin + underdogBonus + scoreDiffBonus + rivalBonus + firstWinBonus + revengeBonus + marginBonus + mentoringBonus)
        : -baseLoss;

      return {
        id: student.id,
        role: p.role,
        isA: p.isA,
        won,
        delta,
        underdogBonus,
        scoreDiffBonus,
        rivalBonus,
        firstWinBonus,
        revengeBonus,
        marginBonus,
        mentoringBonus
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
      marginBonus: number;
      mentoringBonus: number;
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
      scoreDiffBonusA: statA?.scoreDiffBonus ?? 0,
      scoreDiffBonusB: statB?.scoreDiffBonus ?? 0,
      scoreDiffBonusA2: statA2?.scoreDiffBonus ?? 0,
      scoreDiffBonusB2: statB2?.scoreDiffBonus ?? 0,
      rivalBonusA: statA?.rivalBonus ?? 0,
      rivalBonusB: statB?.rivalBonus ?? 0,
      rivalBonusA2: statA2?.rivalBonus ?? 0,
      rivalBonusB2: statB2?.rivalBonus ?? 0,
      firstWinBonusA: statA?.firstWinBonus ?? 0,
      firstWinBonusB: statB?.firstWinBonus ?? 0,
      firstWinBonusA2: statA2?.firstWinBonus ?? 0,
      firstWinBonusB2: statB2?.firstWinBonus ?? 0,
      revengeBonusA: statA?.revengeBonus ?? 0,
      revengeBonusB: statB?.revengeBonus ?? 0,
      revengeBonusA2: statA2?.revengeBonus ?? 0,
      revengeBonusB2: statB2?.revengeBonus ?? 0,
      marginBonusA: statA?.marginBonus ?? 0,
      marginBonusB: statB?.marginBonus ?? 0,
      marginBonusA2: statA2?.marginBonus ?? 0,
      marginBonusB2: statB2?.marginBonus ?? 0,
      mentoringBonusA: statA?.mentoringBonus ?? 0,
      mentoringBonusB: statB?.mentoringBonus ?? 0,
      mentoringBonusA2: statA2?.mentoringBonus ?? 0,
      mentoringBonusB2: statB2?.mentoringBonus ?? 0,
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
    saveJSON(STUDENTS_KEY, nextStudentsList);
    saveJSON(MATCHES_KEY, nextMatchesList);

    await syncAllStudentsToGoogleSheets(nextStudentsList, previousStudents, true);
  }, [matches, students, tierThresholds, rpVariables, syncAllStudentsToGoogleSheets]);

  // 리그 커스텀 설정 통합 저장 (마스터 DB 동기화 포함)
  const saveLeagueSettings = useCallback(async (
    newTitle: string, 
    newBonuses: ActiveBonuses, 
    newOpMode?: "school" | "club",
    newTierSettings?: TierSettings,
    newDynamicBonuses?: DynamicBonuses
  ) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 설정은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    const targetOpMode = newOpMode !== undefined ? newOpMode : opMode;
    setTitle(newTitle);
    setActiveBonuses(newBonuses);
    setOpMode(targetOpMode);
    saveJSON(TITLE_KEY, newTitle);
    saveJSON(BONUSES_KEY, newBonuses);
    localStorage.setItem(OP_MODE_KEY, targetOpMode);

    let finalTierSettings = tierSettings;
    if (newTierSettings) {
      finalTierSettings = newTierSettings;
      setTierSettings(newTierSettings);
      saveJSON(TIER_SETTINGS_KEY, newTierSettings);
    }

    let finalDynamicBonuses = dynamicBonuses;
    if (newDynamicBonuses) {
      finalDynamicBonuses = newDynamicBonuses;
      setDynamicBonuses(newDynamicBonuses);
      saveJSON(NEW_BONUSES_KEY, newDynamicBonuses);
    }

    if (session) {
      const settingsPayload = {
        ...newBonuses,
        opMode: targetOpMode
      };
      const updatedSession = {
        ...session,
        leagueName: newTitle,
        settingsBonus: settingsPayload
      };
      setSession(updatedSession);
      saveJSON(SESSION_KEY, updatedSession);

      setIsSyncing(true);
      try {
        const res = await fetch(MASTER_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({
            action: "UPDATE_LEAGUE_SETTINGS",
            loginId: session.loginId,
            role: session.role,
            schoolName: session.schoolName,
            leagueName: newTitle,
            settingsBonus: JSON.stringify(settingsPayload)
          })
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (data && data.status === "error" && data.message && data.message.includes("혼잡")) {
          toast.error("다른 사용자가 설정을 수정 중입니다. 3초 후 다시 시도해주세요.", { id: "settings-lock-error" });
          return;
        }
        console.log("Updated league settings on Google Sheets:", data);
      } catch (err) {
        console.warn("Failed to sync settings to Google Sheets MASTER row. Kept locally.", err);
      }

      // 개별 테넌트/학교 시트 백엔드 동기화 (UPDATE_SETTINGS)
      if (session.scriptUrl) {
        try {
          await fetch(session.scriptUrl, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
              action: "UPDATE_SETTINGS",
              settings: {
                leagueName: newTitle,
                decayEnabled,
                decayDays,
                decayAmount,
                decayTiers,
                tierSettings: finalTierSettings,
                bonuses: finalDynamicBonuses
              }
            })
          });
          console.log("Updated individual school settings on individual sheet.");
        } catch (err) {
          console.warn("Failed to sync settings to individual scriptUrl:", err);
        }
      }
      setIsSyncing(false);
    }
  }, [session, opMode, decayEnabled, decayDays, decayAmount, decayTiers, tierSettings, dynamicBonuses]);

  // Decay settings save function
  const saveDecaySettings = useCallback(async (enabled: boolean, days: number, amount: number, tiers: TierName[]) => {
    if (currentViewSeasonRef.current !== "현재 시즌") {
      toast.error("과거 시즌 설정은 수정할 수 없습니다 (읽기 전용).");
      return;
    }
    setDecayEnabled(enabled);
    setDecayDays(days);
    setDecayAmount(amount);
    setDecayTiers(tiers);
    saveJSON(DECAY_ENABLED_KEY, enabled);
    saveJSON(DECAY_DAYS_KEY, days);
    saveJSON(DECAY_AMOUNT_KEY, amount);
    saveJSON(DECAY_TIERS_KEY, tiers);

    if (session && session.scriptUrl) {
      setIsSyncing(true);
      try {
        await fetch(session.scriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({
            action: "UPDATE_SETTINGS",
            settings: {
              leagueName: title,
              decayEnabled: enabled,
              decayDays: days,
              decayAmount: amount,
              decayTiers: tiers,
              lastDecayDate
            }
          })
        });
        console.log("Decay settings updated on individual sheet.");
      } catch (e) {
        console.error("Failed to sync decay settings to individual scriptUrl:", e);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [session, title, lastDecayDate]);

  // Client-side auto decay calculation & sync on mount (runs once per day)
  const checkAndApplyAutomaticDecay = useCallback(async () => {
    if (!decayEnabled) return;
    if (!session || !session.scriptUrl) return;
    if (currentViewSeasonRef.current !== "현재 시즌") return;

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
    const msThreshold = decayDays * 24 * 60 * 60 * 1000;

    const targetIds: string[] = [];
    students.forEach((s) => {
      const studentTier = getTier(s.rp, tierThresholds);
      if (!decayTiers.includes(studentTier)) return;

      if (s.lastMatchDate) {
        const lastTime = new Date(s.lastMatchDate).getTime();
        const elapsed = now - lastTime;
        if (elapsed >= msThreshold) {
          targetIds.push(s.id);
        }
      }
    });

    if (targetIds.length === 0) {
      // Cooldown prevention: save lastDecayDate even if no targets found
      setLastDecayDate(todayStr);
      saveJSON(LAST_DECAY_DATE_KEY, todayStr);
      try {
        await fetch(session.scriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({
            action: "UPDATE_SETTINGS",
            settings: {
              leagueName: title,
              decayEnabled,
              decayDays,
              decayAmount,
              decayTiers,
              lastDecayDate: todayStr
            }
          })
        });
      } catch (e) {
        console.warn("Failed to save lastDecayDate to backend:", e);
      }
      return;
    }

    try {
      const res = await fetch(session.scriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "APPLY_DECAY",
          targetIds,
          dropAmount: decayAmount,
          todayStr
        })
      });
      const data = await res.json();
      if (data.status === "success") {
        // Apply locally
        const nextStudents = students.map((s) => {
          if (targetIds.includes(s.id)) {
            return {
              ...s,
              rp: Math.max(0, s.rp - decayAmount)
            };
          }
          return s;
        });
        setStudents(nextStudents);
        saveJSON(STUDENTS_KEY, nextStudents);
        setLastDecayDate(todayStr);
        saveJSON(LAST_DECAY_DATE_KEY, todayStr);
        
        toast.success(`자동 휴면 차감 완료: 총 ${targetIds.length}명의 학생 RP가 각각 -${decayAmount}점 차감되었습니다.`, { duration: 5000 });
      }
    } catch (e) {
      console.error("Failed executing automatic RP decay backend call:", e);
    }
  }, [students, decayEnabled, decayDays, decayAmount, decayTiers, lastDecayDate, session, tierThresholds, title]);

  // 학교/클럽의 운영 모드 조회 헬퍼
  const getSchoolMode = useCallback(async (school: string): Promise<"school" | "club"> => {
    try {
      const teachers = await getTeachersList();
      const normalize = (name: string) => name.replace(/(초등학교|중학교|고등학교|초등|중등|고등|학교|초|클럽|동호회|회)$/, "").trim().toLowerCase();
      const target = normalize(school);
      const matched = teachers.find(
        (t: any) => 
          normalize(t.schoolName) === target || 
          normalize(t.loginId) === target
      );
      if (matched && matched.settingsBonus) {
        const parsed = typeof matched.settingsBonus === "string" ? JSON.parse(matched.settingsBonus) : matched.settingsBonus;
        if (parsed && parsed.opMode) return parsed.opMode;
      }
    } catch (e) {
      console.warn("Failed checking school mode:", e);
    }
    return "school";
  }, []);

  // 학생용 '나의 업적' 자동 연산 함수 (Derived State)
  const calculateAchievements = useCallback((studentId: string): Achievement[] => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return [];

    // 해당 학생이 참여한 모든 경기 필터링 (단식 및 복식 파트너 참여분 포함)
    const studentMatches = matches.filter(
      (m) => m.playerAId === studentId || m.playerBId === studentId || m.playerA2Id === studentId || m.playerB2Id === studentId
    );

    // 경기 기록 시간순 정렬 (과거에서 최신순)
    const chronologicalMatches = [...studentMatches].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const totalGames = studentMatches.length;
    const totalLosses = chronologicalMatches.filter((m) => {
      const isPlayerA = m.playerAId === studentId || m.playerA2Id === studentId;
      const aWon = m.scoreA > m.scoreB;
      const won = isPlayerA ? aWon : !aWon;
      return !won;
    }).length;

    // 연승, 연패, 스냅 연산
    let maxWinStreak = 0;
    let currentWinStreak = 0;
    let maxLossStreak = 0;
    let currentLossStreak = 0;
    let brokeLossStreakOf4Plus = false;

    chronologicalMatches.forEach((m) => {
      const isPlayerA = m.playerAId === studentId || m.playerA2Id === studentId;
      const aWon = m.scoreA > m.scoreB;
      const won = isPlayerA ? aWon : !aWon;

      if (won) {
        currentWinStreak++;
        if (currentLossStreak >= 4) {
          brokeLossStreakOf4Plus = true;
        }
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      }
    });

    // 자신보다 높은 티어와 대결한 횟수 (승패 무관)
    let higherTierCount = 0;
    chronologicalMatches.forEach((m) => {
      const isOnTeamA = m.playerAId === studentId || m.playerA2Id === studentId;
      const oppIds = isOnTeamA 
        ? [m.playerBId, m.playerB2Id].filter(Boolean) as string[] 
        : [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
      
      const hasHigherTierOpponent = oppIds.some((id) => {
        const opponent = students.find((s) => s.id === id);
        if (opponent) {
          const playerTier = getTier(student.rp, tierThresholds);
          const oppTier = getTier(opponent.rp, tierThresholds);
          const playerTierRank = TIER_RANKING[playerTier] ?? 1;
          const oppTierRank = TIER_RANKING[oppTier] ?? 1;
          return oppTierRank > playerTierRank;
        }
        return false;
      });
      
      if (hasHigherTierOpponent) {
        higherTierCount++;
      }
    });

    // 동일 날짜에 5경기 이상 참여 확인
    const dateCounts: Record<string, number> = {};
    studentMatches.forEach((m) => {
      const d = new Date(m.date);
      const dateStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
    });
    const maxMatchesOnSingleDay = Object.values(dateCounts).reduce((max, val) => Math.max(max, val), 0);

    // 복수전 성공 보너스 누적 횟수
    const revengeCount = studentMatches.filter((m) => {
      const isPlayerA = m.playerAId === studentId;
      return isPlayerA ? (m.revengeBonusA ?? 0) > 0 : (m.revengeBonusB ?? 0) > 0;
    }).length;

    // 라이벌 격퇴 보너스 누적 횟수
    const rivalCount = studentMatches.filter((m) => {
      const isPlayerA = m.playerAId === studentId;
      return isPlayerA ? (m.rivalBonusA ?? 0) > 0 : (m.rivalBonusB ?? 0) > 0;
    }).length;

    return [
      // Common (커먼)
      {
        id: "court_first_greeting",
        name: "코트의 첫인사",
        description: "리그 첫 경기 기록 완료",
        tier: "Common",
        currentValue: totalGames >= 1 ? 1 : 0,
        targetValue: 1,
        isUnlocked: totalGames >= 1
      },
      {
        id: "warmup_complete",
        name: "워밍업 완료",
        description: "누적 경기 수 10회 달성",
        tier: "Common",
        currentValue: totalGames,
        targetValue: 10,
        isUnlocked: totalGames >= 10
      },
      {
        id: "taste_of_victory",
        name: "승리의 맛",
        description: "3연승 달성",
        tier: "Common",
        currentValue: maxWinStreak,
        targetValue: 3,
        isUnlocked: maxWinStreak >= 3
      },
      {
        id: "unbroken_heart",
        name: "꺾이지 않는 마음",
        description: "3연패 기록 (실패를 부끄러워하지 않는 태도 칭찬)",
        tier: "Common",
        currentValue: maxLossStreak,
        targetValue: 3,
        isUnlocked: maxLossStreak >= 3
      },
      // Rare (레어)
      {
        id: "iron_stamina",
        name: "강철 체력",
        description: "누적 경기 수 30회 달성",
        tier: "Rare",
        currentValue: totalGames,
        targetValue: 30,
        isUnlocked: totalGames >= 30
      },
      {
        id: "courageous_challenger",
        name: "용기 있는 도전자",
        description: "자신보다 티어가 높은 상대와 10회 대결 진행 (승패 무관)",
        tier: "Rare",
        currentValue: higherTierCount,
        targetValue: 10,
        isUnlocked: higherTierCount >= 10
      },
      {
        id: "gym_spirit",
        name: "체육관 지박령",
        description: "동일한 날짜에 5경기 이상 참여",
        tier: "Rare",
        currentValue: maxMatchesOnSingleDay,
        targetValue: 5,
        isUnlocked: maxMatchesOnSingleDay >= 5
      },
      {
        id: "unyielding_will",
        name: "불굴의 의지",
        description: "4연패 이상 기록 후 승리하여 연패 사슬 끊어내기",
        tier: "Rare",
        currentValue: brokeLossStreakOf4Plus ? 1 : 0,
        targetValue: 1,
        isUnlocked: brokeLossStreakOf4Plus
      },
      {
        id: "avatar_of_revenge",
        name: "복수의 화신",
        description: "복수전 성공 3회 누적 획득",
        tier: "Rare",
        currentValue: revengeCount,
        targetValue: 3,
        isUnlocked: revengeCount >= 3
      },
      // Epic (에픽)
      {
        id: "court_ruler",
        name: "코트의 지배자",
        description: "누적 경기 수 70회 달성",
        tier: "Epic",
        currentValue: totalGames,
        targetValue: 70,
        isUnlocked: totalGames >= 70
      },
      {
        id: "honorable_sweat",
        name: "명예로운 땀방울",
        description: "누적 패배 수 30회 달성 (실패에 굴하지 않는 스포츠맨십 칭찬)",
        tier: "Epic",
        currentValue: totalLosses,
        targetValue: 30,
        isUnlocked: totalLosses >= 30
      },
      {
        id: "rival_destroyer",
        name: "라이벌 파괴자",
        description: "라이벌 격파 15회 누적 획득",
        tier: "Epic",
        currentValue: rivalCount,
        targetValue: 15,
        isUnlocked: rivalCount >= 15
      },
      // Legendary (레전더리)
      {
        id: "legendary_undefeated",
        name: "무패의 전설",
        description: "10연승 달성",
        tier: "Legendary",
        currentValue: maxWinStreak,
        targetValue: 10,
        isUnlocked: maxWinStreak >= 10
      },
      {
        id: "true_champion",
        name: "진정한 챔피언",
        description: "누적 경기 수 120회 달성 (한 학기 동안 가장 성실하게 참여한 학생)",
        tier: "Legendary",
        currentValue: totalGames,
        targetValue: 120,
        isUnlocked: totalGames >= 120
      }
    ];
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
    if (!session || !session.scriptUrl) {
      toast.error("로그인 세션이 없거나 연동된 시트 주소가 없습니다.");
      return { success: false, message: "No scriptUrl" };
    }
    setIsSyncing(true);
    try {
      const res = await fetch(session.scriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "CHANGE_SEASON",
          seasonName
        })
      });

      if (res.status === 429 || res.status === 500 || res.status === 503) {
        throw new Error(`STATUS_${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (data && data.status === "success") {
        return { success: true };
      } else {
        return { success: false, message: (data && data.message) || "시즌 변경 실패" };
      }
    } catch (error: any) {
      console.error("CHANGE_SEASON request failed:", error);
      return { success: false, message: error.message || "Network Error" };
    } finally {
      setIsSyncing(false);
    }
  }, [session]);

  // 6. 과거 시즌 데이터 Fetch 액션 메소드
  const changeViewSeason = useCallback(async (seasonName: string) => {
    setCurrentViewSeason(seasonName);
    if (!session || !session.scriptUrl) return;
    setIsSyncing(true);
    try {
      const url = seasonName === "현재 시즌"
        ? session.scriptUrl
        : `${session.scriptUrl}${session.scriptUrl.includes("?") ? "&" : "?"}seasonName=${encodeURIComponent(seasonName)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "success") {
        if (data.students) {
          const mappedStudents = data.students.map((s: any) => ({
            ...s,
            grade: s.grade ? Number(s.grade) : 0,
            classNum: s.classNum ? Number(s.classNum) : 0,
            number: s.number ? Number(s.number) : 0
          }));
          setStudents(mappedStudents);
          saveJSON(STUDENTS_KEY, mappedStudents);
        }
        if (data.matches) {
          setMatches(data.matches);
          saveJSON(MATCHES_KEY, data.matches);
        }
        if (data.leagueName) {
          setTitle(data.leagueName);
          saveJSON(TITLE_KEY, data.leagueName);
        }
        if (data.settingsBonus) {
          try {
            const parsed = typeof data.settingsBonus === "string" 
              ? JSON.parse(data.settingsBonus) 
              : data.settingsBonus;
            setActiveBonuses(parsed);
            if (parsed && parsed.opMode) {
              setOpMode(parsed.opMode);
              localStorage.setItem(OP_MODE_KEY, parsed.opMode);
            }
            saveJSON(BONUSES_KEY, parsed);
          } catch (e) {
            console.error("Failed parsing settingsBonus from remote GET:", e);
          }
        }
        if (data.seasonList) {
          setSeasonList(data.seasonList);
        }
        console.log(`Successfully loaded historical season data: ${seasonName}`);
      } else {
        toast.error("데이터 로드에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to load season data:", error);
      toast.error("시즌 데이터를 불러오는데 실패했습니다.");
    } finally {
      setIsSyncing(false);
    }
  }, [session]);

  return { 
    hydrated, 
    students, 
    matches, 
    title, 
    setTitle, 
    recordMatch, 
    upsertStudents, 
    isLocked, 
    setIsLocked, 
    deleteMatch, 
    resetStudent, 
    resetAllData, 
    updateStudentRP,
    isSyncing,
    session,
    loginUser,
    registerUser,
    logoutUser,
    recoverPassword,
    MASTER_API_URL,
    tierThresholds,
    rpVariables,
    updateLeagueSettings,
    updateStudentGender,
    deleteStudent,
    restoreFromCSV,
    bulkDecayRP,
    teacherAccessCode,
    updateMatchScore,
    activeBonuses,
    saveLeagueSettings,
    calculateAchievements,
    promotionEvent,
    setPromotionEvent,
    opMode,
    setOpMode,
    getSchoolMode,
    seasonList,
    changeSeason,
    currentViewSeason,
    changeViewSeason,
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
    saveDecaySettings,
    checkAndApplyAutomaticDecay,
    tierSettings,
    setTierSettings,
    dynamicBonuses,
    setDynamicBonuses
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
