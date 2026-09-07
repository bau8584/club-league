/**
 * 대진 배정 계산기 — 순수 함수
 *
 * 설계 문서: docs/PLAN-match-assignment.md
 *
 * DB도, React도, "오늘"도 모르는 함수다. 입력은 참가자 목록 + 만남/판수 히스토리 +
 * 제약(뽑을 경기 수, 팀 크기)뿐이고, 출력은 배정 결과뿐이다. 이 격리 덕분에
 * 30명 × 15주 시뮬레이션을 돌려 커버리지가 실제로 채워지는지 교실 밖에서 확인할 수 있다.
 *
 * 두 가지 원칙이 코드 전체를 지배한다.
 *
 * 1. **누적 카운터를 저장하지 않는다.** 호출할 때마다 (완료 경기 + 현재 큐)를 통째로 받아
 *    처음부터 다시 센다. 큐 행이 지워지면 다음 호출에서 자동으로 반영되므로
 *    취소·조퇴·삭제에 보정 로직이 필요 없다.
 * 2. **큐는 이미 일어난 일로 취급한다.** 큐에 이름이 올라 있으면 후보에서 빼고(하드),
 *    큐의 대진은 판 수 1판과 만난 조합으로 미리 센다. 안 그러면 아직 안 뛴 사람의
 *    판 수가 0이라 같은 사람이 큐에 연속으로 들어가는, 정확히 반대되는 결과가 난다.
 */

/** 팀 크기 — 1이면 단식, 2면 복식. */
export type TeamSize = 1 | 2;

/**
 * 배정 프리셋 — 사용자가 뽑는 순간 고르는 단 하나의 선택.
 *
 * "다양성 / 실력"은 나란한 선택지가 아니라 층위가 다른 두 가지다.
 * 다양성은 "누구를 붙일까"(짝짓기 기준)이고, 실력 균형은 "얼마나 팽팽하게"이며,
 * 둘은 배타적이지 않다 — "안 만난 조합 중에서 실력 차가 크지 않은 쪽"처럼 동시에 쓴다.
 * 그래서 노출하는 것은 그 축 위의 위치 하나뿐이다.
 *
 * - diversity: 안 만난 사람끼리. 사전식으로 다양성이 항상 이기고, 실력은 느슨한 제약
 * - balanced:  안 만난 조합 중 실력이 맞는 쪽. 가중합
 * - skill:     비슷한 실력끼리. 사전식으로 실력이 항상 이김
 *
 * 기본값은 리그 유형이 고른다(school → diversity, club → balanced). 호출부가 명시하면 그게 이긴다.
 * 리그 설정에서 미리 받아 두는 값이 아니라 뽑는 순간의 한 번 선택이므로,
 * "미리 받아 두면 낡는다"는 이유로 기각된 설정값들과는 성격이 다르다.
 */
export type AssignmentPreset = "diversity" | "balanced" | "skill";

/** 리그 유형별 기본 프리셋. 유형은 기본값을 고르는 데만 쓴다. */
export function defaultPreset(leagueType: "school" | "club"): AssignmentPreset {
  return leagueType === "school" ? "diversity" : "balanced";
}

export interface AssignmentPlayer {
  id: string;
  /** 실력 균형에 쓰는 값(RP·급수 점수 등). 없으면 균형 항이 0이 된다. */
  rating?: number | null;
}

/** 히스토리 한 건 — 완료된 경기든 큐에 든 경기든 동일하게 취급한다. */
export interface AssignmentHistoryMatch {
  teamA: string[];
  teamB: string[];
}

export interface AssignmentWeights {
  /** 판 수 편차(적게 뛴 사람 우선) */
  playCount: number;
  /** 같은 파트너 반복 */
  partnerRepeat: number;
  /** 같은 상대 반복 */
  opponentRepeat: number;
  /** 팀 간 실력 차 */
  balance: number;
  /** 팀 내 실력 편중(복식에서 강-강 / 약-약으로 갈리는 것) */
  teamSpread: number;
  /** 이미 큐에 들어 있는 사람을 완화로 다시 쓸 때의 감점 */
  busyReuse: number;
}

