import { useEffect, useMemo, useState } from "react";
import { apiFetchLeaguePublic, apiFetchRankingPublic } from "@/services/league-api";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { TierBadge } from "@/components/league/TierBadge";
import { GenderMark } from "@/components/league/GenderMark";
import { cn } from "@/lib/utils";
import { getTier, isUnranked, schoolLabelCompact, schoolAxesOf, TIER_ORDER, TIER_STYLES, type Gender, type TierName } from "@/lib/league-types";
import { FilterChip } from "@/features/leaderboard/Leaderboard";
import { termsFor } from "@/lib/league-terms";
import { Trophy, RefreshCw, SlidersHorizontal, ChevronDown } from "lucide-react";

// get_ranking_public RPC 가 내려주는 모양. 학교 리그의 display_name 은 서버에서 마스킹된 이름이다.
type PublicPlayer = {
  id: string;
  rp: number;
  display_name: string | null;
  group_label: string | null;
  gender: Gender;
  win_count: number;
  lose_count: number;
  grade: number | null;
  class_num: number | null;
  student_no: number | null;
};

type GenderFilter = "all" | "M" | "F";

// 순위표는 50명씩 끊어 그린다(수백 행을 한 번에 그리면 필터 조작이 눈에 띄게 느려진다).
const PAGE_SIZE = 50;

type PublicLeague = {
  id: string;
  name: string;
  league_type: "club" | "school";
  season: string;
  tier_thresholds: Record<TierName, number> | null;
  placement: { enabled?: boolean; games?: number } | null;
};

/**
 * 무인증 공개 순위표(B안).
 * 로그인 없이 리그의 순위만 열람한다. 본명(name)과 개인 상세는 노출하지 않는다
 * — players_public 뷰(닉네임/표시이름만)와 get_league_public RPC만 사용.
 */
