/**
 * 하이라이트 계산기 — 순수 함수
 *
 * 설계 문서: docs/PLAN-highlight.md · 테스트 방침: docs/PLAN-testing.md
 *
 * DB도, React도, "오늘"도, 리그 종류(school/club)도 모르는 함수다. 입력은 그 날의 경기
 * 목록과 (이름표를 붙이는 데만 쓰는) 참가자 정보뿐이고, 출력은 통계와 상 목록뿐이다.
 *
 * 세 가지 원칙이 코드 전체를 지배한다.
 *
 * 1. **고정 숫자를 쓰지 않는다.** `5점차 압승`은 21점 단식의 값이라 2점제 복식에서는
 *    아무 의미가 없다. 모든 기준을 그 날 점수차 분포의 상대값으로 잡고,
 *    분포가 성립하지 않으면(전부 같은 점수차, 경기 1건) 그 상을 아예 내지 않는다.
 * 2. **카드는 1인 1라벨.** 희귀한 상부터 배정하고 이미 받은 학생은 아래 상에서 뺀다.
 *    안 그러면 잘한 학생 하나가 카드를 전부 가져간다.
 * 3. **동점자가 셋 이상이면 카드가 아니라 목록이다.** 열한 명이 2연승한 날의
 *    "연승왕 한 명"은 거짓이다. 침묵이 거짓보다 낫다.
 */

/** 그 날의 경기 한 건. 승자/패자는 이미 갈려 있다(A팀이 승자라는 저장 규약). */
export type HighlightMatch = {
  id: string;
  /** 정렬용. 같은 값이면 id 순으로 갈린다 — 입력 배열 순서에는 의존하지 않는다. */
  date: string;
  winnerIds: string[];
  loserIds: string[];
  scoreWin: number;
  scoreLose: number;
  matchType?: "single" | "double" | null;
  /**
   * "같은 날"을 묶는 키. 이 파일은 시간대를 모르므로 호출부가 자기 기준(로컬 자정)으로 만든다.
   * 없으면 ISO 문자열의 앞 10자를 쓴다 — 지난 수업이 언제였는지 셀 때만 필요하다.
   */
  dayKey?: string;
  /** 이 경기로 오간 RP. 티어 승급을 경기 전 RP로 역산하는 데 쓴다. */
  rpDeltaByPlayer?: Record<string, number>;
};

/**
 * 이름표를 붙이는 데 필요한 최소한의 정보. 전부 선택 항목이다 —
 * 삭제된 학생이 낀 경기(조회 실패)와 반 정보가 없는 명단(전원 null) 양쪽에서 돌아야 한다.
 *
 * `rp`는 **오늘 경기까지 반영된 현재 값**이다. 경기 전 RP는 그 날 rpDelta 합으로 역산한다.
 */
export type HighlightPlayer = {
  id: string;
  rp?: number | null;
  /**
   * 반을 묶는 키. 이 파일은 "5-4반"이라고 적을 줄 모른다 — 묶기만 하고 이름은 호출부가 짓는다.
   * 빈 문자열이나 없음은 "반 없음"이고, 반 집계에서 통째로 빠진다(동호회 리그가 그렇다).
   */
  classKey?: string | null;
  grade?: number | null;
  classNum?: number | null;
  studentNo?: number | null;
  name?: string | null;
};

export type PlayerDayStat = {
  id: string;
  appearances: number;
  wins: number;
  losses: number;
  /** 패자 0점. 점수 체계와 무관하게 언제나 성립한다. */
  shutoutWins: number;
  blowoutWins: number;
  closeWins: number;
  closeLosses: number;
  /**
   * 이긴 판 중 가장 큰 RP 차(상대 RP − 내 RP). 진 판과 자기보다 약한 상대는 0이다.
   *
   * 횟수가 아니라 차이로 재는 이유는 변별력이다. 하루 1~2경기짜리 리그에서 "몇 번
   * 꺾었나"는 최댓값이 1에 몰려 열댓 명이 동점이 되지만, RP 차는 사람마다 갈린다.
   */
  bestUpsetGap: number;
  /** 오늘 만난 상대들의 평균 RP. 승패와 무관한 축이다. 상대 RP를 하나도 모르면 null. */
  oppRpAvg: number | null;
  maxStreak: number;
  /** 오늘 오간 RP 합. rpDelta가 없으면 0이다. */
  rpToday: number;

  // --- 지난 기록과 대조해야 나오는 것들. `priorMatches`가 없으면 전부 false / 0이다. ---
  /** 오늘 처음 만난 상대 수. 늘 같은 애들끼리 노는 걸 깨는 것이 체육 수업의 실제 목표다. */
  newOpponents: number;
  /** 오늘 처음 뛴 학생. */
  isDebut: boolean;
  /** 한 번도 못 이기던 학생의 첫 승. 그날의 사건이다. */
  isFirstWin: boolean;
  /** 오늘 경기로 티어가 올라간 학생. */
  isPromoted: boolean;
  /** 지난 수업엔 RP가 줄었는데 오늘은 올린 학생. 승률이 아니라 누적 지표로 잰다. */
  isRebound: boolean;
};

