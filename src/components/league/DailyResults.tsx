import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Trophy, Swords, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Match, Student } from "@/lib/league-types";

const displayName = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function DailyResults() {
  const { matches, students } = useLeagueStore();
  const [date, setDate] = useState<Date>(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  // 선택일 경기 (최신순)
  const dayMatches = useMemo(() => {
    return (matches ?? [])
      .filter((m) => sameDay(new Date(m.date), date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, date]);

  // 통계
  const stats = useMemo(() => {
    const players = new Set<string>();
    let singles = 0, doubles = 0;
    const winCount = new Map<string, number>();
    for (const m of dayMatches) {
      const isDouble = !!(m.playerA2Id || m.playerB2Id);
      isDouble ? doubles++ : singles++;
      for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) if (pid) players.add(pid);
      // 승자 = A팀(playerAId가 승자 ID 규약)
      for (const pid of [m.playerAId, m.playerA2Id]) if (pid) winCount.set(pid, (winCount.get(pid) ?? 0) + 1);
    }
    let topWinner: { id: string; wins: number } | null = null;
    for (const [id, wins] of winCount) if (!topWinner || wins > topWinner.wins) topWinner = { id, wins };
    return { total: dayMatches.length, players: players.size, singles, doubles, topWinner };
  }, [dayMatches]);

  const isToday = sameDay(date, new Date());
  const dateLabel = date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="space-y-5 animate-in fade-in duration-200 max-w-3xl">
      {/* 헤더 + 날짜 이동 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
            <Calendar className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-foreground">오늘의 경기</h2>
            <p className="text-[11px] text-muted-foreground">{dateLabel}{isToday && " · 오늘"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9 border-border/50" onClick={() => setDate((d) => addDays(d, -1))} title="이전 날">
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 border-border/50 font-sans text-xs">
                <Calendar className="size-4 text-muted-foreground" /> 날짜 선택
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DayCalendar mode="single" selected={date} onSelect={(d) => { if (d) setDate(d); setPickerOpen(false); }} autoFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="size-9 border-border/50" onClick={() => setDate((d) => addDays(d, 1))} disabled={isToday} title="다음 날">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard icon={<Swords className="size-4" />} label="총 경기" value={`${stats.total}`} />
        <StatCard icon={<Users className="size-4" />} label="참여 인원" value={`${stats.players}`} />
        <StatCard icon={<span className="text-[11px] font-black">단·복</span>} label="단식 / 복식" value={`${stats.singles} / ${stats.doubles}`} />
        <StatCard
          icon={<Trophy className="size-4" />}
          label="최다승"
          value={stats.topWinner ? `${displayName(byId.get(stats.topWinner.id) ?? { name: "?" })} (${stats.topWinner.wins})` : "—"}
        />
      </div>

      {/* 경기 목록 */}
      <Card className="border border-border/40 bg-card/50 p-4 backdrop-blur shadow-lg">
        {dayMatches.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">이 날에 기록된 경기가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {dayMatches.map((m) => <MatchRow key={m.id} m={m} byId={byId} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-neon-blue">{icon}</span>
        <span className="text-[10px] font-bold">{label}</span>
      </div>
      <span className="truncate text-sm font-black text-foreground">{value}</span>
    </div>
  );
}

function MatchRow({ m, byId }: { m: Match; byId: Map<string, Student> }) {
  const get = (id?: string | null) => (id ? byId.get(id) : null);
  const pA = get(m.playerAId) ?? { name: "알 수 없음", nickname: null };
  const pB = get(m.playerBId) ?? { name: "알 수 없음", nickname: null };
  const pA2 = get(m.playerA2Id);
  const pB2 = get(m.playerB2Id);
  const aWon = m.scoreA > m.scoreB;
  const teamA = pA2 ? `${displayName(pA)}·${displayName(pA2)}` : displayName(pA);
  const teamB = pB2 ? `${displayName(pB)}·${displayName(pB2)}` : displayName(pB);
  const time = new Date(m.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-input/40 px-2.5 py-2">
      <span className="hidden w-[48px] shrink-0 text-[10px] text-muted-foreground sm:block">{time}</span>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs">
        <span className={cn("min-w-0 flex-1 truncate text-right font-bold", aWon ? "text-neon-blue" : "text-foreground")} title={teamA}>{teamA}</span>
        <span className="shrink-0 select-none rounded bg-muted/60 px-2 py-0.5 font-mono text-[13px] font-bold">
          <span className={cn(aWon ? "text-win" : "text-loss")}>{m.scoreA}</span>
          <span className="mx-0.5 text-muted-foreground">:</span>
          <span className={cn(!aWon ? "text-win" : "text-loss")}>{m.scoreB}</span>
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-left font-bold", !aWon ? "text-neon-blue" : "text-foreground")} title={teamB}>{teamB}</span>
      </div>
    </div>
  );
}
