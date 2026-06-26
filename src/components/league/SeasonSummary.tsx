import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trophy, Flame, Target, Swords, Users, TrendingUp, Crown, Medal, Handshake, Search, X } from "lucide-react";
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

const nameOf = (s: Student) => s.nickname || s.name;

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
  const [filterGroup, setFilterGroup] = useState<string | null>(null);

  // 필터 옵션: 데이터에 존재하는 레벨만
  const availableGroups = useMemo(
    () => Array.from(new Set(students.map((s) => s.group || "").filter((g) => g))).sort((a, b) => a.localeCompare(b, "ko")),
    [students]
  );

  // 전체/레벨로 좁힌 선수·경기 집합
  const filtered = useMemo(() => {
    const fStudents = students.filter(
      (s) => filterGroup == null || (s.group || "") === filterGroup
    );
    const ids = new Set(fStudents.map((s) => s.id));
    // 그룹이 참여한 경기 (한 명이라도 그룹에 속하면 포함)
    const fMatches = matches.filter((m) => ids.has(m.playerAId) || ids.has(m.playerBId));
    return { fStudents, fMatches };
  }, [students, matches, filterGroup]);

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

    // 최장 연승: 그룹 선수만, 경기 기록(시간순)으로 최대 연승 계산
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

    // 최다 맞대결 라이벌 페어 (그룹 내 두 선수 간)
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

  // 선수 상세 조회 (닉네임 검색)
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rankedAll = useMemo(() => [...students].sort((a, b) => b.rp - a.rp), [students]);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => nameOf(s).toLowerCase().includes(q)).slice(0, 8);
  }, [students, query]);
  const selected = useMemo(() => students.find((s) => s.id === selectedId) || null, [students, selectedId]);
  const detail = useMemo(() => {
    if (!selected) return null;
    const id = selected.id;
    const isWinSide = (m: Match) => m.playerAId === id || m.playerA2Id === id;
    const isLoseSide = (m: Match) => m.playerBId === id || m.playerB2Id === id;
    const myMatches = matches
      .filter((m) => isWinSide(m) || isLoseSide(m))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cur = 0, best = 0;
    for (const m of myMatches) { cur = isWinSide(m) ? cur + 1 : 0; if (cur > best) best = cur; }
    const h2h = new Map<string, { w: number; l: number }>();
    for (const m of myMatches) {
      const won = isWinSide(m);
      const oppIds = won ? [m.playerBId, m.playerB2Id] : [m.playerAId, m.playerA2Id];
      for (const oid of oppIds) {
        if (!oid) continue;
        const e = h2h.get(oid) || { w: 0, l: 0 };
        if (won) e.w++; else e.l++;
        h2h.set(oid, e);
      }
    }
    const h2hList = [...h2h.entries()]
      .map(([oid, rec]) => ({ opp: students.find((s) => s.id === oid) || null, ...rec }))
      .filter((x) => x.opp)
      .sort((a, b) => (b.w + b.l) - (a.w + a.l));
    const games = selected.wins + selected.losses;
    return {
      rank: rankedAll.findIndex((s) => s.id === id) + 1,
      tier: tierOf(selected.rp, thresholds),
      winRate: games > 0 ? Math.round((selected.wins / games) * 100) : 0,
      longest: best,
      totalMatches: myMatches.length,
      recent: myMatches.slice(-5).reverse().map((m) => (isWinSide(m) ? "W" : "L")),
      h2hList,
    };
  }, [selected, matches, students, rankedAll, thresholds]);

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

      {/* 선수 상세 조회 */}
      <Card className="border border-border/60 bg-card/60 p-4 backdrop-blur shadow-md space-y-3">
        <div className="flex items-center gap-2 text-neon-blue">
          <Search className="size-4" />
          <span className="text-xs font-bold uppercase tracking-wider">선수 상세 조회</span>
        </div>
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
          placeholder="닉네임으로 검색해 시즌 상세 통계 보기..."
          className="h-9 bg-input border-border/40 text-sm"
        />
        {query.trim() && !selected && (
          <div className="flex flex-wrap gap-1.5">
            {searchResults.length === 0 ? (
              <span className="px-1 py-1 text-xs text-muted-foreground">검색 결과가 없습니다.</span>
            ) : searchResults.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/60 px-2.5 py-1 text-xs font-bold transition-all hover:border-neon-blue/50 active:scale-95">
                {nameOf(s)}{s.group && <span className="text-[10px] text-muted-foreground">· {s.group}</span>}
              </button>
            ))}
          </div>
        )}

        {selected && detail && (
          <div className="rounded-xl border border-neon-blue/30 bg-neon-blue/[0.04] p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-lg font-black">{nameOf(selected)}</span>
                  <span className={cn("text-xs font-black shrink-0", TIER_COLOR[detail.tier])}>{TIER_LABEL[detail.tier]}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {selected.group || "레벨 미지정"}{detail.rank > 0 ? ` · 시즌 ${detail.rank}위` : ""}
                </div>
              </div>
              <button type="button" onClick={() => { setSelectedId(null); setQuery(""); }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="size-4" /></button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <Stat label="RP" value={`${selected.rp}`} />
              <Stat label="전적" value={`${selected.wins}승 ${selected.losses}패`} />
              <Stat label="승률" value={`${detail.winRate}%`} />
              <Stat label="경기" value={`${detail.totalMatches}`} />
              <Stat label="최장 연승" value={detail.longest > 1 ? `${detail.longest}연승` : "-"} />
            </div>

            {detail.recent.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground">최근</span>
                {detail.recent.map((r, i) => (
                  <span key={i} className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", r === "W" ? "bg-win/20 text-win" : "bg-loss/20 text-loss")}>{r}</span>
                ))}
              </div>
            )}

            {detail.h2hList.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">상대 전적</div>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {detail.h2hList.map(({ opp, w, l }) => (
                    <div key={opp!.id} className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-muted/15 px-2.5 py-1 text-xs">
                      <span className="truncate font-bold">{nameOf(opp!)}</span>
                      <span className="font-mono shrink-0"><span className="text-win">{w}승</span> <span className="text-loss">{l}패</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 전체 / 레벨 필터 */}
      {availableGroups.length > 0 && (
        <Card className="border border-border/60 bg-card/60 p-3 backdrop-blur shadow-md space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground mr-1">레벨</span>
            <FilterChip active={filterGroup == null} onClick={() => setFilterGroup(null)}>전체</FilterChip>
            {availableGroups.map((g) => (
              <FilterChip key={g} active={filterGroup === g} onClick={() => setFilterGroup(g)}>
                {g}
              </FilterChip>
            ))}
          </div>
        </Card>
      )}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/40 px-2 py-1.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-black tabular-nums">{value}</div>
    </div>
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