export function PublicRanking({ classId }: { classId: string }) {
  const [league, setLeague] = useState<PublicLeague | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // quiet=true면 전체 로딩 화면을 띄우지 않고 조용히 값만 바꾼다(주기 갱신용).
  const load = async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [{ data: lg, error: lgErr }, { data: ps, error: psErr }] = await Promise.all([
        apiFetchLeaguePublic(classId),
        apiFetchRankingPublic(classId),
      ]);
      if (lgErr) throw lgErr;
      if (psErr) throw psErr;
      const row = Array.isArray(lg) ? lg[0] : lg;
      if (!row) throw new Error("리그를 찾을 수 없습니다.");
      setLeague(row as PublicLeague);
      setPlayers((ps || []) as PublicPlayer[]);
    } catch (err: any) {
      // 조용한 갱신이 실패하면 이미 보고 있는 순위표를 지우지 않고 그대로 둔다.
      if (!quiet) setError(err?.message || "순위표를 불러오지 못했습니다.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // 공개 화면이라 세션이 없어도 동작해야 한다. 리그가 바뀌면 다시 조회.
  }, [classId]);

  // 갱신 방식: 실시간(Realtime) 구독 대신 30초 폴링.
  //   공개 링크는 한 리그에 수백 명이 동시에 열 수 있는데, 실시간 구독은 열어둔 사람
  //   1명당 연결 1개를 계속 점유해 동시 연결 한도를 가장 먼저 소진시킨다.
  //   순위표는 초 단위 최신성이 필요 없으므로 주기 조회로 충분하다(열람자 수만큼 곱해지는
  //   조회이므로 주기는 넉넉하게 잡는다).
  //   탭이 가려져 있으면 쉬고, 다시 보일 때 한 번 당겨온다.
  useEffect(() => {
    const REFRESH_MS = 60_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void load({ quiet: true }); }, REFRESH_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { void load({ quiet: true }); start(); }
      else stop();
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [classId]);

  const terms = termsFor(league?.league_type ?? "club");
  const isSchool = league?.league_type === "school";
  const placementEnabled = !!league?.placement?.enabled;
  const placementGames = league?.placement?.games ?? 3;

  // 명단 구성에 따라 학년/반 축을 숨긴다 (학급 리그면 번호만 의미 있음).
  const axes = useMemo(
    () => schoolAxesOf(players.map((p) => ({ grade: p.grade, classNum: p.class_num }))),
    [players],
  );

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    players.forEach((p) => { if (p.group_label) set.add(p.group_label); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [players]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [group, setGroup] = useState<string[]>([]);
  const [grade, setGrade] = useState<number[]>([]);
  const [classNum, setClassNum] = useState<number[]>([]);
  const [tier, setTier] = useState<TierName[]>([]);
  const [gender, setGender] = useState<GenderFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  // 눌린 선수 — 이미 받아온 값만 보여준다(추가 조회 없음).
  const [picked, setPicked] = useState<{ p: PublicPlayer; rank: number | null } | null>(null);

  const showGrade = isSchool && axes.varyGrade;
  const showClass = isSchool && axes.varyClass;
  const showGroup = !isSchool && availableGroups.length > 0;
  const activeCount =
    (showGroup && group.length > 0 ? 1 : 0) +
    (showGrade && grade.length > 0 ? 1 : 0) +
    (showClass && classNum.length > 0 ? 1 : 0) +
    (tier.length > 0 ? 1 : 0) +
    (gender !== "all" ? 1 : 0);
  const resetFilters = () => { setGroup([]); setGrade([]); setClassNum([]); setTier([]); setGender("all"); };
  const toggle = <T,>(set: (fn: (p: T[]) => T[]) => void) => (v: T) =>
    set((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const toggleGroup = toggle<string>(setGroup);
  const toggleGrade = toggle<number>(setGrade);
  const toggleClass = toggle<number>(setClassNum);
  const toggleTier = toggle<TierName>(setTier);

  useEffect(() => { setLimit(PAGE_SIZE); }, [group, grade, classNum, tier, gender]);

  // 순위는 필터로 고른 집합 안에서 다시 매긴다(랭킹 화면과 같은 규칙).
  const ranked = useMemo(() => {
    const thresholds = league?.tier_thresholds ?? undefined;
    return players
      .filter((p) =>
        (!showGroup || group.length === 0 ? true : !!p.group_label && group.includes(p.group_label)) &&
        (!showGrade || grade.length === 0 ? true : p.grade != null && grade.includes(p.grade)) &&
        (!showClass || classNum.length === 0 ? true : p.class_num != null && classNum.includes(p.class_num)) &&
        (gender === "all" ? true : p.gender === gender) &&
        (tier.length === 0 ? true : tier.includes(getTier(p.rp, thresholds))))
      .map((p) => ({ ...p, wins: p.win_count ?? 0, losses: p.lose_count ?? 0 }))
      .sort((a, b) => b.rp - a.rp);
  }, [players, league, group, grade, classNum, tier, gender, showGroup, showGrade, showClass]);

  const shown = useMemo(() => ranked.slice(0, limit), [ranked, limit]);
  const restCount = ranked.length - shown.length;

  const nameOf = (p: PublicPlayer) => p.display_name || "이름 미등록";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-muted/30 border-t-neon-blue animate-spin" />
          <span className="text-xs font-black tracking-wider text-muted-foreground animate-pulse">순위표를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
          <p className="text-sm font-bold text-destructive">순위표를 볼 수 없습니다.</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{error ?? "리그를 찾을 수 없습니다."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-lg font-black tracking-tight sm:text-xl">
              <Trophy className="size-5 shrink-0 text-neon-blue" />
              {league.name}
            </h1>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {league.season} · {activeCount > 0 ? `조건에 맞는 ${terms.member} ${ranked.length}명` : `등록 ${terms.member} ${players.length}명`} · 로그인 없이 볼 수 있는 공개 순위표입니다.
            </p>
          </div>
          <button
            onClick={() => void load()}
            title="새로고침"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition-all hover:border-neon-blue/40 hover:text-neon-blue active:scale-95"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        {/* 필터 — 랭킹 화면과 같은 축(학교: 학년·반 / 동호회: 레벨, 공통: 티어·성별) */}
        <div className="space-y-3">
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

          {filtersOpen && (
            <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-3">
              {showGroup && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">레벨</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip active={group.length === 0} onClick={() => setGroup([])}>전체보기</FilterChip>
                    {availableGroups.map((g) => (
                      <FilterChip key={g} active={group.includes(g)} onClick={() => toggleGroup(g)}>{g}</FilterChip>
                    ))}
                  </div>
                </div>
              )}
              {showGrade && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">학년</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip active={grade.length === 0} onClick={() => setGrade([])}>전체 학년</FilterChip>
                    {axes.grades.map((g) => (
                      <FilterChip key={g} active={grade.includes(g)} onClick={() => toggleGrade(g)}>{g}학년</FilterChip>
                    ))}
                  </div>
                </div>
              )}
              {showClass && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">반</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip active={classNum.length === 0} onClick={() => setClassNum([])}>전체 반</FilterChip>
                    {axes.classes.map((c) => (
                      <FilterChip key={c} active={classNum.includes(c)} onClick={() => toggleClass(c)}>{c}반</FilterChip>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">티어</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={tier.length === 0} onClick={() => setTier([])}>전체 티어</FilterChip>
                  {TIER_ORDER.map((t) => (
                    <FilterChip key={t} active={tier.includes(t)} onClick={() => toggleTier(t)} tone={TIER_STYLES[t].text}>
                      {TIER_STYLES[t].label}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">성별</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={gender === "all"} onClick={() => setGender("all")}>전체</FilterChip>
                  <FilterChip active={gender === "M"} onClick={() => setGender("M")}>남자 ♂</FilterChip>
                  <FilterChip active={gender === "F"} onClick={() => setGender("F")}>여자 ♀</FilterChip>
                </div>
              </div>
              {activeCount > 0 && (
                <button type="button" onClick={resetFilters} className="text-[11px] font-bold text-muted-foreground underline hover:text-foreground">
                  필터 전체 초기화
                </button>
              )}
            </div>
          )}
        </div>

        {ranked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/40 bg-muted/5 py-10 text-center text-xs text-muted-foreground">
            {activeCount > 0 ? "조건에 맞는 " + terms.member + "이 없습니다." : "아직 등록된 " + terms.member + "이 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-center font-bold">순위</th>
                  <th className="px-2 py-2.5 text-left font-bold">{terms.nameLabel}</th>
                  <th className="px-2 py-2.5 text-left font-bold">{isSchool ? "소속" : "레벨"}</th>
                  <th className="px-2 py-2.5 text-center font-bold">티어</th>
                  <th className="px-2 py-2.5 text-center font-bold">전적</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => {
                  const unranked = isUnranked(p, placementEnabled, placementGames);
                  return (
                    <tr key={p.id} className="border-t border-border/30">
                      <td className={cn(
                        "px-3 py-2 text-center font-mono font-black tabular-nums",
                        i === 0 ? "text-tier-gold" : i === 1 ? "text-tier-silver" : i === 2 ? "text-tier-bronze" : "text-muted-foreground"
                      )}>
                        {unranked ? "-" : i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setPicked({ p, rank: unranked ? null : i + 1 })}
                          className="flex w-full items-center gap-1.5 text-left font-bold transition-colors hover:text-neon-blue active:scale-[0.98]"
                        >
                          <GenderMark gender={p.gender} className="size-3.5 shrink-0 text-[9px]" />
                          <span className="truncate">{nameOf(p)}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
                        {isSchool
                          ? (schoolLabelCompact({ grade: p.grade, classNum: p.class_num, studentNo: p.student_no }, axes) || "-")
                          : (p.group_label || "-")}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <TierBadge rp={p.rp} thresholds={league.tier_thresholds ?? undefined} unranked={unranked} />
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                        {p.wins}승 {p.losses}패
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {restCount > 0 && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="w-full border-t border-border/40 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                {Math.min(PAGE_SIZE, restCount)}명 더 보기 (남은 {restCount}명)
              </button>
            )}
          </div>
        )}
      </main>

      {/* 간단 정보 — 순위표를 그릴 때 이미 받은 값만 쓴다. 경기 기록(누가 누구와)은
          추가 조회가 필요하고 마스킹한 이름을 되짚는 단서가 되므로 공개 화면에서는 다루지 않는다. */}
      <Drawer open={!!picked} onOpenChange={(v) => { if (!v) setPicked(null); }}>
        <DrawerContent className="mx-auto max-w-md">
          {picked && (() => {
            const { p, rank } = picked;
            const wins = p.win_count ?? 0;
            const losses = p.lose_count ?? 0;
            const total = wins + losses;
            const belong = isSchool
              ? schoolLabelCompact({ grade: p.grade, classNum: p.class_num, studentNo: p.student_no }, axes)
              : p.group_label;
            return (
              <div className="space-y-4 px-5 pb-8 pt-2">
                <div className="flex items-center gap-2">
                  <GenderMark gender={p.gender} className="size-4 shrink-0 text-[10px]" />
                  <DrawerTitle className="truncate text-lg font-black">{nameOf(p)}</DrawerTitle>
                  <TierBadge rp={p.rp} thresholds={league.tier_thresholds ?? undefined} unranked={rank === null} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="순위" value={rank === null ? "배치 중" : `#${rank}`} />
                  <Stat label="RP" value={String(p.rp)} />
                  <Stat label={isSchool ? "소속" : "레벨"} value={belong || "-"} />
                  <Stat label="전적" value={`${wins}승 ${losses}패`} />
                  <Stat label="승률" value={total === 0 ? "-" : `${Math.round((wins / total) * 100)}%`} />
                  <Stat label="경기 수" value={`${total}경기`} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  공개 순위표에서는 경기별 상세 기록을 제공하지 않습니다.
                </p>
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}
