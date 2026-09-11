/**
 * 지난 출석일의 "빚" — 그날 남들보다 덜 뛴 만큼.
 *
 * 대진은 판 수를 오늘 안에서만 센다. 그래서 지난 시간에 한 판밖에 못 뛴 아이가 오늘도
 * 한 판만 뛰는 일이 생긴다 — 오늘의 눈에는 모두가 0판에서 출발하니까. 총 판 수를 세면
 * 결석한 날까지 손해로 잡히고, 학기 평균은 둔해서 지난주의 손해가 묻힌다. 그래서 딱
 * 한 걸음만 뒤를 본다: 마지막으로 출석한 날, 그날 뛴 사람들의 평균보다 덜 뛴 만큼.
 *
 * "출석한 날"은 따로 기록하지 않는다. 그날 한 판이라도 뛰었으면 출석한 날이다.
 * 출석했는데 0판인 아이는 여기서 보이지 않는다 — 그건 출석 이력이 있어야 잡힌다.
 *
 * 빚은 캡을 둔다. 하루 운이 나빴다고 다음 시간 내내 코트를 독점하면 안 된다.
 */

export interface PlayedMatch {
  /** 같은 날을 묶는 키. 로컬 날짜면 충분하다. */
  dayKey: string;
  playerIds: string[];
}

export const PLAY_DEBT_CAP = 2;

/**
 * 참가자별 빚(0 이상). 빚이 없는 사람은 키가 없다.
 * `matches` 에는 오늘 것을 넣지 않는다 — 오늘은 대진 계산기가 직접 센다.
 */
export function carriedPlayDebt(
  matches: PlayedMatch[],
  participantIds: string[],
  cap = PLAY_DEBT_CAP,
): Record<string, number> {
  // 날짜별 → 사람별 판 수
  const byDay = new Map<string, Map<string, number>>();
  for (const m of matches) {
    let day = byDay.get(m.dayKey);
    if (!day) byDay.set(m.dayKey, (day = new Map()));
    for (const id of m.playerIds) day.set(id, (day.get(id) ?? 0) + 1);
  }
  const days = [...byDay.keys()].sort();

  const out: Record<string, number> = {};
  for (const id of participantIds) {
    // 이 사람이 마지막으로 뛴 날
    let lastDay: Map<string, number> | undefined;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = byDay.get(days[i])!;
      if (d.has(id)) {
        lastDay = d;
        break;
      }
    }
    if (!lastDay) continue;
    let sum = 0;
    for (const n of lastDay.values()) sum += n;
    const avg = sum / lastDay.size;
    const debt = Math.min(cap, avg - (lastDay.get(id) ?? 0));
    if (debt > 0) out[id] = debt;
  }
  return out;
}
