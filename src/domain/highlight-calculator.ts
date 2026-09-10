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
};

/**
 * 이름표를 붙이는 데 필요한 최소한의 정보. 전부 선택 항목이다 —
 * 삭제된 학생이 낀 경기(조회 실패)와 반 정보가 없는 명단(전원 null) 양쪽에서 돌아야 한다.
 *
 * `strength`는 티어를 숫자로 편 값으로, **클수록 강하다**. 이 파일은 티어 이름도,
 * 임계 RP도 모른다 — 호출부가 자기 티어 체계로 환산해서 넘긴다.
 */
export type HighlightPlayer = {
  id: string;
  strength?: number | null;
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
  /** 자기보다 강한 상대를 꺾은 판. 양쪽 strength를 다 알 때만 센다. */
  upsetWins: number;
  maxStreak: number;
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
  /** 최다승 — 사실 자체가 유일해야 하므로 배정에서 빼고 그대로 내보낸다. 동점이면 전원. */
  topWinners: { playerIds: string[]; wins: number } | null;
  perPlayer: Map<string, PlayerDayStat>;
  /** 복식에서 함께 이긴 조합. 복식이 없는 날은 비어 있다. */
  duos: { playerIds: string[]; wins: number }[];
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
  upsetWins: 0,
  maxStreak: 0,
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

export function computeDayStats({ matches, players = [] }: HighlightInput): DayStats {
  const byId = new Map(players.map((p) => [p.id, p]));
  const asc = [...matches].sort(chronological);

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
    // 진 팀에서 가장 강한 사람 기준. 복식에서 약한 짝을 골라 이변이라 부르지 않는다.
    const loserStrengths = m.loserIds
      .map((id) => byId.get(id)?.strength)
      .filter((v): v is number => v != null);
    const topLoser =
      loserStrengths.length > 0 && loserStrengths.length === m.loserIds.length
        ? Math.max(...loserStrengths)
        : null;

    for (const id of m.winnerIds) {
      const s = stat(id);
      s.appearances++;
      s.wins++;
      if (shutout) s.shutoutWins++;
      if (blowout) s.blowoutWins++;
      if (close) s.closeWins++;
      const mine = byId.get(id)?.strength;
      if (mine != null && topLoser != null && topLoser > mine) s.upsetWins++;
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

    if (isDouble && m.winnerIds.length === 2) {
      const ids = [...m.winnerIds].sort();
      const key = ids.join("|");
      const cur = duoWins.get(key) ?? { playerIds: ids, wins: 0 };
      cur.wins++;
      duoWins.set(key, cur);
    }
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
    topWinners,
    perPlayer,
    duos: Array.from(duoWins.values()).sort(
      (a, b) => b.wins - a.wins || (a.playerIds.join() < b.playerIds.join() ? -1 : 1),
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
  /** 그 날 분포가 이 상을 성립시키는가. 아니면 후보를 보기도 전에 건너뛴다. */
  enabled?: (d: DayStats) => boolean;
  detail: (value: number) => string;
  /** 부정 계열(진 이야기). 하루 최대 1개, 동점자가 많으면 목록으로도 내지 않는다. */
  negative?: boolean;
};

const AWARDS: AwardSpec[] = [
  {
    key: "대이변러",
    emoji: "🎯",
    value: (s) => s.upsetWins,
    min: 1,
    detail: (v) => `자기보다 높은 티어를 ${v}번 꺾었어요.`,
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
    key: "최다 출전",
    emoji: "🏃",
    value: (s) => s.appearances,
    min: 1,
    detail: (v) => `오늘 ${v}경기, 코트를 가장 오래 지켰어요.`,
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

export function computeAwards(day: DayStats, players: HighlightPlayer[] = []): HighlightAwards {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cards: HighlightCard[] = [];
  const lists: HighlightList[] = [];
  const labeled = new Set<string>();
  const stats = Array.from(day.perPlayer.values());

  for (const spec of AWARDS) {
    if (spec.enabled && !spec.enabled(day)) continue;

    // `최다 출전`만은 절대 기준이 없다 — 그 날 평균을 넘어야 "최다"라 부를 수 있다.
    const isAttendance = spec.key === "최다 출전";
    const pool = stats.filter((s) => {
      if (labeled.has(s.id)) return false; // 이미 받은 학생은 아래 상에서 제외
      const v = spec.value(s);
      return isAttendance ? v > day.avgAppearances && v >= spec.min : v >= spec.min;
    });
    if (pool.length === 0) continue;

    const best = Math.max(...pool.map(spec.value));
    const tied = pool.filter((s) => spec.value(s) === best);

    if (tied.length >= LIST_THRESHOLD) {
      // 동점자가 셋 이상. 한 명을 뽑으면 나머지가 지워진다.
      // 부정 계열은 목록조차 내지 않는다 — 반 전체가 보는 화면에 "오늘 많이 진 사람" 명단이 된다.
      if (!spec.negative) {
        lists.push({
          key: spec.key,
          emoji: spec.emoji,
          playerIds: [...tied].sort((a, b) => tiebreak(a, b, byId)).map((s) => s.id),
          value: best,
          detail: spec.detail(best),
        });
      }
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
    if (sweepers.length > 0) {
      lists.push({
        key: "전승",
        emoji: "✨",
        playerIds: [...sweepers].sort((a, b) => tiebreak(a, b, byId)).map((s) => s.id),
        value: 2,
        detail: "오늘 한 판도 지지 않았어요.",
      });
    }
  }

  const duo = day.hasDoubles ? (day.duos.find((d) => d.wins >= 2) ?? null) : null;

  return { cards, lists, duo };
}

/** 통계와 상을 한 번에. 화면은 보통 이것만 부른다. */
export function computeHighlights(input: HighlightInput) {
  const day = computeDayStats(input);
  return { day, awards: computeAwards(day, input.players ?? []) };
}
