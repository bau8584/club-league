import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, Flame, Target, Swords, Users, TrendingUp, Crown, Medal, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Student, Match, TierName } from "@/lib/league-types";

const TIER_ORDER: TierName[] = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const TIER_LABEL: Record<TierName, string> = {
  Bronze: "브론즈", Silver: "실버", Gold: "골드", Platinum: "플래티넘", Diamond: "다이아몬드",
};
const TIER_COLOR: Record<TierName, string> = {
  Bronze: "text-tier-bronze", Silver: "text-tier-silver", Gold: "text-tier-gold", Platinum: "text-tier-platinum", Diamond: "text-tier-diamond",
};

function tierOf(rp: number, thresholds?: Record<TierName, number>): TierName {
  if (!thresholds) return "Bronze";
  if (rp >= thresholds.Diamond) return "Diamond";
  if (rp >= thresholds.Platinum) return "Platinum";
  if (rp >= thresholds.Gold) return "Gold";
  if (rp >= thresholds.Silver) return "Silver";
  return "Bronze";
}

const nameOf = (s: Student) => s.realName || s.name;

export function SeasonSummary({
  season,
  students,
  matches,
  thresholds,
}: {
  season: string;
  students: Student[];
  matches: Match[];
  thresholds?: Record<TierName, number>;
}) {
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState<number | null>(null);

  // 필터 옵션: 데이터에 존재하는 학년/반만
  const availableGrades = useMemo(
    () => Array.from(new Set(students.map((s) => s.grade))).filter((g) => g > 0).sort((a, b) => a - b),
    [students]
  );
  const availableClasses = useMemo(
    () => filterGrade == null ? [] : Array.from(new Set(students.filter((s) => s.grade === filterGrade).map((s) => s.classNum))).filter((c) => c > 0).sort((a, b) => a - b),
    [students, filterGrade]
  );

  // 전체/학년/반으로 좁힌 학생·경기 집합
  const filtered = useMemo(() => {
    const fStudents = students.filter(
      (s) => (filterGrade == null || s.grade === filterGrade) && (filterClass == null || s.classNum === filterClass)
    );
    const ids = new Set(fStudents.map((s) => s.id));
    // 그룹이 참여한 경기 (한 명이라도 그룹에 속하면 포함)
    const fMatches = matches.filter((m) => ids.has(m.playerAId) || ids.has(m.playerBId));
    return { fStudents, fMatches };
  }, [students, matches, filterGrade, filterClass]);

  const stats = useMemo(() => {
    const group = filtered.fStudents;
    const involvingMatches = filtered.fMatches;
    const groupIds = new Set(group.map((s) => s.id));
    const ranked = [...group].sort((a, b) => b.rp - a.rp);
    const totalMatches = involvingMatches.length;
    const participants = group.length;
    const avgRp = participants > 0 ? Math.round(group.reduce((acc, s) => acc + s.rp, 0) / participants) : 0;

    const games = (s: Student) => s.wins + s.losses;
    const winRate = (s: Student) => (games(s) > 0 ? s.wins / games(s) : 0);

    const mostWins = [...group].filter((s) => s.wins > 0).sort((a, b) => b.wins - a.wins)[0] || null;
    const mostGames = [...group].filter((s) => games(s) > 0).sort((a, b) => games(b) - games(a))[0] || null;
    // 최고 승률: 최소 3경기 이상
    const bestWinRate = [...group]
      .filter((s) => games(s) >= 3)
      .sort((a, b) => winRate(b) - winRate(a) || b.wins - a.wins)[0] || null;

    // 최장 연승: 그룹 학생만, 경기 기록(시간순)으로 최대 연승 계산
    const byPlayer = new Map<string, { won: boolean; t: number }[]>();
    for (const m of involvingMatches) {
      const t = new Date(m.date).getTime();
      if (groupIds.has(m.playerAId)) {
        if (!byPlayer.has(m.playerAId)) byPlayer.set(m.playerAId, []);
        byPlayer.get(m.playerAId)!.push({ won: true, t });
      }
      if (groupIds.has(m.playerBId)) {
        if (!byPlayer.has(m.playerBId)) byPlayer.set(m.playerBId, []);
        byPlayer.get(m.playerBId)!.push({ won: false, t });
      }
    }
    let longestStreak = { id: "", count: 0 };
    for (const [id, list] of byPlayer) {
      list.sort((a, b) => a.t - b.t);
      let cur = 0, best = 0;
      for (const g of list) {
        cur = g.won ? cur + 1 : 0;
        if (cur > best) best = cur;
      }
      if (best > longestStreak.count) longestStreak = { id, count: best };
    }
    const longestStreakStudent = group.find((s) => s.id === longestStreak.id) || null;

    // 최다 맞대결 라이벌 페어 (그룹 내 두 학생 간)
    const pairCount = new Map<string, number>();
    for (const m of involvingMatches) {
      if (groupIds.has(m.playerAId) && groupIds.has(m.playerBId)) {
        const key = [m.playerAId, m.playerBId].sort().join("|");
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
    let topPair: { ids: string[]; count: number } = { ids: [], count: 0 };
    for (const [key, count] of pairCount) {
      if (count > topPair.count) topPair = { ids: key.split("|"), count };
    }
    const rivalPair =
      topPair.count > 1
        ? topPair.ids.map((id) => group.find((s) => s.id === id)).filter(Boolean) as Student[]
        : [];

    // 티어 분포
    const tierDist: Record<TierName, number> = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, Diamond: 0 };
    for (const s of group) tierDist[tierOf(s.rp, thresholds)]++;

    return {
      podium: ranked.slice(0, 3),
      totalMatches, participants, avgRp,
      mostWins, mostGames, bestWinRate,
      longestStreakStudent, longestStreakCount: longestStreak.count,
      rivalPair, rivalCount: topPair.count,
      tierDist,
    };
  }, [filtered, thresholds]);

  if (students.length === 0) {
    return (
      <Card className="border border-border/60 bg-card/60 p-10 text-center backdrop-blur shadow-xl">
        <p className="text-sm text-muted-foreground">이 시즌의 보관된 데이터가 없습니다.</p>
      </Card>
    );
  }

  const podiumStyle = ["text-tier-gold", "text-tier-silver", "text-tier-bronze"];
  const podiumIcon = [Crown, Medal, Medal];

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-neon-blue" />
        <h3 className="text-lg font-black tracking-tight">시즌 요약 · {season}</h3>
      </div>

      {/* 전체 / 학년 / 반 필터 */}
      <Card className="border border-border/60 bg-card/60 p-3 backdrop-blur shadow-md space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted-foreground mr-1">범위</span>
          <FilterChip active={filterGrade == null} onClick={() => { setFilterGrade(null); setFilterClass(null); }}>전체</FilterChip>
          {availableGrades.map((g) => (
            <FilterChip key={g} active={filterGrade === g} onClick={() => { setFilterGrade(g); setFilterClass(null); }}>
              {g}학년
            </FilterChip>
          ))}
        </div>
        {filterGrade != null && availableClasses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/20">
            <span className="text-[10px] font-bold text-muted-foreground mr-1">반</span>
            <FilterChip active={filterClass == null} onClick={() => setFilterClass(null)} accent="green">전체</FilterChip>
            {availableClasses.map((c) => (
              <FilterChip key={c} active={filterClass === c} onClick={() => setFilterClass(c)} accent="green">
                {c}반
              </FilterChip>
            ))}
          </div>
        )}
      </Card>

      {/* 시상대 (Top 3) */}
      <Card className="border border-border/60 bg-card/60 p-5 backdrop-blur shadow-xl">
        <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block mb-3">최종 순위</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.podium.map((s, idx) => {
            const Icon = podiumIcon[idx];
            return (
              <div key={s.id} className={cn(
                "rounded-xl border p-4 flex items-center gap-3",
                idx === 0 ? "border-tier-gold/40 bg-tier-gold/[0.07]" : "border-border/40 bg-muted/15"
              )}>
                <Icon className={cn("size-7 shrink-0", podiumStyle[idx])} />
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground font-bold">{idx + 1}위</div>
                  <div className="font-black truncate">{nameOf(s)}</div>
                  <div className="font-mono text-xs text-neon-blue font-bold">{s.rp} RP · {s.wins}승 {s.losses}패</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<Swords className="size-4" />} label="총 경기 수" value={`${stats.totalMatches}`} />
        <MetricCard icon={<Users className="size-4" />} label="참여 인원" value={`${stats.participants}명`} />
        <MetricCard icon={<TrendingUp className="size-4" />} label="평균 RP" value={`${stats.avgRp}`} />
        <MetricCard
          icon={<Flame className="size-4" />}
          label="최장 연승"
          value={stats.longestStreakStudent && stats.longestStreakCount > 1 ? `${stats.longestStreakCount}연승` : "-"}
          sub={stats.longestStreakStudent && stats.longestStreakCount > 1 ? nameOf(stats.longestStreakStudent) : undefined}
        />
      </div>

      {/* 부문별 1위 */}
      <Card className="border border-border/60 bg-card/60 p-5 backdrop-blur shadow-xl">
        <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block mb-3">부문별 기록</span>
        <div className="space-y-2.5">
          <AwardRow icon={<Trophy className="size-4 text-tier-gold" />} label="최다승"
            student={stats.mostWins} detail={stats.mostWins ? `${stats.mostWins.wins}승` : ""} />
          <AwardRow icon={<Target className="size-4 text-neon-green" />} label="최고 승률 (3경기+)"
            student={stats.bestWinRate}
            detail={stats.bestWinRate ? `${Math.round((stats.bestWinRate.wins / (stats.bestWinRate.wins + stats.bestWinRate.losses)) * 100)}% (${stats.bestWinRate.wins}승 ${stats.bestWinRate.losses}패)` : ""} />
          <AwardRow icon={<Swords className="size-4 text-neon-blue" />} label="최다 경기"
            student={stats.mostGames} detail={stats.mostGames ? `${stats.mostGames.wins + stats.mostGames.losses}경기` : ""} />
          {stats.rivalPair.length === 2 && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/15 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Handshake className="size-4 text-tier-platinum" />
                <span className="text-muted-foreground">최다 라이벌</span>
              </div>
              <span className="text-xs font-bold text-right">
                {nameOf(stats.rivalPair[0])} vs {nameOf(stats.rivalPair[1])} · {stats.rivalCount}회
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* 티어 분포 */}
      <Card className="border border-border/60 bg-card/60 p-5 backdrop-blur shadow-xl">
        <span className="text-xs font-bold text-neon-blue uppercase tracking-wider block mb-3">티어 분포</span>
        <div className="space-y-2">
          {TIER_ORDER.map((t) => {
            const count = stats.tierDist[t];
            const pct = stats.participants > 0 ? Math.round((count / stats.participants) * 100) : 0;
            return (
              <div key={t} className="flex items-center gap-3">
                <span className={cn("text-xs font-black w-16 shrink-0", TIER_COLOR[t])}>{TIER_LABEL[t]}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className={cn("h-full rounded-full bg-neon-blue/60")} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground font-mono w-12 text-right shrink-0">{count}명</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children, accent = "blue" }: { active: boolean; onClick: () => void; children: React.ReactNode; accent?: "blue" | "green" }) {
  const activeCls = accent === "green"
    ? "border-neon-green/50 bg-neon-green/15 text-neon-green"
    : "border-neon-blue/50 bg-neon-blue/15 text-neon-blue";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full border text-[11px] font-bold transition-all active:scale-95",
        active ? activeCls : "border-border/40 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/15 p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold">{icon}{label}</div>
      <div className="mt-1 text-xl font-black tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function AwardRow({ icon, label, student, detail }: { icon: React.ReactNode; label: string; student: Student | null; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/15 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-bold">
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-bold text-right">
        {student ? `${nameOf(student)} · ${detail}` : "-"}
      </span>
    </div>
  );
}
