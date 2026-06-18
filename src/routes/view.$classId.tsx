import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { MyAchievements } from "@/components/league/MyAchievements";
import { SeasonSummary } from "@/components/league/SeasonSummary";
import { StudentCardSettings } from "@/components/league/StudentCardSettings";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  getTier,
  TIER_STYLES,
  type TierName,
  type Student,
  type Match,
  type DecaySettingsRecord,
} from "@/lib/league-types";
import { Trophy, Search, ChevronLeft, TrendingUp, Medal, Calendar, Settings, Hourglass } from "lucide-react";

export const Route = createFileRoute("/view/$classId")({
  component: StudentViewerComponent,
});

const DEFAULT_THRESHOLDS: Record<TierName, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 1200,
  Platinum: 1400,
  Diamond: 1600,
};

// 학번 표기 ("5-9 4번"). 학년-반은 하이픈, 번호 앞은 띄어쓰기.
function studentNo(s: { grade: number; classNum: number; number: number }) {
  return `${s.grade}-${s.classNum} ${s.number}번`;
}

// 화면에 크게 보일 이름. 별명이 있으면 별명, 없으면 학번.
function displayIdentity(s: { nickname?: string | null; grade: number; classNum: number; number: number }) {
  return s.nickname && s.nickname.trim() ? s.nickname.trim() : studentNo(s);
}

// 과거 시즌: 선수 카드 / 시즌 요약 전환 칩
function ViewToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full border text-xs font-bold transition-all active:scale-95",
        active ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue" : "border-border/40 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// 최근 5경기 흐름(W/L 점)을 그리는 공용 미니 위젯
function RecentDots({ recent, size = "sm" }: { recent: ("W" | "L")[]; size?: "sm" | "lg" }) {
  const dot = size === "lg" ? "size-7 text-xs" : "size-5.5 text-[9px]";
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => {
        const r = recent[idx];
        return (
          <span
            key={idx}
            className={cn(
              "flex items-center justify-center rounded-full font-bold",
              dot,
              !r && "bg-muted/40 text-muted-foreground",
              r === "W" && "bg-win/20 text-win ring-1 ring-win/40",
              r === "L" && "bg-loss/20 text-loss ring-1 ring-loss/40",
            )}
          >
            {r ?? "·"}
          </span>
        );
      })}
    </div>
  );
}

