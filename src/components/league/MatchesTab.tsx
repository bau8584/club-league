import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { X, Trophy, ChevronRight, ClipboardList } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { RecordMatch, type MatchResultData, type PlayerResult } from "./RecordMatch";
import { SessionCard } from "./SessionCard";
import { getTier, type Match, type Student } from "@/lib/league-types";
import { useLeagueTerms, useIsSchoolLeague } from "@/lib/league-terms";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Initials = {
  playerAId: string;
  playerBId: string;
  playerA2Id?: string;
  playerB2Id?: string;
  matchType?: "single" | "double";
};

export function MatchesTab({
  incomingInitials,
  onConsumeInitials,
  openMatchId,
  onConsumeMatchId,
}: {
  incomingInitials?: Initials | null;
  onConsumeInitials?: () => void;
  openMatchId?: string | null;
  onConsumeMatchId?: () => void;
} = {}) {
  const {
    session,
    students,
    deletedById,
    matches,
    scheduledMatches,
    tierThresholds,
    rpVariables,
    matchInputMode,
    isClassManager,
    myPlayerId,
    currentViewSeason,
    recordMatch,
    updateStudentGender,
    createReservation,
    cancelReservation,
    linkReservationResult,
    leaveReservation,
    joinReservation,
    notifyReservation,
  } = useLeagueStore();
  const terms = useLeagueTerms();
  const isSchool = useIsSchoolLeague();
  const readOnly = currentViewSeason !== "현재 시즌";
  const canReserve =
    (isClassManager || (matchInputMode !== "admin-only" && !!myPlayerId)) && !readOnly;
  const canRecord = (isClassManager || matchInputMode !== "admin-only") && !readOnly;

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s)); // 삭제된 회원 이름 먼저
    students.forEach((s) => m.set(s.id, s)); // 활성 회원이 우선
    return m;
  }, [students, deletedById]);

  // 예약(참가자 풀 player_ids) / 관리자 대진(팀 확정 player_a_id…) 양쪽의 참가자 id를 통일해 얻는다.
  const participantsOf = useCallback(
    (r: (typeof scheduledMatches)[number]): string[] =>
      (r.player_ids?.length ?? 0) > 0
        ? ((r.player_ids || []).filter(Boolean) as string[])
        : ([r.player_a_id, r.player_a2_id, r.player_b_id, r.player_b2_id].filter(
            Boolean,
          ) as string[]),
    [],
  );
  const isReservation = (r: (typeof scheduledMatches)[number]) => (r.player_ids?.length ?? 0) > 0;

  // ── 예약 목록(전원 열람) ── 회원 예약 + 관리자 대진(모두 waiting|called)
  const reservations = useMemo(
    () =>
      scheduledMatches
        .filter((m) => m.status === "waiting" || m.status === "called")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [scheduledMatches],
  );

  // ── 결과 입력 모달 ──
  const [recordOpen, setRecordOpen] = useState(false);
  const [activeReservation, setActiveReservation] = useState<
    (typeof scheduledMatches)[number] | null
  >(null);
  // 매치 추천 등 외부에서 넘어온 프리필(예약과 무관한 직접 기록)
  const [directInitials, setDirectInitials] = useState<Initials | null>(null);
  // 같은 줄을 다시 눌러도 폼이 채워지도록 프리필 객체를 새로 만들게 하는 값.
  // (RecordMatch 의 프리필 effect 가 initials 의 객체 동일성으로 재실행된다)
  const [prefillNonce, setPrefillNonce] = useState(0);
  // 자율(free) 모드의 비관리자는 '내가 낀 경기'만 기록 — 슬롯 A를 본인으로 고정.
  // (예약 결과 입력은 참가자가 이미 정해져 있으므로 고정하지 않음)
  const lockedPlayerId =
    !isClassManager && matchInputMode === "free" && !activeReservation ? myPlayerId : null;

  const initials = useMemo(() => {
    if (!activeReservation) return directInitials;
    const r = activeReservation;
    const type = r.match_type === "single" ? "single" : "double";
    // 관리자 대진: 팀(A vs B)이 이미 확정 → 그대로 프리필
    if (!isReservation(r) && r.player_a_id && r.player_b_id) {
      if (type === "double" && r.player_a2_id && r.player_b2_id) {
        return {
          playerAId: r.player_a_id,
          playerA2Id: r.player_a2_id,
          playerBId: r.player_b_id,
          playerB2Id: r.player_b2_id,
          matchType: "double" as const,
        };
      }
      return { playerAId: r.player_a_id, playerBId: r.player_b_id, matchType: "single" as const };
    }
    // 회원 예약: 참가자 풀에서 순서대로 팀 추정
    const ids = (r.player_ids || []).filter(Boolean) as string[];
    if (type === "double" && ids.length >= 4) {
      return {
        playerAId: ids[0],
        playerA2Id: ids[1],
        playerBId: ids[2],
        playerB2Id: ids[3],
        matchType: "double" as const,
      };
    }
    if (ids.length >= 2)
      return { playerAId: ids[0], playerBId: ids[1], matchType: "single" as const };
    return null;
    // prefillNonce: 같은 예약을 다시 골랐을 때도 새 객체를 만들어 폼을 다시 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReservation, directInitials, prefillNonce]);

  const openResultInput = (reservation: (typeof scheduledMatches)[number] | null) => {
    setActiveReservation(reservation);
    setDirectInitials(null);
    setRecordOpen(true);
  };

  // 큐 줄의 [결과 입력]. school 은 결과 입력 폼이 같은 화면에 이미 있으므로 모달을 띄우지
  // 않고 그 폼을 채운다 — "경기 끝남 → 결과 등록 → 다음이 올라옴"이 한 화면에서 돌아야 한다.
  // 아래 폼에 사람이 직접 고른 선수·점수가 남아 있는지. 남아 있는데 큐 줄을 누르면
  // 프리필이 그걸 말없이 지운다 — 선택 도중 [결과 입력]을 누른 사람이 겪던 충돌이다.
  const [formDirty, setFormDirty] = useState(false);
  // 덮어쓰기 확인을 기다리는 큐 줄.
  const [pendingRow, setPendingRow] = useState<(typeof scheduledMatches)[number] | null>(null);

  // 결과를 등록하고 영수증을 닫으면 대기열로 돌아간다 — 단, 방금 등록한 경기가 큐의
  // 줄이었을 때만. 학교에서는 폼이 큐 아래 같은 화면에 있어서, 결과를 넣고 나면 다음
  // 아이가 와서 자기 줄을 눌러야 하는데 화면이 폼에 머물러 있으면 아래에서 이름을 찾기
  // 시작한다. 큐와 무관하게 손으로 넣는 경우(연속 입력)는 폼에 그대로 둔다 — 올려 보내면
  // 매번 다시 내려와야 한다. 동호회는 폼이 팝업이라 닫히면 이미 목록이므로 해당 없다.
  const queueCardRef = useRef<HTMLDivElement>(null);
  const lastRecordWasQueued = useRef(false);

  const applyQueueRow = (row: (typeof scheduledMatches)[number]) => {
    setActiveReservation(row);
    setDirectInitials(null);
    setPrefillNonce((n) => n + 1);
    // 화면을 폼으로 옮기는 일은 RecordMatch 가 직접 한다. 여기서 옮기면
    // 프리필이 반영되기 전(빈 폼)을 기준으로 좌표가 잡혀 어떨 땐 키패드까지,
    // 어떨 땐 이름에서 멈추는 문제가 있었다.
    if (!isSchool) setRecordOpen(true);
  };

  const openQueueRow = (row: (typeof scheduledMatches)[number]) => {
    // 같은 화면에 폼이 떠 있는 school 에서만 덮어쓸 것이 있다. 모달을 쓰는 쪽은 그대로.
    if (isSchool && formDirty) return setPendingRow(row);
    applyQueueRow(row);
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
  const noop = useCallback(() => {
    /* initials 유지 */
  }, []);

  // recordMatch 래퍼: 기록 성공 시 예약에 결과 연결 + 참가자에게 결과 푸시
  const handleRecord = (
    a: string,
    b: string,
    sa: number,
    sb: number,
    a2?: string,
    b2?: string,
    type?: "single" | "double",
  ): Match | undefined => {
    const m = recordMatch(a, b, sa, sb, a2, b2, type);
    if (!m) return m;

    // 어느 줄의 경기인가는 "누가 뛰었나"로 정한다. 팀이 어느 쪽이든, 짝의 순서가
    // 어떻든, 같은 사람들이면 같은 경기다.
    const played = new Set([a, a2, b, b2].filter(Boolean) as string[]);
    const isSameMatch = (r: (typeof scheduledMatches)[number]) => {
      const parts = participantsOf(r);
      return parts.length === played.size && parts.every((id) => played.has(id));
    };
    // 1순위: 줄의 [결과 입력]으로 넘어온 그 줄. 단, 폼에서 선수를 갈아끼웠다면 그
    //        줄의 경기가 아니다 — 엉뚱한 줄을 지우고 엉뚱한 사람에게 알림을 보내면 안 된다.
    // 2순위: 줄을 누르지 않고 폼에서 직접 같은 사람들을 골라 넣은 경우. 지금까지는
    //        이러면 줄이 남았다 — 아이들이 결과를 넣고도 대기열에 자기 이름이 그대로
    //        있어 두 번 넣거나 선생님이 손으로 지워야 했다. 앞줄부터 찾는다(같은 사람들이
    //        두 번 잡혀 있으면 먼저 잡힌 줄이 먼저 뛴 것이다).
    const target =
      (activeReservation && isSameMatch(activeReservation) ? activeReservation : null) ??
      [...reservations]
        .sort((x, y) => (x.seq ?? Infinity) - (y.seq ?? Infinity) || x.created_at.localeCompare(y.created_at))
        .find(isSameMatch) ??
      null;

    lastRecordWasQueued.current = !!target;
    if (target) {
      const winners = [a, a2]
        .filter(Boolean)
        .map((id) => dn(byId.get(id as string)))
        .join("·");
      const summary = `${winners} 승 · ${sa}:${sb}`;
      linkReservationResult(target.id, m.id, participantsOf(target), summary);
    } else if (activeReservation) {
      // 줄에서 넘어왔는데 다른 사람들로 기록했고, 그 사람들의 줄도 따로 없다 →
      // 넘어온 줄은 대기열에 그대로 두고 연결만 끊는다.
      toast.info("선수가 대기열의 대진과 달라 그 줄은 남겨 두었어요.");
    }
    // 큐와의 연결은 여기서 끝난다. 다음 입력이 이미 사라진 줄에 다시 붙으면 안 된다.
    setActiveReservation(null);
    return m;
  };

  // ── 경기 결과 보기 (맨 아래 버튼 → 팝업) ──
  const [resultsOpen, setResultsOpen] = useState(false); // 팝업 열림 여부
  const [mineOnly, setMineOnly] = useState(true); // 기본: 내 경기만
  const [recentVisible, setRecentVisible] = useState(5);
  const [presetResult, setPresetResult] = useState<MatchResultData | null>(null);

  // 옛 경기(영수증 rpBreakdown 없음)를 현재 결과보기 팝업으로 띄우기 위한 Match → MatchResultData 변환.
  // 보너스 세부 내역은 없으므로 기본 승/패 RP만 표시된다.
  const mkPlayerResult = (
    studentId: string | undefined,
    rpDelta: number,
    score: number,
    won: boolean,
  ): PlayerResult => {
    const s = studentId ? byId.get(studentId) : null;
    const finalRp = s?.rp ?? 1000;
    const prevRp = finalRp - rpDelta;
    return {
      name: s ? dn(s) : `탈퇴한 ${terms.member}`,
      group: s?.group ?? null,
      gender: s?.gender ?? "U",
      prevRp,
      finalRp,
      prevTier: getTier(prevRp, tierThresholds),
      finalTier: getTier(finalRp, tierThresholds),
      promoted: false,
      score,
      rpDelta,
      underdogBonus: 0,
      scoreDiffBonus: 0,
      rivalBonus: 0,
      firstWinBonus: 0,
      revengeBonus: 0,
      freshnessBonus: 0,
      streakBonus: 0,
      comebackBonus: 0,
      marginBonus: 0,
      mentoringBonus: 0,
      baseWin: won ? Math.max(0, rpDelta) : 0,
      baseLoss: won ? 0 : Math.max(0, -rpDelta),
      unranked: false,
      placementDone: 0,
      placementNeed: 0,
    };
  };
  const buildResultFromMatch = (m: Match): MatchResultData => {
    const isDouble = m.matchType === "double" || !!m.playerA2Id || !!m.playerB2Id;
    const wDelta = m.rpDeltaA ?? rpVariables.winDelta;
    const lDelta = m.rpDeltaB ?? -rpVariables.loseDelta;
    return {
      matchType: isDouble ? "double" : "single",
      winner: mkPlayerResult(m.playerAId, wDelta, m.scoreA, true),
      winner2: m.playerA2Id
        ? mkPlayerResult(m.playerA2Id, m.rpDeltaA2 ?? wDelta, m.scoreA, true)
        : undefined,
      loser: mkPlayerResult(m.playerBId, lDelta, m.scoreB, false),
      loser2: m.playerB2Id
        ? mkPlayerResult(m.playerB2Id, m.rpDeltaB2 ?? lDelta, m.scoreB, false)
        : undefined,
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
    if (m) {
      openMatch(m);
      onConsumeMatchId?.();
    }
    // matches 로딩 후 잡히도록 matches 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMatchId, matches]);

  const recent = useMemo(() => {
    const all = [...matches].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    if (mineOnly && myPlayerId) {
      return all.filter((m) =>
        [m.playerAId, m.playerA2Id, m.playerBId, m.playerB2Id].includes(myPlayerId),
      );
    }
    return all;
  }, [matches, mineOnly, myPlayerId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── 경기 결과 입력 ── school: 버튼→팝업 대신 경기장 탭에 폼을 바로 노출 */}
      {/* ── 오늘 수업(출석 → 대진) ── 경기 탭 상단.
           지금은 학교 리그에만 (동호회는 예약 목록과 합칠 때 함께).
           관리자냐 아니냐는 카드 안에서 갈린다 — 학생에게는 대기열만 보인다. */}
      {isSchool && !readOnly && (
        <div ref={queueCardRef}>
          <SessionCard canManage={isClassManager} onRecordRow={openQueueRow} />
        </div>
      )}

      {canRecord && isSchool && (
        <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
              <Trophy className="size-5" />
            </div>
            <h2 className="text-base font-black tracking-tight text-foreground">
              경기 결과 입력하기
            </h2>
          </div>
          <RecordMatch
            students={students}
            onRecord={handleRecord}
            initials={initials}
            onClearInitials={noop}
            thresholds={tierThresholds}
            rpVariables={rpVariables}
            onUpdateGender={updateStudentGender}
            lockedPlayerId={lockedPlayerId}
            onDirtyChange={setFormDirty}
            onCloseResult={() => {
              if (!lastRecordWasQueued.current) return;
              lastRecordWasQueued.current = false;
              queueCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </Card>
      )}

      {/* 대기열 줄로 폼을 덮어쓰기 전 확인 — 선택 중에 [결과 입력]을 눌러 입력이
          통째로 날아가던 자리다. */}
      {pendingRow && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setPendingRow(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">입력 중인 내용을 바꿀까요?</h3>
            <p className="mt-1.5 truncate text-xs font-bold text-muted-foreground">
              {participantsOf(pendingRow)
                .map((id) => dn(byId.get(id)))
                .join(" · ")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              아래 폼에 고르던 선수와 점수가 이 대진으로 덮어써져요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={() => {
                  applyQueueRow(pendingRow);
                  setPendingRow(null);
                }}
                className="h-11 w-full rounded-xl bg-neon-blue text-sm font-black text-primary-foreground hover:bg-neon-blue/90"
              >
                이 대진으로 바꾸기
              </Button>
              <Button
                onClick={() => setPendingRow(null)}
                variant="outline"
                className="h-11 w-full rounded-xl border-border/50 text-sm font-black"
              >
                입력 중인 내용 유지
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── 대기열 (동호회) ── 회원 예약·운영진 소집·뽑힌 대진이 한 목록. 학교는 위에서 그렸다. */}
      {!isSchool && !readOnly && (
        <SessionCard canManage={isClassManager} canReserve={canReserve} onRecordRow={openQueueRow} />
      )}

      {canRecord && !isSchool && (
        <Button
          onClick={() => openResultInput(null)}
          className="h-14 w-full rounded-2xl bg-gradient-to-r from-neon-blue to-tier-diamond text-base font-black text-primary-foreground glow-primary transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <Trophy className="mr-2 size-5" /> 경기 결과 입력하기
        </Button>
      )}

      {/* ── 경기 결과 보기 (맨 아래 · 입력 버튼과 수미상관) ── 클릭 시 팝업. 학교 리그는 잠시 숨김 */}
      {!isSchool && (
        <Button
          onClick={() => setResultsOpen(true)}
          className="h-14 w-full rounded-2xl bg-gradient-to-r from-tier-diamond to-neon-blue text-base font-black text-primary-foreground glow-primary transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <ClipboardList className="mr-2 size-5" /> 경기 결과 보기
        </Button>
      )}

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
                    <input
                      type="checkbox"
                      checked={mineOnly}
                      onChange={(e) => {
                        setMineOnly(e.target.checked);
                        setRecentVisible(5);
                      }}
                      className="size-3.5 accent-neon-blue"
                    />
                    내 기록
                  </label>
                )}
                <button
                  onClick={() => setResultsOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  title="닫기"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
            {recent.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/30 py-8 text-center text-[11px] text-muted-foreground">
                {mineOnly && myPlayerId
                  ? "아직 내 경기 기록이 없습니다. ‘내 기록’을 해제하면 전체를 볼 수 있어요."
                  : "아직 기록된 경기가 없습니다."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {recent.slice(0, recentVisible).map((m) => {
                  const winners = [m.playerAId, m.playerA2Id]
                    .filter(Boolean)
                    .map((id) => dn(byId.get(id as string)))
                    .join("·");
                  const losers = [m.playerBId, m.playerB2Id]
                    .filter(Boolean)
                    .map((id) => dn(byId.get(id as string)))
                    .join("·");
                  return (
                    <button
                      key={m.id}
                      onClick={() => openMatch(m)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border/30 bg-input/40 px-3 py-2 text-left transition-all hover:border-neon-blue/40 active:scale-[0.99]"
                    >
                      <span className="text-[10px] text-muted-foreground shrink-0 w-16">
                        {fmtWhen(m.date)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-win">
                        {winners}
                      </span>
                      <span className="shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">
                        {m.scoreA}:{m.scoreB}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-bold text-loss">
                        {losers}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
                {recent.length > recentVisible && (
                  <button
                    onClick={() => setRecentVisible((c) => c + 5)}
                    className="mt-1 w-full rounded-lg border border-border/40 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
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
          {/* 넓은 화면에서는 대진/선수목록을 좌우로 펴야 하므로 팝업도 함께 넓힌다. */}
          <div className="relative my-8 w-full max-w-2xl lg:max-w-5xl rounded-2xl border border-border/50 bg-background p-4 shadow-2xl sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-black text-foreground">
                {activeReservation ? "예약 경기 결과 입력" : "경기 결과 입력"}
              </h3>
              <button
                onClick={() => {
                  setRecordOpen(false);
                  setActiveReservation(null);
                }}
                className="text-muted-foreground hover:text-foreground"
                title="닫기"
              >
                <X className="size-5" />
              </button>
            </div>
            {activeReservation && (
              <p className="mb-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                예약 참가자:{" "}
                {(activeReservation.player_ids || []).map((id) => dn(byId.get(id))).join(" · ")} —
                실제 팀을 확정해 입력하세요.
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
              onCloseResult={() => {
                setRecordOpen(false);
                setActiveReservation(null);
                setDirectInitials(null);
              }}
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

    </div>
  );
}