export type DayStats = {
  total: number;
  playerCount: number;
  singles: number;
  doubles: number;
  hasSingles: boolean;
  hasDoubles: boolean;
  /** 압승 기준(이상). 분포가 성립하지 않으면 null이고, 그 날 압승은 없다. */
  blowoutThreshold: number | null;
  /** 접전 기준(이하). 마찬가지로 성립하지 않으면 null. */
  closeThreshold: number | null;
  /** 그 날 최대 연승. 3 미만이면 `연승왕` 카드를 만들지 않는다. */
  maxStreak: number;
  /** 평균 출전 수. `최다 출전`은 이 값을 **초과**해야 한다. */
  avgAppearances: number;
  /** 그 날 뛴 학생들의 평균 RP. `강한 상대`는 이 값을 초과해야 한다. 아무도 RP를 모르면 null. */
  avgPlayerRp: number | null;
  /** 최다승 — 사실 자체가 유일해야 하므로 배정에서 빼고 그대로 내보낸다. 동점이면 전원. */
  topWinners: { playerIds: string[]; wins: number } | null;
  perPlayer: Map<string, PlayerDayStat>;
  /** 복식에서 함께 이긴 조합. 복식이 없는 날은 비어 있다. */
  duos: { playerIds: string[]; wins: number }[];
  /** 지난 기록을 받았는가. 아니면 `친구 넓히기`·`첫 승`·`리그 데뷔`를 아예 내지 않는다. */
  hasHistory: boolean;
  /** 반 전체가 기억할 한 판 — 접전 중 총득점이 가장 높은 경기. 접전이 없으면 null. */
  bestMatch: BestMatch | null;
  /**
   * 반별 집계. **순위표가 아니다.**
   *
   * 반 내부 경기의 승률은 정의상 항상 50%라 막대를 그리면 아무것도 측정하지 않는 그래프가
   * 되고, 1교시 반은 20경기·5교시 반은 0경기라 시점도 어긋난다. 그래서 센 것만 적는다.
   * **안 뛴 반은 목록에 없다.**
   */
  classSummary: { classKey: string; matches: number; players: number }[];
  /** 반대항 경기의 승패. 거의 일어나지 않으므로, 없으면 빈 배열이고 블록 자체를 내지 않는다. */
  crossClass: { a: string; b: string; winsA: number; winsB: number }[];
};

export type BestMatch = {
  matchId: string;
  winnerIds: string[];
  loserIds: string[];
  scoreWin: number;
  scoreLose: number;
  /** 양 팀 득점 합. 접전 중에서 이 값이 가장 큰 판을 고른다. */
  totalScore: number;
};

/** 한 명에게 붙는 카드. */
export type HighlightCard = {
  key: string;
  emoji: string;
  playerId: string;
  value: number;
  detail: string;
};

/** 해당자가 여럿인 지표. 카드로 한 명을 뽑으면 거짓이 되므로 이름 목록으로 낸다. */
export type HighlightList = {
  key: string;
  emoji: string;
  playerIds: string[];
  value: number;
  detail: string;
};

export type HighlightAwards = {
  cards: HighlightCard[];
  lists: HighlightList[];
  /** 복식 짝꿍. 한 명이 아니라 조합이므로 1인 1라벨 배정에 끼지 않는다. */
  duo: { playerIds: string[]; wins: number } | null;
};

export type HighlightInput = {
  matches: HighlightMatch[];
  players?: HighlightPlayer[];
  /**
   * 그 날 **이전**의 모든 경기. 있으면 "오늘 처음"인 것들이 계산된다.
   *
   * 반 필터로 좁히지 않은 전체를 넣는다 — 옆 반 학생과 이미 만난 적이 있으면
   * 오늘 처음 만난 상대가 아니다.
   */
  priorMatches?: HighlightMatch[];
  /**
   * RP를 티어 번호로 바꾸는 함수. **클수록 강하다.**
   * 이 파일은 티어 이름도 임계 RP도 모른다 — 호출부가 자기 체계로 환산해서 넘긴다.
   */
  tierOf?: (rp: number) => number;
};