export interface AssignmentInput {
  /** 후보 모집단. 보통 "오늘 참석자". 지각·조퇴는 이 목록의 유무로만 표현된다. */
  participants: AssignmentPlayer[];
  /**
   * 지금 큐에 이름이 올라 있는 사람(대기 중 + 뛰는 중). 다음 경기에 넣으면 안 되는 건
   * 같으므로 상태를 구분하지 않는다. 후보에서 하드 제외되며, 후보가 모자랄 때만
   * 큰 감점과 함께 완화된다.
   */
  busyPlayerIds?: string[];
  /**
   * 만남 히스토리 — 누가 누구와 같은 팀이었나 / 누구와 붙었나. 완료 경기 + 현재 큐.
   * `playHistory`를 주지 않으면 판 수도 여기서 센다.
   */
  history?: AssignmentHistoryMatch[];
  /**
   * 판 수 히스토리. 만남과 창(window)이 다를 때 쓴다 — 커버리지는 지난 학기까지
   * 소급해서 보고 싶지만 "몇 판 뛰었나"는 오늘 것만 세야 하는 경우가 그렇다.
   * 생략하면 `history`를 그대로 쓴다.
   */
  playHistory?: AssignmentHistoryMatch[];
  /** 뽑을 경기 수. "다 뽑기"가 아니라 모자란 만큼만 채운다. */
  count: number;
  teamSize?: TeamSize;
  /** 생략하면 diversity. 리그 유형별 기본값은 defaultPreset()으로 고른다. */
  policy?: AssignmentPreset;
  /** [다양성 우선]의 느슨한 제약 한계(1인당 평균 실력 차). */
  balanceLimit?: number;
  /** [실력 우선]이 실력 차를 같은 급으로 묶는 단위. */
  skillGranularity?: number;
  /** 프리셋 위에 얹는 부분 조정. */
  weights?: Partial<AssignmentWeights>;
  /** 동점 처리를 결정론적으로 흔든다. 같은 seed면 같은 결과가 나온다. */
  seed?: number;
}

export interface AssignedMatch {
  teamA: string[];
  teamB: string[];
  /** 이 대진의 목적함수 값(낮을수록 좋음). 디버깅·시뮬레이션용. */
  cost: number;
  /** 후보 부족으로 큐에 든 사람을 다시 쓴 경우 그 id들. */
  relaxedPlayerIds: string[];
}

export interface AssignmentOutput {
  matches: AssignedMatch[];
  /** 요청한 count 중 인원이 모자라 못 뽑은 경기 수. */
  shortfall: number;
  /** 배정 후 기준 판 수(입력 히스토리 + 이번 배정). 화면·시뮬레이션 검증용. */
  playCounts: Record<string, number>;
}

/**
 * 가중치는 [절충]의 가중합에만 그대로 쓰인다. [다양성 우선]·[실력 우선]은 사전식이라
 * 이 값들이 항목 *안에서의* 비중(파트너 반복 vs 상대 반복 등)만 정한다.
 */
const BASE_WEIGHTS: AssignmentWeights = {
  playCount: 100,
  partnerRepeat: 60,
  opponentRepeat: 30,
  balance: 30,
  teamSpread: 10,
  busyReuse: 1000,
};

const PRESET_WEIGHTS: Record<AssignmentPreset, AssignmentWeights> = {
  // 다양성이 사전식으로 이기므로 가중치는 항목 내부 비중만 담당한다.
  diversity: { ...BASE_WEIGHTS },
  // 절충: 판 수 균등 > 실력 균형 > 다양성. 동호회의 최대 민원은 예외 없이 "나만 덜 뛰었다"이다.
  balanced: {
    ...BASE_WEIGHTS,
    playCount: 160,
    balance: 40,
    teamSpread: 12,
    partnerRepeat: 30,
    opponentRepeat: 15,
  },
  skill: { ...BASE_WEIGHTS },
};

export function defaultWeights(preset: AssignmentPreset): AssignmentWeights {
  return { ...PRESET_WEIGHTS[preset] };
}

/**
 * [다양성 우선]의 "느슨한 제약" 한계 — 두 팀의 1인당 평균 실력 차가 이보다 크면
 * 다양성보다 먼저 감점된다. 다만 조건을 만족하는 조합이 하나도 없으면 전부 같은
 * 위반 상태가 되어 다양성이 다시 결정한다(막히지 않는 제약).
 */
const DEFAULT_BALANCE_LIMIT = 300;