function StudentViewerComponent() {
  const { classId } = Route.useParams();
  const { students, matches, title, loadClassData, tierThresholds, hydrated, isSyncing,
    seasonList, currentSeason, currentViewSeason, changeViewSeason,
    decaySettings, decayAppliedDates } = useLeagueStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const isPastSeason = currentViewSeason !== "현재 시즌";

  // 시즌 전환: 선택된 학생/보기 상태는 그대로 유지한 채 데이터만 교체.
  // (학생 id는 시즌 간 동일하므로 같은 학생의 해당 시즌 기록이 바로 보인다)
  const handleSeasonChange = (season: string) => {
    changeViewSeason(season);
  };

  useEffect(() => {
    if (classId) {
      loadClassData(classId);
    }
  }, [classId, loadClassData]);

  const thresholds = tierThresholds || DEFAULT_THRESHOLDS;

  // 번호순(학년-반-번호) 중립 정렬 — 등수 느낌을 주지 않기 위함
  const orderedStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...students]
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          String(s.number).includes(q) ||
          `${s.grade}-${s.classNum}-${s.number}`.includes(q)
        );
      })
      .sort((a, b) => a.grade - b.grade || a.classNum - b.classNum || a.number - b.number);
  }, [students, searchQuery]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) ?? null,
    [students, selectedId],
  );

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs text-muted-foreground font-black tracking-wider animate-pulse">
            리그 정보를 불러오고 있습니다...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <Toaster theme="dark" position="top-center" richColors />
      {/* Background neon elements */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.25)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-30" />
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-neon-blue/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-tier-diamond/10 blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl relative z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-neon-blue to-tier-diamond shadow-[0_0_18px_oklch(0.78_0.18_230/0.5)]">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-[10px] font-bold text-neon-green tracking-wider uppercase flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-neon-green animate-pulse" />
                학생 전용 화면
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSyncing && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-neon-blue/40 bg-neon-blue/5 text-[9px] font-bold text-neon-blue animate-pulse">
                <span>실시간 동기화 중...</span>
              </div>
            )}
            {/* 시즌 선택 (과거 시즌 열람) */}
            <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5">
              <Calendar className="size-3.5 text-neon-blue" />
              <select
                value={currentViewSeason}
                onChange={(e) => handleSeasonChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer pr-1"
              >
                <option value="현재 시즌" className="bg-background text-foreground font-bold">{currentSeason} (현재)</option>
                {seasonList && seasonList.map((season) => (
                  <option key={season} value={season} className="bg-background text-foreground font-bold">{season}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 relative z-10 space-y-5">
        {/* 과거 시즌 읽기 전용 배너 */}
        {isPastSeason && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-amber-200">
            <Calendar className="size-5 shrink-0 text-amber-500" />
            <div className="flex-1 text-xs sm:text-sm">
              <span className="font-black">과거 시즌 {currentViewSeason}</span> 열람 중입니다. (읽기 전용)
            </div>
            <button
              onClick={() => handleSeasonChange("현재 시즌")}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg px-3 py-1.5 font-bold transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              현재 시즌으로
            </button>
          </div>
        )}

        {selectedStudent ? (
          <StudentDashboard
            student={selectedStudent}
            students={students}
            matches={matches}
            thresholds={thresholds}
            decaySettings={decaySettings}
            decayAppliedDates={decayAppliedDates}
            readOnly={isPastSeason}
            onBack={() => setSelectedId(null)}
            onSaved={() => loadClassData(classId, true)}
          />
        ) : isPastSeason && showSummary ? (
          <SeasonSummary
            season={currentViewSeason}
            students={students}
            matches={matches}
            thresholds={thresholds}
          />
        ) : (
          <>
            {/* 과거 시즌일 때 선수 카드 / 시즌 요약 전환 */}
            {isPastSeason && (
              <div className="flex items-center gap-1.5">
                <ViewToggle active={!showSummary} onClick={() => setShowSummary(false)}>선수 카드</ViewToggle>
                <ViewToggle active={showSummary} onClick={() => setShowSummary(true)}>시즌 요약</ViewToggle>
              </div>
            )}
            <StudentPicker
              students={orderedStudents}
              thresholds={thresholds}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              onSelect={setSelectedId}
            />
          </>
        )}
      </main>

      <footer className="border-t border-border/25 py-4 text-center text-[10px] text-muted-foreground relative z-10 bg-background/50">
        <div>자기 카드를 눌러 나의 티어와 경기 기록, 업적을 확인해 보세요. 화면은 실시간으로 갱신됩니다.</div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 화면 1: 학생 선택 창 (카드 그리드)
// ─────────────────────────────────────────────────────────────
function StudentPicker({
  students,
  thresholds,
  searchQuery,
  onSearch,
  onSelect,
}: {
  students: Student[];
  thresholds: Record<TierName, number>;
  searchQuery: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">나의 카드를 찾아 눌러주세요</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            번호순으로 정렬되어 있어요. 총 {students.length}명
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="번호 또는 별명으로 찾기..."
            className="h-10 border-border/60 bg-card/60 pl-9 text-sm"
          />
        </div>
      </div>

      {students.length === 0 ? (
        <Card className="border-border/60 bg-card/60 p-12 text-center backdrop-blur-xl">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "검색 결과가 없습니다." : "아직 등록된 학생이 없습니다."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {students.map((s) => {
            const tier = getTier(s.rp, thresholds);
            const style = TIER_STYLES[tier];
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "group relative flex flex-col gap-3 rounded-2xl border bg-card/60 p-4 text-left backdrop-blur-xl transition-all",
                  "hover:scale-[1.03] hover:bg-card/80 active:scale-100 cursor-pointer",
                  style.ring,
                  "ring-1",
                )}
              >
                {/* 은은한 티어 색상 글로우 */}
                <div
                  className={cn(
                    "absolute -top-10 -right-10 size-24 rounded-full blur-[50px] opacity-20 pointer-events-none",
                    style.bg.replace("/15", ""),
                  )}
                />

                <div className="flex items-center justify-between gap-2 relative z-10">
                  <GenderMark gender={s.gender} />
                  <TierBadge rp={s.rp} thresholds={thresholds} />
                </div>

                <div className="flex flex-col items-center gap-1 py-2 relative z-10">
                  <span className="text-2xl font-black tracking-tight text-foreground text-center break-keep line-clamp-2">
                    {displayIdentity(s)}
                  </span>
                  {s.nickname && s.nickname.trim() ? (
                    <span className="text-xs font-semibold text-muted-foreground">{studentNo(s)}</span>
                  ) : null}
                </div>

                <div className="flex justify-center relative z-10">
                  <RecentDots recent={s.recent} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 화면 2: 개인 대시보드 (RP 점수·승률·등수 숨김)
// ─────────────────────────────────────────────────────────────
function StudentDashboard({
  student,
  students,
  matches,
  thresholds,
  decaySettings,
  decayAppliedDates = {},
  readOnly = false,
  onBack,
  onSaved,
}: {
  student: Student;
  students: Student[];
  matches: Match[];
  thresholds: Record<TierName, number>;
  decaySettings?: DecaySettingsRecord;
  decayAppliedDates?: Record<string, string>;
  readOnly?: boolean;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const currentTier = getTier(student.rp, thresholds);

  // 휴면 감점 카운트다운 (사이클당 1회 차감 기준). 과거 시즌 열람(readOnly)에서는 숨김.
  // students_public 뷰에는 lastMatchDate가 없으므로 matches에서 마지막 경기일을 직접 계산한다.
  const decayInfo = useMemo(() => {
    if (readOnly) return null;
    const tierKey = currentTier.toLowerCase() as 'bronze'|'silver'|'gold'|'platinum'|'diamond';
    const setting = decaySettings?.[tierKey];
    if (!setting || !setting.enabled) return null;

    const lastMatchTime = matches
      .filter((m) =>
        m.playerAId === student.id ||
        m.playerBId === student.id ||
        m.playerA2Id === student.id ||
        m.playerB2Id === student.id,
      )
      .reduce((max, m) => Math.max(max, new Date(m.date).getTime()), 0);
    if (!lastMatchTime) return null; // 경기 기록이 없으면 표시하지 않음

    const dayMs = 1000 * 60 * 60 * 24;
    const appliedStr = decayAppliedDates[student.id];
    const baseline = Math.max(lastMatchTime, appliedStr ? new Date(appliedStr).getTime() : 0);
    const daysRemaining = Math.max(0, Math.ceil(setting.inactiveDays - (Date.now() - baseline) / dayMs));
    return { daysRemaining, decayRp: setting.decayRp, warning: daysRemaining <= 3 };
  }, [readOnly, matches, student.id, currentTier, decaySettings, decayAppliedDates]);

  // 다음 티어까지의 진행도 (RP 숫자는 노출하지 않고 막대/비율만)
  const progress = useMemo(() => {
    const order: TierName[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    const idx = order.indexOf(currentTier);
    const nextTier = idx < order.length - 1 ? order[idx + 1] : null;
    const currentThreshold = thresholds[currentTier] ?? 0;
    const nextThreshold = nextTier
      ? thresholds[nextTier] ?? currentThreshold + 400
      : currentThreshold + 400;
    const range = Math.max(1, nextThreshold - currentThreshold);
    const percent = Math.min(100, Math.max(0, Math.round(((student.rp - currentThreshold) / range) * 100)));
    return { nextTier, percent };
  }, [currentTier, student.rp, thresholds]);

  // 본인이 참여한 경기 (최신순). 상대는 display_name(별명/번호)이라 실명 노출 없음.
  const myMatches = useMemo(() => {
    return matches
      .filter(
        (m) =>
          m.playerAId === student.id ||
          m.playerBId === student.id ||
          m.playerA2Id === student.id ||
          m.playerB2Id === student.id,
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, student.id]);

  const style = TIER_STYLES[currentTier];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="size-4" />
          목록으로
        </button>
        {!readOnly && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neon-blue/40 bg-neon-blue/5 px-3 py-1.5 text-sm font-bold text-neon-blue transition-colors hover:bg-neon-blue/15 cursor-pointer"
          >
            <Settings className="size-4" />
            내 카드 설정
          </button>
        )}
      </div>

      {settingsOpen && (
        <StudentCardSettings
          student={student}
          onClose={() => setSettingsOpen(false)}
          onSaved={onSaved}
        />
      )}

      {/* 프로필 + 티어 진행도 */}
      <Card className="relative overflow-hidden border-border/60 bg-card/45 p-6 backdrop-blur-xl shadow-lg">
        <div
          className={cn(
            "absolute -right-24 -top-24 size-64 rounded-full blur-[100px] pointer-events-none opacity-20",
            style.bg.replace("/15", ""),
          )}
        />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-neon-blue">
                {student.grade}학년 {student.classNum}반 · {student.number}번
              </span>
              <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                <GenderMark gender={student.gender} />
                <span>{displayIdentity(student)}</span>
              </h2>
            </div>
            <TierBadge rp={student.rp} thresholds={thresholds} className="text-sm px-2.5 py-1" />
          </div>

          {/* 티어 진행 막대 (RP 숫자 없음) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="size-3.5 text-neon-blue" />
                티어 진행도
              </span>
              <span>
                {progress.nextTier ? (
                  <>
                    다음 등급:{" "}
                    <span className="text-neon-blue font-extrabold">
                      {TIER_STYLES[progress.nextTier].label}
                    </span>
                  </>
                ) : (
                  <span className="text-glow-gold text-gold flex items-center gap-1">
                    <Medal className="size-3.5" /> 최고 티어 달성!
                  </span>
                )}
              </span>
            </div>
            <div className="relative w-full h-3.5 bg-background/60 border border-border/40 rounded-full overflow-hidden p-0.5">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 bg-gradient-to-r",
                  currentTier === "Diamond"
                    ? "from-tier-diamond to-[#00b4d8]"
                    : currentTier === "Platinum"
                      ? "from-tier-platinum to-[#80ffdb]"
                      : currentTier === "Gold"
                        ? "from-tier-gold to-amber-300"
                        : currentTier === "Silver"
                          ? "from-tier-silver to-[#e2eafc]"
                          : "from-tier-bronze to-amber-700",
                )}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-muted-foreground">최근 경기 흐름</span>
              <RecentDots recent={student.recent} size="lg" />
            </div>
          </div>

          {/* 휴면 감점 카운트다운 */}
          {decayInfo && (
            <div className={cn(
              "rounded-xl border p-3 text-xs font-bold flex items-center justify-between gap-2.5 transition-all",
              decayInfo.warning
                ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
                : "border-border/50 bg-background/40 text-muted-foreground"
            )}>
              <span className="flex items-center gap-1.5 leading-relaxed">
                <Hourglass className="size-3.5 shrink-0" />
                {decayInfo.daysRemaining <= 0
                  ? `미활동으로 곧 RP ${decayInfo.decayRp}점이 차감됩니다. 지금 대결하세요!`
                  : `대결이 없으면 ${decayInfo.daysRemaining}일 후 RP ${decayInfo.decayRp}점이 차감돼요.`}
              </span>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0",
                decayInfo.warning
                  ? "text-destructive bg-destructive/15 border-destructive/20"
                  : "text-muted-foreground bg-card/65 border-border/40"
              )}>
                {decayInfo.daysRemaining <= 0 ? "감점 임박!" : `D-${decayInfo.daysRemaining}`}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* 최근 경기 기록 (승/패 + 상대 별명, 점수·RP 변동 없음) */}
      <Card className="border-border/60 bg-card/45 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <h3 className="text-base font-black tracking-tight text-foreground flex items-center gap-1.5">
            <Trophy className="size-4.5 text-neon-blue" />
            나의 최근 경기
          </h3>
          <span className="text-xs text-muted-foreground font-semibold">총 {myMatches.length}경기</span>
        </div>
        {myMatches.length === 0 ? (
          <div className="text-center py-14 px-4">
            <Calendar className="size-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">아직 경기 기록이 없습니다.</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              경기 결과가 등록되면 여기에 실시간으로 나타납니다!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {myMatches.slice(0, 20).map((m) => {
              const isTeamA = m.playerAId === student.id || m.playerA2Id === student.id;
              const oppIds = isTeamA
                ? ([m.playerBId, m.playerB2Id].filter(Boolean) as string[])
                : ([m.playerAId, m.playerA2Id].filter(Boolean) as string[]);
              const oppNames =
                oppIds
                  .map((id) => {
                    const o = students.find((s) => s.id === id);
                    return o ? displayIdentity(o) : null;
                  })
                  .filter(Boolean)
                  .join(" & ") || "탈퇴한 학생";
              const isWin = isTeamA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA;
              const dateStr = new Date(m.date).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-accent/15 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-[11px] font-black border",
                        isWin
                          ? "bg-win/15 border-win/40 text-win"
                          : "bg-loss/15 border-loss/40 text-loss",
                      )}
                    >
                      {isWin ? "WIN" : "LOSE"}
                    </div>
                    <span className="font-bold text-sm text-foreground">vs {oppNames}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                    <Calendar className="size-3" />
                    {dateStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 업적 (기존 컴포넌트 재사용 — RP/승률 노출 없음) */}
      <MyAchievements studentId={student.id} />
    </div>
  );
}
