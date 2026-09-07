import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ListOrdered, Plus, Sparkles, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import type { ScheduledMatch, Student } from "@/lib/league-types";
import type { AssignmentPreset } from "@/domain/assignment-calculator";

const dn = (s?: Student | null) => (s ? s.nickname || s.name : "?");

/** ①②③… 20까지는 원문자, 그 뒤는 그냥 숫자. 순서가 곧 "몇 번째 차례냐"다. */
function orderMark(i: number): string {
  return i < 20 ? String.fromCharCode(0x2460 + i) : `${i + 1}.`;
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
  onRecordRow,
}: {
  canManage: boolean;
  /** 줄의 [결과 입력] — 4명이 확정이므로 선수 선택 없이 바로 점수판으로 간다. */
  onRecordRow: (row: ScheduledMatch) => void;
}) {
  const {
    scheduledMatches,
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

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s));
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students, deletedById]);

  // 큐는 만든 순서대로다. 위에서부터 코트에 들어간다.
  const queue = useMemo(
    () =>
      scheduledMatches
        .filter((m) => m.status === "waiting" || m.status === "called")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [scheduledMatches],
  );

  const teamsOf = (r: ScheduledMatch) => ({
    teamA: [r.player_a_id, r.player_a2_id].filter(Boolean) as string[],
    teamB: [r.player_b_id, r.player_b2_id].filter(Boolean) as string[],
    pool: ((r.player_ids || []).filter(Boolean) as string[]) ?? [],
  });

  const fill = async (mode: "round" | "one") => {
    setFilling(true);
    // 종목은 세션 설정이다. 여기서는 채우는 단위(한 바퀴 / 1경기)만 정한다.
    await fillAssignmentQueue({ mode, policy: preset });
    setFilling(false);
  };

  const myTurn = queue.findIndex((r) => {
    const { teamA, teamB, pool } = teamsOf(r);
    return !!myPlayerId && [...teamA, ...teamB, ...pool].includes(myPlayerId);
  });

  return (
    <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
          <ListOrdered className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-foreground">
            대기열 ({queue.length})
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {myTurn >= 0
              ? `내 차례 ${myTurn + 1}번째예요.`
              : "위에서부터 코트에 들어갑니다. 결과를 입력하면 그 줄이 빠집니다."}
          </p>
        </div>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-[11px] text-muted-foreground">
          대기 중인 경기가 없어요.{canManage ? " 아래에서 대진을 채우세요." : ""}
        </p>
      ) : (
        <div className="space-y-2">
          {queue.map((r, i) => {
            const { teamA, teamB, pool } = teamsOf(r);
            const confirmed = teamA.length > 0 && teamB.length > 0;
            const mine = !!myPlayerId && [...teamA, ...teamB, ...pool].includes(myPlayerId);
            const nameOf = (id: string) => dn(byId.get(id));
            return (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5",
                  mine ? "border-neon-blue/40 bg-neon-blue/5" : "border-border/30 bg-input/40",
                )}
              >
                <span className="w-5 shrink-0 text-center text-sm font-black text-muted-foreground">
                  {orderMark(i)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
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
                {canManage && (
                  <>
                    <Button
                      onClick={() => onRecordRow(r)}
                      size="sm"
                      className="h-7 shrink-0 rounded-lg bg-neon-blue px-2.5 text-[10px] font-black text-primary-foreground hover:bg-neon-blue/90"
                    >
                      결과 입력
                    </Button>
                    <button
                      type="button"
                      onClick={() => removeScheduledMatch(r.id)}
                      aria-label="대기열에서 빼기"
                      className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && !assignmentSession?.player_ids?.length && (
        <p className="mt-4 border-t border-border/30 pt-4 text-[11px] text-muted-foreground">
          위에서 출석을 먼저 체크하세요. 체크된 사람만 대진에 들어갑니다.
        </p>
      )}

      {canManage && !!assignmentSession?.player_ids?.length && (
        <div className="mt-4 border-t border-border/30 pt-4">
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
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {PRESETS.find((p) => p.value === preset)?.hint}
          </p>

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
    </Card>
  );
}
