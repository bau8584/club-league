import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BellRing, Check, ChevronDown, ChevronRight, CircleHelp, ListChecks, Pencil, Plus, UserPlus, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { teamsOf, useQueueRows } from "@/lib/use-queue-rows";
import { sortStudentsForRoster, type ScheduledMatch, type Student } from "@/lib/league-types";
import { liveSession } from "@/lib/session-today";
import type { AssignmentPreset } from "@/domain/assignment-calculator";
import { REGROUP_NEEDS_CONFIRM, roundGamesKeepingOut, separateGamesKeepingOut } from "@/domain/round-size";
import { countByGender, separateRoundBreakdown, type GenderCounts } from "@/domain/gender-split";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

/**
 * 줄의 고정 번호. #7 은 앞줄이 빠져도 계속 #7 이라, 아이가 "우리 7번"만 기억하면 된다.
 *
 * ①②③ 원문자를 쓰지 않는다. 20까지만 원문자고 그 뒤는 모양이 무너지는데, 고정 번호는
 * 한 수업에 쉽게 20을 넘는다.
 *
 * 번호 없는 줄(회원 예약 등)은 자리만 비워 둔다. 없는 번호를 지어내면 그 번호로 부른다.
 */
function seqMark(seq?: number | null): string {
  return seq == null ? "" : `#${seq}`;
}

/**
 * 세 프리셋은 "무엇을 먼저 보느냐"의 순서가 다를 뿐이다.
 * - 다양성: 안 만난 사람 > 적게 뛴 사람 > 실력
 * - 밸런스: 적게 뛴 사람 > 실력 균형 > 안 만난 사람
 * - 실력:   실력 > 안 만난 사람 > 적게 뛴 사람
 *
 * "실력"이 무엇인지는 리그마다 다르다 — 급수를 둔 리그는 급수, 아니면 RP.
 * 이름만 보고 "실력이 뭔데?"를 묻지 않도록 설명에 기준을 박아 둔다.
 */
const PRESETS: {
  value: AssignmentPreset;
  label: string;
  hint: (skill: string) => string;
}[] = [
  { value: "diversity", label: "다양성", hint: () => "아직 안 만난 사람끼리. 실력은 너무 벌어지지만 않게." },
  { value: "balanced", label: "밸런스", hint: (s) => `골고루 뛰고, ${s}도 맞춰서.` },
  { value: "skill", label: "실력", hint: (s) => `${s}가 비슷한 사람끼리 팽팽하게.` },
];

/**
 * [한 바퀴]가 지금 몇 경기이고 누가 남는지 한 줄. "보장"이 아니라 "이만큼이면 들어갈
 * 수 있다"는 안내다 — [실력]은 판 수를 뒤에 보므로 같은 사람이 두 번 들어갈 수 있다.
 * 놀고 있는 사람이 한 경기 인원도 안 되면 바퀴가 없고, [+1경기]는 이미 줄에 선 사람으로
 * 다음 판을 미리 잡는다(계산기가 판 수 적은 순으로 다시 쓴다).
 */
function roundHint(free: number, perMatch: number, queued: number): string {
  const all = Math.floor(free / perMatch);
  if (all === 0) return "놀고 있는 사람이 모자라요. [+1]은 이미 줄에 선 사람으로 다음 판을 미리 잡아요.";
  const rounds = roundGamesKeepingOut(all, free, perMatch, queued);
  if (rounds === 0) return "방금 끝난 친구들끼리만 남아 있어요. 다음 경기가 끝나면 섞어서 넣어요.";
  if (rounds < all) return `채우기 = ${rounds}경기 · ${free - rounds * perMatch}명은 남겨 두었다가 다음에 끝난 친구들과 섞어요.`;
  const rest = free - rounds * perMatch;
  return rest === 0
    ? `채우기 = ${rounds}경기 · 놀고 있는 ${free}명 전원이 한 번씩.`
    : `채우기 = ${rounds}경기 · ${free - rest}명이 한 번씩, ${rest}명은 다음에.`;
}

/** 남녀 따로일 때의 안내 — 남 몇 경기·여 몇 경기, 미지정은 자리 남는 쪽에. */
function separateRoundHint(free: GenderCounts, queued: { m: number; f: number }, perMatch: number): string {
  const { m, f } = separateGamesKeepingOut(free, queued, perMatch);
  if (m + f === 0) {
    const all = separateRoundBreakdown(free, perMatch);
    return all.m + all.f > 0
      ? "남녀 따로 · 방금 끝난 친구들끼리만 남아 있어요. 다음 경기가 끝나면 섞어서 넣어요."
      : "남녀 따로 · 남자도 여자도 한 경기 인원이 안 돼요. [+1]은 이미 줄에 선 사람으로 잡아요.";
  }
  const u = free.u > 0 ? ` · 미지정 ${free.u}명은 자리 남는 쪽에` : "";
  return `남녀 따로 · 남 ${m}경기 · 여 ${f}경기${u}`;
}

/** 모두 동시에 — 라운드 안내. 줄이 남아 있으면 진행 중, 비면 다음 라운드 크기. */
function simulHint(queued: number, rounds: number, free: number, perMatch: number): string {
  if (queued > 0) return `라운드 진행 중 · ${queued}경기 남았어요. 다 끝나면 [다음 라운드]를 눌러요.`;
  if (rounds === 0) return "놀고 있는 사람이 한 경기 인원도 안 돼요.";
  const rest = free - rounds * perMatch;
  return rest === 0 ? `다음 라운드 = ${rounds}경기 · ${free}명 전원.` : `다음 라운드 = ${rounds}경기 · ${rest}명은 쉬고 다음 라운드에 먼저.`;
}

const SIMUL_HELP =
  "가위바위보처럼 전원이 한 라운드를 같이 뛰어요. 라운드가 다 끝나야 다음 라운드를 짜요 — 먼저 끝난 친구들끼리 바로 붙이면 같은 친구들끼리만 계속 만나거든요. 결과를 못 넣은 줄은 [여러 줄 빼기]로 빼면 돼요.";

const ROUND_HELP =
  "[다음 경기 채우기] = 놀고 있는 사람 전원이 한 번씩 들어가는 만큼 뽑아요. 복식은 4명, 단식은 2명이 한 경기예요. 4명(2명)으로 안 나눠떨어지면 남는 사람은 다음에 먼저 들어가요. 줄에 경기가 남아 있으면 몇 명은 남겨 두었다가 다음에 끝난 친구들과 섞어요 — 같은 친구들끼리만 계속 만나지 않게요.";