const emptyStat = (id: string): PlayerDayStat => ({
  id,
  appearances: 0,
  wins: 0,
  losses: 0,
  shutoutWins: 0,
  blowoutWins: 0,
  closeWins: 0,
  closeLosses: 0,
  bestUpsetGap: 0,
  oppRpAvg: null,
  maxStreak: 0,
  rpToday: 0,
  newOpponents: 0,
  isDebut: false,
  isFirstWin: false,
  isPromoted: false,
  isRebound: false,
});

/** 선형 보간 분위수. 오름차순 정렬된 배열을 받는다. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 압승·접전 기준을 그 날 점수차 분포에서 뽑는다.
 *
 * 상위 25% / 하위 25%로 가르되, **분포가 퍼져 있지 않으면 둘 다 내지 않는다.**
 * 경기가 1건이거나 모든 점수차가 같은 날에는 "상위 25%"가 곧 전부라서,
 * 기준을 만들면 모든 경기가 동시에 압승이자 접전이 된다.
 * 압승에 최소 2점차를 얹는 이유는 1점차를 압승이라 부를 수 있는 점수 체계가 없기 때문이다.
 */
function marginThresholds(margins: number[]) {
  const sorted = [...margins].sort((a, b) => a - b);
  const q25 = quantile(sorted, 0.25);
  const q75 = quantile(sorted, 0.75);
  if (!(q75 > q25)) return { blowoutThreshold: null, closeThreshold: null };
  return { blowoutThreshold: Math.max(q75, 2), closeThreshold: q25 };
}

