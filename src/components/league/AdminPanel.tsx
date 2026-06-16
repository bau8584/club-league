import { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  AlertCircle, 
  Database, 
  RotateCcw, 
  Download, 
  User, 
  ShieldAlert,
  Swords,
  Calendar,
  Users,
  Settings,
  UserPlus
} from "lucide-react";
import type { Gender, Student, Match, TierName, TierSettings, DynamicBonuses, DynamicPenalties } from "@/lib/league-types";
import { useLeagueStore, type ActiveBonuses } from "@/lib/league-store";
import { GenderMark } from "./GenderMark";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Sub-components
import { AdminSettings } from "./admin/AdminSettings";
import { AdminStudentManage } from "./admin/AdminStudentManage";
import { AdminMatchRecords } from "./admin/AdminMatchRecords";

type Row = { grade: number; classNum: number; number: number; name: string; gender?: Gender };

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
    tierSettings?: TierSettings,
    dynamicBonuses?: DynamicBonuses,
    dynamicPenalties?: DynamicPenalties
  ) => Promise<void>;
  seasonList?: string[];
  onChangeSeason?: (seasonName: string) => Promise<{ success: boolean; message?: string }>;
}) {
  // Active Tab for dashboard split layout
  const [activeTab, setActiveTab] = useState<string>("settings");

  // JSON Rollback/Restore states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<Student[] | null>(null);
  const [pendingRestoreMatches, setPendingRestoreMatches] = useState<Match[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto Decay lock logic
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
  } = useLeagueStore();
  const isDemo = session?.loginId === "guest" || session?.schoolName?.includes("꿈나무");

  // Run auto decay check once on mount/unlock
  const hasEntered = isUnlocked || isDemo;
  useEffect(() => {
    if (hasEntered) {
      checkAndApplyAutomaticDecay();
    }
  }, [hasEntered, checkAndApplyAutomaticDecay]);

  useEffect(() => {
    setIsUnlocked(false);
    return () => {
      setIsUnlocked(false);
    };
  }, []);

  // Season change states
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

  // Bulk upload states
  const [text, setText] = useState("");
  const parsed = useMemo(() => parsePaste(text), [text]);

  const commit = async () => {
    if (parsed.rows.length === 0) return toast.error("등록할 학생이 없습니다");
    const { added, kept } = await onUpsert(parsed.rows);
    setText("");
    toast.success(`신규 ${added}명 등록, 기존 ${kept}명 전적 유지`);
  };

  // JSON backup download
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

  // JSON backup restore upload
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
        
        {/* settings Tab */}
        {activeTab === "settings" && (
          <AdminSettings
            isLocked={isLocked}
            onToggleLock={onToggleLock}
            thresholds={thresholds}
            rpVariables={rpVariables}
            onUpdateSettings={onUpdateSettings}
            title={title}
            activeBonuses={activeBonuses}
            onSaveLeagueSettings={onSaveLeagueSettings}
            decayEnabled={decayEnabled}
            decayDays={decayDays}
            decayAmount={storeDecayAmount}
            decayTiers={decayTiers}
            saveDecaySettings={saveDecaySettings}
            tierSettings={tierSettings}
            dynamicBonuses={dynamicBonuses}
            dynamicPenalties={dynamicPenalties}
          />
        )}

        {/* studentManage Tab */}
        {activeTab === "studentManage" && (
          <AdminStudentManage
            students={students}
            matches={matches}
            onUpdateRP={onUpdateRP}
            onResetStudent={onResetStudent}
            onDeleteStudent={onDeleteStudent}
            onUpdateGender={onUpdateGender}
            onUpdateStudentInfo={onUpdateStudentInfo}
            thresholds={thresholds}
          />
        )}

        {/* matchRecords Tab */}
        {activeTab === "matchRecords" && (
          <AdminMatchRecords
            students={students}
            matches={matches}
            onDeleteMatch={onDeleteMatch}
            onUpdateMatchScore={onUpdateMatchScore}
          />
        )}

        {/* dataManage Tab */}
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

        {/* studentRegister Tab */}
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

        {/* seasonManage Tab */}
        {activeTab === "seasonManage" && (
          <Card className="border border-destructive/40 bg-destructive/5 p-5 backdrop-blur shadow-lg space-y-6">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              <h3 className="font-black text-base">위험 구역 (Danger Zone)</h3>
            </div>
            
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

        {/* Season Change Dialog */}
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

        {/* JSON Restore Confirmation Dialog */}
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
