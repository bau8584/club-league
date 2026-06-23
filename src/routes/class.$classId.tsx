import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { toast } from "sonner";
import { Leaderboard } from "@/features/leaderboard/Leaderboard";
import { RecordMatch } from "@/components/league/RecordMatch";
import { AdminPanel } from "@/components/league/AdminPanel";
import { MatchRecommend } from "@/components/league/MatchRecommend";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { MyRecord } from "@/components/league/MyRecord";
import { SeasonSummary } from "@/components/league/SeasonSummary";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Crown, Swords, Trophy, Users, Pencil, Target, LogOut, School, ShieldAlert, Award, BarChart3, ArrowLeft, Lock } from "lucide-react";
import { MyAchievements } from "@/components/league/MyAchievements";

export const Route = createFileRoute("/class/$classId")({
  head: () => ({
    meta: [
      { title: "스포츠 리그 · 티어 시스템" },
      { name: "description", content: "스포츠 리그 & 티어 랭킹 시스템." },
    ],
  }),
  component: Index,
});

type Tab = "leaderboard" | "recommend" | "record" | "memberRecord" | "admin" | "myRecord" | "myAchievements" | "seasonSummary";

function Index() {
  const { classId } = Route.useParams();
  const {
    hydrated,
    students,
    matches,
    title,
    setTitle,
    loadClassData,
    recordMatch,
    upsertStudents,
    deleteMatch,
    resetStudent,
    resetAllData,
    updateStudentRP,
    isSyncing,
    isClassOwner,
    isClassManager,
    isClassMember,
    myPlayerId,
    claimPlayer,
    createMyPlayer,
    levelMode,
    levels,
    matchInputMode,
    session,
    logoutUser,
    tierThresholds,
    rpVariables,
    decaySettings,
    decayAppliedDates,
    updateLeagueSettings,
    updateStudentGender,
    deleteStudent,
    updateStudentInfo,
    restoreFromCSV,
    bulkDecayRP,
    updateMatchScore,
    activeBonuses,
    saveLeagueSettings,
    promotionEvent,
    setPromotionEvent,
    seasonList,
    currentSeason,
    currentViewSeason,
    changeViewSeason,
  } = useLeagueStore();

  useEffect(() => {
    if (classId) {
      loadClassData(classId);
    }
  }, [classId, loadClassData]);

  const [tab, setTab] = useState<Tab>("leaderboard");
  // 일반회원(가입했지만 관리자 아님)인데 아직 내 선수 미연동 → 프로필 설정 온보딩
  const needsOnboarding = isClassMember && !isClassManager && !myPlayerId;
  const [editingTitle, setEditingTitle] = useState(false);
  const [recommendInitials, setRecommendInitials] = useState<{
    playerAId: string;
    playerBId: string;
    playerA2Id?: string;
    playerB2Id?: string;
    matchType?: "single" | "double";
  } | null>(null);

  // Persistent Match Recommendation States (Elevated for Session Preservation)
  const [recommendSel, setRecommendSel] = useState<{ grade: number | null; classNum: number | null; studentId: string | null }>({ grade: null, classNum: null, studentId: null });
  const [recommendMode, setRecommendMode] = useState<"class" | "otherClass" | "otherGrade">("class");
  const [recommendTargetGrade, setRecommendTargetGrade] = useState<number | null>(null);
  const [recommendTargetClass, setRecommendTargetClass] = useState<number | null>(null);

  // Role-based default tab redirect on session login
  useEffect(() => {
    if (session) {
      if (session.role === "STUDENT") {
        setTab("myRecord"); // 선수의 경우 첫 탭인 나의 기록으로 진입
      } else {
        setTab("record"); // 관리자의 경우 첫 탭인 경기 기록 입력으로 진입
      }
    }
  }, [session]);

  // 과거 시즌 조회 시 쓰기/설정 탭에서 조회 전용 탭(시즌 요약)으로 강제 이동
  useEffect(() => {
    if (currentViewSeason !== "현재 시즌") {
      if (tab === "record" || tab === "admin" || tab === "recommend") {
        setTab("seasonSummary");
      }
    }
  }, [currentViewSeason, tab]);

  // 일반회원이 본인 경기를 기록할 수 있는지 (자율/완전자율 모드 + 현재 시즌)
  const memberCanRecord = matchInputMode !== "admin-only" && currentViewSeason === "현재 시즌";

  // 선수 탭 접근 통제 보안 가드 (myRecord, recommend, myAchievements + 허용 시 memberRecord)
  useEffect(() => {
    if (session && session.role === "STUDENT") {
      const allowed = ["recommend", "myRecord", "myAchievements", ...(memberCanRecord ? ["memberRecord"] : [])];
      if (!allowed.includes(tab)) {
        setTab("myRecord");
      }
    }
  }, [session, tab, memberCanRecord]);

  // 관리 권한이 없는 사용자가 관리자 탭 접근 시 차단
  useEffect(() => {
    if (session && session.role === "TEACHER" && !isClassManager && tab === "admin") {
      toast.error("해당 메뉴에 접근할 권한이 없습니다.");
      setTab("record");
    }
  }, [session, isClassManager, tab]);

  // 선수 로그인 시 AI 매치메이킹 타겟(recommendSel)을 본인 정보로 즉시 고정
  useEffect(() => {
    if (session && session.role === "STUDENT" && session.studentId) {
      const student = students.find((s) => s.id === session.studentId);
      if (student) {
        setRecommendSel({
          grade: null,
          classNum: null,
          studentId: student.id
        });
      }
    }
  }, [session, students]);

  // Prevent closing the page during synchronization
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSyncing) {
        e.preventDefault();
        e.returnValue = "선수 데이터 동기화 중입니다. 페이지를 종료하시겠습니까?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSyncing]);

  const handleSelectRecommendedMatch = (
    playerAId: string, 
    playerBId: string,
    playerA2Id?: string,
    playerB2Id?: string,
    matchType?: "single" | "double"
  ) => {
    setRecommendInitials({ playerAId, playerBId, playerA2Id, playerB2Id, matchType });
    // 일반회원은 본인 경기 기록 탭으로, 관리자는 기록 입력 탭으로
    setTab(session?.role === "STUDENT" ? "memberRecord" : "record");
  };

  if (!hydrated || !session) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen animate-in fade-in duration-300">
      <Toaster theme="dark" position="top-center" richColors />

      {/* Header */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            
            {/* Logo and Editable Title */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-blue to-tier-diamond shadow-[0_0_18px_oklch(0.78_0.18_230/0.5)]">
                <Crown className="size-5 text-primary-foreground" />
              </div>
              <div>
                {editingTitle && session.role !== "STUDENT" && isClassOwner ? (
                  <Input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
                    className="h-8 border-neon-blue/60 bg-background/60 text-lg font-bold"
                  />
                ) : (
                  <button 
                    onClick={() => session.role !== "STUDENT" && isClassOwner && setEditingTitle(true)} 
                    disabled={session.role === "STUDENT" || !isClassOwner}
                    className={cn(
                      "flex items-center gap-2 text-lg font-bold tracking-tight hover:text-neon-blue sm:text-xl",
                      (session.role === "STUDENT" || !isClassOwner) && "cursor-default hover:text-foreground"
                    )}
                  >
                    {title}
                    {session.role !== "STUDENT" && isClassOwner && <Pencil className="size-3.5 text-muted-foreground" />}
                  </button>
                )}
              </div>
            </div>

            {/* Role Session Badge and Sync status */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Real-time Google Sheets Sync Badge */}
              {isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full border border-neon-blue/40 bg-neon-blue/5 px-3 py-1.5 text-xs text-neon-blue animate-pulse">
                  <span className="size-1.5 rounded-full bg-neon-blue animate-ping" />
                  <span className="font-bold text-[10px] tracking-wider">🔄 구글 시트 동기화 중...</span>
                </div>
              )}

              {/* Dynamic User Identity Session Badge */}
              <div className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-md",
                session.role === "TEACHER"
                  ? "border-neon-green/40 bg-neon-green/5 text-neon-green"
                  : "border-purple-500/40 bg-purple-500/5 text-purple-400"
              )}>
                {session.role === "TEACHER" ? (
                  <span>{session.schoolName} · {isClassOwner ? "최고 관리자" : "관리자"}</span>
                ) : (
                  <>
                    <Users className="size-3.5" />
                    <span>🏆 {session.schoolName} · 회원</span>
                  </>
                )}
              </div>

              {/* Season Selection Dropdown */}
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-xs">
                <span className="font-bold text-muted-foreground mr-1">시즌:</span>
                <select
                  value={currentViewSeason}
                  onChange={(e) => changeViewSeason(e.target.value)}
                  className="bg-transparent text-foreground font-bold focus:outline-none cursor-pointer pr-1"
                >
                  <option value="현재 시즌" className="bg-background text-foreground font-bold">{currentSeason} (현재)</option>
                  {seasonList && seasonList.map((season) => (
                    <option key={season} value={season} className="bg-background text-foreground font-bold">
                      {season}
                    </option>
                  ))}
                </select>
              </div>

              {/* Registered student count */}
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-1.5 text-xs">
                <Users className="size-3.5 text-neon-green" />
                <span className="font-mono text-muted-foreground">등록 선수</span>
                <span className="font-bold text-neon-green">{students.length}</span>
              </div>

              {/* 리그 로비로 돌아가기 */}
              <button
                onClick={() => { window.location.href = "/"; }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/40 active:scale-95 transition-all text-xs font-bold"
                title="리그 로비로 돌아가기"
              >
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">리그 로비</span>
              </button>

              {/* Logout Button (Rectangular Style with Text) */}
              <button
                onClick={logoutUser}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-card/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 active:scale-95 transition-all text-xs font-bold"
                title="로그아웃"
              >
                <LogOut className="size-4" />
                <span>로그아웃</span>
              </button>

            </div>
          </div>

          {/* Role-Based Nav Tabs */}
          <nav className="mt-5 flex gap-1 overflow-x-auto">
            {session.role === "STUDENT" ? (
              <>
                {/* 1. 나의 기록 (선수 - 신규) */}
                <TabButton active={tab === "myRecord"} onClick={() => setTab("myRecord")} icon={<Trophy className="size-4" />}>
                  나의 기록
                </TabButton>

                {/* 1-b. 내 경기 기록 (자율/완전자율 모드에서만) */}
                {memberCanRecord && (
                  <TabButton active={tab === "memberRecord"} onClick={() => setTab("memberRecord")} icon={<Swords className="size-4" />}>
                    내 경기 기록
                  </TabButton>
                )}

                {/* 2. 매치 추천 (선수) */}
                <TabButton active={tab === "recommend"} onClick={() => setTab("recommend")} icon={<Target className="size-4" />}>
                  매치 추천
                </TabButton>

                {/* 3. 나의 업적 (선수 - 신규) */}
                <TabButton active={tab === "myAchievements"} onClick={() => setTab("myAchievements")} icon={<Award className="size-4" />}>
                  나의 업적
                </TabButton>
              </>
            ) : (
              <>
                {/* 과거 시즌 열람 시: 시즌 요약 탭 */}
                {currentViewSeason !== "현재 시즌" && (
                  <TabButton active={tab === "seasonSummary"} onClick={() => setTab("seasonSummary")} icon={<BarChart3 className="size-4" />}>
                    시즌 요약
                  </TabButton>
                )}

                {/* 1. 경기 기록 입력 (관리자 전용) */}
                {currentViewSeason === "현재 시즌" && (
                  <TabButton active={tab === "record"} onClick={() => setTab("record")} icon={<Swords className="size-4" />}>
                    경기 기록 입력
                  </TabButton>
                )}

                {/* 2. 매치 추천 (관리자) — 과거 시즌 열람 시 숨김 */}
                {currentViewSeason === "현재 시즌" && (
                  <TabButton active={tab === "recommend"} onClick={() => setTab("recommend")} icon={<Target className="size-4" />}>
                    매치 추천
                  </TabButton>
                )}

                {/* 3. 티어 순위표 (관리자) */}
                <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={<Trophy className="size-4" />}>
                  티어 순위표
                </TabButton>
                
                {/* 4. 관리자 (관리자 전용) */}
                {currentViewSeason === "현재 시즌" && isClassManager && (
                  <TabButton active={tab === "admin"} onClick={() => setTab("admin")} icon={<Users className="size-4" />}>
                    관리자
                  </TabButton>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Panel Content Routing */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {needsOnboarding ? (
          <Onboarding
            students={students}
            thresholds={tierThresholds}
            levelMode={levelMode}
            levels={levels}
            onClaim={claimPlayer}
            onCreate={createMyPlayer}
          />
        ) : (<>
        {/* Read-Only Warning Banner */}
        {currentViewSeason !== "현재 시즌" && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.08)] animate-in slide-in-from-top duration-200">
            <ShieldAlert className="size-5 shrink-0 text-amber-500" />
            <div className="flex-1 text-xs sm:text-sm">
              <span className="font-black">읽기 전용 모드 활성화</span>: 과거 시즌 <strong className="text-amber-400 font-extrabold">{currentViewSeason}</strong>의 데이터를 열람 중입니다. 새로운 경기 기록이나 정보 수정이 제한됩니다.
            </div>
            <button
              onClick={() => changeViewSeason("현재 시즌")}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg px-3 py-1.5 font-bold transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              현재 시즌으로 복귀
            </button>
          </div>
        )}
        {/* Tenant Panels */}
        {tab === "seasonSummary" && currentViewSeason !== "현재 시즌" && (
          <SeasonSummary
            season={currentViewSeason}
            students={students}
            matches={matches}
            thresholds={tierThresholds}
          />
        )}

        {tab === "leaderboard" && session.role !== "STUDENT" && (
          <Leaderboard
            students={students}
            thresholds={tierThresholds}
          />
        )}
        
        {tab === "recommend" && (
          <MatchRecommend
            students={students}
            matches={matches}
            onSelectRecommendedMatch={handleSelectRecommendedMatch}
            sel={recommendSel}
            onSelChange={setRecommendSel}
            mode={recommendMode}
            onModeChange={setRecommendMode}
            targetGrade={recommendTargetGrade}
            onTargetGradeChange={setRecommendTargetGrade}
            targetClass={recommendTargetClass}
            onTargetClassChange={setRecommendTargetClass}
            thresholds={tierThresholds}
            onUpdateGender={updateStudentGender}
            isStudentView={session?.role === "STUDENT"}
            isReadOnly={currentViewSeason !== "현재 시즌"}
          />
        )}
        
        {session.role === "STUDENT" && tab === "myRecord" && (
          <MyRecord
            session={session}
            students={students}
            matches={matches}
            thresholds={tierThresholds}
            rpVariables={rpVariables}
            decaySettings={decaySettings}
            decayAppliedDates={decayAppliedDates}
          />
        )}

        {session.role === "STUDENT" && tab === "myAchievements" && (
          <MyAchievements
            studentId={session.studentId || ""}
          />
        )}
        
        {session.role !== "STUDENT" && tab === "record" && (
          <RecordMatch
            students={students}
            onRecord={recordMatch}
            initials={recommendInitials}
            onClearInitials={() => setRecommendInitials(null)}
            thresholds={tierThresholds}
            rpVariables={rpVariables}
            onUpdateGender={updateStudentGender}
          />
        )}

        {/* 일반회원 본인 경기 기록 — free: 본인 고정 / free-all: 자유 선택 */}
        {session.role === "STUDENT" && tab === "memberRecord" && memberCanRecord && (
          <RecordMatch
            students={students}
            onRecord={recordMatch}
            initials={recommendInitials}
            onClearInitials={() => setRecommendInitials(null)}
            thresholds={tierThresholds}
            rpVariables={rpVariables}
            onUpdateGender={updateStudentGender}
            lockedPlayerId={matchInputMode === "free" ? myPlayerId : null}
          />
        )}

         {session.role !== "STUDENT" && tab === "admin" && isClassManager && (
          <AdminPanel
            isOwner={isClassOwner}
            students={students}
            matches={matches}
            onUpsert={upsertStudents}
            count={students.length}
            onDeleteMatch={deleteMatch}
            onResetStudent={resetStudent}
            onResetAll={resetAllData}
            onUpdateRP={updateStudentRP}
            thresholds={tierThresholds}
            rpVariables={rpVariables}
            onUpdateSettings={updateLeagueSettings}
            onDeleteStudent={deleteStudent}
            onUpdateGender={updateStudentGender}
            onUpdateStudentInfo={updateStudentInfo}
            onRestoreFromCSV={restoreFromCSV}
            onBulkDecay={bulkDecayRP}
            onUpdateMatchScore={updateMatchScore}
            title={title}
            activeBonuses={activeBonuses}
            onSaveLeagueSettings={saveLeagueSettings}
          />
        )}
        </>)}
      </main>

      {isSyncing && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border/50 bg-card/60 shadow-[0_0_50px_rgba(0,180,216,0.15)] animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex size-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-muted/30" />
              <div className="absolute inset-0 rounded-full border-4 border-neon-blue border-t-transparent animate-spin" />
              <Swords className="size-6 text-neon-blue animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-foreground">선수 데이터 동기화 중...</h3>
              <p className="text-xs text-muted-foreground mt-1">서버에 데이터를 안전하게 저장하고 있습니다.<br/>창을 닫거나 새로고침하지 마세요.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all",
        active
          ? "border-neon-blue bg-neon-blue/10 text-neon-blue text-glow-blue"
          : "border-transparent text-muted-foreground hover:bg-accent/30 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#060913] text-foreground flex flex-col">
      {/* Header Skeleton */}
      <header className="border-b border-border/40 bg-card/20 p-5 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="size-10 rounded-lg bg-muted/40" />
            <div className="h-6 w-36 rounded bg-muted/40" />
          </div>
          <div className="flex flex-wrap items-center gap-2 animate-pulse">
            <div className="h-8 w-28 rounded-full bg-muted/40" />
            <div className="h-8 w-24 rounded-full bg-muted/40" />
            <div className="h-8 w-16 rounded-full bg-muted/40" />
          </div>
        </div>
      </header>

      {/* Tabs Navigation Skeleton */}
      <div className="border-b border-border/20 bg-card/10 px-4 py-2">
        <div className="mx-auto max-w-7xl flex gap-2 overflow-x-auto animate-pulse">
          <div className="h-9 w-28 rounded-t-lg bg-muted/30" />
          <div className="h-9 w-28 rounded-t-lg bg-muted/30" />
          <div className="h-9 w-28 rounded-t-lg bg-muted/30" />
        </div>
      </div>

      {/* Main Content Area Skeleton */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex-grow w-full space-y-6 animate-pulse">
        {/* Top filter cards bone */}
        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/20 bg-card/10">
          <div className="h-10 w-full rounded-lg bg-muted/40" />
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="h-8 w-20 rounded-full bg-muted/30" />
            <div className="h-8 w-20 rounded-full bg-muted/30" />
            <div className="h-8 w-20 rounded-full bg-muted/30" />
          </div>
        </div>

        {/* Table layout bone */}
        <div className="rounded-xl border border-border/20 bg-card/10 overflow-hidden">
          <div className="h-12 bg-muted/40 border-b border-border/20" />
          <div className="p-4 space-y-4">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-5 w-8 rounded bg-muted/30" />
                  <div className="h-5 w-16 rounded bg-muted/30" />
                  <div className="size-5 rounded-full bg-muted/30" />
                  <div className="h-5 w-32 rounded bg-muted/30" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-5 w-16 rounded bg-muted/30" />
                  <div className="h-5 w-24 rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