/**
 * [실력 우선]에서 실력 차를 반올림하는 단위. 연속값을 그대로 1순위로 두면
 * 동점이 나지 않아 2순위(다양성)가 영영 작동하지 않는다. 같은 급으로 묶어
 * "실력이 사실상 같으면 안 만난 쪽"이 되게 한다.
 */
const DEFAULT_SKILL_GRANULARITY = 25;

/**
 * 조합 후보 상한. 한 경기를 뽑을 때 우선순위 상위 이만큼만 완전 탐색한다.
 * 4명 기준 C(11,3) = 165가지 × 팀 나누기 3가지라 30명이 와도 즉시 끝난다.
 */
const CANDIDATE_WINDOW = 12;

/** 결정론적 난수(mulberry32) — 동점일 때만 쓴다. */
function makeRng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

export interface HistoryStats {
  playCount: Map<string, number>;
  partner: Map<string, number>;
  opponent: Map<string, number>;
}

function emptyStats(): HistoryStats {
  return { playCount: new Map(), partner: new Map(), opponent: new Map() };
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** 히스토리 한 건을 통계에 반영한다. 완료 경기와 큐 경기를 구분하지 않는다. */
function applyMatch(stats: HistoryStats, teamA: string[], teamB: string[]) {
  for (const id of [...teamA, ...teamB]) bump(stats.playCount, id, 1);
  for (const team of [teamA, teamB]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) bump(stats.partner, pairKey(team[i], team[j]));
    }
  }
  for (const a of teamA) {
    for (const b of teamB) bump(stats.opponent, pairKey(a, b));
  }
}

/**
 * 완료 경기 + 큐에서 판 수·파트너·상대 카운트를 만든다.
 * 커버리지는 과거 기록에서 그때그때 유도되므로 미리 남겨둘 데이터가 없다.
 */
export function buildHistoryStats(history: AssignmentHistoryMatch[]): HistoryStats {
  const stats = emptyStats();
  for (const m of history) applyMatch(stats, m.teamA ?? [], m.teamB ?? []);
  return stats;
}

/**
 * 한 대진의 비용을 항목별로 나눠 잰다. 프리셋마다 항목을 다르게 조합하기 때문에
 * 하나의 합으로 뭉쳐 두면 사전식 비교가 불가능하다.
 */
interface CostParts {
  /** 조합 반복(파트너 + 상대). 낮을수록 새로운 조합이다. */
  diversity: number;
  /** 이미 뛴 판 수 합. 낮을수록 덜 뛴 사람들이다. */
  play: number;
  /** 팀 간 실력 차 + 팀 내 편중. 낮을수록 팽팽하다. */
  balance: number;
  /** 두 팀의 1인당 평균 실력 차. 느슨한 제약 판정에만 쓴다. */
  gap: number;
  /**
   * 네 명이 실력적으로 얼마나 한 덩어리인가(팀 간 차 + 팀 내 편중).
   * "비슷한 실력끼리"는 팀 간 차만으로는 표현되지 않는다 — 강-약 / 강-약으로 나누면
   * 두 팀 합은 같지만 그건 실력이 섞인 경기다.
   */
  homogeneity: number;
  /** 큐에 든 사람을 완화로 다시 쓴 대가. 어떤 프리셋에서도 항상 1순위다. */
  relax: number;
  /** 동점을 결정론적으로 가르는 미세값. */
  jitter: number;
}

