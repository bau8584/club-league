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
  /**
   * 반 필터 — 학년 하나, 반 하나. 날짜를 넘겨도 유지된다("3반을 보는 중"은 날짜와 무관하다).
   *
   * 여러 개를 고를 수 있게 두면 5·6학년에 4·7반처럼 있지도 않은 조합이 만들어지고,
   * 화면은 "무엇을 보고 있는지" 한 줄로 말할 수 없게 된다. 수업은 한 번에 한 반이다.
   * `전체`도 두지 않는다 — 51명이 한 덩어리로 뜨는 화면이 바로 이 필터가 생긴 이유다.
   */
  const [filterGrade, setFilterGrade] = useState<number | null>(null);
  const [filterClass, setFilterClass] = useState<number | null>(null);

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
  /**
   * 반 칩은 **고른 학년 안에서** 그 날 경기가 있었는지로 정한다.
   *
   * 학년을 무시하고 반 번호만 모으면, 6-7반이 수업한 날 5학년을 골라도 `7반`이 멀쩡히
   * 활성으로 뜬다. 눌러 보면 빈 화면이다 — 5-7반은 오늘 수업을 안 했으니까.
   */
  const dayClasses = useMemo(() => {
    const set = new Set<number>();
    for (const s of dayPlayers) {
      if (s.classNum == null) continue;
      if (filterGrade != null && s.grade !== filterGrade) continue;
      set.add(s.classNum);
    }
    return set;
  }, [dayPlayers, filterGrade]);

  /**
   * 칩 목록은 명단 전체에서 뽑는다 — 그 날 뛴 반만 내면, 한 반만 수업한 날에는 필터 줄이
   * 통째로 사라져서 그런 기능이 있는 줄도 모르게 된다. 경기가 없던 반은 흐리게 남겨
   * "오늘은 이 반만 했다"까지 한눈에 보이게 한다.
   */
  const axes = useMemo(() => schoolAxesOf(students), [students]);
  /**
   * 반 칩은 **고른 학년 안에서만** 추린다. 학년을 고르기 전에는 아무것도 내지 않는다 —
   * 학년 모르는 채 "4반"만 고르면 5-4반과 6-4반이 한 화면에 섞인다. 순서가 곧 규칙이다.
   */
  const showGrade = isSchool && axes.grades.length > 1;
  const chipClasses = useMemo(() => {
    // 학년을 묻는 리그에서는 학년을 고르기 전까지 반을 내지 않는다.
    if (showGrade && filterGrade == null) return [];
    const set = new Set<number>();
    for (const s of students) {
      if (s.classNum == null) continue;
      if (filterGrade != null && s.grade !== filterGrade) continue;
      set.add(s.classNum);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [students, showGrade, filterGrade]);

  // 고를 것이 하나뿐이면 묻지 않는다 — 6학년만 있는 리그, 반이 하나뿐인 학년.
  const showClass = isSchool && chipClasses.length > 1;

  /**
   * 볼 준비가 됐는가. **물어본 축은 다 골라야** 하이라이트가 나온다.
   *
   * 묻지 않은 축은 기다리지 않는다. 학년이 하나뿐인 리그는 반부터 고르고,
   * 반이 하나뿐인 학년은 학년만 고르면 끝이며, 동호회 리그는 둘 다 묻지 않아 전부 보인다.
   */
  const ready = (!showGrade || filterGrade != null) && (!showClass || filterClass != null);
  const filterOn = filterGrade != null || filterClass != null;

  /** 고른 학년·반에 드는 학생인가. 경기를 남길지도, 범위 이름도 전부 이 하나로 정해진다. */
  const inScope = useMemo(() => {
    return (s?: Student | null) => {
      if (!s) return false;
      if (filterGrade != null && s.grade !== filterGrade) return false;
      if (filterClass != null && s.classNum !== filterClass) return false;
      return true;
    };
  }, [filterGrade, filterClass]);

  /**
   * 선택한 반 소속이 한 명이라도 낀 경기는 남긴다.
   * 반대항 경기를 걸러내면 "우리 반이 옆 반을 이긴 판"이 통째로 사라진다 — 학교에선 그게 제일 보고 싶은 경기다.
   */
  const shownMatches = useMemo(() => {
    if (!ready) return [];
    if (!filterOn) return dayMatches;
    return dayMatches.filter((m) =>
      [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id].some((pid) => inScope(pid ? byId.get(pid) : null))
    );
  }, [dayMatches, ready, filterOn, byId, inScope]);

  const clearFilter = () => { setFilterGrade(null); setFilterClass(null); };
  // 학년을 바꾸면 반 선택은 버린다 — 5-4반을 보다 6학년을 누르면 6-4반이 아니라 6학년 선택 화면이다.
  const pickGrade = (g: number) => {
    setFilterClass(null);
    setFilterGrade((prev) => (prev === g ? null : g));
  };
  const pickClass = (c: number) => setFilterClass((prev) => (prev === c ? null : c));

  /**
   * 지금 보고 있는 범위 이름 — "6-7반의 하이라이트"임을 제목 줄에서 알 수 있어야 한다.
   *
   * 고른 값으로 이름을 짓지 않고 그 날 실제로 걸린 학생들의 반을 모은다. 그래야
   * 명단에 없는 조합("6-4반")이 제목에 끼어들지 않는다. 아직 안 뛴 반이면 고른 값으로 적는다.
   */
  const scopeLabel = useMemo(() => {
    if (!filterOn) return null;
    const keys = new Set<string>();
    for (const s of dayPlayers) if (inScope(s)) keys.add(classKeyOf(s));
    const labels = Array.from(keys).filter((k) => k !== "").sort().map(classLabel);
    if (labels.length > 0) return labels.join(", ");
    if (filterGrade != null && filterClass != null) return `${filterGrade}-${filterClass}반`;
    if (filterClass != null) return `${filterClass}반`;
    return filterGrade != null ? `${filterGrade}학년` : null;
  }, [filterOn, dayPlayers, inScope, filterGrade, filterClass]);

  /**
   * 통계와 상 — 규칙은 전부 `src/domain/highlight-calculator.ts`에 있다.
   *
   * 이 화면이 하는 일은 두 방향의 번역뿐이다. 들어갈 때는 Match/Student를 계산기가 아는
   * 모양으로 펴고(승자/패자 배열, 티어를 숫자로), 나올 때는 id를 이름으로 바꾼다.
   * 상대값 기준·1인 1라벨·타이브레이커가 화면 안에 있으면 검증할 방법이 없다(→ docs/PLAN-testing.md).
   */
  const highlight = useMemo(() => {
    const toHighlight = (m: Match): HighlightMatch => ({
      id: m.id,
      date: m.date,
      // "같은 날"은 로컬 자정 기준이다. 계산기는 시간대를 모르므로 여기서 키를 만든다.
      dayKey: String(dayStart(new Date(m.date))),
      winnerIds: [m.playerAId, m.playerA2Id].filter((v): v is string => !!v),
      loserIds: [m.playerBId, m.playerB2Id].filter((v): v is string => !!v),
      scoreWin: m.scoreA,
      scoreLose: m.scoreB,
      matchType: m.matchType ?? null,
      rpDeltaByPlayer: {
        ...(m.playerAId && m.rpDeltaA != null ? { [m.playerAId]: m.rpDeltaA } : {}),
        ...(m.playerBId && m.rpDeltaB != null ? { [m.playerBId]: m.rpDeltaB } : {}),
        ...(m.playerA2Id && m.rpDeltaA2 != null ? { [m.playerA2Id]: m.rpDeltaA2 } : {}),
        ...(m.playerB2Id && m.rpDeltaB2 != null ? { [m.playerB2Id]: m.rpDeltaB2 } : {}),
      },
    });

    // 삭제된 학생은 여기 없다. 계산기는 id만으로 끝까지 돌고, 이름만 "알 수 없음"이 된다.
    const hPlayers: HighlightPlayer[] = dayPlayers.map((s) => ({
      id: s.id,
      rp: s.rp,
      classKey: classKeyOf(s),
      grade: s.grade ?? null,
      classNum: s.classNum ?? null,
      studentNo: s.studentNo ?? null,
      name: s.name,
    }));

    /**
     * 지난 기록은 **반 필터로 좁히지 않는다.** 옆 반 학생과 이미 만난 적이 있으면
     * 오늘 처음 만난 상대가 아니다. 좁히면 "처음"이 필터에 따라 달라진다.
     */
    const prior = (matches ?? [])
      .filter((m) => dayStart(new Date(m.date)) < dayStart(date))
      .map(toHighlight);

    return computeHighlights({
      matches: shownMatches.map(toHighlight),
      players: hPlayers,
      priorMatches: prior,
      // TIER_ORDER는 Diamond가 0이므로 뒤집어야 "클수록 강함"이 된다.
      tierOf: (rp) => TIER_ORDER.length - 1 - TIER_ORDER.indexOf(getTier(rp, tierThresholds)),
    });
  }, [shownMatches, dayPlayers, tierThresholds, matches, date]);

  const nameOf = (id: string) => displayName(byId.get(id) ?? { name: "알 수 없음" });
  const day = highlight.day;
  const { cards, lists, duo } = highlight.awards;

  /** 명경기는 원본 경기 줄 그대로 보여준다 — 경기 기록과 같은 모양이어야 "그 판"임을 안다. */
  const bestMatchId = day.bestMatch?.matchId;
  const bestMatch = bestMatchId ? (shownMatches.find((m) => m.id === bestMatchId) ?? null) : null;

  /** 최다승은 동점자를 지우지 않는다 — 사실 자체가 유일해야 하는 지표라 한 명을 뽑으면 거짓이 된다. */
  const topWinnerLabel = (() => {
    const t = day.topWinners;
    if (!t) return "—";
    // 셋 이상이 공동 1위면 이름 두 개만 적어 봐야 잘리고, 나머지를 지우는 셈이 된다.
    if (t.playerIds.length > 2) return `${t.playerIds.length}명 공동 (${t.wins}승)`;
    return `${t.playerIds.map(nameOf).join("·")} (${t.wins}승)`;
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
              {axes.grades.map((g) => (
                <FilterChip
                  key={g}
                  active={filterGrade === g}
                  disabled={!dayGrades.has(g)}
                  title={dayGrades.has(g) ? undefined : "이 날 경기가 없습니다"}
                  onClick={() => pickGrade(g)}
                >
                  {g}학년
                </FilterChip>
              ))}
            </div>
          )}
          {showClass && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-11 shrink-0 text-[10px] font-bold text-muted-foreground">반</span>
              {chipClasses.map((c) => (
                <FilterChip
                  key={c}
                  active={filterClass === c}
                  disabled={!dayClasses.has(c)}
                  title={dayClasses.has(c) ? undefined : "이 날 경기가 없습니다"}
                  onClick={() => pickClass(c)}
                >
                  {c}반
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 아직 고르는 중 — 빈 화면 대신 다음에 누를 것을 말해 준다 */}
      {!ready && (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/20 px-3 py-8 text-center">
          <p className="text-xs font-bold text-foreground">
            {showGrade && filterGrade == null ? "학년을 고르세요." : "반을 고르세요."}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {showGrade && filterGrade == null
              ? "학년을 고르면 그 학년의 반이 나옵니다."
              : `${filterGrade != null ? `${filterGrade}학년의 ` : ""}반을 고르면 그 반의 하이라이트가 나옵니다.`}
          </p>
        </div>
      )}

      {/* 고른 반이 이 날엔 안 뛴 경우 — 빈 화면만 보여주고 끝내지 않는다 */}
      {ready && filterOn && shownMatches.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">이 날 {scopeLabel} 경기 기록이 없습니다.</span>
          <Button variant="outline" size="sm" className="h-7 border-border/50 text-xs font-bold" onClick={clearFilter}>다시 고르기</Button>
        </div>
      )}

      {/* 경기 요약 — 고르기 전에는 내지 않는다. 아래 블록들은 경기가 0건이면 스스로 숨는다. */}
      {ready && (
      <div className="space-y-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">📊 경기 요약</span>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard icon={<Swords className="size-4" />} label="총 경기" value={`${day.total}`} />
        <StatCard icon={<Users className="size-4" />} label="참여 인원" value={`${day.playerCount}`} />
        <StatCard icon={<span className="text-[11px] font-black">단·복</span>} label="단식 / 복식" value={`${day.singles} / ${day.doubles}`} />
        <StatCard icon={<Trophy className="size-4" />} label="최다승" value={topWinnerLabel} />
        </div>
      </div>
      )}

      {/* 오늘의 인물 — 카드는 드문 일에만. 억지로 채우지 않는다(두 장이면 두 장). */}
      {(cards.length > 0 || duo) && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🏅 오늘의 인물</span>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {cards.map((a) => (
              <AwardCard key={a.key} name={nameOf(a.playerId)} emoji={a.emoji} label={a.key} detail={a.detail} about={a.about} />
            ))}
            {duo && (
              <AwardCard
                key="단짝"
                name={duo.playerIds.map(nameOf).join("·")}
                emoji="🤝"
                label="단짝"
                detail={`복식에서 ${duo.wins}번 함께 이긴 짝꿍.`}
                about="복식에서 두 번 넘게 같이 이긴 짝이 받아요."
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
                <div key={l.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <AwardLabel emoji={l.emoji} label={l.key} about={l.about} />
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

      {/* 오늘의 명경기 — 반 전체가 기억할 한 판 */}
      {bestMatch && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">⚡ 오늘의 명경기</span>
          <MatchRow m={bestMatch} byId={byId} markCrossClass={isSchool} />
        </div>
      )}

      {/* 반 집계 — 순위표가 아니다. 반 내부 경기의 승률은 정의상 언제나 50%다. */}
      {isSchool && day.classSummary.length > 1 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-sm font-black text-foreground">🏫 반별 기록</span>
          <div className="space-y-1 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
            {day.classSummary.map((c) => (
              <div key={c.classKey} className="flex items-baseline gap-2 text-xs">
                <span className="w-16 shrink-0 font-black text-foreground">{classLabel(c.classKey)}</span>
                <span className="text-muted-foreground">{c.matches}경기 · {c.players}명 참여</span>
              </div>
            ))}
            {day.crossClass.map((x) => (
              <div key={`${x.a}|${x.b}`} className="flex items-baseline gap-2 pt-1 text-xs">
                <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[9px] font-bold text-muted-foreground">반대항</span>
                <span className="font-bold text-foreground">
                  {classLabel(x.a)} <span className="font-mono">{x.winsA} : {x.winsB}</span> {classLabel(x.b)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 경기 기록 */}
      {ready && (
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
      )}
    </div>
  );
}

/**
 * 상 이름표. 누르면 "이건 뭐 하면 받는 거지"가 펼쳐진다.
 *
 * 아이들에게 `퍼펙트`는 이름만 봐서는 어른들이 붙인 딱지다. 규칙을 알아야 다음 시간에
 * 노려볼 수 있고, 그때부터 상이 목표가 된다. 그래서 설명을 툴팁(마우스 전용)이 아니라
 * 눌러서 펼치는 글로 둔다 — 이 화면은 태블릿과 휴대폰에서 본다.
 */
function AwardLabel({ emoji, label, about }: { emoji: string; label: string; about: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-neon-blue/15 px-1.5 py-0.5 text-left text-neon-blue transition-colors hover:bg-neon-blue/25 data-[state=open]:bg-neon-blue/25"
          title="어떻게 받는 상인지 보기"
        >
          <span className="text-[13px] leading-none">{emoji}</span>
          <span className="text-[11px] font-black">{label}</span>
          <span className="text-[10px] font-black opacity-60">?</span>
        </button>
      </PopoverTrigger>
      {/* 말풍선으로 띄운다 — 펼쳐서 밀어내면 목록 줄이 흔들리고 이름이 밀린다. */}
      <PopoverContent side="top" align="start" sideOffset={6} className="w-60 p-2.5">
        <p className="text-[11px] font-medium leading-snug text-foreground">{about}</p>
      </PopoverContent>
    </Popover>
  );
}

function AwardCard({ name, emoji, label, detail, about }: { name: string; emoji: string; label: string; detail: string; about: string }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5">
      {/* 닉네임 (강조·상단) */}
      <span className="w-full truncate text-xl font-black leading-tight text-foreground" title={name}>{name}</span>
      {/* 이모지 + 키워드 — 누르면 규칙이 펼쳐진다 */}
      <AwardLabel emoji={emoji} label={label} about={about} />
      {/* 오늘 무슨 일이 있었나 */}
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
