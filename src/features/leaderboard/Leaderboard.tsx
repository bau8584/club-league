import { useMemo, useState, useEffect } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { getTier, TIER_ORDER, TIER_STYLES, type TierName, type Student } from "@/lib/league-types";

type GenderFilter = "all" | "M" | "F";

function getWinStreak(recent: ("W" | "L")[]): number {
  let count = 0;
  for (const r of recent) {
    if (r === "W") count++;
    else break;
  }
  return count;
}

export function Leaderboard({ 
  students, 
  thresholds 
}: { 
  students: Student[]; 
  thresholds?: Record<TierName, number>;
}) {
  const [group, setGroup] = useState<string | "all">("all");
  const [tier, setTier] = useState<TierName | "all">("all");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [query, setQuery] = useState("");

  // 이중 보안 상태 및 자동 잠금 훅
  const [isUnlocked, setIsUnlocked] = useState(false);
  const { session } = useLeagueStore();
  const isDemo = session?.loginId === "guest" || session?.schoolName?.includes("꿈나무");

  useEffect(() => {
    setIsUnlocked(false);
    return () => {
      setIsUnlocked(false);
    };
  }, []);



  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.group) set.add(s.group);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  // 순위는 레벨/티어/성별 필터 집합 기준으로 매김(이름 검색과 무관).
  const ranked = useMemo(() => {
    return students
      .filter((s) => (group === "all" ? true : s.group === group))
      .filter((s) => (tier === "all" ? true : getTier(s.rp, thresholds) === tier))
      .filter((s) => (gender === "all" ? true : s.gender === gender))
      .sort((a, b) => b.rp - a.rp)
      .map((s, i) => ({ student: s, rank: i + 1 }));
  }, [students, group, tier, gender, thresholds]);

  // 이름 검색은 표시만 거른다(각자의 순위는 그대로 유지).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(({ student }) => (student.nickname || student.name).toLowerCase().includes(q));
  }, [ranked, query]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임으로 검색..."
            className="h-10 border-border/60 bg-card/60 pl-9 text-sm"
          />
        </div>

        {availableGroups.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">레벨</p>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={group === "all"} onClick={() => setGroup("all")}>전체보기</FilterChip>
              {availableGroups.map((g) => (
                <FilterChip key={g} active={group === g} onClick={() => setGroup(g)}>
                  {g}
                </FilterChip>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">티어</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={tier === "all"} onClick={() => setTier("all")}>전체 티어</FilterChip>
            {TIER_ORDER.map((t) => (
              <FilterChip
                key={t}
                active={tier === t}
                onClick={() => setTier(t)}
                tone={TIER_STYLES[t].text}
              >
                {TIER_STYLES[t].label}
              </FilterChip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">성별</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={gender === "all"} onClick={() => setGender("all")}>전체</FilterChip>
            <FilterChip active={gender === "M"} onClick={() => setGender("M")}>남자 순위 ♂</FilterChip>
            <FilterChip active={gender === "F"} onClick={() => setGender("F")}>여자 순위 ♀</FilterChip>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-border/60 bg-card/60 p-0 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left w-12 sm:w-16">순위</th>
                <th className="px-3 py-3 text-left hidden sm:table-cell">레벨</th>
                <th className="px-4 py-3 text-left">닉네임</th>
                <th className="px-4 py-3 text-left">티어</th>
                <th className="px-4 py-3 text-right">RP</th>
                <th className="px-4 py-3 text-center hidden md:table-cell">최근 5경기</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">승률</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ student: s, rank }) => {
                const total = s.wins + s.losses;
                const winRate = total === 0 ? 0 : Math.round((s.wins / total) * 100);
                return (
                  <tr key={s.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3 font-bold tabular-nums w-12 sm:w-16">
                      <RankBadge rank={rank} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground hidden sm:table-cell">{s.group || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-semibold">
                        <GenderMark gender={s.gender} />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span>{s.nickname || s.name}</span>
                          {s.group && (
                            <span className="text-[10px] text-muted-foreground sm:hidden">
                              ({s.group})
                            </span>
                          )}
                        </div>
                        {getWinStreak(s.recent) >= 3 && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-black text-orange-500 ring-1 ring-orange-500/30 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.2)]"
                            title={`${getWinStreak(s.recent)}연승 중! 🔥`}
                          >
                            🔥 {getWinStreak(s.recent)}연승
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><TierBadge rp={s.rp} thresholds={thresholds} /></td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-neon-blue text-glow-blue">{s.rp}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center justify-center gap-1">
                        {Array.from({ length: 5 }).map((_, idx) => {
                          const r = s.recent[idx];
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
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                      <span className="font-semibold">{winRate}%</span>
                      <span className="ml-1 text-xs text-muted-foreground">({s.wins}W {s.losses}L)</span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground animate-pulse">조건에 맞는 선수가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilterChip({
  active, onClick, children, tone,
}: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold transition-all",
        active
          ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue glow-primary"
          : cn("border-border/60 bg-card/40 hover:text-foreground", tone ?? "text-muted-foreground"),
      )}
    >
      {children}
    </Button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-glow-gold text-gold">#{rank}</span>;
  if (rank === 2) return <span className="text-tier-silver">#{rank}</span>;
  if (rank === 3) return <span className="text-tier-bronze">#{rank}</span>;
  return <span className="text-muted-foreground">#{rank}</span>;
}