function costParts(
  teamA: string[],
  teamB: string[],
  stats: HistoryStats,
  ratings: Map<string, number>,
  w: AssignmentWeights,
  relaxed: Set<string>,
  jitter: Map<string, number>,
): CostParts {
  let diversity = 0;
  for (const team of [teamA, teamB]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        diversity += w.partnerRepeat * (stats.partner.get(pairKey(team[i], team[j])) ?? 0);
      }
    }
  }
  for (const a of teamA) {
    for (const b of teamB) {
      diversity += w.opponentRepeat * (stats.opponent.get(pairKey(a, b)) ?? 0);
    }
  }

  let balance = 0;
  let gap = 0;
  let spreadSum = 0;
  const members = [...teamA, ...teamB];
  if (members.some((id) => ratings.has(id))) {
    const sum = (team: string[]) => team.reduce((acc, id) => acc + (ratings.get(id) ?? 0), 0);
    gap = Math.abs(sum(teamA) - sum(teamB)) / teamA.length;
    // 팀 내 편중: 강-강 / 약-약으로 갈리면 두 팀 합이 같아도 경기가 재미없다.
    const spread = (team: string[]) => {
      if (team.length < 2) return 0;
      const vals = team.map((id) => ratings.get(id) ?? 0);
      return Math.max(...vals) - Math.min(...vals);
    };
    spreadSum = spread(teamA) + spread(teamB);
    balance = (w.balance * gap) / 100 + (w.teamSpread * spreadSum) / 100;
  }

  let play = 0;
  let relax = 0;
  let jit = 0;
  for (const id of members) {
    play += w.playCount * (stats.playCount.get(id) ?? 0);
    if (relaxed.has(id)) relax += w.busyReuse;
    jit += (jitter.get(id) ?? 0) * 0.001;
  }

  return { diversity, play, balance, gap, homogeneity: gap + spreadSum, relax, jitter: jit };
}