/**
 * 대기열 — 순서 목록 하나.
 *
 * 진행 중/대기를 나누지 않는다. 코트에 누가 있는지는 고개를 돌리면 보이고,
 * 대기하는 사람에게 필요한 정보는 "내가 몇 번째냐" 하나다.
 * 위에서부터 코트에 들어가고, 결과가 등록되면 그 줄이 빠진다.
 *
 * 화면의 주인공은 줄 목록이다. 아이가 찾는 것은 번호와 자기 이름이라 번호를 굵게 세우고,
 * 뽑는 조작은 수업 중 한두 번 쓰는 것이라 카드 아래 한 줄로 낮춘다.
 */
export function MatchQueue({
  canManage,
  canRecord = false,
  onRecordRow,
}: {
  canManage: boolean;
  /** 회원 줄의 [점수 넣기]. "all" = 모든 줄, "mine" = 내가 낀 줄만(자율 모드), false = 없음(관리자만 입력). */
  canRecord?: "all" | "mine" | false;
  /** 줄의 [결과 입력] — 4명이 확정이므로 선수 선택 없이 바로 점수판으로 간다. */
  onRecordRow: (row: ScheduledMatch) => void;
}) {
  const {
    students,
    currentClassId,
    deletedById,
    myPlayerId,
    leagueType,
    levels,
    genderEnabled,
    assignmentSession: rawSession,
    fillAssignmentQueue,
    claimAutoRound,
    releaseAutoRound,
    removeScheduledMatch,
    removeScheduledMatches,
    endClassQueue,
    replaceQueuePlayer,
    matches,
    joinReservation,
    leaveReservation,
    notifyReservation,
    updateAssignmentSession,
  } = useLeagueStore();
  const isClub = leagueType !== "school";
  // 동호회의 지난주 세션은 없는 것으로 본다 — 명단이 없으니 뽑기 조작도 숨는다.
  const assignmentSession = liveSession(rawSession, isClub ? "club" : "school");

  // 대진 방식은 이 기기에 반(리그)별로 기억한다 — 새로고침할 때마다 처음으로 돌아가지 않게.
  const presetKey = currentClassId ? `queue-preset:${currentClassId}` : null;
  const [preset, setPresetState] = useState<AssignmentPreset>(() => {
    try {
      const saved = presetKey ? localStorage.getItem(presetKey) : null;
      if (saved && PRESETS.some((p) => p.value === saved)) return saved as AssignmentPreset;
    } catch { /* 저장소를 못 쓰면 기본값 */ }
    return leagueType === "school" ? "diversity" : "balanced";
  });
  // 첫 화면엔 아직 반 정보가 없다 → 반이 정해지는 순간 다시 읽는다.
  useEffect(() => {
    if (!presetKey) return;
    try {
      const saved = localStorage.getItem(presetKey);
      if (saved && PRESETS.some((p) => p.value === saved)) setPresetState(saved as AssignmentPreset);
    } catch { /* 저장소를 못 쓰면 그대로 */ }
  }, [presetKey]);
  const setPreset = (v: AssignmentPreset) => {
    setPresetState(v);
    try {
      if (presetKey) localStorage.setItem(presetKey, v);
    } catch { /* 기억 못 해도 동작엔 지장 없다 */ }
  };
  const [filling, setFilling] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  // 실력의 기준 — 급수를 둔 리그는 급수, 아니면 RP. 계산기(skillRating)와 같은 판단.
  const skillBasis = levels.length > 1 ? "급수" : "RP";
  // 줄에서 빼기 확인 팝업 대상. 삭제는 되돌릴 수 없으므로 한 번 묻는다.
  const [confirmRemove, setConfirmRemove] = useState<ScheduledMatch | null>(null);
  // 사람 바꾸기 팝업 대상 줄.
  const [editRow, setEditRow] = useState<ScheduledMatch | null>(null);
  // 팀 미정 줄(동호회 소집 예약)에 사람 더하기 팝업 대상 줄.
  const [addRow, setAddRow] = useState<ScheduledMatch | null>(null);
  // 회원이 자기 줄에서 나가기 확인.
  const [confirmLeave, setConfirmLeave] = useState<ScheduledMatch | null>(null);
  // 알림 보낸 뒤 잠깐 잠근다(스토어가 1분 쿨다운을 강제하지만 버튼도 같이 죽인다).
  const now = Date.now();
  // 여러 줄 빼기 — 고르는 중이면 Set, 아니면 null. 한 줄씩 × 를 누르면 폰에서 N번 확인해야 한다.
  const [picking, setPicking] = useState<Set<string> | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  // [수업 종료] 확인 팝업. 학교만 — 동호회는 12시간 지난 줄이 저절로 정리된다.
  const [confirmEnd, setConfirmEnd] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s));
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students, deletedById]);

  const { queue } = useQueueRows();

  // 코트 — 켜 두면 서버가 앞쪽 줄에 코트 번호를 붙인다. 여기서는 보여주기만 한다.
  const courtCount = assignmentSession?.court_count ?? null;
  // 점수입력판이 오늘 열려 있나 — 열려 있으면 줄이 없어도 [수업 종료]를 보여 QR까지 닫게 한다.
  const inputOpen = !!rawSession?.input_key
    && rawSession.input_key_day === new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [courtOpen, setCourtOpen] = useState(false);
  const callout = useCourtCallout(courtCount ? queue : []);

  // 지금 놀고 있는 사람. 기본 경기 수(한 바퀴)와 안내 문구의 바탕이다.
  const perMatch = assignmentSession?.match_type === "single" ? 2 : 4;
  const freeIds = useMemo(() => {
    const busy = new Set<string>();
    for (const r of queue) {
      const { teamA, teamB, pool } = teamsOf(r);
      for (const id of [...teamA, ...teamB, ...pool]) busy.add(id);
    }
    // 명단에서 빠진(전학·삭제) 학생은 오늘 명단에 id가 남아 있어도 세지 않는다.
    const alive = new Set(students.map((s) => s.id));
    return (assignmentSession?.player_ids ?? []).filter((id) => alive.has(id) && !busy.has(id));
  }, [queue, assignmentSession?.player_ids, students]);
  const free = freeIds.length;

  // 이름 옆 × — 그 사람을 빼고 놀고 있는 사람 중 오늘 가장 덜 뛴 사람을 자동으로 넣는다.
  // 남녀 따로면 같은 성별에서 고른다. 동점이면 무작위.
  const [subBusy, setSubBusy] = useState(false);
  const autoSubstitute = async (row: ScheduledMatch, outId: string) => {
    if (subBusy) return;
    const today = new Date().toDateString();
    const played = new Map<string, number>();
    for (const m of matches) {
      if (new Date(m.date).toDateString() !== today) continue;
      for (const id of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) if (id) played.set(id, (played.get(id) ?? 0) + 1);
    }
    const g = byId.get(outId)?.gender;
    let pool = freeIds;
    if (separate && (g === "M" || g === "F")) pool = pool.filter((id) => byId.get(id)?.gender === g);
    if (pool.length === 0) { toast.error("들어갈 사람이 없어요. 모두 줄에 서 있어요."); return; }
    const pick = [...pool]
      .map((id) => ({ id, n: played.get(id) ?? 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r)[0]!.id;
    setSubBusy(true);
    try {
      if (await replaceQueuePlayer(row.id, outId, pick)) toast.success(`${dn(byId.get(outId))} → ${dn(byId.get(pick))}`);
    } finally { setSubBusy(false); }
  };
  // 오늘 명단이 코트를 다 못 채우면 몇 개만 쓰는지 알려 준다(예: 10명·복식·코트 3 → 2개만).
  const rosterCount = useMemo(() => {
    const alive = new Set(students.map((s) => s.id));
    return (assignmentSession?.player_ids ?? []).filter((id) => alive.has(id)).length;
  }, [assignmentSession?.player_ids, students]);
  const usableCourts = Math.floor(rosterCount / perMatch);
  // 남녀 따로 — 세션 설정이 "따로"이고 이 리그가 성별을 쓸 때만(스토어와 같은 조건).
  const separate = assignmentSession?.gender_mode === "separate" && genderEnabled;
  const freeByGender = useMemo(
    () => countByGender(freeIds, (id) => byId.get(id)?.gender),
    [freeIds, byId],
  );
  /**
   * 한 바퀴 = 놀고 있는 사람 전원이 한 번씩, 남는 사람은 다음에. 25명 복식이면 6경기(1명 남음),
   * 단식이면 12경기. "모두 한 번 이상"(7경기, 3명은 두 번)이 아니다 — 바퀴라는 말이
   * "한 사람 한 번"이고, 두 번 들어갈 사람을 고르는 규칙이 따로 필요해진다.
   * 남녀 따로면 남 바퀴 + 여 바퀴. 실제 경기 수는 스토어가 같은 계산으로 다시 센다.
   */
  // 남녀 따로면 남녀를 따로 세어 각자 남긴다 — 스토어(fillAssignmentQueue)와 같은 규칙.
  const queuedByGender = useMemo(() => {
    const c = { m: 0, f: 0 };
    for (const r of queue) {
      const { teamA, teamB, pool } = teamsOf(r);
      const g = [...teamA, ...teamB, ...pool].map((id) => byId.get(id)?.gender).find((x) => x === "M" || x === "F");
      if (g !== "F") c.m++;
      if (g !== "M") c.f++;
    }
    return c;
  }, [queue, byId]);
  const roundCount = separate
    ? (({ m, f }) => m + f)(separateGamesKeepingOut(freeByGender, queuedByGender, perMatch))
    : roundGamesKeepingOut(Math.floor(free / perMatch), free, perMatch, queue.length);
  // [+1경기]가 같은 친구들끼리 재대결이라 멈췄을 때 — 넣을지 한 번 묻는 줄.
  const [regroupAsk, setRegroupAsk] = useState(false);
  // 줄이 바뀌면(경기가 끝나거나 들어가면) 물음은 낡는다 — 다시 누르면 그때 새로 판단한다.
  useEffect(() => setRegroupAsk(false), [queue.length]);
  // [한 바퀴] 옆 물음표를 누르면 뜨는 말풍선.
  const [helpOpen, setHelpOpen] = useState(false);

  // 버튼 잠금은 ref로 — filling(상태)은 다음 그림 때야 버튼을 막아서, 빠른 두 번 누름이 둘 다 들어갔다.
  const fillLock = useRef(false);
  const fill = async (n: number | "round", allowRegroup = false) => {
    if (fillLock.current) return 0;
    fillLock.current = true;
    setFilling(true);
    setRegroupAsk(false);
    try {
      // 종목·남녀는 세션 설정이다. 여기서는 경기 수만 정한다 — 한 바퀴는 스토어가 센다
      // (남녀 따로일 때 남 바퀴 + 여 바퀴를 여기와 같은 규칙으로 세므로 어긋날 일이 없다).
      const made = await fillAssignmentQueue(
        n === "round" ? { mode: "round", policy: preset } : { count: n, policy: preset, allowRegroup },
      );
      if (made === REGROUP_NEEDS_CONFIRM) setRegroupAsk(true);
      return made;
    } finally {
      fillLock.current = false;
      setFilling(false);
    }
  };

  // 한 바퀴 자동 — 코트를 쓰고 스위치를 켰을 때만. 대기 줄(코트에 못 든 줄)이 코트 수 − 1 이
  // 되면 붙인다. −1 인 까닭: 한 경기가 더 끝난 뒤라 그 조까지 한 바퀴 계산에 들어간다.
  // 여기서는 "때가 됐다"만 보고, 실제로 붙일 기기 하나는 서버가 고른다(두 화면 → 한 바퀴).
  // 모두 동시에(라운드제)면 줄이 다 빠졌을 때만 다음 라운드 — 자동 채우기·+1은 없다.
  const simul = assignmentSession?.queue_mode === "simultaneous";
  const autoRound = !simul && !!courtCount && assignmentSession?.auto_round === true;
  const waitingRows = courtCount ? Math.max(queue.length - courtCount, 0) : 0;
  // 허락을 받고도 0경기였던 줄 모양. 같은 모양이면 다시 묻지 않는다 — 안 그러면 0경기를 계속
  // 되풀이한다. 줄이 바뀌면(경기가 끝나거나 들어오면) 다시 묻는다.
  const queueSig = `${queue.length}:${queue.reduce((m, r) => Math.max(m, r.seq ?? 0), 0)}`;
  const [autoStuckAt, setAutoStuckAt] = useState<string | null>(null);
  const autoDue =
    autoRound && canManage && !filling && roundCount > 0 && waitingRows <= courtCount! - 1 && autoStuckAt !== queueSig;
  useEffect(() => {
    if (!autoDue) return;
    let cancelled = false;
    (async () => {
      // 내가 본 줄의 마지막 번호를 같이 보낸다 — 다른 기기가 방금 붙인 줄을 못 봤으면 서버가 거절한다.
      const seenSeq = queue.reduce((m, r) => Math.max(m, r.seq ?? 0), 0);
      if (!(await claimAutoRound(seenSeq))) return;
      // 허락은 받았는데 그새 줄이 바뀌었거나 0경기면 허락 표시를 되돌린다. 안 되돌리면 서버가
      // "이 번호에서는 이미 허락함"을 쥐고 있어 자동 채우기가 조용히 멈춘다.
      if (cancelled) { await releaseAutoRound(); return; }
      const made = await fill("round");
      if (made <= 0) {
        await releaseAutoRound();
        setAutoStuckAt(queueSig);
      }
    })();
    return () => { cancelled = true; };
    // fill 은 매 렌더 새로 만들어지지만 때(autoDue·줄 수)가 바뀔 때만 다시 묻는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDue, queue.length]);

  // 학교는 한 바퀴씩, 동호회는 몇 경기씩 그때그때. 자주 쓰는 쪽을 진하게.
  const roundPrimary = leagueType === "school" || simul;
  const roundBlocked = filling || roundCount === 0 || (simul && queue.length > 0);
  const primaryBtn = "bg-neon-blue text-primary-foreground hover:bg-neon-blue/90";
  const secondaryBtn = "border border-border/40 bg-transparent text-foreground hover:bg-muted/40";

  const currentPreset = PRESETS.find((p) => p.value === preset)!;

  return (
    <div>
      {courtCount != null && courtCount > 0 && rosterCount > 0 && usableCourts < courtCount && (
        <div className="mb-2 rounded-xl border border-neon-blue/40 bg-neon-blue/10 px-3 py-2 text-sm font-bold text-neon-blue">
          학생 {rosterCount}명 → 코트 {courtCount}개 중 {usableCourts}개만 써요
        </div>
      )}
      {/* 방금 코트가 빈 줄 — 선생님 화면에서는 확인용 한 줄. 크게는 교실 화면이 띄운다. */}
      {callout.length > 0 && (
        <div className="mb-2 rounded-xl border border-neon-green/50 bg-neon-green/10 px-3 py-2 text-sm font-black text-neon-green animate-in fade-in duration-200">
          코트 들어가세요 →{" "}
          {callout
            .map((c) => {
              const r = queue.find((x) => x.seq === c.seq);
              const tag = c.seq != null ? `[대기열 ${c.seq}번] ` : "";
              if (!r) return tag;
              const { teamA, teamB, pool } = teamsOf(r);
              const nm = (ids: string[]) => ids.map((id) => dn(byId.get(id))).join(", ");
              return tag + (teamA.length && teamB.length ? `${nm(teamA)} vs ${nm(teamB)}` : nm(pool));
            })
            .join(" / ")}
        </div>
      )}
      {/*
        태블릿 가로에서는 두 줄씩. 이름 넷이 든 줄은 400px 이면 충분한데 카드는 1,300px 이라,
        한 줄에 하나씩 세우면 오른쪽 2/3 가 비고 세로만 길어진다. 폰은 한 줄이다.
      */}
      {queue.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {queue.map((r) => {
            const { teamA, teamB, pool } = teamsOf(r);
            const confirmed = teamA.length > 0 && teamB.length > 0;
            const mine = !!myPlayerId && [...teamA, ...teamB, ...pool].includes(myPlayerId);
            const nameOf = (id: string) => dn(byId.get(id));
            const court = courtCount ? r.court : null;
            // 관리자 화면의 팀 확정 줄은 이름마다 × (빼고 자동으로 다른 사람).
            const subbable = canManage && confirmed && !picking;
            const nameNode = (id: string) =>
              subbable ? (
                <span key={id} className="inline-flex items-center">
                  {nameOf(id)}
                  <button
                    type="button"
                    disabled={subBusy}
                    onClick={(e) => { e.stopPropagation(); autoSubstitute(r, id); }}
                    aria-label={`${nameOf(id)} 빼고 다른 사람 넣기`}
                    className="ml-0.5 flex size-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ) : (
                <span key={id}>{nameOf(id)}</span>
              );
            const joinNodes = (ids: string[]) =>
              ids.flatMap((id, i) => (i === 0 ? [nameNode(id)] : [<span key={`d${id}`}>·</span>, nameNode(id)]));
            const names = (
              <>
                {/* 번호가 아이들이 부르는 이름이다. 목록에서 제일 먼저 눈에 띄어야 한다. */}
                <span className="w-8 shrink-0 text-sm font-black tabular-nums text-foreground">
                  {seqMark(r.seq)}
                </span>
                {court && (
                  <span className="shrink-0 rounded-md bg-neon-green/15 px-1.5 py-0.5 text-[10px] font-black text-neon-green">
                    경기 중
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-left text-sm font-bold text-foreground">
                  {confirmed ? (
                    <>
                      {joinNodes(teamA)}
                      <span className="mx-1.5 text-[11px] font-black text-muted-foreground">
                        vs
                      </span>
                      {joinNodes(teamB)}
                    </>
                  ) : (
                    pool.map(nameOf).join(" · ")
                  )}
                </span>
              </>
            );
            const rowStyle = cn(
              "flex min-h-11 w-full items-center gap-2 rounded-xl border pl-3",
              court
                ? "border-2 border-neon-green/60 bg-neon-green/5"
                : mine ? "border-neon-blue/40 bg-neon-blue/5" : "border-border/30 bg-input/40",
            );

            // 알림 버튼 — 동호회의 모든 줄. 참가자와 운영진이 누른다(소집 대신 뽑은 줄로 부른다).
            const cooling = !!r.notified_at && now - new Date(r.notified_at).getTime() < 60_000;
            const notifyBtn = isClub && (mine || canManage) && (
              <button
                type="button"
                onClick={() => notifyReservation(r.id)}
                disabled={cooling}
                aria-label="참가자에게 알림"
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-black transition-colors",
                  cooling
                    ? "border-border/30 text-muted-foreground/50"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400",
                )}
              >
                <BellRing className="size-3.5" />
                {cooling ? "잠시 후" : "알림"}
              </button>
            );

            // 볼 수만 있는 사람에게는 목록일 뿐이다 — 학교는 그렇다.
            // 동호회 회원은 줄을 만드는 쪽이라 팀 미정 줄에서 참가·알림·나가기를 할 수 있다.
            if (!canManage) {
              const canJoin = isClub && !confirmed && !!myPlayerId && !mine;
              return (
                <div key={r.id} className={cn(rowStyle, isClub && (!confirmed || mine) ? "pr-1" : "pr-3")}>
                  {names}
                  {isClub && confirmed && (canRecord === "all" || (canRecord === "mine" && mine)) && (
                    <button
                      type="button"
                      onClick={() => onRecordRow(r)}
                      className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-neon-blue px-2.5 text-[11px] font-black text-primary-foreground hover:bg-neon-blue/90"
                    >
                      점수 넣기
                      <ChevronRight className="size-3.5" />
                    </button>
                  )}
                  {canJoin && (
                    <button
                      type="button"
                      onClick={() => joinReservation(r.id)}
                      className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-neon-blue px-2.5 text-[11px] font-black text-primary-foreground hover:bg-neon-blue/90"
                    >
                      <Plus className="size-3.5" /> 참가
                    </button>
                  )}
                  {notifyBtn}
                  {isClub && !confirmed && mine && (
                    <button
                      type="button"
                      onClick={() => setConfirmLeave(r)}
                      aria-label="이 줄에서 나가기"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              );
            }

            /*
              행이 곧 [결과 입력] 버튼이다. 따로 글자를 두지 않는다 — 행 전체가 눌리는 것을
              화살표 하나가 말해 주고, 잘못 눌러도 폼이 열릴 뿐이라 되돌리는 비용이 0이다.
              × 는 행 안 오른쪽 끝에 둔다. 밖에 세우면 목록의 오른쪽 선이 흐트러진다.
              되돌릴 수 없는 동작이므로 확인을 거친다.
            */
            // 고르는 중에는 행이 체크박스다. 결과 입력·바꾸기·빼기는 잠시 물러난다.
            if (picking) {
              const on = picking.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setPicking((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left transition-colors",
                    on ? "border-destructive/50 bg-destructive/10" : "border-border/30 bg-input/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      on ? "border-destructive bg-destructive text-white" : "border-border/60",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                  {names}
                </button>
              );
            }

            return (
              // 폰에서는 두 줄: 윗줄 이름 전체, 아랫줄 버튼들. 한 줄에 버튼 4개면 × 가 카드 밖으로 밀리고 이름이 잘렸다(2026-10-10).
              <div key={r.id} className={cn(rowStyle, "flex-wrap gap-y-1 py-1 pr-1 sm:flex-nowrap sm:py-0")}>
                {/* 이름 옆 × 버튼이 안에 들어가므로 button 이 아니라 div(버튼 안 버튼 금지). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onRecordRow(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") onRecordRow(r); }}
                  className="flex min-h-9 min-w-0 basis-full cursor-pointer items-center gap-2 text-left sm:min-h-11 sm:flex-1 sm:basis-auto"
                >
                  {names}
                </div>
                {/* 화살표만으로는 아이들이 "누르면 한 번에 채워진다"를 몰랐다(2026-10-01) → 버튼처럼 보이게. */}
                <button
                  type="button"
                  onClick={() => onRecordRow(r)}
                  className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-lg bg-neon-blue px-2.5 text-[11px] font-black text-primary-foreground hover:bg-neon-blue/90 sm:flex-none"
                >
                  점수 넣기
                  <ChevronRight className="size-3.5" />
                </button>
                {/* 사람 바꾸기는 연필로. 이름을 눌러 바꾸게 하면 폰에서 이름이 행 대부분이라
                    결과 입력하려다 바꾸기 창이 뜬다 — 행 누르기의 뜻은 하나여야 한다. */}
                {isClub && !confirmed && (
                  <button
                    type="button"
                    onClick={() => setAddRow(r)}
                    aria-label="사람 더하기"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <UserPlus className="size-4" />
                  </button>
                )}
                {notifyBtn}
                {confirmed && (
                  <button
                    type="button"
                    onClick={() => setEditRow(r)}
                    aria-label={`${seqMark(r.seq) || "이 대진"} 사람 바꾸기`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmRemove(r)}
                  aria-label={`${seqMark(r.seq) || "이 대진"} 대기열에서 빼기`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 관리자가 아니고 줄도 없으면 카드 머리글이 이미 "아직 없어요"를 말한다. */}

      {canManage && picking && (
        <div className="mt-4 flex items-center gap-2 border-t border-border/30 pt-3">
          <span className="text-xs font-bold text-muted-foreground">
            {picking.size === 0 ? "뺄 줄을 누르세요." : `${picking.size}줄 골랐어요.`}
          </span>
          <button
            type="button"
            onClick={() => setPicking(null)}
            className="ml-auto h-9 rounded-lg border border-border/40 px-3 text-xs font-black text-muted-foreground hover:text-foreground"
          >
            취소
          </button>
          <Button
            onClick={() => setConfirmBulk(true)}
            disabled={picking.size === 0}
            className="h-9 rounded-lg bg-destructive px-3 text-xs font-black text-white hover:bg-destructive/90"
          >
            {picking.size}줄 빼기
          </Button>
        </div>
      )}

      {canManage && !picking && !!assignmentSession?.player_ids?.length && (
        <div className={cn(queue.length > 0 && "mt-4 border-t border-border/30 pt-3")}>
          {/*
            두 층. 1층은 실제 동작 버튼만 같은 너비로 — 폰 폭에서도 글자가 꺾이지 않게 셋까지.
            2층은 설정(방식)과 안내 한 줄. 방식은 수업당 한 번 건드리는 것이라 버튼 층에 둘 이유가 없다.
          */}
          <div className="flex items-stretch gap-2">
            {/* 한 바퀴 — 놀고 있는 사람이 한 경기도 안 되면 바퀴가 없다. 뜻은 물음표로. */}
            <div
              className={cn(
                "relative flex h-10 flex-1 items-stretch overflow-hidden rounded-lg",
                roundPrimary ? "bg-neon-blue text-primary-foreground" : "border border-border/40 text-foreground",
                roundBlocked && "opacity-50",
              )}
            >
              <button
                type="button"
                onClick={() => fill("round")}
                disabled={roundBlocked}
                className="min-w-0 flex-1 whitespace-nowrap px-2 text-xs font-black transition-colors hover:bg-black/5 disabled:cursor-not-allowed"
              >
                {simul ? "다음 라운드" : "다음 경기 채우기"}
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                aria-label={simul ? "다음 라운드가 뭔가요" : "다음 경기 채우기가 뭔가요"}
                className={cn(
                  "flex w-8 shrink-0 items-center justify-center border-l transition-colors hover:bg-black/5",
                  roundPrimary ? "border-white/25" : "border-border/40 text-muted-foreground",
                )}
              >
                <CircleHelp className="size-3.5" />
              </button>
            </div>

            {/* +1경기 — 한 건. 누르는 횟수가 곧 경기 수라 숫자를 고를 필요가 없다.
                놀고 있는 사람이 모자라도 뽑힌다(다음 판 미리 잡기). */}
            {!simul && (
            <Button
              onClick={() => fill(1)}
              disabled={filling}
              className={cn("h-10 flex-1 whitespace-nowrap rounded-lg px-2 text-xs font-black", roundPrimary ? secondaryBtn : primaryBtn)}
            >
              <Plus className="mr-0.5 size-3.5" />1
            </Button>
            )}

            {/* 여러 줄 빼기 — 줄이 있을 때만. 오른쪽 끝, 아이콘만(드물게 쓴다). */}
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setPicking(new Set())}
                aria-label="여러 줄 골라서 빼기"
                className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ListChecks className="size-4" />
              </button>
            )}
          </div>

          {regroupAsk && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs animate-in fade-in duration-150">
              <span className="min-w-0 flex-1 font-bold text-foreground">방금 같이 뛴 친구들끼리 또 붙어요. 그래도 넣을까요?</span>
              <button
                type="button"
                onClick={() => fill(1, true)}
                disabled={filling}
                className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 font-black text-black"
              >
                넣기
              </button>
              <button
                type="button"
                onClick={() => setRegroupAsk(false)}
                className="shrink-0 rounded-md border border-border/40 px-2.5 py-1 font-bold text-muted-foreground"
              >
                다음 경기 끝나고
              </button>
            </div>
          )}

          {/* 2층 — 방식(설정) · 안내. 물음표를 눌렀으면 안내 자리에 설명이 온다. */}
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setCourtOpen((v) => !v)}
              className={cn(
                "flex shrink-0 items-center gap-0.5 font-black transition-colors",
                courtOpen ? "text-neon-blue" : "text-foreground hover:text-neon-blue",
              )}
            >
              <span className="font-bold text-muted-foreground">코트</span>&nbsp;{courtCount ? `${courtCount}개` : "안 씀"}
              <ChevronDown className={cn("size-3.5 transition-transform", courtOpen && "rotate-180")} />
            </button>
            <span className="shrink-0">·</span>
            <button
              type="button"
              onClick={() => setPresetOpen((v) => !v)}
              className={cn(
                "flex shrink-0 items-center gap-0.5 font-black transition-colors",
                presetOpen ? "text-neon-blue" : "text-foreground hover:text-neon-blue",
              )}
            >
              <span className="font-bold text-muted-foreground">방식</span>&nbsp;{currentPreset.label}
              <ChevronDown className={cn("size-3.5 transition-transform", presetOpen && "rotate-180")} />
            </button>
            <span className="shrink-0">·</span>
            {helpOpen ? (
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-w-0 flex-1 text-left leading-relaxed text-foreground animate-in fade-in duration-150"
              >
                {simul ? SIMUL_HELP : ROUND_HELP}
              </button>
            ) : (
              <span className="min-w-0 flex-1">
                {simul
                  ? simulHint(queue.length, roundCount, free, perMatch)
                  : separate ? separateRoundHint(freeByGender, queuedByGender, perMatch) : roundHint(free, perMatch, queue.length)}
              </span>
            )}
          </div>

          {courtOpen && (
            <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex flex-wrap items-center gap-1.5">
                {[null, 1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n ?? 0}
                    type="button"
                    onClick={async () => {
                      setCourtOpen(false);
                      if (n !== courtCount) await updateAssignmentSession({ courtCount: n });
                    }}
                    className={cn(
                      "h-8 min-w-9 rounded-full border px-3 text-xs font-black transition-all",
                      courtCount === n
                        ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                        : "border-border/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {n == null ? "안 씀" : n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                앞쪽 줄에 "경기 중"이 붙고, 결과가 들어오면 다음 줄이 들어가요. 코트 번호는 안 정해요. 교실 화면에 크게 떠요.
              </p>
              {/* 스위치는 DB 에 칸이 생긴 뒤에만 보인다(마이그레이션 전에 눌러 저장 실패가 나지 않게). */}
              {!simul && courtCount && assignmentSession && "auto_round" in assignmentSession && (
                <button
                  type="button"
                  onClick={() => updateAssignmentSession({ autoRound: !autoRound })}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      autoRound ? "bg-neon-blue" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-white transition-all",
                        autoRound ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-black text-foreground">자동으로 채우기</span>
                    <span className="block text-[11px] text-muted-foreground">
                      기다리는 줄이 {courtCount - 1 === 0 ? "다 들어가면" : `${courtCount - 1}줄이 되면`} 저절로 붙여요. 수업 끝나 갈 때 끄세요.
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}

          {presetOpen && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setPreset(p.value);
                    setPresetOpen(false);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-black transition-all",
                    preset === p.value
                      ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                      : "border-border/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                  <span className="ml-1.5 font-bold opacity-70">{p.hint(skillBasis)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 수업 종료 — 같은 날 다음 반이 들어오기 전에 남은 줄만 비운다. 명단은 그대로.
          안 눌러도 12시간 뒤엔 저절로 치워지므로 눌러야 하는 의무가 아니다. */}
      {canManage && !isClub && !picking && (queue.length > 0 || inputOpen) && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="text-[11px] font-bold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {queue.length > 0 ? `수업 종료 · 남은 ${queue.length}줄 비우기` : "수업 종료"}{inputOpen && " · 점수입력판 닫기"}
          </button>
        </div>
      )}

      {confirmEnd && createPortal(
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setConfirmEnd(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">수업을 마칠까요?</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {queue.length > 0 && `아직 안 치른 ${queue.length}줄이 사라져요. `}
              {inputOpen && "학생 점수입력판 QR도 닫혀요. "}
              경기 기록과 출석 명단은 그대로예요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={async () => {
                  await endClassQueue();   // 줄이 사라지는 게 곧 결과라 성공 토스트는 없다
                  setConfirmEnd(false);
                }}
                className="h-10 rounded-xl bg-destructive text-sm font-black text-white hover:bg-destructive/90"
              >
                마칠게요
              </Button>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                그대로 둘게요
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editRow && createPortal(
        <QueueEditDialog
          row={queue.find((r) => r.id === editRow.id) ?? editRow}
          queue={queue}
          participants={(assignmentSession?.player_ids ?? [])
            .map((id) => byId.get(id))
            .filter((s): s is Student => !!s)}
          nameOf={(id) => dn(byId.get(id))}
          onReplace={(from, to) => replaceQueuePlayer(editRow.id, from, to)}
          onClose={() => setEditRow(null)}
        />,
        document.body,
      )}

      {addRow && createPortal(
        <PoolAddDialog
          row={queue.find((r) => r.id === addRow.id) ?? addRow}
          candidates={(assignmentSession?.player_ids?.length
            ? assignmentSession.player_ids.map((id) => byId.get(id)).filter((s): s is Student => !!s)
            : students
          )}
          nameOf={(id) => dn(byId.get(id))}
          onAdd={(id) => joinReservation(addRow.id, id)}
          onClose={() => setAddRow(null)}
        />,
        document.body,
      )}

      {confirmLeave && createPortal(
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setConfirmLeave(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">이 줄에서 나갈까요?</h3>
            <p className="mt-1.5 truncate text-xs font-bold text-muted-foreground">
              {teamsOf(confirmLeave).pool.map((id) => dn(byId.get(id))).join(" · ")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              나만 빠져요. 내가 빠져서 혼자만 남으면 줄은 저절로 사라져요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={async () => {
                  await leaveReservation(confirmLeave.id);
                  setConfirmLeave(null);
                }}
                className="h-10 rounded-xl bg-destructive text-sm font-black text-white hover:bg-destructive/90"
              >
                나갈게요
              </Button>
              <button
                type="button"
                onClick={() => setConfirmLeave(null)}
                className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                그대로 둘게요
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 여러 줄 빼기 확인 */}
      {confirmBulk && picking && createPortal(
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setConfirmBulk(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">{picking.size}줄을 뺄까요?</h3>
            <p className="mt-1.5 text-xs font-bold text-muted-foreground">
              {queue
                .filter((r) => picking.has(r.id))
                .map((r) => seqMark(r.seq) || "번호 없음")
                .join(" · ")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              경기 기록은 남지 않아요. 되돌릴 수 없어요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={async () => {
                  const ok = await removeScheduledMatches([...picking]);
                  setConfirmBulk(false);
                  if (ok) setPicking(null);
                }}
                className="h-10 rounded-xl bg-destructive text-sm font-black text-white hover:bg-destructive/90"
              >
                줄에서 뺄게요
              </Button>
              <button
                type="button"
                onClick={() => setConfirmBulk(false)}
                className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                그대로 둘게요
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 줄에서 빼기 확인 — MatchesTab 의 예약 정리 팝업과 같은 모양이다. */}
      {confirmRemove &&
        (() => {
          const r = confirmRemove;
          const { teamA, teamB, pool } = teamsOf(r);
          // 팀이 갈린 줄은 양 팀을, 아직 안 갈린 줄(인원 소집 예약)은 모인 사람을 보여준다.
          const who = (teamA.length && teamB.length ? [...teamA, ...teamB] : pool)
            .map((id) => dn(byId.get(id)))
            .join(" · ");
          return createPortal(
            <div
              className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={() => setConfirmRemove(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-black text-foreground">
                  {seqMark(r.seq) ? `${seqMark(r.seq)} 줄을 뺄까요?` : "이 줄을 뺄까요?"}
                </h3>
                <p className="mt-1.5 truncate text-xs font-bold text-muted-foreground">{who}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  경기 기록은 남지 않아요. 결과를 넣으려면 줄을 눌러 결과 입력으로 가세요.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    onClick={async () => {
                      await removeScheduledMatch(r.id);
                      setConfirmRemove(null);
                    }}
                    className="h-10 rounded-xl bg-destructive text-sm font-black text-white hover:bg-destructive/90"
                  >
                    줄에서 뺄게요
                  </Button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className="mt-0.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    그대로 둘게요
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()}
    </div>
  );
}

/**
 * 대기열 한 줄의 사람 바꾸기.
 *
 * 위에 그 줄의 네 사람(단식이면 둘), 아래에 오늘 명단. 위에서 누구를 뺄지 누르고 아래에서
 * 누구를 넣을지 누르면 끝이다 — 저장 버튼이 없다. 자리(팀·짝)는 그대로다.
 * 위에서 두 사람을 차례로 누르면 둘이 자리를 맞바꾼다(팀원 바꾸기).
 *
 * 명단에 없는 사람은 선택지에 없다(참석한 사람만 대진에 들어간다는 규칙). 다른 줄에 이미 선
 * 사람은 막지 않고 "#n" 표시만 한다 — 두 줄에 서는 것이 미리 잡기의 정의라서다.
 */
function QueueEditDialog({
  row,
  queue,
  participants,
  nameOf,
  onReplace,
  onClose,
}: {
  row: ScheduledMatch;
  queue: ScheduledMatch[];
  participants: Student[];
  nameOf: (id: string) => string;
  onReplace: (fromId: string, toId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { teamA, teamB } = teamsOf(row);
  const inRow = new Set([...teamA, ...teamB]);
  // 빼려는 사람. 처음엔 아무도 안 골라져 있다 — 넣을 사람부터 누르는 실수를 막으려면
  // 위에서 먼저 골라야 아래가 켜지게 한다.
  const [fromId, setFromId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 다른 줄에 선 사람 → 그 줄 번호. 같은 사람이 여러 줄이면 앞줄만.
  const seqOf = new Map<string, number | null>();
  for (const r of queue) {
    if (r.id === row.id) continue;
    const { teamA: a, teamB: b, pool } = teamsOf(r);
    for (const id of [...a, ...b, ...pool]) if (!seqOf.has(id)) seqOf.set(id, r.seq ?? null);
  }

  const candidates = sortStudentsForRoster(participants).filter((s) => !inRow.has(s.id));

  const pick = async (toId: string) => {
    if (!fromId || busy) return;
    setBusy(true);
    const ok = await onReplace(fromId, toId);
    setBusy(false);
    if (ok) onClose();
  };

  const Slot = ({ id }: { id: string }) => (
    <button
      type="button"
      onClick={() => (fromId && fromId !== id ? pick(id) : setFromId((v) => (v === id ? null : id)))}
      className={cn(
        "h-10 flex-1 rounded-lg border text-sm font-bold transition-all",
        fromId === id
          ? "border-neon-blue bg-neon-blue/15 text-neon-blue ring-2 ring-neon-blue/40"
          : "border-border/40 bg-background text-foreground hover:border-border",
      )}
    >
      {nameOf(id)}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative my-4 w-full max-w-2xl rounded-2xl border border-border/50 bg-background shadow-2xl sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
            <Pencil className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black tracking-tight text-foreground">
              {seqMark(row.seq) ? `${seqMark(row.seq)} 사람 바꾸기` : "사람 바꾸기"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {fromId ? `${nameOf(fromId)} 대신 들어갈 사람을 고르세요. 위에서 고르면 서로 자리를 바꿔요.` : "먼저 뺄 사람을 누르세요."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          {/* 그 줄의 사람들 — 팀 모양 그대로. */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1.5">
              {teamA.map((id) => (
                <Slot key={id} id={id} />
              ))}
            </div>
            <span className="text-[11px] font-black text-muted-foreground">vs</span>
            <div className="flex flex-1 gap-1.5">
              {teamB.map((id) => (
                <Slot key={id} id={id} />
              ))}
            </div>
          </div>

          {/* 오늘 명단 — 뺄 사람을 고르기 전엔 흐리게. */}
          <div
            className={cn(
              "rounded-xl border border-border/30 bg-input/30 p-2 transition-opacity",
              !fromId && "pointer-events-none opacity-40",
            )}
          >
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {candidates.map((s) => {
                const seq = seqOf.get(s.id);
                const elsewhere = seqOf.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => pick(s.id)}
                    className={cn(
                      "flex h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-all active:scale-95",
                      "border-border/40 bg-background text-foreground hover:border-neon-blue/50 hover:text-neon-blue",
                    )}
                  >
                    {s.studentNo != null && (
                      <span className="w-5 shrink-0 text-right text-[11px] font-black tabular-nums text-muted-foreground">
                        {s.studentNo}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">{nameOf(s.id)}</span>
                    {elsewhere && (
                      <span className="shrink-0 text-[10px] font-black text-muted-foreground">
                        {seq == null ? "줄" : `#${seq}`}
                      </span>
                    )}
                  </button>
                );
              })}
              {candidates.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                  바꿔 넣을 사람이 없어요.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 팀 미정 줄(동호회 소집 예약)에 사람 더하기. 누르면 바로 들어가고 닫힌다.
 * 후보는 오늘 참석 명단, 명단이 없으면 회원 전체.
 */
function PoolAddDialog({
  row,
  candidates,
  nameOf,
  onAdd,
  onClose,
}: {
  row: ScheduledMatch;
  candidates: Student[];
  nameOf: (id: string) => string;
  onAdd: (playerId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const inRow = new Set(teamsOf(row).pool);
  const [busy, setBusy] = useState(false);
  const list = sortStudentsForRoster(candidates).filter((s) => !inRow.has(s.id));
  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative my-4 w-full max-w-2xl rounded-2xl border border-border/50 bg-background shadow-2xl sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
            <UserPlus className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black tracking-tight text-foreground">
              {seqMark(row.seq) ? `${seqMark(row.seq)} 사람 더하기` : "사람 더하기"}
            </h3>
            <p className="truncate text-[11px] text-muted-foreground">
              지금: {teamsOf(row).pool.map(nameOf).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <div className="rounded-xl border border-border/30 bg-input/30 p-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await onAdd(s.id);
                    setBusy(false);
                    if (ok) onClose();
                  }}
                  className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border/40 bg-background px-2.5 text-sm font-bold text-foreground transition-all hover:border-neon-blue/50 hover:text-neon-blue active:scale-95"
                >
                  <span className="min-w-0 flex-1 truncate text-left">{nameOf(s.id)}</span>
                  {s.group && <span className="shrink-0 text-[10px] font-black opacity-70">{s.group}</span>}
                </button>
              ))}
              {list.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-muted-foreground">더할 사람이 없어요.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 방금 코트를 받은 줄 — "2코트 → #7 들어가세요". 1분 동안 보여 준다.
 *
 * 처음 화면을 열 때 이미 코트에 있던 줄은 안내하지 않는다. 그 조는 이미 뛰고 있다.
 * 교실 화면(ClassroomView)도 같은 규칙으로 크게 띄운다.
 */
export function useCourtCallout<T extends { seq?: number | null; court?: string | null }>(rows: T[]) {
  const seen = useRef<Map<string, string> | null>(null);
  const [items, setItems] = useState<{ key: string; seq: number | null; court: string; at: number }[]>([]);

  useEffect(() => {
    const now = new Map<string, string>();
    rows.forEach((r, i) => { if (r.court) now.set(r.seq != null ? `#${r.seq}` : `x${i}`, r.court); });
    const prev = seen.current;
    seen.current = now;
    if (!prev) return;   // 첫 화면
    const fresh = [...now].filter(([k, c]) => prev.get(k) !== c);
    if (fresh.length === 0) return;
    const at = Date.now();
    setItems((old) => [
      ...old.filter((o) => !fresh.some(([k]) => k === o.key)),
      ...fresh.map(([key, court]) => ({ key, court, at, seq: key.startsWith("#") ? Number(key.slice(1)) : null })),
    ]);
  }, [rows]);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => setItems((old) => old.filter((o) => Date.now() - o.at < 60_000)), 60_000);
    return () => clearTimeout(t);
  }, [items]);

  // 코트를 잃은 줄(결과가 들어와 빠짐)은 바로 지운다.
  return items
    .filter((o) => seen.current?.get(o.key) === o.court)
    .sort((a, b) => Number(a.court) - Number(b.court));
}
