import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CalendarPlus, Megaphone, Plus, X, Trophy, ChevronRight, ClipboardList, Hourglass, BellRing, Target, ChevronDown } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { RecordMatch, type MatchResultData, type PlayerResult } from "./RecordMatch";
import { MatchRecommend } from "./MatchRecommend";
import { getTier, type Match, type Student } from "@/lib/league-types";
import { getTodayPlayerIds } from "@/lib/today-players";

const dn = (s?: Student | null) => (s ? (s.nickname || s.name) : "?");

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Initials = { playerAId: string; playerBId: string; playerA2Id?: string; playerB2Id?: string; matchType?: "single" | "double" };

export function MatchesTab({ incomingInitials, onConsumeInitials, openMatchId, onConsumeMatchId }: {
  incomingInitials?: Initials | null;
  onConsumeInitials?: () => void;
  openMatchId?: string | null;
  onConsumeMatchId?: () => void;
} = {}) {
  const {
    session, students, matches, scheduledMatches, tierThresholds, rpVariables,
    matchInputMode, isClassManager, myPlayerId, currentViewSeason,
    recordMatch, updateStudentGender,
    createReservation, cancelReservation, linkReservationResult,
    leaveReservation, joinReservation, notifyReservation,
  } = useLeagueStore();

  const readOnly = currentViewSeason !== "현재 시즌";
  const canReserve = (isClassManager || (matchInputMode !== "admin-only" && !!myPlayerId)) && !readOnly;
  const canRecord = (isClassManager || matchInputMode !== "admin-only") && !readOnly;

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  // ── 예약 생성 폼 ──
  const [reserveOpen, setReserveOpen] = useState(false); // 접기 기본
  const [picked, setPicked] = useState<string[]>([]);
  const [court, setCourt] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 기본은 오늘 참여자만 후보에 노출, 해제하면 전체 회원
  const [todayOnly, setTodayOnly] = useState(true);
  // 관리자: 특정 예약에 사람 추가하기 위한 인라인 선택
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState("");
  // 예약 정리 확인 팝업 대상
  const [confirmCancel, setConfirmCancel] = useState<typeof scheduledMatches[number] | null>(null);

  const todayPlayerIds = useMemo(() => getTodayPlayerIds(matches), [matches]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => dn(a).localeCompare(dn(b))),
    [students]
  );
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = !q
      ? sortedStudents
      : sortedStudents.filter((s) => dn(s).toLowerCase().includes(q) || (s.group || "").toLowerCase().includes(q));
    if (todayOnly) {
      // 오늘 참여자 + (본인·이미 선택한 사람은 항상 유지해 선택 가능)
      base = base.filter((s) => todayPlayerIds.has(s.id) || s.id === myPlayerId || picked.includes(s.id));
    }
    return base;
  }, [sortedStudents, search, todayOnly, todayPlayerIds, myPlayerId, picked]);

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submitReservation = async () => {
    if (picked.length < 2) return toast.error("참가자를 2명 이상 선택하세요.");
    setSubmitting(true);
    const ok = await createReservation({ playerIds: picked, court: court.trim() || null });
    setSubmitting(false);
    if (ok) { setPicked([]); setCourt(""); setSearch(""); }
  };

  // 예약(참가자 풀 player_ids) / 관리자 대진·수락된 도전장(팀 확정 player_a_id…) 양쪽의 참가자 id를 통일해 얻는다.
  const participantsOf = useCallback(
    (r: typeof scheduledMatches[number]): string[] =>
      (r.player_ids?.length ?? 0) > 0
        ? ((r.player_ids || []).filter(Boolean) as string[])
        : ([r.player_a_id, r.player_a2_id, r.player_b_id, r.player_b2_id].filter(Boolean) as string[]),
    []
  );
  const isReservation = (r: typeof scheduledMatches[number]) => (r.player_ids?.length ?? 0) > 0;

  // ── 예약 목록(전원 열람) ── 회원 예약 + 관리자 대진 + 수락된 도전장(모두 waiting|called)
  const reservations = useMemo(
    () => scheduledMatches
      .filter((m) => m.status === "waiting" || m.status === "called")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [scheduledMatches]
  );

  // ── 결과 입력 모달 ──
  const [recordOpen, setRecordOpen] = useState(false);
  const [activeReservation, setActiveReservation] = useState<typeof scheduledMatches[number] | null>(null);
  // 매치 추천 등 외부에서 넘어온 프리필(예약과 무관한 직접 기록)
  const [directInitials, setDirectInitials] = useState<Initials | null>(null);
  // 자율(free) 모드의 비관리자는 '내가 낀 경기'만 기록 — 슬롯 A를 본인으로 고정.
  // (예약 결과 입력은 참가자가 이미 정해져 있으므로 고정하지 않음)
  const lockedPlayerId = (!isClassManager && matchInputMode === "free" && !activeReservation) ? myPlayerId : null;

  const initials = useMemo(() => {
    if (!activeReservation) return directInitials;
    const r = activeReservation;
    const type = r.match_type === "single" ? "single" : "double";
    // 관리자 대진·수락된 도전장: 팀(A vs B)이 이미 확정 → 그대로 프리필
    if (!isReservation(r) && r.player_a_id && r.player_b_id) {
      if (type === "double" && r.player_a2_id && r.player_b2_id) {
        return { playerAId: r.player_a_id, playerA2Id: r.player_a2_id, playerBId: r.player_b_id, playerB2Id: r.player_b2_id, matchType: "double" as const };
      }
      return { playerAId: r.player_a_id, playerBId: r.player_b_id, matchType: "single" as const };
    }
    // 회원 예약: 참가자 풀에서 순서대로 팀 추정
    const ids = (r.player_ids || []).filter(Boolean) as string[];
    if (type === "double" && ids.length >= 4) {
      return { playerAId: ids[0], playerA2Id: ids[1], playerBId: ids[2], playerB2Id: ids[3], matchType: "double" as const };
    }
    if (ids.length >= 2) return { playerAId: ids[0], playerBId: ids[1], matchType: "single" as const };
    return null;
  }, [activeReservation, directInitials]);

  const openResultInput = (reservation: typeof scheduledMatches[number] | null) => {
    setActiveReservation(reservation);
    setDirectInitials(null);
    setRecordOpen(true);
  };

  // 매치 추천에서 넘어온 프리필이 있으면 결과 입력 창을 그 대진으로 연다
  useEffect(() => {
    if (incomingInitials) {
      setActiveReservation(null);
      setDirectInitials(incomingInitials);
      setRecordOpen(true);
      onConsumeInitials?.();
    }
    // onConsumeInitials 로 소비되므로 incomingInitials 변경 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingInitials]);

  // RecordMatch 프리필 effect가 매 렌더 재실행되지 않도록 안정적인 no-op 전달
  const noop = useCallback(() => { /* initials 유지 */ }, []);

  // recordMatch 래퍼: 기록 성공 시 예약에 결과 연결 + 참가자에게 결과 푸시
  const handleRecord = (
    a: string, b: string, sa: number, sb: number, a2?: string, b2?: string, type?: "single" | "double",
  ): Match | undefined => {
    const m = recordMatch(a, b, sa, sb, a2, b2, type);
    if (m && activeReservation) {
      const winners = [a, a2].filter(Boolean).map((id) => dn(byId.get(id as string))).join("·");
      const summary = `${winners} 승 · ${sa}:${sb}`;
      const parts = participantsOf(activeReservation);
      linkReservationResult(activeReservation.id, m.id, parts, summary);
    }
    return m;
  };

  // ── 경기 결과 보기 (맨 아래 버튼 → 팝업) ──
  const [resultsOpen, setResultsOpen] = useState(false); // 팝업 열림 여부
  const [mineOnly, setMineOnly] = useState(true); // 기본: 내 경기만
  const [recentVisible, setRecentVisible] = useState(5);
  const [presetResult, setPresetResult] = useState<MatchResultData | null>(null);

  // 옛 경기(영수증 rpBreakdown 없음)를 현재 결과보기 팝업으로 띄우기 위한 Match → MatchResultData 변환.
  // 보너스 세부 내역은 없으므로 기본 승/패 RP만 표시된다.
  const mkPlayerResult = (studentId: string | undefined, rpDelta: number, score: number, won: boolean): PlayerResult => {
    const s = studentId ? byId.get(studentId) : null;
    const finalRp = s?.rp ?? 1000;
    const prevRp = finalRp - rpDelta;
    return {
      name: s ? dn(s) : "탈퇴한 회원",
      group: s?.group ?? null,
      gender: s?.gender ?? "U",
      prevRp,
      finalRp,
      prevTier: getTier(prevRp, tierThresholds),
      finalTier: getTier(finalRp, tierThresholds),
      promoted: false,
      score,
      rpDelta,
      underdogBonus: 0, scoreDiffBonus: 0, rivalBonus: 0, firstWinBonus: 0, revengeBonus: 0,
      freshnessBonus: 0, streakBonus: 0, comebackBonus: 0, marginBonus: 0, mentoringBonus: 0,
      baseWin: won ? Math.max(0, rpDelta) : 0,
      baseLoss: won ? 0 : Math.max(0, -rpDelta),
      unranked: false, placementDone: 0, placementNeed: 0,
    };
  };
  const buildResultFromMatch = (m: Match): MatchResultData => {
    const isDouble = m.matchType === "double" || !!m.playerA2Id || !!m.playerB2Id;
    const wDelta = m.rpDeltaA ?? rpVariables.winDelta;
    const lDelta = m.rpDeltaB ?? -rpVariables.loseDelta;
    return {
      matchType: isDouble ? "double" : "single",
      winner: mkPlayerResult(m.playerAId, wDelta, m.scoreA, true),
      winner2: m.playerA2Id ? mkPlayerResult(m.playerA2Id, m.rpDeltaA2 ?? wDelta, m.scoreA, true) : undefined,
      loser: mkPlayerResult(m.playerBId, lDelta, m.scoreB, false),
      loser2: m.playerB2Id ? mkPlayerResult(m.playerB2Id, m.rpDeltaB2 ?? lDelta, m.scoreB, false) : undefined,
      aWon: true,
    };
  };

  // 저장된 영수증(rpBreakdown)이 있으면 그대로, 없으면(옛 경기) Match에서 재구성해 동일한 팝업으로 표시.
  const openMatch = (m: Match) => {
    setPresetResult(m.rpBreakdown ? (m.rpBreakdown as MatchResultData) : buildResultFromMatch(m));
  };

  // 결과 푸시(?match=<id>)로 들어오면 해당 경기 결과 창을 자동으로 연다
  useEffect(() => {
    if (!openMatchId) return;
    const m = matches.find((x) => x.id === openMatchId);
    if (m) { openMatch(m); onConsumeMatchId?.(); }
    // matches 로딩 후 잡히도록 matches 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMatchId, matches]);

  const recent = useMemo(() => {
    const all = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (mineOnly && myPlayerId) {
      return all.filter((m) => [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].includes(myPlayerId));
    }
    return all;
  }, [matches, mineOnly, myPlayerId]);

  // ── 매치 추천 (경기 탭 내 접힌 섹션) ──
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recSel, setRecSel] = useState<{ grade: number | null; classNum: number | null; studentId: string | null }>({ grade: null, classNum: null, studentId: null });
  const [recMode, setRecMode] = useState<"class" | "otherClass" | "otherGrade">("class");
  const [recTargetGrade, setRecTargetGrade] = useState<number | null>(null);
  const [recTargetClass, setRecTargetClass] = useState<number | null>(null);

  // 선수 로그인 시 추천 타겟을 본인으로 고정
  useEffect(() => {
    if (session?.role === "STUDENT" && myPlayerId) {
      setRecSel({ grade: null, classNum: null, studentId: myPlayerId });
    }
  }, [session, myPlayerId]);

  // 추천에서 대진 선택 → '경기 예약' 폼에 참가자 프리필 + 폼 펼치고 스크롤(예약으로 일원화)
  //  순서 [본인, 파트너, 상대1, 상대2] = [A, A2, B, B2] → 나중에 결과 입력 시 팀 구성 복원됨.
  const reserveFormRef = useRef<HTMLDivElement>(null);
  const handleRecommendReserve = (a: string, b: string, a2?: string, b2?: string, type?: "single" | "double") => {
    const ids = [a, a2, b, b2].filter(Boolean) as string[];
    setPicked(ids);
    setReserveOpen(true);
    setRecommendOpen(false);
    toast.success("추천 대진을 예약 폼에 담았어요. 코트를 정하고 예약하세요.");
    requestAnimationFrame(() => reserveFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── 경기 결과 입력 (최상단 주 액션) ── */}
      {canRecord && (
        <Button onClick={() => openResultInput(null)}
          className="h-14 w-full rounded-2xl bg-gradient-to-r from-neon-blue to-tier-diamond text-base font-black text-primary-foreground glow-primary transition-all hover:opacity-90 active:scale-[0.99]">
          <Trophy className="mr-2 size-5" /> 경기 결과 입력하기
        </Button>
      )}

      {/* ── 매치 추천 (접힌 섹션) ── */}
      {!readOnly && (
        <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setRecommendOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
                <Target className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-black tracking-tight text-foreground">매치 추천</h2>
                <p className="text-[11px] text-muted-foreground">실력이 비슷한 상대를 찾아 대진을 잡아 보세요.</p>
              </div>
            </div>
            <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", recommendOpen && "rotate-180")} />
          </button>
          {recommendOpen && (
            <div className="mt-4 border-t border-border/30 pt-4 animate-in fade-in slide-in-from-top-1 duration-150">
              <MatchRecommend
                students={students}
                matches={matches}
                onSelectRecommendedMatch={handleRecommendReserve}
                canReserve={canReserve}
                sel={recSel}
                onSelChange={setRecSel}
                mode={recMode}
                onModeChange={setRecMode}
                targetGrade={recTargetGrade}
                onTargetGradeChange={setRecTargetGrade}
                targetClass={recTargetClass}
                onTargetClassChange={setRecTargetClass}
                thresholds={tierThresholds}
                onUpdateGender={updateStudentGender}
                isStudentView={session?.role === "STUDENT"}
                isReadOnly={readOnly}
              />
            </div>
          )}
        </Card>
      )}

      {/* ── 경기 예약 (접힌 섹션) ── */}
      {canReserve && (
        <Card ref={reserveFormRef} className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setReserveOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
                <CalendarPlus className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-black tracking-tight text-foreground">경기 예약</h2>
                <p className="text-[11px] text-muted-foreground">참가자를 모으면 그들에게 알림이 갑니다. 팀은 코트에서 자유롭게.</p>
              </div>
            </div>
            <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", reserveOpen && "rotate-180")} />
          </button>
          {reserveOpen && (
          <div className="mt-4 border-t border-border/30 pt-4 animate-in fade-in slide-in-from-top-1 duration-150">

          <Input value={court} onChange={(e) => setCourt(e.target.value)} placeholder="코트/메모 (선택)"
            className="mb-2 h-9 w-full border-border/50 bg-input text-xs" />

          <div className="mb-2 flex items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="참가자 검색..."
              className="h-9 flex-1 border-border/50 bg-input text-xs" />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground select-none">
              <input type="checkbox" checked={todayOnly} onChange={(e) => setTodayOnly(e.target.checked)}
                className="size-3.5 accent-neon-blue" />
              오늘 참여자만
            </label>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-border/30 p-2">
            <div className="flex flex-wrap gap-1.5">
              {filteredStudents.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button key={s.id} onClick={() => togglePick(s.id)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-bold transition-all",
                      on ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                    {dn(s)}{s.group ? ` · ${s.group}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">선택 {picked.length}명</span>
            <Button onClick={submitReservation} disabled={submitting || picked.length < 2}
              className="h-9 rounded-xl bg-neon-blue px-4 text-xs font-black text-primary-foreground hover:bg-neon-blue/90">
              <Plus className="mr-1 size-4" /> 예약하기
            </Button>
          </div>
          </div>
          )}
        </Card>
      )}

      {/* ── 예약 목록 (전원 열람) ── */}
      <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="size-4 text-amber-500" />
          <span className="text-sm font-black text-foreground">예약된 경기 ({reservations.length})</span>
        </div>
        {reservations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-[11px] text-muted-foreground">
            예약된 경기가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {reservations.map((r) => {
              const ids = participantsOf(r);
              const names = ids.map((id) => dn(byId.get(id))).join(" · ");
              const mine = !!myPlayerId && ids.includes(myPlayerId);
              const roster = isReservation(r);
              const notifier = r.notified_by ? dn(byId.get(r.notified_by)) : null;
              const cooling = !!r.notified_at && (Date.now() - new Date(r.notified_at).getTime() < 60_000);
              // 알림 버튼: 참가자 또는 관리자
              const canNotify = (mine || isClassManager) && !readOnly;
              const addable = students.filter((s) => !ids.includes(s.id) &&
                (!addSearch.trim() || dn(s).toLowerCase().includes(addSearch.trim().toLowerCase())));
              return (
                <div key={r.id} className={cn("rounded-xl border px-3 py-2.5",
                  mine ? "border-neon-blue/40 bg-neon-blue/5" : "border-border/30 bg-input/40")}>
                  <div className="flex items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-500">
                      <Hourglass className="size-3" /> 예약
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{names}</span>
                    {r.court && <span className="shrink-0 text-[10px] text-muted-foreground">{r.court}</span>}
                    {mine && <span className="shrink-0 rounded-full bg-neon-blue/15 px-1.5 text-[9px] font-black text-neon-blue">참가</span>}
                  </div>

                  {notifier && (
                    <p className="mt-1 text-[10px] font-bold text-neon-green">🔔 {notifier}님이 알림을 보냈어요{cooling ? " · 방금" : ""}</p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtWhen(r.created_at)}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {/* 알림 보내기: 참가자/관리자 모두, 1분 쿨다운(store 에서 강제) */}
                      {canNotify && (
                        <Button onClick={() => notifyReservation(r.id)} size="sm" disabled={cooling}
                          className={cn("h-7 rounded-lg px-2.5 text-[10px] font-black text-white",
                            cooling ? "bg-amber-500/40" : "bg-amber-500 hover:bg-amber-500/90")}>
                          <BellRing className="mr-0.5 size-3" /> {cooling ? "잠시 후" : "알림"}
                        </Button>
                      )}
                      {/* 참가 / 나가기 (인원 소집 예약만) */}
                      {roster && myPlayerId && !mine && (
                        <Button onClick={() => joinReservation(r.id)} size="sm"
                          className="h-7 rounded-lg bg-neon-blue px-2.5 text-[10px] font-black text-white hover:bg-neon-blue/90">
                          <Plus className="mr-0.5 size-3" /> 참가
                        </Button>
                      )}
                      {/* 관리자: 사람 추가 */}
                      {roster && isClassManager && !readOnly && (
                        <Button onClick={() => { setAddingTo(addingTo === r.id ? null : r.id); setAddSearch(""); }} size="sm" variant="ghost"
                          className="h-7 rounded-lg border border-border/50 px-2 text-[10px] font-black text-muted-foreground hover:text-foreground">
                          <Plus className="size-3" /> 추가
                        </Button>
                      )}
                      {canRecord && (
                        <Button onClick={() => openResultInput(r)} size="sm"
                          className="h-7 rounded-lg bg-neon-green px-2.5 text-[10px] font-black text-white hover:bg-neon-green/90">
                          <Trophy className="mr-0.5 size-3" /> 결과 입력
                        </Button>
                      )}
                      {/* 취소/나가기: 눌러서 팝업으로 선택. 관리자는 아무 예약이나, 회원은 본인 참가 예약만 */}
                      {(isClassManager || (roster && canReserve && mine)) && (
                        <Button onClick={() => setConfirmCancel(r)} variant="ghost" size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive" title="예약 취소 / 나가기">
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 관리자 사람 추가 인라인 선택 */}
                  {addingTo === r.id && (
                    <div className="mt-2 rounded-lg border border-border/40 bg-background/40 p-2">
                      <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="추가할 회원 검색..."
                        className="mb-2 h-8 border-border/50 bg-input text-xs" />
                      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                        {addable.slice(0, 40).map((s) => (
                          <button key={s.id} onClick={async () => { const ok = await joinReservation(r.id, s.id); if (ok) setAddingTo(null); }}
                            className="rounded-full border border-border/40 px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-neon-blue/50 hover:text-neon-blue">
                            {dn(s)}{s.group ? ` · ${s.group}` : ""}
                          </button>
                        ))}
                        {addable.length === 0 && <span className="text-[11px] text-muted-foreground">추가할 회원이 없어요.</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>


      {/* ── 경기 결과 보기 (맨 아래 · 입력 버튼과 수미상관) ── 클릭 시 팝업 */}
      <Button onClick={() => setResultsOpen(true)}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-tier-diamond to-neon-blue text-base font-black text-primary-foreground glow-primary transition-all hover:opacity-90 active:scale-[0.99]">
        <ClipboardList className="mr-2 size-5" /> 경기 결과 보기
      </Button>

      {/* 경기 결과 보기 모달 */}
      {resultsOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative my-8 w-full max-w-lg rounded-2xl border border-border/50 bg-background p-4 shadow-2xl sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-black text-foreground">
                <ClipboardList className="size-5 text-neon-blue" /> 경기 결과 보기
              </h3>
              <div className="flex items-center gap-3">
                {myPlayerId && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground select-none">
                    <input type="checkbox" checked={mineOnly}
                      onChange={(e) => { setMineOnly(e.target.checked); setRecentVisible(5); }}
                      className="size-3.5 accent-neon-blue" />
                    내 기록
                  </label>
                )}
                <button onClick={() => setResultsOpen(false)} className="text-muted-foreground hover:text-foreground" title="닫기">
                  <X className="size-5" />
                </button>
              </div>
            </div>
            {recent.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/30 py-8 text-center text-[11px] text-muted-foreground">
                {mineOnly && myPlayerId ? "아직 내 경기 기록이 없습니다. ‘내 기록’을 해제하면 전체를 볼 수 있어요." : "아직 기록된 경기가 없습니다."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {recent.slice(0, recentVisible).map((m) => {
                  const winners = [m.playerAId, m.playerA2Id].filter(Boolean).map((id) => dn(byId.get(id as string))).join("·");
                  const losers = [m.playerBId, m.playerB2Id].filter(Boolean).map((id) => dn(byId.get(id as string))).join("·");
                  return (
                    <button key={m.id} onClick={() => openMatch(m)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border/30 bg-input/40 px-3 py-2 text-left transition-all hover:border-neon-blue/40 active:scale-[0.99]">
                      <span className="text-[10px] text-muted-foreground shrink-0 w-16">{fmtWhen(m.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-win">{winners}</span>
                      <span className="shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">{m.scoreA}:{m.scoreB}</span>
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-bold text-loss">{losers}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
                {recent.length > recentVisible && (
                  <button onClick={() => setRecentVisible((c) => c + 5)}
                    className="mt-1 w-full rounded-lg border border-border/40 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                    더보기 ({recent.length - recentVisible})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 결과 입력 모달 */}
      {recordOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-border/50 bg-background p-4 shadow-2xl sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-black text-foreground">
                {activeReservation ? "예약 경기 결과 입력" : "경기 결과 입력"}
              </h3>
              <button onClick={() => { setRecordOpen(false); setActiveReservation(null); }}
                className="text-muted-foreground hover:text-foreground" title="닫기">
                <X className="size-5" />
              </button>
            </div>
            {activeReservation && (
              <p className="mb-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                예약 참가자: {(activeReservation.player_ids || []).map((id) => dn(byId.get(id))).join(" · ")} — 실제 팀을 확정해 입력하세요.
              </p>
            )}
            <RecordMatch
              students={students}
              onRecord={handleRecord}
              initials={initials}
              onClearInitials={noop}
              thresholds={tierThresholds}
              rpVariables={rpVariables}
              onUpdateGender={updateStudentGender}
              lockedPlayerId={lockedPlayerId}
              onCloseResult={() => { setRecordOpen(false); setActiveReservation(null); setDirectInitials(null); }}
            />
          </div>
        </div>
      )}

      {/* 경기 상세 — 저장된 영수증(rpBreakdown)이 있으면 그대로, 없으면 Match에서 재구성해 동일 팝업으로 */}
      {presetResult && (
        <RecordMatch
          students={students}
          onRecord={() => undefined}
          thresholds={tierThresholds}
          rpVariables={rpVariables}
          onUpdateGender={updateStudentGender}
          presetResult={presetResult}
          onCloseResult={() => setPresetResult(null)}
        />
      )}

      {/* 예약 정리 확인 팝업 — 전체 취소 / 나만 빠지기 */}
      {confirmCancel && (() => {
        const r = confirmCancel;
        const ids = participantsOf(r);
        const iAmIn = !!myPlayerId && ids.includes(myPlayerId) && isReservation(r);
        return (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setConfirmCancel(null)}>
            <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-black text-foreground">예약을 정리할까요?</h3>
              <p className="mt-1.5 truncate text-xs font-bold text-muted-foreground">{ids.map((id) => dn(byId.get(id))).join(" · ")}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {iAmIn
                  ? "예약을 통째로 접거나, 나만 살짝 빠질 수 있어요. 내가 빠져서 혼자만 남으면 예약은 저절로 사라져요."
                  : "이 예약을 취소하면 목록에서 사라져요."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {iAmIn && (
                  <Button onClick={async () => { await leaveReservation(r.id); setConfirmCancel(null); }}
                    className="h-10 rounded-xl bg-neon-blue text-sm font-black text-white hover:bg-neon-blue/90">
                    나만 빠질게요
                  </Button>
                )}
                <Button onClick={async () => { await cancelReservation(r.id); setConfirmCancel(null); }}
                  className="h-10 rounded-xl bg-destructive text-sm font-black text-white hover:bg-destructive/90">
                  예약 통째로 취소
                </Button>
                <button type="button" onClick={() => setConfirmCancel(null)}
                  className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                  그대로 둘게요
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
