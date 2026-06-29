import { useMemo, useState, useRef } from "react";
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
  UserPlus,
  ChevronDown,
  Moon,
  Megaphone
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
import { LevelManager } from "./admin/LevelManager";
import { AdminMatchRecords } from "./admin/AdminMatchRecords";
import { SeasonManagePanel } from "./admin/SeasonManagePanel";
import { CurrentSeasonPanel } from "./admin/CurrentSeasonPanel";
import { DecayManager } from "./admin/DecayManager";
import { MatchScheduler } from "./admin/MatchScheduler";

type Row = { grade: number; classNum: number; number: number; name: string; gender?: Gender };

// 관리자 패널의 하위 탭 목록 — PC 사이드바와 모바일 드롭다운이 공유한다.
const ADMIN_MENU_ITEMS = [
  { id: "settings", label: "리그 글로벌 설정", icon: Settings, desc: "리그 이름, 티어, RP 규칙 설정" },
  { id: "studentManage", label: "회원 관리", icon: User, desc: "회원 명단, RP·나이 수정 및 삭제" },
  { id: "matchRecords", label: "리그 기록 관리", icon: Swords, desc: "전체 경기 조회, 점수 수정/삭제" },
  { id: "scheduler", label: "대진 호출", icon: Megaphone, desc: "대진 배정·입장 호출(실시간 알림)" },
  { id: "decay", label: "휴면 감점", icon: Moon, desc: "티어별 감점 설정·실시·내역" },
  { id: "dataManage", label: "데이터 관리", icon: Database, desc: "JSON 백업 다운로드 및 복원" },
  { id: "seasonManage", label: "시즌 관리", icon: Calendar, desc: "시즌 초기화 및 신규 시즌 생성" },
] as const;

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
  isOwner = false,
  students,
  matches,
  onUpsert,
  count,
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
  onUpdateMatchScore,
  title,
  activeBonuses,
  onSaveLeagueSettings,
}: {
  isOwner?: boolean;
  students: Student[];
  matches: Match[];
  onUpsert: (rows: Row[]) => Promise<{ added: number; kept: number }>;
  count: number;
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
}) {
  // Active Tab for dashboard split layout
  // 소유자(개설자) 전용 탭 — 관리 관리자(공동관리자/기록원)에게는 숨김
  const OWNER_ONLY_TABS = new Set(["settings", "decay", "dataManage", "seasonManage"]);
  const menuItems = ADMIN_MENU_ITEMS.filter((i) => isOwner || !OWNER_ONLY_TABS.has(i.id));
  const [activeTab, setActiveTab] = useState<string>(isOwner ? "settings" : "studentManage");

  // JSON Rollback/Restore states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<Student[] | null>(null);
  const [pendingRestoreMatches, setPendingRestoreMatches] = useState<Match[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    matchInputMode,
    saveMatchInputMode,
    tierSettings,
    dynamicBonuses,
    dynamicPenalties,
  } = useLeagueStore();
  // 휴면 감점은 '휴면 감점' 탭에서 관리자가 수동 실시한다(자동 차감 없음).

  // 시즌 관리 서브탭 (현재 / 과거)
  const [seasonSubTab, setSeasonSubTab] = useState<"current" | "past">("current");

  // Bulk upload states
  const [text, setText] = useState("");
  const parsed = useMemo(() => parsePaste(text), [text]);

  const commit = async () => {
    if (parsed.rows.length === 0) return toast.error("등록할 선수이 없습니다");
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
        name: s.name,
        group: s.group ?? null,
        nickname: s.nickname ?? null,
        gender: s.gender,
        rp: s.rp,
        recent: s.recent,
        wins: s.wins,
        losses: s.losses,
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
          return toast.error("JSON 파일에 유효한 선수(students) 데이터 배열이 없습니다.");
        }

        const parsedStudents: Student[] = data.students.map((s: any) => ({
          id: s.id || Math.random().toString(36).slice(2, 10),
          grade: Number(s.grade),
          classNum: Number(s.classNum),
          number: Number(s.number),
          name: String(s.name),
          realName: s.realName !== undefined && s.realName !== null ? String(s.realName) : undefined,
          nickname: s.nickname !== undefined && s.nickname !== null ? String(s.nickname) : null,
          gender: (s.gender === "M" || s.gender === "F") ? s.gender : "U",
          rp: Number(s.rp),
          recent: Array.isArray(s.recent) ? s.recent : [],
          wins: Number(s.wins),
          losses: Number(s.losses),
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
          return toast.error("파싱 가능한 유효한 선수 데이터가 없습니다.");
        }

        // 검증: 선수 id는 유효한 UUID여야 하고 RP는 숫자여야 한다 (안전한 복원 사전 점검)
        const isUuid = (v: any) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        const badStudent = parsedStudents.find((s) => !isUuid(s.id) || Number.isNaN(s.rp));
        if (badStudent) {
          return toast.error("백업 파일이 손상되었거나 이 앱의 형식이 아닙니다 (선수 ID/RP 오류). 복원을 중단합니다.");
        }
        const badMatch = parsedMatches.find((m) => !isUuid(m.id) || !isUuid(m.playerAId) || !isUuid(m.playerBId));
        if (badMatch) {
          return toast.error("백업 파일의 경기 데이터가 손상되었습니다 (ID 오류). 복원을 중단합니다.");
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
    <div className="flex flex-col lg:flex-row gap-6 min-h-[600px] w-full text-foreground">
      {/* 폰·태블릿 세로: 상단 고정 드롭다운 (스크롤해도 항상 위에 떠있음) */}
      <div className="lg:hidden sticky top-0 z-30 -mx-1 px-1 pt-1">
        <div className="bg-card/95 border border-border/40 rounded-2xl p-3 backdrop-blur-md shadow-lg">
          <label htmlFor="admin-tab-select" className="text-[10px] font-black text-neon-blue tracking-tight block mb-1.5 px-0.5">
            관리자 패널
          </label>
          <div className="relative">
            <select
              id="admin-tab-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full h-11 pl-3 pr-9 rounded-xl bg-neon-blue/10 border border-neon-blue/30 text-sm font-bold text-neon-blue appearance-none focus:outline-none focus:ring-2 focus:ring-neon-blue/40"
            >
              {menuItems.map((item) => (
                <option key={item.id} value={item.id} className="bg-card text-foreground font-bold">
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown className="size-4 text-neon-blue absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Left Sidebar Menu (데스크톱·태블릿 가로 전용) */}
      <div className="hidden lg:flex w-full lg:w-64 shrink-0 flex-col gap-2 bg-card/45 border border-border/40 rounded-2xl p-4 backdrop-blur shadow-lg self-start sticky top-4">
        <div className="px-3 py-2">
          <h2 className="text-lg font-black text-neon-blue tracking-tight">관리자 패널</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">리그 글로벌 설정 및 선수 데이터를 통제합니다.</p>
        </div>
        <div className="h-px bg-border/20 my-2" />

        {/* Menu Buttons */}
        <div className="flex flex-col gap-1">
          {menuItems.map((item) => {
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
                    ? "bg-neon-blue/15 text-neon-blue font-black border border-neon-blue/30 glow-primary"
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
        {activeTab === "settings" && isOwner && (
          <AdminSettings
            thresholds={thresholds}
            rpVariables={rpVariables}
            onUpdateSettings={onUpdateSettings}
            title={title}
            activeBonuses={activeBonuses}
            onSaveLeagueSettings={onSaveLeagueSettings}
            matchInputMode={matchInputMode}
            saveMatchInputMode={saveMatchInputMode}
            isOwner={isOwner}
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
        {activeTab === "studentManage" && isOwner && (
          <div className="mt-6"><LevelManager /></div>
        )}

        {/* scheduler Tab — 대진 호출(관리자 접근) */}
        {activeTab === "scheduler" && (
          <MatchScheduler />
        )}

        {/* decay Tab — 휴면 감점 설정·실시·내역 */}
        {activeTab === "decay" && isOwner && (
          <DecayManager />
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
        {activeTab === "dataManage" && isOwner && (
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
                  관리자가 이전에 백업해 둔 JSON 파일을 업로드하면, 해당 파일을 기반으로 전체 선수 명단과 RP, 전적 및 매치 로그 데이터를 완벽하게 해당 시점의 데이터로 롤백 복원합니다.
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


        {/* seasonManage Tab — 현재 시즌 / 과거 시즌 서브탭 */}
        {activeTab === "seasonManage" && isOwner && (
          <div className="space-y-5">
            <div className="flex gap-1.5 p-1 bg-muted/40 border border-border/20 rounded-xl w-full sm:w-max">
              {([["current", "현재 시즌"], ["past", "과거 시즌"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSeasonSubTab(key)}
                  className={cn(
                    "px-4 py-2 text-xs font-black rounded-lg transition-all active:scale-95",
                    seasonSubTab === key
                      ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35"
                      : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {seasonSubTab === "current" ? <CurrentSeasonPanel /> : <SeasonManagePanel />}
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
                현재 데이터를 업로드한 백업으로 교체합니다. <b className="text-foreground">진행 직전 현재 데이터가 자동으로 한 번 더 백업 다운로드</b>되며, 복원은 서버에서 한 번에 처리되어 <b className="text-foreground">중간에 실패하면 원본이 그대로 유지</b>됩니다. 진행하시겠습니까?
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
                    // 안전장치: 복원 직전 현재 데이터를 자동으로 백업 다운로드
                    try { downloadJSON(); } catch (e) { console.warn("auto-backup before restore failed", e); }
                    onRestoreFromCSV?.(pendingRestoreData, pendingRestoreMatches || []);
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
