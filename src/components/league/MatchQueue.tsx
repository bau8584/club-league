import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Minus, Plus, Sparkles, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { teamsOf, useQueueRows } from "@/lib/use-queue-rows";
import type { ScheduledMatch, Student } from "@/lib/league-types";
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
 * 이 경기 수로 뽑으면 무슨 일이 생기는지 한 줄. "보장"이 아니라 "이만큼이면 들어갈
 * 수 있다"는 안내다 — [실력]은 판 수를 뒤에 보므로 같은 사람이 두 번 들어갈 수 있다.
 *
 * 놀고 있는 사람이 한 경기 인원도 안 되면 이미 줄에 선 사람으로 다음 판을 미리 잡는다.
 * 계산기가 판 수 적은 순으로 다시 쓴다.
 */
function countHint(count: number, free: number, perMatch: number): string {
  if (free < perMatch) return "놀고 있는 사람이 모자라 이미 줄에 선 사람으로 다음 판을 미리 잡아요.";
  const slots = count * perMatch;
  if (slots < free) return `${slots}명이 1번, ${free - slots}명은 다음에.`;
  const each = Math.floor(slots / free);
  const extra = slots % free;
  const base = `전원 ${each}번씩 들어갈 수 있는 수`;
  const tail = extra > 0 ? ` (${extra}명은 ${each + 1}번)` : "";
  const long = each >= 3 ? " · 대기열이 길어져요" : "";
  return base + tail + long + ".";
}

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
  const defaultCount = Math.max(1, roundCount);

  /**
   * 뽑을 경기 수. 기본은 한 바퀴(놀고 있는 인원 ÷ 경기당 인원)이고, 교사가 늘리거나
   * 줄일 수 있다. 손으로 고친 값은 그 순간의 인원에 대한 판단이지 영구 설정이 아니다 —
   * 인원이 바뀌어 기본값이 달라지면 버린다. 안 그러면 줄이 다 빠진 뒤에도 아까 고친
   * 숫자가 남아 "26명인데 5경기"가 된다.
   */
  const [override, setOverride] = useState<{ count: number; base: number } | null>(null);
  const count = override && override.base === defaultCount ? override.count : defaultCount;
  const setCount = (n: number) => setOverride({ count: Math.max(1, n), base: defaultCount });

  const fill = async (n: number) => {
    setFilling(true);
    // 종목은 세션 설정이다. 여기서는 경기 수만 정한다.
    await fillAssignmentQueue({ count: n, policy: preset });
    setOverride(null);
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

      {canManage && !!assignmentSession?.player_ids?.length && (
        <div className={cn(queue.length > 0 && "mt-4 border-t border-border/30 pt-3")}>
          {/*
            조작은 한 줄: [방식] · [한 바퀴] · [− N +][N경기]. 전부 같은 높이(h-9)라 한 묶음으로
            읽히고, 버튼은 내용 너비만 차지한다 — 수업 중 한두 번 누르는 것이 화면의 1/8 을
            차지할 이유가 없다. 안내는 그 아래 한 문장.
          */}
          <div className="flex flex-wrap items-center gap-2">
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

            {/* 한 바퀴 — 숫자 없이. 놀고 있는 사람이 한 경기도 안 되면 바퀴가 없다. */}
            <Button
              onClick={() => fill(roundCount)}
              disabled={filling || roundCount === 0}
              className={cn("h-9 rounded-lg px-3 text-xs font-black", roundPrimary ? primaryBtn : secondaryBtn)}
            >
              <Sparkles className="mr-1 size-3.5" /> 한 바퀴
            </Button>

            {/* N경기 — 스테퍼와 버튼을 한 덩어리로 붙인다. 숫자가 버튼의 일부라는 뜻이다. */}
            <div className="flex h-9 items-center overflow-hidden rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => setCount(count - 1)}
                disabled={filling || count <= 1}
                aria-label="경기 수 줄이기"
                className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-6 text-center text-xs font-black tabular-nums text-foreground">
                {count}
              </span>
              <button
                type="button"
                onClick={() => setCount(count + 1)}
                disabled={filling}
                aria-label="경기 수 늘리기"
                className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Plus className="size-3.5" />
              </button>
              <Button
                onClick={() => fill(count)}
                disabled={filling}
                className={cn(
                  "h-full rounded-none border-0 border-l border-border/40 px-3 text-xs font-black",
                  roundPrimary ? secondaryBtn : primaryBtn,
                )}
              >
                {count}경기 뽑기
              </Button>
            </div>
          </div>

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {countHint(count, free, perMatch)}
          </p>

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

      {/* 줄에서 빼기 확인 — MatchesTab 의 예약 정리 팝업과 같은 모양이다. */}
      {confirmRemove &&
        (() => {
          const r = confirmRemove;
          const { teamA, teamB, pool } = teamsOf(r);
          // 팀이 갈린 줄은 양 팀을, 아직 안 갈린 줄(인원 소집 예약)은 모인 사람을 보여준다.
          const who = (teamA.length && teamB.length ? [...teamA, ...teamB] : pool)
            .map((id) => dn(byId.get(id)))
            .join(" · ");
          return (
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
            </div>
          );
        })()}
    </div>
  );
}
