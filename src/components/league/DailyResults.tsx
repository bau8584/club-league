import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Trophy, Swords, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTier, TIER_ORDER } from "@/lib/league-types";
import type { Match, Student } from "@/lib/league-types";

const displayName = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function DailyResults() {
  const { matches, students, tierThresholds } = useLeagueStore();
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

  // 오늘의 인물 키워드 (그날 경기 + 현재 티어만으로 계산 — 추가 쿼리 없음)
  const awards = useMemo(() => {
    const asc = [...dayMatches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const inc = (m: Map<string, number>, id?: string | null) => { if (id) m.set(id, (m.get(id) ?? 0) + 1); };
    const tierRank = (id?: string | null) => { const s = id ? byId.get(id) : null; return s ? TIER_ORDER.indexOf(getTier(s.rp, tierThresholds)) : -1; };

    const butcher = new Map<string, number>();   // 점수차 5+ 압승
    const upset = new Map<string, number>();      // 상위 티어 격파
    const nail = new Map<string, number>();       // 1~3점차 진땀승
    const nailLoss = new Map<string, number>();   // 1~3점차 아쉬운 패배
    const lossCount = new Map<string, number>();  // 패배 수
    const attend = new Map<string, number>();     // 출전
    const streakCur = new Map<string, number>();
    const streakMax = new Map<string, number>();
    const duo = new Map<string, { ids: string[]; w: number }>();

    for (const m of asc) {
      const margin = Math.abs(m.scoreA - m.scoreB);
      const winners = [m.playerAId, m.playerA2Id].filter(Boolean) as string[];
      const losers = [m.playerBId, m.playerB2Id].filter(Boolean) as string[];
      [...winners, ...losers].forEach((id) => inc(attend, id));
      const loserRank = Math.max(-1, ...losers.map(tierRank));
      for (const w of winners) {
        if (margin >= 5) inc(butcher, w);
        if (margin >= 1 && margin <= 3) inc(nail, w);
        if (tierRank(w) >= 0 && loserRank > tierRank(w)) inc(upset, w);
        const c = (streakCur.get(w) ?? 0) + 1;
        streakCur.set(w, c);
        streakMax.set(w, Math.max(streakMax.get(w) ?? 0, c));
      }
      for (const l of losers) {
        streakCur.set(l, 0);
        inc(lossCount, l);
        if (margin >= 1 && margin <= 3) inc(nailLoss, l);
      }
      if (m.matchType === "double" && m.playerA2Id) {
        const ids = [m.playerAId, m.playerA2Id].sort();
        const key = ids.join("|");
        const cur = duo.get(key) ?? { ids, w: 0 };
        cur.w++; duo.set(key, cur);
      }
    }

    const top = (mp: Map<string, number>, min: number) => {
      let best: { id: string; c: number } | null = null;
      for (const [id, c] of mp) if (c >= min && (!best || c > best.c)) best = { id, c };
      return best;
    };
    let topDuo: { ids: string[]; w: number } | null = null;
    for (const v of duo.values()) if (v.w >= 2 && (!topDuo || v.w > topDuo.w)) topDuo = v;

    const list: { emoji: string; key: string; id?: string; ids?: string[]; detail: string }[] = [];
    const b = top(butcher, 1); if (b) list.push({ emoji: "🔪", key: "학살자", id: b.id, detail: `5점차 이상으로 ${b.c}번이나 상대를 완파했어요.` });
    const u = top(upset, 1); if (u) list.push({ emoji: "🎯", key: "대이변러", id: u.id, detail: `자기보다 높은 티어를 ${u.c}번 꺾은 대이변의 주인공.` });
    const st = top(streakMax, 2); if (st) list.push({ emoji: "🔥", key: "연승왕", id: st.id, detail: `쉬지 않고 ${st.c}연승을 내달렸어요.` });
    const n = top(nail, 1); if (n) list.push({ emoji: "😤", key: "진땀승 장인", id: n.id, detail: `1~3점 차 손에 땀 쥐는 승부를 ${n.c}번 잡아냈어요.` });
    const at = top(attend, 1); if (at) list.push({ emoji: "🏃", key: "개근왕", id: at.id, detail: `오늘 ${at.c}경기, 끝까지 코트를 지킨 출석왕.` });
    if (topDuo) list.push({ emoji: "🤝", key: "환상의 복식조", ids: topDuo.ids, detail: `복식에서 ${topDuo.w}번 함께 이긴 환상의 짝꿍.` });
    // 패자 격려 — 위로/응원 카테고리
    const nl = top(nailLoss, 1); if (nl) list.push({ emoji: "💪", key: "근성상", id: nl.id, detail: `1~3점 차로 ${nl.c}번 아깝게 놓쳤어요. 다음 판은 당신 겁니다!` });
    const lc = top(lossCount, 2); if (lc && lc.id !== st?.id) list.push({ emoji: "🌱", key: "성장 중", id: lc.id, detail: `오늘 ${lc.c}패, 누구보다 많이 부딪히며 성장하는 중!` });
    return list;
  }, [dayMatches, byId, tierThresholds]);

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

      {/* 경기 요약 */}
      <div className="space-y-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">📊 경기 요약</span>
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
      </div>

      {/* 오늘의 인물 — 키워드 부여 */}
      {awards.length > 0 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🏅 오늘의 인물</span>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {awards.map((a) => {
              const name = a.ids
                ? a.ids.map((id) => displayName(byId.get(id) ?? { name: "?" })).join("·")
                : displayName(byId.get(a.id!) ?? { name: "?" });
              return (
                <div key={a.key} className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
                  {/* 닉네임 (강조·상단) */}
                  <span className="truncate text-xl font-black leading-tight text-foreground">{name}</span>
                  {/* 이모지 + 키워드 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{a.emoji}</span>
                    <span className="rounded-md bg-neon-blue/15 px-1.5 py-0.5 text-[11px] font-black text-neon-blue">{a.key}</span>
                  </div>
                  {/* 설명 */}
                  <span className="text-[11px] leading-snug text-muted-foreground">{a.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 경기 기록 */}
      <div className="space-y-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🏸 경기 기록</span>
        <Card className="border border-border/40 bg-card/50 p-4 backdrop-blur shadow-lg">
          {dayMatches.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">이 날에 기록된 경기가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
              {dayMatches.map((m) => <MatchRow key={m.id} m={m} byId={byId} />)}
            </div>
          )}
        </Card>
      </div>
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
      <span className="w-[38px] shrink-0 text-[9px] leading-tight text-muted-foreground sm:w-[46px] sm:text-[10px]">{time}</span>
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
