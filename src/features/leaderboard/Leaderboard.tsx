import { useMemo, useState, useEffect } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { TitleBadge } from "@/components/league/TitleBadge";
import { PlayerDetailSheet } from "@/components/league/PlayerDetailSheet";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { getTier, isUnranked, TIER_ORDER, TIER_STYLES, type TierName, type Student } from "@/lib/league-types";

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
  const [group, setGroup] = useState<string[]>([]);   // 다중 선택 (빈 배열 = 전체)
  const [tier, setTier] = useState<TierName[]>([]);    // 다중 선택 (빈 배열 = 전체)
  const [gender, setGender] = useState<GenderFilter>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const activeCount = (group.length > 0 ? 1 : 0) + (tier.length > 0 ? 1 : 0) + (gender !== "all" ? 1 : 0);
  const resetFilters = () => { setGroup([]); setTier([]); setGender("all"); };
  const genderLabel = gender === "M" ? "남자" : gender === "F" ? "여자" : null;
  const toggleGroup = (g: string) => setGroup((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  const toggleTier = (t: TierName) => setTier((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  // 이중 보안 상태 및 자동 잠금 훅
  const [isUnlocked, setIsUnlocked] = useState(false);
  const { session, placementEnabled, placementGames, getEquippedTitle } = useLeagueStore();
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
  // 배치고사 미완료(언랭크) 회원은 순위 없이(??) 맨 아래에 이름 오름차순으로 붙인다.
  const ranked = useMemo(() => {
    const passesFilters = (s: Student) =>
      (group.length === 0 ? true : !!s.group && group.includes(s.group)) &&
      (gender === "all" ? true : s.gender === gender);

    const rankedPart: { student: Student; rank: number | null; unranked: boolean }[] = students
      .filter((s) => !isUnranked(s, placementEnabled, placementGames))
      .filter(passesFilters)
      .filter((s) => (tier.length === 0 ? true : tier.includes(getTier(s.rp, thresholds))))
      .sort((a, b) => b.rp - a.rp)
      .map((s, i) => ({ student: s, rank: i + 1, unranked: false }));

    // 언랭크: 티어 필터가 걸려 있으면(특정 티어만 보기) 제외, 아니면 이름순으로 맨 아래에.
    const unrankedPart: { student: Student; rank: number | null; unranked: boolean }[] = tier.length > 0
      ? []
      : students
        .filter((s) => isUnranked(s, placementEnabled, placementGames))
        .filter(passesFilters)
        .sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "ko"))
        .map((s) => ({ student: s, rank: null, unranked: true }));

    return [...rankedPart, ...unrankedPart];
  }, [students, group, tier, gender, thresholds, placementEnabled, placementGames]);

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

        {/* 필터 토글 */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs font-bold transition-all hover:border-neon-blue/40"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-neon-blue" /> 필터
            {activeCount > 0 && (
              <span className="rounded-full bg-neon-blue/15 px-1.5 py-0.5 text-[10px] text-neon-blue">{activeCount}</span>
            )}
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", filtersOpen && "rotate-180")} />
        </button>

        {/* 접힘 상태 활성 필터 요약 */}
        {!filtersOpen && activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {group.map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] font-bold">
                {g}<button type="button" onClick={() => toggleGroup(g)} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
              </span>
            ))}
            {tier.map((t) => (
              <span key={t} className={cn("inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] font-bold", TIER_STYLES[t].text)}>
                {TIER_STYLES[t].label}<button type="button" onClick={() => toggleTier(t)} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
              </span>
            ))}
            {genderLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] font-bold">
                {genderLabel}<button type="button" onClick={() => setGender("all")} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
              </span>
            )}
            <button type="button" onClick={resetFilters} className="text-[10px] text-muted-foreground underline hover:text-foreground">전체 초기화</button>
          </div>
        )}

        {/* 펼친 필터 그룹 */}
        {filtersOpen && (
          <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-3 animate-in fade-in slide-in-from-top-1 duration-150">
            {availableGroups.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">레벨</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={group.length === 0} onClick={() => setGroup([])}>전체보기</FilterChip>
                  {availableGroups.map((g) => (
                    <FilterChip key={g} active={group.includes(g)} onClick={() => toggleGroup(g)}>
                      {g}
                    </FilterChip>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">티어</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={tier.length === 0} onClick={() => setTier([])}>전체 티어</FilterChip>
                {TIER_ORDER.map((t) => (
                  <FilterChip
                    key={t}
                    active={tier.includes(t)}
                    onClick={() => toggleTier(t)}
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
            {activeCount > 0 && (
              <button type="button" onClick={resetFilters} className="text-[11px] font-bold text-muted-foreground underline hover:text-foreground">필터 전체 초기화</button>
            )}
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-border/60 bg-card/60 p-0 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-3 text-left w-10 sm:w-14">순위</th>
                <th className="px-4 py-3 text-left">닉네임</th>
                <th className="px-4 py-3 text-left">티어</th>
                <th className="px-4 py-3 text-center hidden md:table-cell">최근 5경기</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">승률</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ student: s, rank, unranked }) => {
                const total = s.wins + s.losses;
                const winRate = total === 0 ? 0 : Math.round((s.wins / total) * 100);
                return (
                  <tr key={s.id} className="border-b border-border/30 transition-colors hover:bg-accent/40">
                    <td className="px-2 py-3 font-bold tabular-nums w-10 sm:w-14">
                      {unranked ? <span className="text-muted-foreground/60">??</span> : <RankBadge rank={rank!} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-semibold">
                        <GenderMark gender={s.gender} />
                        <button
                          type="button"
                          onClick={() => { setDetailStudent(s); setDetailOpen(true); }}
                          className="flex items-center gap-1.5 text-left transition-colors hover:text-neon-blue active:scale-[0.98]"
                        >
                          {(() => { const t = getEquippedTitle(s); return t ? <TitleBadge title={t} /> : null; })()}
                          <span>{s.nickname || s.name}</span>
                        </button>
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
                    <td className="px-4 py-3">
                      <TierBadge rp={s.rp} thresholds={thresholds} unranked={unranked} />
                    </td>
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
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground animate-pulse">조건에 맞는 선수가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PlayerDetailSheet
        student={detailStudent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        students={students}
        thresholds={thresholds}
      />
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
