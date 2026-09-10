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

  // 통계
  const stats = useMemo(() => {
    const players = new Set<string>();
    let singles = 0, doubles = 0;
    const winCount = new Map<string, number>();
    for (const m of shownMatches) {
      const isDouble = !!(m.playerA2Id || m.playerB2Id);
      isDouble ? doubles++ : singles++;
      for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id]) if (pid) players.add(pid);
      // 승자 = A팀(playerAId가 승자 ID 규약)
      for (const pid of [m.playerAId, m.playerA2Id]) if (pid) winCount.set(pid, (winCount.get(pid) ?? 0) + 1);
    }
    let topWinner: { id: string; wins: number } | null = null;
    for (const [id, wins] of winCount) if (!topWinner || wins > topWinner.wins) topWinner = { id, wins };
    return { total: shownMatches.length, players: players.size, singles, doubles, topWinner };
  }, [shownMatches]);

  // 오늘의 인물 키워드 (그날 경기 + 현재 티어만으로 계산 — 추가 쿼리 없음)
  const awards = useMemo(() => {
    const asc = [...shownMatches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    const at = top(attend, 1); if (at) list.push({ emoji: "🏃", key: "최다 출전", id: at.id, detail: `오늘 ${at.c}경기, 코트를 가장 오래 지켰어요.` });
    if (topDuo) list.push({ emoji: "🤝", key: "환상의 복식조", ids: topDuo.ids, detail: `복식에서 ${topDuo.w}번 함께 이긴 환상의 짝꿍.` });
    // 패자 격려 — 위로/응원 카테고리
    const nl = top(nailLoss, 1); if (nl) list.push({ emoji: "💪", key: "근성상", id: nl.id, detail: `1~3점 차로 ${nl.c}번 아깝게 놓쳤어요. 다음 판은 당신 겁니다!` });
    const lc = top(lossCount, 2); if (lc && lc.id !== st?.id) list.push({ emoji: "🌱", key: "성장 중", id: lc.id, detail: `오늘 ${lc.c}패, 누구보다 많이 부딪히며 성장하는 중!` });
    return list;
  }, [shownMatches, byId, tierThresholds]);

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
