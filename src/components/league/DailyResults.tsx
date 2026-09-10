import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Trophy, Swords, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeagueStore } from "@/lib/league-store";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTier, TIER_ORDER, classKeyOf, classLabel, schoolAxesOf } from "@/lib/league-types";
import type { Match, Student } from "@/lib/league-types";
import { useIsSchoolLeague } from "@/lib/league-terms";
import { computeHighlights } from "@/domain/highlight-calculator";
import type { HighlightMatch, HighlightPlayer } from "@/domain/highlight-calculator";
import { FilterChip } from "./FilterChip";

const displayName = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function DailyResults() {
  const { matches, students, tierThresholds, deletedById } = useLeagueStore();
  const isSchool = useIsSchoolLeague();
  const [date, setDate] = useState<Date>(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  // 반 필터. 날짜를 넘겨도 유지된다 — "3반만 보는 중"이라는 맥락은 날짜와 무관하다.
  const [filterGrade, setFilterGrade] = useState<number[]>([]);
  const [filterClass, setFilterClass] = useState<number[]>([]);

  // 기록이 있는 날짜(로컬 자정 기준) 목록 — 오름차순
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const recordDays = useMemo(() => {
    const map = new Map<number, Date>();
    for (const m of matches ?? []) {
      const d = new Date(m.date);
      const k = dayStart(d);
      if (!map.has(k)) map.set(k, new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [matches]);

  // 최초 진입 시 '가장 최근 기록 날짜'를 자동으로 연다(한 번만).
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && recordDays.length > 0) {
      initRef.current = true;
      setDate(recordDays[recordDays.length - 1]);
    }
  }, [recordDays]);

  // 화살표: 기록이 있는 이전/다음 날짜로 점프(빈 날짜는 건너뜀)
  const hasPrev = recordDays.some((d) => dayStart(d) < dayStart(date));
  const hasNext = recordDays.some((d) => dayStart(d) > dayStart(date));
  const goPrev = () => { const older = recordDays.filter((d) => dayStart(d) < dayStart(date)); if (older.length) setDate(older[older.length - 1]); };
  const goNext = () => { const newer = recordDays.filter((d) => dayStart(d) > dayStart(date)); if (newer.length) setDate(newer[0]); };

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    deletedById.forEach((s, id) => m.set(id, s)); // 삭제된 회원 이름 먼저
    students.forEach((s) => m.set(s.id, s));        // 활성 회원이 우선
    return m;
  }, [students, deletedById]);

  // 선택일 경기 (최신순)
  const dayMatches = useMemo(() => {
    return (matches ?? [])
      .filter((m) => sameDay(new Date(m.date), date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [matches, date]);

  /**
   * 그 날 실제로 뛴 사람들. 어느 반을 고를 수 있는지, 지금 보는 범위가 무슨 반인지가 여기서 나온다.
   * (출석부는 대기열 화면의 일이다. 여기는 경기 기록만 다룬다 — 안 온 학생은 등장하지 않는다.)
   */
  const dayPlayers = useMemo(() => {
    const out: Student[] = [];
    const seen = new Set<string>();
    for (const m of dayMatches) {
      for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) {
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        const s = byId.get(pid);
        if (s) out.push(s);
      }
    }
    return out;
  }, [dayMatches, byId]);

  /** 그 날 경기가 있었던 학년/반. 칩을 고를 수 있는지는 이것으로 정해진다. */
  const dayGrades = useMemo(
    () => new Set(dayPlayers.map((s) => s.grade).filter((g): g is number => g != null)),
    [dayPlayers]
  );
  const dayClasses = useMemo(
    () => new Set(dayPlayers.map((s) => s.classNum).filter((c): c is number => c != null)),
    [dayPlayers]
  );

  /**
   * 칩 목록은 명단 전체에서 뽑는다 — 그 날 뛴 반만 내면, 한 반만 수업한 날에는 필터 줄이
   * 통째로 사라져서 그런 기능이 있는 줄도 모르게 된다. 경기가 없던 반은 흐리게 남겨
   * "오늘은 이 반만 했다"까지 한눈에 보이게 한다.
   */
  const axes = useMemo(() => schoolAxesOf(students), [students]);
  // 반 칩은 고른 학년 안에서만 추린다 — 5학년만 보는데 6학년의 반 번호가 뜰 이유가 없다.
  const chipClasses = useMemo(() => {
    const set = new Set<number>();
    for (const s of students) {
      if (s.classNum == null) continue;
      if (filterGrade.length > 0 && (s.grade == null || !filterGrade.includes(s.grade))) continue;
      set.add(s.classNum);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [students, filterGrade]);

  const showGrade = isSchool && axes.grades.length > 1;
  const showClass = isSchool && chipClasses.length > 1;
  const filterOn = (showGrade && filterGrade.length > 0) || (showClass && filterClass.length > 0);

  /** 고른 학년·반에 드는 학생인가. 경기를 남길지도, 범위 이름도 전부 이 하나로 정해진다. */
  const inScope = useMemo(() => {
    return (s?: Student | null) => {
      if (!s) return false;
      if (showGrade && filterGrade.length > 0 && (s.grade == null || !filterGrade.includes(s.grade))) return false;
      if (showClass && filterClass.length > 0 && (s.classNum == null || !filterClass.includes(s.classNum))) return false;
      return true;
    };
  }, [showGrade, showClass, filterGrade, filterClass]);

  /**
   * 선택한 반 소속이 한 명이라도 낀 경기는 남긴다.
   * 반대항 경기를 걸러내면 "우리 반이 옆 반을 이긴 판"이 통째로 사라진다 — 학교에선 그게 제일 보고 싶은 경기다.
   */
  const shownMatches = useMemo(() => {
    if (!filterOn) return dayMatches;
    return dayMatches.filter((m) =>
      [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id].some((pid) => inScope(pid ? byId.get(pid) : null))
    );
  }, [dayMatches, filterOn, byId, inScope]);

  const clearFilter = () => { setFilterGrade([]); setFilterClass([]); };
  const toggleGrade = (g: number) =>
    setFilterGrade((prev) => { setFilterClass([]); return prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]; });
  const toggleClass = (c: number) =>
    setFilterClass((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  /**
   * 지금 보고 있는 범위 이름 — "6-7반의 하이라이트"임을 제목 줄에서 알 수 있어야 한다.
   *
   * 고른 학년과 반을 곱해서 짓지 않는다. 5·6학년에 4·7반을 고르면 6-4반, 5-7반처럼
   * 있지도 않은 반이 이름에 끼어든다. 그 날 실제로 걸린 학생들의 반만 모은다.
   */
  const scopeLabel = useMemo(() => {
    if (!filterOn) return null;
    const keys = new Set<string>();
    for (const s of dayPlayers) if (inScope(s)) keys.add(classKeyOf(s));
    // 반 정보가 없는 명단이면 붙일 이름이 없다 → 고른 학년으로 대신한다.
    const labels = Array.from(keys).filter((k) => k !== "").sort().map(classLabel);
    if (labels.length > 0) return labels.join(", ");
    return filterGrade.map((g) => `${g}학년`).join(", ") || null;
  }, [filterOn, dayPlayers, inScope, filterGrade]);

  /**
   * 통계와 상 — 규칙은 전부 `src/domain/highlight-calculator.ts`에 있다.
   *
   * 이 화면이 하는 일은 두 방향의 번역뿐이다. 들어갈 때는 Match/Student를 계산기가 아는
   * 모양으로 펴고(승자/패자 배열, 티어를 숫자로), 나올 때는 id를 이름으로 바꾼다.
   * 상대값 기준·1인 1라벨·타이브레이커가 화면 안에 있으면 검증할 방법이 없다(→ docs/PLAN-testing.md).
   */
  const highlight = useMemo(() => {
    // 티어를 숫자로 편다. TIER_ORDER는 Diamond가 0이므로 뒤집어야 "클수록 강함"이 된다.
    const strengthOf = (s: Student) =>
      TIER_ORDER.length - 1 - TIER_ORDER.indexOf(getTier(s.rp, tierThresholds));

    const hMatches: HighlightMatch[] = shownMatches.map((m) => ({
      id: m.id,
      date: m.date,
      winnerIds: [m.playerAId, m.playerA2Id].filter((v): v is string => !!v),
      loserIds: [m.playerBId, m.playerB2Id].filter((v): v is string => !!v),
      scoreWin: m.scoreA,
      scoreLose: m.scoreB,
      matchType: m.matchType ?? null,
    }));

    // 삭제된 학생은 여기 없다. 계산기는 id만으로 끝까지 돌고, 이름만 "알 수 없음"이 된다.
    const hPlayers: HighlightPlayer[] = dayPlayers.map((s) => ({
      id: s.id,
      strength: strengthOf(s),
      grade: s.grade ?? null,
      classNum: s.classNum ?? null,
      studentNo: s.studentNo ?? null,
      name: s.name,
    }));

    return computeHighlights({ matches: hMatches, players: hPlayers });
  }, [shownMatches, dayPlayers, tierThresholds]);

  const nameOf = (id: string) => displayName(byId.get(id) ?? { name: "알 수 없음" });
  const day = highlight.day;
  const { cards, lists, duo } = highlight.awards;

  /** 최다승은 동점자를 지우지 않는다 — 사실 자체가 유일해야 하는 지표라 한 명을 뽑으면 거짓이 된다. */
  const topWinnerLabel = (() => {
    const t = day.topWinners;
    if (!t) return "—";
    const shown = t.playerIds.slice(0, 2).map(nameOf).join("·");
    const rest = t.playerIds.length - 2;
    return `${shown}${rest > 0 ? ` 외 ${rest}명` : ""} (${t.wins})`;
  })();

  const isToday = sameDay(date, new Date());
  const dateLabel = date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const shortDateLabel = `${date.getMonth() + 1}월 ${date.getDate()}일 (${date.toLocaleDateString("ko-KR", { weekday: "short" })})`;

  return (
    <div className="space-y-5 animate-in fade-in duration-200 max-w-3xl">
      {/* 헤더 + 날짜 이동 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
            <Calendar className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-foreground">
              하이라이트{scopeLabel && <span className="ml-1.5 text-neon-blue">· {scopeLabel}</span>}
            </h2>
            <p className="text-[11px] text-muted-foreground">{dateLabel}{isToday && " · 오늘"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9 border-border/50" onClick={goPrev} disabled={!hasPrev} title="이전 기록 날짜">
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 border-border/50 font-sans text-xs font-bold">
                <Calendar className="size-4 text-muted-foreground" /> {shortDateLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DayCalendar mode="single" selected={date} onSelect={(d) => { if (d) setDate(d); setPickerOpen(false); }} autoFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="size-9 border-border/50" onClick={goNext} disabled={!hasNext} title="다음 기록 날짜">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* 반 필터 — 학교 리그에서 그 날 두 반 이상이 뛰었을 때만 */}
      {(showGrade || showClass) && (
        <div className="space-y-1.5 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5">
          {showGrade && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-11 shrink-0 text-[10px] font-bold text-muted-foreground">학년</span>
              <FilterChip active={filterGrade.length === 0} onClick={() => { setFilterGrade([]); setFilterClass([]); }}>전체 학년</FilterChip>
              {axes.grades.map((g) => (
                <FilterChip
                  key={g}
                  active={filterGrade.includes(g)}
                  disabled={!dayGrades.has(g)}
                  title={dayGrades.has(g) ? undefined : "이 날 경기가 없습니다"}
                  onClick={() => toggleGrade(g)}
                >
                  {g}학년
                </FilterChip>
              ))}
            </div>
          )}
          {showClass && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-11 shrink-0 text-[10px] font-bold text-muted-foreground">반</span>
              <FilterChip active={filterClass.length === 0} onClick={() => setFilterClass([])}>전체 반</FilterChip>
              {chipClasses.map((c) => (
                <FilterChip
                  key={c}
                  active={filterClass.includes(c)}
                  disabled={!dayClasses.has(c)}
                  title={dayClasses.has(c) ? undefined : "이 날 경기가 없습니다"}
                  onClick={() => toggleClass(c)}
                >
                  {c}반
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 고른 반이 이 날엔 안 뛴 경우 — 빈 화면만 보여주고 끝내지 않는다 */}
      {filterOn && shownMatches.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">이 날 {scopeLabel} 경기 기록이 없습니다.</span>
          <Button variant="outline" size="sm" className="h-7 border-border/50 text-xs font-bold" onClick={clearFilter}>전체 보기</Button>
        </div>
      )}

      {/* 경기 요약 */}
      <div className="space-y-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">📊 경기 요약</span>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard icon={<Swords className="size-4" />} label="총 경기" value={`${day.total}`} />
        <StatCard icon={<Users className="size-4" />} label="참여 인원" value={`${day.playerCount}`} />
        <StatCard icon={<span className="text-[11px] font-black">단·복</span>} label="단식 / 복식" value={`${day.singles} / ${day.doubles}`} />
        <StatCard icon={<Trophy className="size-4" />} label="최다승" value={topWinnerLabel} />
        </div>
      </div>

      {/* 오늘의 인물 — 카드는 드문 일에만. 억지로 채우지 않는다(두 장이면 두 장). */}
      {(cards.length > 0 || duo) && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🏅 오늘의 인물</span>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {cards.map((a) => (
              <AwardCard key={a.key} name={nameOf(a.playerId)} emoji={a.emoji} label={a.key} detail={a.detail} />
            ))}
            {duo && (
              <AwardCard
                key="환상의 복식조"
                name={duo.playerIds.map(nameOf).join("·")}
                emoji="🤝"
                label="환상의 복식조"
                detail={`복식에서 ${duo.wins}번 함께 이긴 짝꿍.`}
              />
            )}
          </div>
        </div>
      )}

      {/* 오늘 이런 학생들 — 해당자가 여럿인 지표. 한 명을 뽑으면 나머지가 지워진다. */}
      {lists.length > 0 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🙌 오늘 이런 학생들</span>
          <div className="space-y-1.5 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
            {lists.map((l) => {
              // 이름은 6명까지. 스무 명이 전승한 날에도 한 줄을 넘기지 않는다.
              const shown = l.playerIds.slice(0, 6).map(nameOf).join(", ");
              const rest = l.playerIds.length - 6;
              return (
                <div key={l.key} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="shrink-0 text-sm">{l.emoji}</span>
                  <span className="shrink-0 rounded-md bg-neon-blue/15 px-1.5 py-0.5 text-[11px] font-black text-neon-blue">{l.key}</span>
                  <span className="min-w-0 text-xs font-bold text-foreground">
                    {shown}
                    {rest > 0 && <span className="text-muted-foreground"> 외 {rest}명</span>}
                  </span>
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
          {shownMatches.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {filterOn ? `이 날 ${scopeLabel} 경기가 없습니다.` : "이 날에 기록된 경기가 없습니다."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
              {shownMatches.map((m) => <MatchRow key={m.id} m={m} byId={byId} markCrossClass={isSchool} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function AwardCard({ name, emoji, label, detail }: { name: string; emoji: string; label: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
      {/* 닉네임 (강조·상단) */}
      <span className="truncate text-xl font-black leading-tight text-foreground" title={name}>{name}</span>
      {/* 이모지 + 키워드 */}
      <div className="flex items-center gap-1.5">
        <span className="text-base">{emoji}</span>
        <span className="rounded-md bg-neon-blue/15 px-1.5 py-0.5 text-[11px] font-black text-neon-blue">{label}</span>
      </div>
      {/* 설명 */}
      <span className="text-[11px] leading-snug text-muted-foreground">{detail}</span>
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

function MatchRow({ m, byId, markCrossClass }: { m: Match; byId: Map<string, Student>; markCrossClass?: boolean }) {
  const get = (id?: string | null) => (id ? byId.get(id) : null);
  /**
   * 참가자 반이 둘 이상이면 반대항. 반 필터로 좁혀 봐도 "옆 반과 붙은 판"임을 알 수 있어야 한다.
   * 반 정보가 없는 명단에서는 키가 전부 ""이라 뱃지가 뜨지 않는다.
   */
  const crossClass = (() => {
    if (!markCrossClass) return null;
    const keys = new Set<string>();
    for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) {
      const s = get(pid);
      if (s) keys.add(classKeyOf(s));
    }
    if (keys.size < 2) return null;
    return Array.from(keys).map(classLabel).join(" vs ");
  })();
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
      {crossClass && (
        <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[9px] font-bold text-muted-foreground" title={crossClass}>반대항</span>
      )}
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