/** 날짜 → id 순. 입력 배열 순서가 결과를 바꾸지 못하게 못 박는다(연승은 시간 순서를 탄다). */
const chronological = (a: HighlightMatch, b: HighlightMatch) => {
  const ta = new Date(a.date).getTime();
  const tb = new Date(b.date).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** 같은 날을 묶는 키. 호출부가 안 주면 ISO 앞 10자로 때운다. */
const dayKeyOf = (m: HighlightMatch) => m.dayKey ?? m.date.slice(0, 10);

/** 한 경기의 참가자 전원. */
const everyone = (m: HighlightMatch) => [...m.winnerIds, ...m.loserIds];

export function computeDayStats({
  matches,
  players = [],
  priorMatches,
  tierOf,
}: HighlightInput): DayStats {
  const byId = new Map(players.map((p) => [p.id, p]));
  const asc = [...matches].sort(chronological);
  /**
   * 그 경기 **직전**의 RP. 이변의 크기는 붙기 전의 격차로 재야 한다 —
   * 경기 후 RP를 쓰면 이긴 쪽은 올라가고 진 쪽은 내려가서 격차가 저절로 깎인다.
   * rpDelta가 없는 기록에서는 현재 RP가 그대로 쓰인다.
   */
  const rpBefore = (id: string, m: HighlightMatch) => {
    const rp = byId.get(id)?.rp;
    return rp == null ? null : rp - (m.rpDeltaByPlayer?.[id] ?? 0);
  };

  const margins = asc.map((m) => Math.abs(m.scoreWin - m.scoreLose));
  const { blowoutThreshold, closeThreshold } = marginThresholds(margins);

  const perPlayer = new Map<string, PlayerDayStat>();
  const stat = (id: string) => {
    let s = perPlayer.get(id);
    if (!s) perPlayer.set(id, (s = emptyStat(id)));
    return s;
  };

  const streakCur = new Map<string, number>();
  const duoWins = new Map<string, { playerIds: string[]; wins: number }>();
  const oppToday = new Map<string, Set<string>>();
  let singles = 0;
  let doubles = 0;

  for (const m of asc) {
    const margin = Math.abs(m.scoreWin - m.scoreLose);
    const isDouble = m.matchType === "double" || m.winnerIds.length > 1 || m.loserIds.length > 1;
    if (isDouble) doubles++;
    else singles++;

    const blowout = blowoutThreshold != null && margin >= blowoutThreshold;
    const close = closeThreshold != null && margin <= closeThreshold;
    const shutout = m.scoreLose === 0;
    // 진 팀에서 가장 센 사람 기준. 복식에서 약한 짝을 골라 이변이라 부르지 않는다.
    const loserRps = m.loserIds.map((id) => rpBefore(id, m)).filter((v): v is number => v != null);
    const topLoserRp =
      loserRps.length > 0 && loserRps.length === m.loserIds.length ? Math.max(...loserRps) : null;

    for (const id of m.winnerIds) {
      const s = stat(id);
      s.appearances++;
      s.wins++;
      if (shutout) s.shutoutWins++;
      if (blowout) s.blowoutWins++;
      if (close) s.closeWins++;
      const before = rpBefore(id, m);
      if (before != null && topLoserRp != null) {
        s.bestUpsetGap = Math.max(s.bestUpsetGap, topLoserRp - before);
      }
      const c = (streakCur.get(id) ?? 0) + 1;
      streakCur.set(id, c);
      s.maxStreak = Math.max(s.maxStreak, c);
    }
    for (const id of m.loserIds) {
      const s = stat(id);
      s.appearances++;
      s.losses++;
      if (close) s.closeLosses++;
      streakCur.set(id, 0);
    }
    for (const id of everyone(m)) {
      stat(id).rpToday += m.rpDeltaByPlayer?.[id] ?? 0;
      // 상대는 "반대 팀"이다. 복식 짝꿍은 만난 사람이 아니라 같이 뛴 사람이다.
      const foes = m.winnerIds.includes(id) ? m.loserIds : m.winnerIds;
      let set = oppToday.get(id);
      if (!set) oppToday.set(id, (set = new Set()));
      for (const f of foes) set.add(f);
    }

    if (isDouble && m.winnerIds.length === 2) {
      const ids = [...m.winnerIds].sort();
      const key = ids.join("|");
      const cur = duoWins.get(key) ?? { playerIds: ids, wins: 0 };
      cur.wins++;
      duoWins.set(key, cur);
    }
  }

  /**
   * 지난 기록과의 대조. "오늘 처음"인 것들은 전부 여기서 나온다.
   *
   * 개선은 반이 아니라 개인으로, 승률이 아니라 RP로 잰다. 반은 인원 구성이 매일 달라
   * 요동치고, 하루 두 경기짜리 승률은 0·50·100% 세 값뿐이라 한 판에 뒤집힌다.
   */
  const hasHistory = priorMatches != null;
  if (priorMatches) {
    type Prior = { appearances: number; wins: number; opponents: Set<string> };
    const prior = new Map<string, Prior>();
    /** id → 날짜키 → 그 날 오간 RP 합. "지난 수업"은 그 학생이 마지막으로 뛴 날이다. */
    const rpByDay = new Map<string, Map<string, { rp: number; t: number }>>();

    for (const m of priorMatches) {
      const key = dayKeyOf(m);
      const t = new Date(m.date).getTime();
      for (const id of everyone(m)) {
        let q = prior.get(id);
        if (!q) prior.set(id, (q = { appearances: 0, wins: 0, opponents: new Set() }));
        q.appearances++;
        const won = m.winnerIds.includes(id);
        if (won) q.wins++;
        for (const f of won ? m.loserIds : m.winnerIds) q.opponents.add(f);

        let days = rpByDay.get(id);
        if (!days) rpByDay.set(id, (days = new Map()));
        const cell = days.get(key) ?? { rp: 0, t };
        cell.rp += m.rpDeltaByPlayer?.[id] ?? 0;
        cell.t = Math.max(cell.t, t);
        days.set(key, cell);
      }
    }

    for (const s of perPlayer.values()) {
      const q = prior.get(s.id);
      s.isDebut = !q;
      s.isFirstWin = !!q && q.wins === 0 && s.wins > 0;

      let fresh = 0;
      for (const f of oppToday.get(s.id) ?? []) if (!q?.opponents.has(f)) fresh++;
      s.newOpponents = fresh;

      // 지난 수업엔 RP가 줄었는데 오늘은 올린 학생. 기록이 없으면(전부 0) 해당되지 않는다.
      let last: { rp: number; t: number } | null = null;
      for (const cell of rpByDay.get(s.id)?.values() ?? [])
        if (!last || cell.t > last.t) last = cell;
      s.isRebound = last != null && last.rp < 0 && s.rpToday > 0;
    }
  }

  // 오늘 만난 상대의 평균 RP — 승패와 무관한 축. 더 센 상대와 붙기 시작한 것 자체가 개선이다.
  for (const s of perPlayer.values()) {
    const rps = [...(oppToday.get(s.id) ?? [])]
      .map((id) => byId.get(id)?.rp)
      .filter((v): v is number => v != null);
    s.oppRpAvg = rps.length > 0 ? rps.reduce((a, b) => a + b, 0) / rps.length : null;
  }

  // 티어 승급은 지난 기록이 없어도 난다 — 오늘 오간 RP만 되돌리면 경기 전 티어가 나온다.
  if (tierOf) {
    for (const s of perPlayer.values()) {
      const rp = byId.get(s.id)?.rp;
      if (rp == null || s.rpToday === 0) continue;
      s.isPromoted = tierOf(rp) > tierOf(rp - s.rpToday);
    }
  }

  /**
   * 오늘의 명경기 — 접전 중 총득점이 가장 높은 판.
   *
   * 점수차만 보면 2점제의 2:1이 전부 동률이고, 총득점만 보면 21:3 학살이 뽑힌다.
   * 접전으로 후보를 거르고 그 안에서 오래 주고받은 판을 고른다.
   * 접전 기준이 없는 날(경기 1건, 점수차가 전부 같은 날)은 명경기도 없다.
   */
  let bestMatch: BestMatch | null = null;
  if (closeThreshold != null) {
    for (const m of asc) {
      if (Math.abs(m.scoreWin - m.scoreLose) > closeThreshold) continue;
      const totalScore = m.scoreWin + m.scoreLose;
      // 동점이면 먼저 뛴 판. asc가 결정적이므로 결과도 결정적이다.
      if (bestMatch && totalScore <= bestMatch.totalScore) continue;
      bestMatch = {
        matchId: m.id,
        winnerIds: m.winnerIds,
        loserIds: m.loserIds,
        scoreWin: m.scoreWin,
        scoreLose: m.scoreLose,
        totalScore,
      };
    }
  }

  // 반 집계 — 순위가 아니라 집계다. 안 뛴 반은 애초에 여기 들어오지 않는다.
  const classAgg = new Map<string, { matches: number; players: Set<string> }>();
  const crossAgg = new Map<string, { a: string; b: string; winsA: number; winsB: number }>();
  const classOf = (id: string) => byId.get(id)?.classKey || "";
  for (const m of asc) {
    const keys = new Set<string>();
    for (const id of everyone(m)) {
      const k = classOf(id);
      if (!k) continue;
      keys.add(k);
      let agg = classAgg.get(k);
      if (!agg) classAgg.set(k, (agg = { matches: 0, players: new Set() }));
      agg.players.add(id);
    }
    // 반이 섞인 경기는 양쪽 반 모두에서 1경기로 센다 — 그 반 학생이 실제로 뛴 판이다.
    for (const k of keys) classAgg.get(k)!.matches++;

    // 반대항은 "한 반 대 한 반"일 때만 센다. 반이 섞인 팀은 어느 반의 승리인지 말할 수 없다.
    const wk = new Set(m.winnerIds.map(classOf));
    const lk = new Set(m.loserIds.map(classOf));
    if (keys.size !== 2 || wk.size !== 1 || lk.size !== 1) continue;
    const [w] = [...wk];
    const [l] = [...lk];
    if (!w || !l || w === l) continue;
    const [a, b] = [w, l].sort();
    let pair = crossAgg.get(`${a}|${b}`);
    if (!pair) crossAgg.set(`${a}|${b}`, (pair = { a, b, winsA: 0, winsB: 0 }));
    if (w === a) pair.winsA++;
    else pair.winsB++;
  }

  let maxWins = 0;
  let slots = 0;
  let maxStreak = 0;
  for (const s of perPlayer.values()) {
    slots += s.appearances;
    if (s.wins > maxWins) maxWins = s.wins;
    if (s.maxStreak > maxStreak) maxStreak = s.maxStreak;
  }
  const topWinners =
    maxWins > 0
      ? {
          playerIds: Array.from(perPlayer.values())
            .filter((s) => s.wins === maxWins)
            .map((s) => s.id)
            .sort(),
          wins: maxWins,
        }
      : null;

  return {
    total: asc.length,
    playerCount: perPlayer.size,
    singles,
    doubles,
    hasSingles: singles > 0,
    hasDoubles: doubles > 0,
    blowoutThreshold,
    closeThreshold,
    maxStreak,
    avgAppearances: perPlayer.size > 0 ? slots / perPlayer.size : 0,
    avgPlayerRp: (() => {
      const rps = Array.from(perPlayer.keys())
        .map((id) => byId.get(id)?.rp)
        .filter((v): v is number => v != null);
      return rps.length > 0 ? rps.reduce((a, b) => a + b, 0) / rps.length : null;
    })(),
    topWinners,
    perPlayer,
    duos: Array.from(duoWins.values()).sort(
      (a, b) => b.wins - a.wins || (a.playerIds.join() < b.playerIds.join() ? -1 : 1),
    ),
    hasHistory,
    bestMatch,
    // 많이 뛴 반부터. 같으면 반 키 순 — 새로고침마다 순서가 바뀌면 안 된다.
    classSummary: Array.from(classAgg.entries())
      .map(([classKey, v]) => ({ classKey, matches: v.matches, players: v.players.size }))
      .sort((x, y) => y.matches - x.matches || (x.classKey < y.classKey ? -1 : 1)),
    crossClass: Array.from(crossAgg.values()).sort((x, y) =>
      x.a !== y.a ? (x.a < y.a ? -1 : 1) : x.b < y.b ? -1 : 1,
    ),
  };
}

/**
 * 한 명을 골라야 할 때의 순서.
 *
 * 마지막 축까지 결정적이어야 한다 — 같은 데이터에서 새로고침마다 다른 이름이 나오면 안 된다.
 * 그래서 학년·반·번호·이름이 전부 비어 있는 명단에서도 id가 마지막으로 갈라준다.
 * ("아직 아무 라벨도 못 받은 학생"은 축으로 두지 않는다 — 받은 학생은 이미 후보에서 빠져 있다.)
 */
function tiebreak(a: PlayerDayStat, b: PlayerDayStat, byId: Map<string, HighlightPlayer>): number {
  // 1. 더 적은 경기로 달성한 학생
  if (a.appearances !== b.appearances) return a.appearances - b.appearances;
  const pa = byId.get(a.id);
  const pb = byId.get(b.id);
  // 2. 학년 · 반 · 번호 (없으면 뒤로)
  const axis = (v?: number | null) => (v == null ? Number.MAX_SAFE_INTEGER : v);
  for (const k of ["grade", "classNum", "studentNo"] as const) {
    const d = axis(pa?.[k]) - axis(pb?.[k]);
    if (d !== 0) return d;
  }
  const na = pa?.name ?? "";
  const nb = pb?.name ?? "";
  if (na !== nb) return na < nb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 희귀도 순으로 줄 세운 상들. 위에서부터 배정하고, 이미 받은 학생은 아래에서 제외한다.
 *
 * 드문 상을 먼저 배정해야 그 학생이 흔한 상에 묶여 사라지지 않는다.
 * 흔한 상은 후보가 많아 다른 사람으로 대체해도 거짓이 아니다.
 *
 * `최다승`은 여기 없다 — 사실 자체가 유일해야 하는 지표라 남에게 넘기면 거짓말이 된다.
 * (`DayStats.topWinners`로 경기 요약에 그대로 나간다.)
 */
type AwardSpec = {
  key: string;
  emoji: string;
  value: (s: PlayerDayStat) => number;
  min: number;
  /**
   * 그 날 평균을 넘어야 하는 상의 문턱. 절대 기준이 없는 지표에 쓴다 —
   * 평균만큼 뛴 사람을 `최다 출전`이라 부를 수 없다.
   */
  floor?: (d: DayStats) => number | null;
  /** 그 날 분포가 이 상을 성립시키는가. 아니면 후보를 보기도 전에 건너뛴다. */
  enabled?: (d: DayStats) => boolean;
  detail: (value: number) => string;
  /** 부정 계열(진 이야기). 하루 최대 1개, 동점자가 많으면 목록으로도 내지 않는다. */
  negative?: boolean;
};

const AWARDS: AwardSpec[] = [
  {
    key: "친구 넓히기",
    emoji: "👋",
    // 학교용으로 가장 값진 지표다. 승패와 무관하게 상을 받을 수 있고, 대진 배정의
    // "다양성 우선"과 목표가 같다. 그래서 사다리 맨 위에 둔다 — 이 학생이 다른 상에
    // 묶여 사라지면 그 날 하이라이트에서 유일하게 승패를 안 보는 자리가 없어진다.
    value: (s) => s.newOpponents,
    min: 2,
    enabled: (d) => d.hasHistory,
    detail: (v) => `오늘 처음 만난 상대가 ${v}명. 늘 하던 애들끼리를 깼어요.`,
  },
  {
    key: "대이변러",
    emoji: "🎯",
    // 횟수가 아니라 RP 차. 하루 1~2경기 리그에서 "몇 번 꺾었나"는 전원이 1이라 아무도
    // 구별되지 않지만, 차이는 사람마다 갈린다. 최소 20은 "실수로 이긴 게 아니다"의 선.
    value: (s) => s.bestUpsetGap,
    min: 20,
    detail: (v) => `나보다 RP가 ${Math.round(v)} 높은 상대를 꺾었어요.`,
  },
  {
    key: "완봉승",
    emoji: "🧱",
    value: (s) => s.shutoutWins,
    min: 1,
    detail: (v) => `상대에게 한 점도 주지 않은 판이 ${v}번.`,
  },
  {
    key: "연승왕",
    emoji: "🔥",
    // 그 날 최대 연승이 3 미만이면 카드를 만들지 않는다.
    // 하루 2~3경기 뛰는 리그에서 2연승은 곧 "오늘 전승"이라 수십 명이 해당된다.
    value: (s) => s.maxStreak,
    min: 3,
    enabled: (d) => d.maxStreak >= 3,
    detail: (v) => `쉬지 않고 ${v}연승을 내달렸어요.`,
  },
  {
    key: "RP 상승",
    emoji: "📊",
    // 보너스와 상대 티어가 섞여 값이 거의 겹치지 않는다 — 하루 두 경기짜리 날의 몇 안 되는
    // 연속값이다. 다만 승패와 강하게 붙어 있으므로 승패 무관 상들보다 아래에 둔다.
    value: (s) => s.rpToday,
    min: 1,
    detail: (v) => `오늘 RP를 +${Math.round(v)} 올렸어요.`,
  },
  {
    key: "접전 승부사",
    emoji: "😤",
    // 문서의 `1점차 승부사` 자리. 2점제에서 1점차는 가장 흔한 결과라 고정값을 쓰지 않고
    // 그 날 점수차 하위 25%를 접전으로 본다.
    value: (s) => s.closeWins,
    min: 1,
    enabled: (d) => d.closeThreshold != null,
    detail: (v) => `손에 땀 쥐는 접전을 ${v}번 잡아냈어요.`,
  },
  {
    key: "강한 상대",
    emoji: "🧗",
    // 승패와 무관한 축이다. 져도 받을 수 있고, RP·연승 계열이 잘하는 학생에게 쏠리는 것을
    // 이 상이 상쇄한다. 그 날 평균 RP를 넘는 상대를 만났을 때만 성립한다.
    value: (s) => s.oppRpAvg ?? 0,
    min: 1,
    floor: (d) => d.avgPlayerRp,
    enabled: (d) => d.avgPlayerRp != null,
    detail: (v) => `오늘 만난 상대 평균 RP가 ${Math.round(v)}. 센 상대와 붙었어요.`,
  },
  {
    key: "최다 출전",
    emoji: "🏃",
    value: (s) => s.appearances,
    min: 1,
    floor: (d) => d.avgAppearances,
    detail: (v) => `오늘 ${v}경기, 코트를 오래 지켰어요.`,
  },
  {
    key: "근성상",
    emoji: "💪",
    value: (s) => s.closeLosses,
    min: 1,
    enabled: (d) => d.closeThreshold != null,
    negative: true,
    detail: (v) => `${v}번을 아깝게 놓쳤어요. 다음 판은 당신 겁니다!`,
  },
];

/** 카드로 낼 수 없을 만큼 해당자가 많은 기준. 이 수부터는 목록으로 내린다. */
const LIST_THRESHOLD = 3;

/**
 * 목록으로도 낼 수 없을 만큼 해당자가 많은 기준. 이 수를 넘으면 그 지표를 아예 내지 않는다.
 *
 * 27명이 뛴 날 21명이 `친구 넓히기`, 19명이 `최다 출전`이면 그건 하이라이트가 아니라
 * 출석부다. 이름이 여섯을 넘어 `외 N명`으로 접히기 시작하는 순간 이미 목록이 아니라
 * 명단이고, 명단은 아무것도 구별해 주지 않는다.
 *
 * 상한을 넘긴 지표는 그 날 흔한 일이었다는 뜻이다. 흔한 일에는 상을 주지 않는다.
 */
const LIST_MAX = 6;

export function computeAwards(day: DayStats, players: HighlightPlayer[] = []): HighlightAwards {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cards: HighlightCard[] = [];
  const lists: HighlightList[] = [];
  const labeled = new Set<string>();
  const stats = Array.from(day.perPlayer.values());

  /** 목록 한 줄. 해당자가 상한을 넘으면 조용히 버린다 — 침묵이 명단보다 낫다. */
  const pushList = (
    key: string,
    emoji: string,
    who: PlayerDayStat[],
    value: number,
    detail: string,
  ) => {
    if (who.length === 0 || who.length > LIST_MAX) return;
    lists.push({
      key,
      emoji,
      playerIds: [...who].sort((a, b) => tiebreak(a, b, byId)).map((s) => s.id),
      value,
      detail,
    });
  };

  for (const spec of AWARDS) {
    if (spec.enabled && !spec.enabled(day)) continue;

    const floor = spec.floor?.(day) ?? null;
    const pool = stats.filter((s) => {
      if (labeled.has(s.id)) return false; // 이미 받은 학생은 아래 상에서 제외
      const v = spec.value(s);
      return v >= spec.min && (floor == null || v > floor);
    });
    if (pool.length === 0) continue;

    const best = Math.max(...pool.map(spec.value));
    const tied = pool.filter((s) => spec.value(s) === best);

    if (tied.length >= LIST_THRESHOLD) {
      // 동점자가 셋 이상. 한 명을 뽑으면 나머지가 지워진다.
      // 부정 계열은 목록조차 내지 않는다 — 반 전체가 보는 화면에 "오늘 많이 진 사람" 명단이 된다.
      if (!spec.negative) pushList(spec.key, spec.emoji, tied, best, spec.detail(best));
      continue;
    }

    const winner = [...tied].sort((a, b) => tiebreak(a, b, byId))[0];
    labeled.add(winner.id);
    cards.push({
      key: spec.key,
      emoji: spec.emoji,
      playerId: winner.id,
      value: best,
      detail: spec.detail(best),
    });
  }

  // 연승 카드가 안 나온 날의 전승자들. "2연승 한 명"이라는 거짓 대신 이름을 다 적는다.
  if (day.maxStreak === 2) {
    const sweepers = stats.filter((s) => s.losses === 0 && s.wins >= 2);
    pushList("전승", "✨", sweepers, 2, "오늘 한 판도 지지 않았어요.");
  }

  /**
   * 사실 목록 — 해당되면 전부 적는다.
   *
   * 카드 사다리에 끼우지 않는 이유는, 이것들이 "가장 잘한 한 명"이 아니라 **그 학생에게
   * 실제로 일어난 일**이기 때문이다. 첫 승을 한 학생이 그 날 다른 카드를 받았다고 해서
   * 첫 승이 아니게 되지는 않는다. 그래서 라벨을 소비하지도, 라벨 때문에 빠지지도 않는다.
   *
   * 나빠진 학생은 내지 않는다. 51명을 다 계산해 "나아짐 / 나빠짐"을 붙이면
   * 하이라이트가 아니라 성적표가 된다.
   */
  const facts: [key: string, emoji: string, pick: (s: PlayerDayStat) => boolean, detail: string][] =
    [
      ["리그 데뷔", "🐣", (s) => s.isDebut, "오늘 처음 코트에 섰어요."],
      ["첫 승", "🎉", (s) => s.isFirstWin, "한 번도 못 이기다가 오늘 첫 승을 거뒀어요."],
      ["티어 승급", "⬆️", (s) => s.isPromoted, "오늘 경기로 티어가 올라갔어요."],
      // 승급한 학생은 여기 다시 적지 않는다 — 승급이 더 큰 사실이다.
      [
        "나아진 학생",
        "📈",
        (s) => s.isRebound && !s.isPromoted,
        "지난 수업엔 RP가 줄었는데 오늘은 올렸어요.",
      ],
    ];
  for (const [key, emoji, pick, detail] of facts) {
    const who = stats.filter(pick);
    pushList(key, emoji, who, who.length, detail);
  }

  const duo = day.hasDoubles ? (day.duos.find((d) => d.wins >= 2) ?? null) : null;

  return { cards, lists, duo };
}

/** 통계와 상을 한 번에. 화면은 보통 이것만 부른다. */
export function computeHighlights(input: HighlightInput) {
  const day = computeDayStats(input);
  return { day, awards: computeAwards(day, input.players ?? []) };
}
