import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Swords, Calendar, Users, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Gender, Student, Match } from "@/lib/league-types";
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

export interface AdminMatchRecordsProps {
  students: Student[];
  matches: Match[];
  onDeleteMatch: (matchId: string) => void;
  onUpdateMatchScore: (matchId: string, scoreA: number, scoreB: number) => void;
}

export function AdminMatchRecords({
  students,
  matches,
  onDeleteMatch,
  onUpdateMatchScore,
}: AdminMatchRecordsProps) {
  // 관리자 화면에서는 별명을 우선 표시, 없으면 이름
  const displayName = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;

  // Score editor states
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScoreA, setEditScoreA] = useState<string>("");
  const [editScoreB, setEditScoreB] = useState<string>("");

  // 경기 삭제 확인 다이얼로그 (window.confirm 대체)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; desc: string } | null>(null);

  type PlayerLike = { name: string; nickname?: string | null };
  const requestDeleteMatch = (m: Match, playerA: PlayerLike, playerB: PlayerLike, playerA2: PlayerLike | null | undefined, playerB2: PlayerLike | null | undefined, aWon: boolean) => {
    // 삭제 시 각 선수에게 적용되는 변동 = 기록 시 받은 변동의 반대(-rpDelta). 선수별로 다르므로 개별 표기.
    const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
    const rollback = (delta: number | undefined, won: boolean) =>
      delta !== undefined ? -delta : (won ? -25 : 20); // 저장된 개별 변동이 없으면(레거시) 근사치
    const lines: string[] = [];
    lines.push(`· ${displayName(playerA)}: RP ${fmt(rollback(m.rpDeltaA, aWon))}`);
    if (playerA2) lines.push(`· ${displayName(playerA2)}: RP ${fmt(rollback(m.rpDeltaA2, aWon))}`);
    lines.push(`· ${displayName(playerB)}: RP ${fmt(rollback(m.rpDeltaB, !aWon))}`);
    if (playerB2) lines.push(`· ${displayName(playerB2)}: RP ${fmt(rollback(m.rpDeltaB2, !aWon))}`);
    setPendingDelete({
      id: m.id,
      desc: `이 경기 기록을 삭제하면 참여 선수 각자의 RP·전적이 경기 이전 상태로 롤백됩니다. (선수마다 변동량이 다릅니다)\n${lines.join("\n")}\n이 작업은 되돌릴 수 없습니다.`,
    });
  };

  // Filtering states — 회원(급수 칩 + 회원 선택) / 날짜(달력)
  const [matchFilterType, setMatchFilterType] = useState<"recent" | "member" | "date">("recent");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
  // 목록 페이지네이션 (더보기 +20)
  const [visibleCount, setVisibleCount] = useState(20);

  // 급수(레벨) 목록 — Leaderboard 칩 패턴과 동일
  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => { if (s.group) set.add(s.group); });
    return Array.from(set).sort();
  }, [students]);
  const toggleGroup = (g: string) =>
    setSelectedGroups((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));

  // 선택한 급수에 속한 회원만 셀렉트 후보로 (급수 미선택 시 전체)
  const memberOptions = useMemo(() => {
    const list = selectedGroups.length
      ? students.filter((s) => s.group && selectedGroups.includes(s.group))
      : students;
    return [...list].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [students, selectedGroups]);

  const handleSaveScoreEdit = () => {
    if (!editingMatchId) return;
    const sA = parseInt(editScoreA, 10);
    const sB = parseInt(editScoreB, 10);

    if (isNaN(sA) || sA < 0 || isNaN(sB) || sB < 0) {
      return toast.error("올바른 점수 값을 입력해 주세요 (0점 이상).");
    }

    if (sA === sB) {
      return toast.error("경기는 동점으로 끝날 수 없습니다. 승패가 결정되는 점수를 입력해 주세요.");
    }

    onUpdateMatchScore(editingMatchId, sA, sB);
    setEditingMatchId(null);
    toast.success("경기 점수가 수정되었으며 두 선수의 보너스 및 최종 RP가 오차 없이 즉시 재계산되어 덮어씌워졌습니다!");
  };

  // Filtered matches logic
  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    let result = [...matches];
    // 최신순 정렬
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matchFilterType === "recent") {
      return result; // 페이지네이션(visibleCount)으로 제한
    }

    if (matchFilterType === "member") {
      const involves = (m: Match, id: string) =>
        m.playerAId === id || m.playerBId === id || m.playerA2Id === id || m.playerB2Id === id;
      if (selectedMemberId) return result.filter((m) => involves(m, selectedMemberId));
      if (selectedGroups.length) {
        const inGroup = (id?: string | null) => {
          const s = id ? students.find((x) => x.id === id) : null;
          return !!s?.group && selectedGroups.includes(s.group);
        };
        return result.filter((m) =>
          inGroup(m.playerAId) || inGroup(m.playerBId) || inGroup(m.playerA2Id) || inGroup(m.playerB2Id)
        );
      }
      return [];
    }

    if (matchFilterType === "date") {
      if (!selectedDate) return [];
      const sameDay = (d: Date) =>
        d.getFullYear() === selectedDate.getFullYear() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getDate() === selectedDate.getDate();
      return result.filter((m) => sameDay(new Date(m.date)));
    }

    return result;
  }, [matches, students, matchFilterType, selectedMemberId, selectedGroups, selectedDate]);

  // 필터 조건이 바뀌면 더보기 카운트 리셋
  useEffect(() => { setVisibleCount(20); }, [matchFilterType, selectedMemberId, selectedGroups, selectedDate]);

  const visibleMatches = filteredMatches.slice(0, visibleCount);

  return (
    <>
      <Card className="border border-border/60 bg-card/60 p-6 backdrop-blur shadow-xl relative overflow-hidden">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-neon-blue">
            <Swords className="size-5 animate-pulse" />
            <h3 className="font-black text-lg">리그 기록 관리</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-muted-foreground/85">
            리그에 기록된 모든 매치 데이터를 조회하고, 경기 점수를 소급 수정하거나 완전 삭제하여 RP 및 전적을 안전하게 롤백 복원합니다.
          </p>
        </div>

        {/* Category Selector Tabs */}
        <div className="mb-5 space-y-3">
          <div className="p-1 bg-muted/40 border border-border/20 rounded-xl flex flex-wrap gap-1.5 w-full md:w-max">
            {([
              { id: "recent", label: "최근 경기", icon: Swords },
              { id: "member", label: "회원 검색", icon: Users },
              { id: "date", label: "날짜 검색", icon: Calendar },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMatchFilterType(id)}
                className={cn(
                  "px-3.5 py-2 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all active:scale-95",
                  matchFilterType === id
                    ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/35 shadow-sm shadow-neon-blue/10"
                    : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* 회원 검색: 급수 칩 다중선택 → 해당 급수 회원 선택 */}
          {matchFilterType === "member" && (
            <div className="space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {availableGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground mr-0.5">급수</span>
                  {availableGroups.map((g) => {
                    const on = selectedGroups.includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => { toggleGroup(g); setSelectedMemberId(""); }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all active:scale-95",
                          on ? "border-neon-blue/50 bg-neon-blue/15 text-neon-blue" : "border-border/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              )}
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="h-10 w-full max-w-md rounded-xl border border-border/50 bg-input px-3 text-xs font-sans focus:border-neon-blue"
              >
                <option value="">
                  {selectedGroups.length ? "급수 내 회원 선택 (전체 보기 = 미선택)" : "회원 선택 (또는 급수 칩으로 좁히기)"}
                </option>
                {memberOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {displayName(s)}{s.group ? ` · ${s.group}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 날짜 검색: 달력 팝오버 */}
          {matchFilterType === "date" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 justify-start gap-2 font-sans text-xs min-w-[200px] border-border/50"
                  >
                    <Calendar className="size-4 text-muted-foreground" />
                    {selectedDate
                      ? selectedDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                      : "날짜를 선택하세요"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DayCalendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { setSelectedDate(d); setDateOpen(false); }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(undefined)}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/65 hover:bg-muted px-2.5 py-2 rounded-lg transition-colors"
                >
                  지우기
                </button>
              )}
            </div>
          )}
        </div>

        {/* 경기 목록 — 한 행에 핵심만(대결 요약 · 점수 · 작업). 모바일·데스크톱 공통 컴팩트 행. */}
        <div className="space-y-1.5">
          {filteredMatches && filteredMatches.length > 0 ? (
            visibleMatches.map((m) => {
              const playerA = students.find((s) => s.id === m.playerAId) ?? { name: "알 수 없는 멤버", nickname: null, group: null, gender: "U" as Gender };
              const playerB = students.find((s) => s.id === m.playerBId) ?? { name: "알 수 없는 멤버", nickname: null, group: null, gender: "U" as Gender };
              const playerA2 = m.playerA2Id ? students.find((s) => s.id === m.playerA2Id) : null;
              const playerB2 = m.playerB2Id ? students.find((s) => s.id === m.playerB2Id) : null;
              const aWon = m.scoreA > m.scoreB;
              const matchDateStr = new Date(m.date).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              // 복식이면 "닉·파트너" 한 줄로 합쳐 표기
              const teamA = playerA2 ? `${displayName(playerA)}·${displayName(playerA2)}` : displayName(playerA);
              const teamB = playerB2 ? `${displayName(playerB)}·${displayName(playerB2)}` : displayName(playerB);

              return (
                <div key={m.id} className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border/30 bg-input/40 px-2.5 py-2 hover:bg-accent/10 transition-colors">
                  <span className="hidden sm:block w-[88px] shrink-0 text-[10px] leading-tight text-muted-foreground">{matchDateStr}</span>

                  {/* 대결 요약: A팀  점수  B팀 (승자 강조) */}
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs">
                    <span className={cn("min-w-0 flex-1 truncate text-right font-bold", aWon ? "text-neon-blue" : "text-foreground")} title={teamA}>{teamA}</span>
                    <span className="shrink-0 font-mono font-bold bg-muted/60 px-2 py-0.5 rounded text-[13px] select-none">
                      <span className={cn(aWon ? "text-win" : "text-loss")}>{m.scoreA}</span>
                      <span className="text-muted-foreground mx-0.5">:</span>
                      <span className={cn(!aWon ? "text-win" : "text-loss")}>{m.scoreB}</span>
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-left font-bold", !aWon ? "text-neon-blue" : "text-foreground")} title={teamB}>{teamB}</span>
                  </div>

                  {/* 작업 (아이콘) */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      onClick={() => { setEditingMatchId(m.id); setEditScoreA(m.scoreA.toString()); setEditScoreB(m.scoreB.toString()); }}
                      variant="ghost" size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-lg active:scale-95"
                      title="경기 점수 수정"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      onClick={() => requestDeleteMatch(m, playerA, playerB, playerA2, playerB2, aWon)}
                      variant="ghost" size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg active:scale-95"
                      title="이 경기 삭제 및 안전 롤백"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center text-muted-foreground text-xs border border-dashed border-border/30 rounded-xl bg-muted/5">
              {matchFilterType === "recent"
                ? "기록된 경기 내역이 없습니다."
                : (matchFilterType === "member" && (selectedMemberId || selectedGroups.length)) || (matchFilterType === "date" && selectedDate)
                  ? "조건과 일치하는 경기가 없습니다."
                  : matchFilterType === "member"
                    ? "급수 칩을 고르거나 회원을 선택하세요."
                    : "달력에서 날짜를 선택하세요."}
            </div>
          )}

          {/* 더보기 — 검색/최근 공통 페이지네이션 */}
          {filteredMatches.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + 20)}
              className="mt-1 w-full rounded-lg border border-border/50 bg-card/40 py-2.5 text-xs font-bold text-muted-foreground transition-all hover:border-neon-blue/40 hover:text-neon-blue active:scale-[0.99]"
            >
              경기 더보기 ({Math.min(20, filteredMatches.length - visibleCount)}건 더 · 남은 {filteredMatches.length - visibleCount}건)
            </button>
          )}
        </div>
      </Card>

      {/* Inline Score Edit Modal Overlaid */}
      {editingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-sm w-full border border-border/80 bg-background p-6 shadow-2xl rounded-2xl relative z-50 animate-in zoom-in-95 duration-200">
            <h4 className="text-base font-black mb-1 flex items-center gap-1.5 text-foreground">
              <Pencil className="size-4.5 text-neon-blue" /> 경기 세부 점수 수정
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              경기 결과를 수정하면 바뀐 점수를 기반으로 점수차 비례 보상 등의 보너스 및 최종 RP가 오차 없이 다시 자동 계산되어 두 선수에게 즉시 덮어씌워집니다.
            </p>

            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border/30 mb-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  A 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreA}
                  onChange={(e) => setEditScoreA(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  B 선수 점수
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editScoreB}
                  onChange={(e) => setEditScoreB(e.target.value)}
                  className="font-mono font-bold text-center text-lg h-12 bg-background"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setEditingMatchId(null)}
                variant="outline"
                className="w-1/2 h-10 font-bold border-border/80 text-foreground rounded-xl"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSaveScoreEdit}
                className="w-1/2 h-10 font-black bg-neon-blue text-primary-foreground hover:opacity-90 rounded-xl"
              >
                저장 및 재계산
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 경기 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent className="border-destructive/30 bg-background/95 max-w-md shadow-2xl rounded-2xl backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-destructive flex items-center gap-2">
              <ShieldAlert className="size-5 shrink-0" /> 이 경기를 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed whitespace-pre-line">
              {pendingDelete?.desc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="font-bold border-border/80 text-foreground hover:bg-accent/40 active:scale-95 transition-all rounded-xl h-11 px-5">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  onDeleteMatch(pendingDelete.id);
                  toast.success("경기 기록이 삭제되었으며 참여 선수들의 RP·전적이 경기 이전으로 롤백되었습니다!");
                }
              }}
              className="font-black bg-destructive hover:bg-destructive/80 active:scale-95 transition-all text-white rounded-xl h-11 px-5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            >
              삭제 및 롤백
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
