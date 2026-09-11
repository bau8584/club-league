import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, CircleHelp, ListChecks, Pencil, Plus, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { teamsOf, useQueueRows } from "@/lib/use-queue-rows";
import { sortStudentsForRoster, type ScheduledMatch, type Student } from "@/lib/league-types";
import type { AssignmentPreset } from "@/domain/assignment-calculator";

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
function roundHint(free: number, perMatch: number): string {
  const rounds = Math.floor(free / perMatch);
  if (rounds === 0) return "놀고 있는 사람이 모자라요. +1경기는 이미 줄에 선 사람으로 다음 판을 미리 잡아요.";
  const rest = free - rounds * perMatch;
  return rest === 0
    ? `한 바퀴 = ${rounds}경기 · 놀고 있는 ${free}명 전원이 한 번씩.`
    : `한 바퀴 = ${rounds}경기 · ${free - rest}명이 한 번씩, ${rest}명은 다음에.`;
}

const ROUND_HELP =
  "놀고 있는 사람 전원이 한 번씩 들어가는 만큼 뽑아요. 복식은 4명, 단식은 2명이 한 경기예요. 4명(2명)으로 안 나눠떨어지면 남는 사람은 다음 바퀴에 먼저 들어가요.";

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
  onRecordRow,
}: {
  canManage: boolean;
  /** 줄의 [결과 입력] — 4명이 확정이므로 선수 선택 없이 바로 점수판으로 간다. */
  onRecordRow: (row: ScheduledMatch) => void;
}) {
  const {
    students,
    deletedById,
    myPlayerId,
    leagueType,
    levels,
    assignmentSession,
    fillAssignmentQueue,
    removeScheduledMatch,
    removeScheduledMatches,
    replaceQueuePlayer,
  } = useLeagueStore();

  const [preset, setPreset] = useState<AssignmentPreset>(
    leagueType === "school" ? "diversity" : "balanced",
  );
  const [filling, setFilling] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  // 실력의 기준 — 급수를 둔 리그는 급수, 아니면 RP. 계산기(skillRating)와 같은 판단.
  const skillBasis = levels.length > 1 ? "급수" : "RP";
  // 줄에서 빼기 확인 팝업 대상. 삭제는 되돌릴 수 없으므로 한 번 묻는다.
  const [confirmRemove, setConfirmRemove] = useState<ScheduledMatch | null>(null);
  // 사람 바꾸기 팝업 대상 줄.
  const [editRow, setEditRow] = useState<ScheduledMatch | null>(null);
  // 여러 줄 빼기 — 고르는 중이면 Set, 아니면 null. 한 줄씩 × 를 누르면 폰에서 N번 확인해야 한다.
  const [picking, setPicking] = useState<Set<string> | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s));
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students, deletedById]);

  const { queue } = useQueueRows();

  // 지금 놀고 있는 사람 수. 기본 경기 수(한 바퀴)와 안내 문구의 바탕이다.
  const perMatch = assignmentSession?.match_type === "single" ? 2 : 4;
  const free = useMemo(() => {
    const busy = new Set<string>();
    for (const r of queue) {
      const { teamA, teamB, pool } = teamsOf(r);
      for (const id of [...teamA, ...teamB, ...pool]) busy.add(id);
    }
    return (assignmentSession?.player_ids ?? []).filter((id) => !busy.has(id)).length;
  }, [queue, assignmentSession?.player_ids]);
  /**
   * 한 바퀴 = 놀고 있는 사람 전원이 한 번씩, 남는 사람은 다음에. 25명 복식이면 6경기(1명 남음),
   * 단식이면 12경기. "모두 한 번 이상"(7경기, 3명은 두 번)이 아니다 — 바퀴라는 말이
   * "한 사람 한 번"이고, 두 번 들어갈 사람을 고르는 규칙이 따로 필요해진다.
   */
  const roundCount = Math.floor(free / perMatch);
  // [한 바퀴] 옆 물음표를 누르면 뜨는 말풍선.
  const [helpOpen, setHelpOpen] = useState(false);

  const fill = async (n: number) => {
    setFilling(true);
    // 종목은 세션 설정이다. 여기서는 경기 수만 정한다.
    await fillAssignmentQueue({ count: n, policy: preset });
    setFilling(false);
  };

  // 학교는 한 바퀴씩, 동호회는 몇 경기씩 그때그때. 자주 쓰는 쪽을 진하게.
  const roundPrimary = leagueType === "school";
  const primaryBtn = "bg-neon-blue text-primary-foreground hover:bg-neon-blue/90";
  const secondaryBtn = "border border-border/40 bg-transparent text-foreground hover:bg-muted/40";

  const currentPreset = PRESETS.find((p) => p.value === preset)!;

  return (
    <div>
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
            const names = (
              <>
                {/* 번호가 아이들이 부르는 이름이다. 목록에서 제일 먼저 눈에 띄어야 한다. */}
                <span className="w-8 shrink-0 text-sm font-black tabular-nums text-foreground">
                  {seqMark(r.seq)}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-bold text-foreground">
                  {confirmed ? (
                    <>
                      {teamA.map(nameOf).join("·")}
                      <span className="mx-1.5 text-[11px] font-black text-muted-foreground">
                        vs
                      </span>
                      {teamB.map(nameOf).join("·")}
                    </>
                  ) : (
                    pool.map(nameOf).join(" · ")
                  )}
                </span>
              </>
            );
            const rowStyle = cn(
              "flex min-h-11 w-full items-center gap-2 rounded-xl border pl-3",
              mine ? "border-neon-blue/40 bg-neon-blue/5" : "border-border/30 bg-input/40",
            );

            // 볼 수만 있는 사람에게는 목록일 뿐이다. 누를 것이 없으니 버튼으로 만들지 않는다.
            if (!canManage) {
              return (
                <div key={r.id} className={cn(rowStyle, "pr-3")}>
                  {names}
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
              <div key={r.id} className={cn(rowStyle, "pr-1")}>
                <button
                  type="button"
                  onClick={() => onRecordRow(r)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-neon-blue"
                >
                  {names}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </button>
                {/* 사람 바꾸기는 연필로. 이름을 눌러 바꾸게 하면 폰에서 이름이 행 대부분이라
                    결과 입력하려다 바꾸기 창이 뜬다 — 행 누르기의 뜻은 하나여야 한다. */}
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
            조작은 한 줄: [방식] · [한 바퀴 ?] · [+1경기]. 전부 같은 높이(h-9)라 한 묶음으로
            읽히고, 버튼은 내용 너비만 차지한다 — 수업 중 한두 번 누르는 것이 화면의 1/8 을
            차지할 이유가 없다. 안내는 그 아래 한 문장.
          */}
          <div className="flex items-center gap-2">
            {/* 대진 방식 — 평소엔 기본값 그대로. 누르면 아래에 선택지가 펼쳐진다. */}
            <button
              type="button"
              onClick={() => setPresetOpen((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-black transition-all",
                presetOpen
                  ? "border-neon-blue/50 text-neon-blue"
                  : "border-border/40 text-foreground hover:border-border",
              )}
            >
              <span className="font-bold text-muted-foreground">방식</span>
              {currentPreset.label}
              <ChevronDown className={cn("size-3.5 transition-transform", presetOpen && "rotate-180")} />
            </button>

            {/* 한 바퀴 — 놀고 있는 사람이 한 경기도 안 되면 바퀴가 없다. 뜻은 물음표 말풍선에. */}
            <div
              className={cn(
                "relative flex h-9 items-stretch overflow-hidden rounded-lg",
                roundPrimary ? "bg-neon-blue text-primary-foreground" : "border border-border/40 text-foreground",
                (filling || roundCount === 0) && "opacity-50",
              )}
            >
              <button
                type="button"
                onClick={() => fill(roundCount)}
                disabled={filling || roundCount === 0}
                className="px-3 text-xs font-black transition-colors hover:bg-black/5 disabled:cursor-not-allowed"
              >
                한 바퀴
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                aria-label="한 바퀴가 뭔가요"
                className={cn(
                  "flex w-7 items-center justify-center border-l transition-colors hover:bg-black/5",
                  roundPrimary ? "border-white/25" : "border-border/40 text-muted-foreground",
                )}
              >
                <CircleHelp className="size-3.5" />
              </button>
            </div>

            {/* +1경기 — 한 건. 누르는 횟수가 곧 경기 수라 숫자를 고를 필요가 없다.
                놀고 있는 사람이 모자라도 뽑힌다(다음 판 미리 잡기). */}
            <Button
              onClick={() => fill(1)}
              disabled={filling}
              className={cn("h-9 rounded-lg px-3 text-xs font-black", roundPrimary ? secondaryBtn : primaryBtn)}
            >
              <Plus className="mr-0.5 size-3.5" /> 1경기
            </Button>

            {/* 여러 줄 빼기 — 줄이 있을 때만. 오른쪽 끝, 아이콘만(드물게 쓴다). */}
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => setPicking(new Set())}
                aria-label="여러 줄 골라서 빼기"
                className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ListChecks className="size-4" />
              </button>
            )}
          </div>

          {helpOpen ? (
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-1.5 w-full rounded-lg border border-border/40 bg-input/40 p-2.5 text-left text-[11px] leading-relaxed text-foreground animate-in fade-in duration-150"
            >
              {ROUND_HELP}
            </button>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{roundHint(free, perMatch)}</p>
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
      onClick={() => setFromId((v) => (v === id ? null : id))}
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
              {fromId ? `${nameOf(fromId)} 대신 들어갈 사람을 고르세요.` : "먼저 뺄 사람을 누르세요."}
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
