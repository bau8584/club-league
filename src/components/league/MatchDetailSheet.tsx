import { useMemo } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useLeagueStore } from "@/lib/league-store";
import { TierBadge } from "./TierBadge";
import { GenderMark } from "./GenderMark";
import { isUnranked, type Match, type Student, type TierName } from "@/lib/league-types";
import { cn } from "@/lib/utils";

const dn = (s?: Student | null) => (s ? (s.nickname || s.name) : "?");

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 완료된 경기 1건의 상세 — 스코어 + 선수별 RP 변동. 배치고사 중 선수는 RP 은닉.
export function MatchDetailSheet({
  match, open, onOpenChange, thresholds,
}: {
  match: Match | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  thresholds?: Record<TierName, number>;
}) {
  const { students, placementEnabled, placementGames } = useLeagueStore();
  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  if (!match) return null;
  const isDouble = match.matchType === "double" || !!match.playerA2Id;

  // playerAId = 승자, playerBId = 패자 (스키마 컨벤션)
  const rows = [
    { id: match.playerAId, delta: match.rpDeltaA, win: true },
    ...(match.playerA2Id ? [{ id: match.playerA2Id, delta: match.rpDeltaA2, win: true }] : []),
    { id: match.playerBId, delta: match.rpDeltaB, win: false },
    ...(match.playerB2Id ? [{ id: match.playerB2Id, delta: match.rpDeltaB2, win: false }] : []),
  ];

  const winners = [match.playerAId, match.playerA2Id].filter(Boolean).map((id) => dn(byId.get(id as string))).join(" · ");
  const losers = [match.playerBId, match.playerB2Id].filter(Boolean).map((id) => dn(byId.get(id as string))).join(" · ");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-8 pt-2">
          <div className="mb-1 text-center text-[11px] font-bold text-muted-foreground">{fmtDate(match.date)} · {isDouble ? "복식" : "단식"}</div>

          {/* 스코어 */}
          <div className="my-4 flex items-center justify-center gap-4">
            <div className="flex-1 text-right">
              <div className="text-xs font-black text-win truncate">{winners}</div>
              <div className="text-3xl font-black text-win tabular-nums">{match.scoreA}</div>
            </div>
            <div className="text-sm font-black text-muted-foreground">VS</div>
            <div className="flex-1 text-left">
              <div className="text-xs font-black text-loss truncate">{losers}</div>
              <div className="text-3xl font-black text-loss tabular-nums">{match.scoreB}</div>
            </div>
          </div>

          {/* 선수별 RP 변동 */}
          <div className="space-y-2">
            {rows.map((r, i) => {
              const s = byId.get(r.id);
              const unranked = s ? isUnranked(s, placementEnabled, placementGames) : false;
              const delta = r.delta;
              return (
                <div key={`${r.id}-${i}`} className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-2.5",
                  r.win ? "border-win/30 bg-win/5" : "border-loss/30 bg-loss/5"
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-black", r.win ? "bg-win/15 text-win" : "bg-loss/15 text-loss")}>
                      {r.win ? "WIN" : "LOSE"}
                    </span>
                    {s && <GenderMark gender={s.gender} className="size-3.5" />}
                    <span className="truncate text-sm font-bold text-foreground">{dn(s)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unranked ? (
                      <span className="text-[11px] font-bold text-muted-foreground">배치 중</span>
                    ) : (
                      <>
                        {s && <TierBadge rp={s.rp} thresholds={thresholds} />}
                        {typeof delta === "number" && (
                          <span className={cn("font-mono text-xs font-black", delta >= 0 ? "text-win" : "text-loss")}>
                            {delta >= 0 ? "+" : ""}{delta} RP
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {rows.every((r) => typeof r.delta !== "number") && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">이 경기는 RP 변동 기록이 저장되기 전의 경기예요.</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
