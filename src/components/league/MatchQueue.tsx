import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
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

const PRESETS: { value: AssignmentPreset; label: string; hint: string }[] = [
  { value: "diversity", label: "다양성 우선", hint: "아직 안 만난 사람끼리 붙입니다." },
  { value: "balanced", label: "절충", hint: "안 만난 조합 중에서 실력이 맞는 쪽으로 붙입니다." },
  { value: "skill", label: "실력 우선", hint: "실력이 비슷한 사람끼리 붙입니다." },
];

/**
 * 대기열 — 순서 목록 하나.
 *
 * 진행 중/대기를 나누지 않는다. 코트에 누가 있는지는 고개를 돌리면 보이고,
 * 대기하는 사람에게 필요한 정보는 "내가 몇 번째냐" 하나다.
 * 위에서부터 코트에 들어가고, 결과가 등록되면 그 줄이 빠진다.
 */
export function MatchQueue({
  canManage,
  stepLabel,
  onRecordRow,
}: {
  canManage: boolean;
  /**
   * 이 단계의 이름("2단계 · 대진"). 학생 화면에서는 단계가 하나뿐이라 카드 제목이 곧
   * 대기열이므로 null을 준다 — 그때는 머리글 없이 목록만 그린다.
   */
  stepLabel?: string | null;
  /** 줄의 [결과 입력] — 4명이 확정이므로 선수 선택 없이 바로 점수판으로 간다. */
  onRecordRow: (row: ScheduledMatch) => void;
}) {
  const {
    students,
    deletedById,
    myPlayerId,
    leagueType,
    assignmentSession,
    fillAssignmentQueue,
    removeScheduledMatch,
  } = useLeagueStore();

  const [preset, setPreset] = useState<AssignmentPreset>(
    leagueType === "school" ? "diversity" : "balanced",
  );
  const [filling, setFilling] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  // 줄에서 빼기 확인 팝업 대상. 삭제는 되돌릴 수 없으므로 한 번 묻는다.
  const [confirmRemove, setConfirmRemove] = useState<ScheduledMatch | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s));
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students, deletedById]);

  const { queue, myTurn } = useQueueRows();

  const fill = async (mode: "round" | "one") => {
    setFilling(true);
    // 종목은 세션 설정이다. 여기서는 채우는 단위(한 바퀴 / 1경기)만 정한다.
    await fillAssignmentQueue({ mode, policy: preset });
    setFilling(false);
  };

  return (
    <div>
      {/* 학생 화면에서는 카드 제목이 곧 "대기열 (N)"이라 머리글이 겹친다 → 통째로 생략. */}
      {stepLabel && (
        <div className={cn("min-w-0", queue.length > 0 && "mb-3")}>
          <p className="text-xs font-black text-foreground">
            {stepLabel} ({queue.length})
          </p>
          {/* 줄이 없을 때 줄 서는 법을 설명할 이유가 없다. 빈 대기열에서 알아야 할 것은
              "지금 무엇을 하면 되는가" 하나뿐이고, 그건 사람마다 다르다. */}
          <p className="text-[11px] text-muted-foreground">
            {queue.length === 0
              ? canManage
                ? "대진을 채워서 시작하세요."
                : "아직 대기 중인 경기가 없어요."
              : myTurn >= 0
                ? `내 차례 ${myTurn + 1}번째예요.`
                : "위에서부터 코트에 들어갑니다. 결과를 입력하면 그 줄이 빠집니다."}
          </p>
        </div>
      )}

      {/* 빈 대기열에 점선 상자를 세우지 않는다. "아래에서 대진을 채우세요"는 바로 아래
          [한 바퀴 채우기] 버튼이 이미 하는 말이고, 그 안내에 화면 절반을 쓸 이유가 없다. */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((r) => {
            const { teamA, teamB, pool } = teamsOf(r);
            const confirmed = teamA.length > 0 && teamB.length > 0;
            const mine = !!myPlayerId && [...teamA, ...teamB, ...pool].includes(myPlayerId);
            const nameOf = (id: string) => dn(byId.get(id));
            const names = (
              <>
                <span className="w-9 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
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
              "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5",
              mine ? "border-neon-blue/40 bg-neon-blue/5" : "border-border/30 bg-input/40",
            );

            // 볼 수만 있는 사람에게는 목록일 뿐이다. 누를 것이 없으니 버튼으로 만들지 않는다.
            if (!canManage) {
              return (
                <div key={r.id} className={rowStyle}>
                  {names}
                </div>
              );
            }

            return (
              <div key={r.id} className="flex items-center gap-1">
                {/*
                  행 전체가 [결과 입력] 버튼이다. 예전의 작은 버튼은 28px 로 권장치 44px 에
                  한참 못 미쳤는데, 행 자체는 이미 48px 였다 — 알맞은 타깃이 이미 있는데
                  눌리지 않을 뿐이었다. 사람들이 이름을 누르는 건 실수가 아니다.
                  잘못 눌러도 폼이 열릴 뿐이라 되돌리는 비용이 0이다.
                */}
                <button
                  type="button"
                  onClick={() => onRecordRow(r)}
                  className={cn(rowStyle, "min-w-0 flex-1 text-left transition-colors hover:border-neon-blue/50")}
                >
                  {names}
                  {/* 버튼이 아니라 글자로 남긴다 — 누를 곳을 가리키는 게 아니라 무엇이 일어날지 알린다. */}
                  <span className="shrink-0 text-[10px] font-black text-neon-blue">결과 입력</span>
                </button>
                {/*
                  되돌릴 수 없는 동작만 조준을 요구한다. 행이 큰 타깃이 되면서 × 와 붙으므로
                  확인을 거친다 — 예전에는 정확히 반대였다(작은 × 가 확인 없이 즉시 삭제).
                */}
                <button
                  type="button"
                  onClick={() => setConfirmRemove(r)}
                  aria-label={`${seqMark(r.seq) || "이 대진"} 대기열에서 빼기`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {canManage && !assignmentSession?.player_ids?.length && (
        <p className="text-[11px] text-muted-foreground">
          1단계를 마치면 대진을 뽑을 수 있어요. 참석한 사람만 대진에 들어갑니다.
        </p>
      )}

      {canManage && !!assignmentSession?.player_ids?.length && (
        <div className="mt-4 border-t border-border/30 pt-4">
          {/* 대진 방식은 대개 기본값 그대로 둔다. 평소에는 지금 무엇으로 뽑는지만 한 줄로
              알리고, 바꾸려는 사람만 펼친다 — 처음 보는 사람에게 뜻 모를 선택지 셋을
              들이밀지 않는다. */}
          {presetOpen ? (
            <div className="animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPreset(p.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-black transition-all",
                      preset === p.value
                        ? "border-neon-blue/50 bg-neon-blue/20 text-neon-blue"
                        : "border-border/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPresetOpen(false)}
                  className="ml-auto text-[11px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  접기
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {PRESETS.find((p) => p.value === preset)?.hint}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPresetOpen(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              대진 방식{" "}
              <span className="font-black text-foreground">
                {PRESETS.find((p) => p.value === preset)?.label}
              </span>
              <ChevronDown className="size-3.5" />
            </button>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => fill("round")}
              disabled={filling}
              className="h-11 flex-1 rounded-xl bg-neon-blue text-sm font-black text-primary-foreground hover:bg-neon-blue/90"
            >
              <Sparkles className="mr-1.5 size-4" /> 한 바퀴 채우기
            </Button>
            <Button
              onClick={() => fill("one")}
              disabled={filling}
              variant="outline"
              className="h-11 shrink-0 rounded-xl border-border/50 px-4 text-sm font-black"
            >
              <Plus className="mr-1 size-4" /> 1경기
            </Button>
          </div>
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