/** 사전식 비교용 키. 앞자리부터 순서대로 비교하고, 같으면 다음 자리로 넘어간다. */
function sortKey(
  parts: CostParts,
  preset: AssignmentPreset,
  balanceLimit: number,
  skillGranularity: number,
): number[] {
  switch (preset) {
    case "diversity":
      // 실력은 느슨한 제약(한계를 넘었는가 0/1)일 뿐, 그 안에서는 다양성이 항상 이긴다.
      return [
        parts.relax,
        parts.gap > balanceLimit ? 1 : 0,
        parts.diversity,
        parts.play,
        parts.balance,
        parts.jitter,
      ];
    case "skill":
      // 실력이 항상 이긴다. 같은 급으로 묶어야 2순위(다양성)가 작동한다.
      return [
        parts.relax,
        Math.round(parts.homogeneity / skillGranularity),
        parts.diversity,
        parts.play,
        parts.balance,
        parts.jitter,
      ];
    case "balanced":
    default:
      // 하나의 가중합. 세 항목이 서로를 밀고 당긴다.
      return [parts.relax + parts.diversity + parts.play + parts.balance + parts.jitter];
  }
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 뽑힌 인원을 팀으로 나누는 모든 경우(4명이면 3가지). */
function splitsOf(group: string[], teamSize: TeamSize): Array<[string[], string[]]> {
  if (teamSize === 1) return [[[group[0]], [group[1]]]];
  const [p0, p1, p2, p3] = group;
  return [
    [
      [p0, p1],
      [p2, p3],
    ],
    [
      [p0, p2],
      [p1, p3],
    ],
    [
      [p0, p3],
      [p1, p2],
    ],
  ];
}

/** k개를 고르는 조합을 모두 만든다. 후보 창이 작아서(≤12) 완전 탐색이 싸다. */
function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * 큐를 채울 대진을 계산한다.
 *
 * 매 경기마다 (1) 판 수가 가장 적은 사람을 앵커로 고정하고, (2) 우선순위 상위
 * 후보 창 안에서 나머지 자리를 완전 탐색해 목적함수를 최소화한다. 뽑은 경기는
 * 곧바로 작업 통계에 반영되므로, 한 번의 호출로 여러 경기를 뽑아도 같은 사람이
 * 연달아 들어가지 않는다.
 */
export function calculateAssignment(input: AssignmentInput): AssignmentOutput {
  const teamSize: TeamSize = input.teamSize ?? 2;
  const preset: AssignmentPreset = input.policy ?? "diversity";
  const w = { ...defaultWeights(preset), ...(input.weights ?? {}) };
  const balanceLimit = input.balanceLimit ?? DEFAULT_BALANCE_LIMIT;
  const skillGranularity = input.skillGranularity ?? DEFAULT_SKILL_GRANULARITY;
  const rng = makeRng(input.seed ?? 0);
  const needed = teamSize * 2;

  // 같은 id가 두 번 들어와도 한 사람으로 본다(참가자 목록은 밖에서 온다).
  const roster = new Map<string, AssignmentPlayer>();
  for (const p of input.participants) if (p?.id) roster.set(p.id, p);

  const ratings = new Map<string, number>();
  for (const [id, p] of roster) {
    if (typeof p.rating === "number" && Number.isFinite(p.rating)) ratings.set(id, p.rating);
  }

  const stats = buildHistoryStats(input.history ?? []);
  if (input.playHistory) {
    // 판 수만 다른 창에서 다시 센다. 만남 카운트는 history 것을 그대로 둔다.
    stats.playCount = buildHistoryStats(input.playHistory).playCount;
  }
  // 입력으로 들어온 큐 인원과, 이번 호출에서 방금 배정한 인원을 나눠 둔다.
  // 전자는 후보가 모자랄 때 감점과 함께 완화할 수 있지만, 후자는 절대 완화하지 않는다.
  // 같은 사람을 한 번의 채우기에서 두 경기에 넣는 것은 물리적으로 불가능하다.
  const busy = new Set((input.busyPlayerIds ?? []).filter((id) => roster.has(id)));
  const justAssigned = new Set<string>();

  // 동점을 결정론적으로 깨기 위한 고정 지터. 매 경기 다시 뽑지 않는다
  // (같은 사람이 매번 같은 방향으로 유리해지는 것을 막되, 결과는 재현 가능하게).
  const jitter = new Map<string, number>();
  for (const id of roster.keys()) jitter.set(id, rng());

  const matches: AssignedMatch[] = [];
  let shortfall = 0;

  for (let round = 0; round < Math.max(0, input.count); round++) {
    const free = [...roster.keys()].filter((id) => !busy.has(id) && !justAssigned.has(id));

    // 후보가 모자랄 때: 하드 제외를 단계적으로 풀되 큰 감점(busyReuse)으로 뒤로 보낸다.
    // "항상 뭔가는 뽑힌다"를 보장한다 — 단, 사람 자체가 모자라면 못 뽑는다.
    let pool = free;
    const relaxed = new Set<string>();
    if (pool.length < needed) {
      const extra = [...roster.keys()]
        .filter((id) => busy.has(id) && !justAssigned.has(id))
        .sort((a, b) => playPriority(a, b));
      for (const id of extra) {
        if (pool.length >= needed) break;
        pool = [...pool, id];
        relaxed.add(id);
      }
    }
    if (pool.length < needed) {
      shortfall = input.count - round;
      break;
    }

    const ordered = pool.slice().sort(playPriority);
    const anchor = ordered[0];
    const window = ordered.slice(1, CANDIDATE_WINDOW);

    // 조합과 팀 나누기를 함께 훑는다. 프리셋에 따라 "좋은 팀 나누기"의 기준까지
    // 달라지므로 팀을 먼저 고정하고 조합을 고를 수 없다.
    let best: { teamA: string[]; teamB: string[]; cost: number; key: number[] } | null = null;
    for (const rest of combinations(window, needed - 1)) {
      const group = [anchor, ...rest];
      for (const [teamA, teamB] of splitsOf(group, teamSize)) {
        const parts = costParts(teamA, teamB, stats, ratings, w, relaxed, jitter);
        const key = sortKey(parts, preset, balanceLimit, skillGranularity);
        if (!best || compareKeys(key, best.key) < 0) {
          best = {
            teamA,
            teamB,
            key,
            cost: parts.relax + parts.diversity + parts.play + parts.balance,
          };
        }
      }
    }

    if (!best) {
      shortfall = input.count - round;
      break;
    }

    const chosen = [...best.teamA, ...best.teamB];
    matches.push({
      teamA: best.teamA,
      teamB: best.teamB,
      cost: best.cost,
      relaxedPlayerIds: chosen.filter((id) => relaxed.has(id)),
    });

    // 방금 뽑은 대진을 즉시 사실로 취급한다. 큐를 계산에 넣는 것과 같은 이유다.
    applyMatch(stats, best.teamA, best.teamB);
    for (const id of chosen) justAssigned.add(id);
  }

  const playCounts: Record<string, number> = {};
  for (const id of roster.keys()) playCounts[id] = stats.playCount.get(id) ?? 0;

  return { matches, shortfall, playCounts };

  /** 덜 뛴 사람 우선, 동점이면 고정 지터로 결정론적으로 가른다. */
  function playPriority(a: string, b: string): number {
    const diff = (stats.playCount.get(a) ?? 0) - (stats.playCount.get(b) ?? 0);
    if (diff !== 0) return diff;
    return (jitter.get(a) ?? 0) - (jitter.get(b) ?? 0);
  }
}
