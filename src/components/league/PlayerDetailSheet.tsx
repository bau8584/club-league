import { useMemo, useState, useEffect } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useLeagueStore } from "@/lib/league-store";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { TitleBadge } from "@/components/league/TitleBadge";
import { getFullTierLabel, type Student, type TierName } from "@/lib/league-types";
import { cn } from "@/lib/utils";
import { Swords, ChevronDown } from "lucide-react";

function getWinStreak(recent: ("W" | "L")[]): number {
  let count = 0;
  for (const r of recent) {
    if (r === "W") count++;
    else break;
  }
  return count;
}

// store 와 동일한 로컬 타임존 기준 YYYY-MM-DD
function localYmd(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

export function PlayerDetailSheet({
  student,
  open,
  onOpenChange,
  students,
  thresholds,
}: {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  thresholds?: Record<TierName, number>;
}) {
  const { matches, myPlayerId, createChallenge, getEquippedTitle } = useLeagueStore();
  const [showLog, setShowLog] = useState(false);

  // 시트를 다시 열 때마다 전적 펼침 상태 초기화
  useEffect(() => {
    if (!open) setShowLog(false);
  }, [open]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => map.set(s.id, s.nickname || s.name));
    return (id?: string | null) => (id ? map.get(id) ?? "?" : null);
  }, [students]);

  // 이 선수가 치른 경기(최신순)
  const myMatches = useMemo(() => {
    if (!student) return [];
    return matches
      .filter(
        (m) =>
          m.playerAId === student.id ||
          m.playerBId === student.id ||
          m.playerA2Id === student.id ||
          m.playerB2Id === student.id,
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, student]);

  // 오늘의 승률
  const today = useMemo(() => {
    const todayYmd = localYmd(new Date().toISOString());
    const todays = myMatches.filter((m) => localYmd(m.date) === todayYmd);
    let wins = 0;
    todays.forEach((m) => {
      const isA = m.playerAId === student?.id || m.playerA2Id === student?.id;
      const aWon = m.scoreA > m.scoreB;
      if (isA ? aWon : !aWon) wins++;
    });
    const total = todays.length;
    return { total, wins, losses: total - wins, rate: total === 0 ? null : Math.round((wins / total) * 100) };
  }, [myMatches, student]);

  // 최근 5경기 상세(상대·스코어·승패)
  const recentLog = useMemo(() => {
    if (!student) return [];
    return myMatches.slice(0, 5).map((m) => {
      const isA = m.playerAId === student.id || m.playerA2Id === student.id;
      const aWon = m.scoreA > m.scoreB;
      const won = isA ? aWon : !aWon;
      const myScore = isA ? m.scoreA : m.scoreB;
      const oppScore = isA ? m.scoreB : m.scoreA;
      const myTeam = isA ? [m.playerAId, m.playerA2Id] : [m.playerBId, m.playerB2Id];
      const partnerId = myTeam.find((pid) => pid && pid !== student.id);
      const partner = partnerId ? nameOf(partnerId) : null;
      const oppNames = (isA ? [m.playerBId, m.playerB2Id] : [m.playerAId, m.playerA2Id])
        .map(nameOf)
        .filter(Boolean) as string[];
      return { id: m.id, won, myScore, oppScore, opp: oppNames.join("·") || "?", partner };
    });
  }, [myMatches, student, nameOf]);

  const selfName = student ? student.nickname || student.name : "";

  if (!student) return null;

  const total = student.wins + student.losses;
  const winRate = total === 0 ? 0 : Math.round((student.wins / total) * 100);
  const streak = getWinStreak(student.recent);
  const title = getEquippedTitle(student);
  const canChallenge = !!myPlayerId && student.id !== myPlayerId;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-border/60 bg-card">
        <div className="mx-auto w-full max-w-md overflow-y-auto px-5 pb-8 pt-2" style={{ maxHeight: "80vh" }}>
          {/* 헤더 */}
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="flex min-w-0 items-center gap-2">
              <GenderMark gender={student.gender} />
              {title && <TitleBadge title={title} />}
              <span className="truncate text-lg font-bold">{student.nickname || student.name}</span>
            </div>
            <TierBadge rp={student.rp} thresholds={thresholds} />
          </div>

          {/* RP / 오늘의 승률 */}
          <div className="grid grid-cols-2 gap-2.5 pb-3">
            <div className="rounded-xl bg-muted/40 px-3.5 py-2.5">
              <p className="text-[11px] font-bold text-muted-foreground">RP</p>
              <p className="font-mono text-xl font-black text-neon-blue">{student.rp}</p>
            </div>
            <div className="rounded-xl bg-muted/40 px-3.5 py-2.5">
              <p className="text-[11px] font-bold text-muted-foreground">오늘의 승률</p>
              {today.rate === null ? (
                <p className="text-sm font-bold text-muted-foreground">오늘 경기 없음</p>
              ) : (
                <p className="text-xl font-black">
                  {today.rate}%
                  <span className="ml-1 text-[11px] font-bold text-muted-foreground">
                    {today.wins}승 {today.losses}패
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* 전체 승률 */}
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-muted-foreground">전체 승률</span>
            <span className="text-sm font-black">
              {winRate}%
              <span className="ml-1 text-[11px] font-bold text-muted-foreground">
                {student.wins}승 {student.losses}패
              </span>
            </span>
          </div>

          {/* 최근 5경기 (점 + 연승) */}
          <div className="flex items-center gap-2.5 pt-4">
            <span className="text-[11px] font-bold text-muted-foreground">최근 5경기</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, idx) => {
                const r = student.recent[idx];
                return (
                  <span
                    key={idx}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[10px] font-bold",
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
            {streak >= 2 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-black text-orange-500 ring-1 ring-orange-500/30">
                🔥 {streak}연승
              </span>
            )}
          </div>

          {/* 최근 전적 펼치기 */}
          {recentLog.length > 0 && (
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs font-bold text-muted-foreground transition-all hover:border-neon-blue/40 hover:text-foreground"
              >
                최근 전적 보기
                <ChevronDown className={cn("size-4 transition-transform", showLog && "rotate-180")} />
              </button>
              {showLog && (
                <ul className="mt-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  {recentLog.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="font-bold text-neon-blue">{selfName}</span>
                        {r.partner && <><span className="text-muted-foreground">·</span><span className="font-semibold text-foreground">{r.partner}</span></>}
                        <span className="text-muted-foreground"> vs </span>
                        <span className="font-semibold text-foreground">{r.opp}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono font-bold tabular-nums">{r.myScore} : {r.oppScore}</span>
                        <span className={cn("w-4 text-right font-black", r.won ? "text-win" : "text-loss")}>
                          {r.won ? "승" : "패"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 도전장 보내기 */}
          {canChallenge && (
            <button
              type="button"
              onClick={async () => {
                const ok = await createChallenge(student.id);
                if (ok) onOpenChange(false);
              }}
              className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-sm font-black text-amber-500 transition-all hover:bg-amber-500/20 active:scale-[0.98]"
            >
              <Swords className="size-4" /> 도전장 보내기
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
