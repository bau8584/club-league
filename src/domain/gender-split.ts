/**
 * 남녀 따로 뽑기 — 순수 계산
 *
 * 설계 문서: docs/PLAN-queue-gender.md
 *
 * 남자끼리·여자끼리만 한 경기에 들어간다(초등 체육의 남자부/여자부). 성별 미지정(U)은
 * "어느 쪽이든 되는 사람"이라 자리가 남는 쪽에 붙는다 — 미지정끼리만 붙이거나 빼지 않는다.
 * 혼복(팀마다 남1+여1)은 아직 없다. 값 자리만 비워 둔다("pairs" 를 나중에 더할 수 있게).
 */

export type GenderMode = "mixed" | "separate";

export interface GenderCounts {
  m: number;
  f: number;
  u: number;
}

/** 참석자를 성별로 센다. 명단에 없는 사람(성별을 모르는 id)은 미지정으로 본다. */
export function countByGender(
  ids: Iterable<string>,
  genderOf: (id: string) => "M" | "F" | "U" | null | undefined,
): GenderCounts {
  const c: GenderCounts = { m: 0, f: 0, u: 0 };
  for (const id of ids) {
    const g = genderOf(id);
    if (g === "M") c.m++;
    else if (g === "F") c.f++;
    else c.u++;
  }
  return c;
}

/**
 * 따로 모드의 한 바퀴 = 남 바퀴 + 여 바퀴. 미지정은 남자 쪽에 a명, 여자 쪽에 (u-a)명으로
 * 갈라 붙일 수 있고 그 나누기에 따라 경기 수가 달라지므로, 모든 나누기 중 가장 많이
 * 나오는 쪽을 잡는다(남 3·여 3·미지정 2 → 1명씩 붙여 2경기). 실제보다 많이 잡혀도
 * 계산기가 인원이 안 모이면 shortfall 로 멈추니 안전하다.
 */
export function separateRoundBreakdown(
  free: GenderCounts,
  perMatch: number,
): { m: number; f: number } {
  let best = { m: 0, f: 0 };
  for (let a = 0; a <= free.u; a++) {
    const cand = {
      m: Math.floor((free.m + a) / perMatch),
      f: Math.floor((free.f + free.u - a) / perMatch),
    };
    if (cand.m + cand.f > best.m + best.f) best = cand;
  }
  return best;
}

export function separateRoundCount(free: GenderCounts, perMatch: number): number {
  const { m, f } = separateRoundBreakdown(free, perMatch);
  return m + f;
}

/**
 * 계산기(assignment-calculator)에 넘길 groupOf. M/F 만 그룹을 갖고 U 는 넣지 않는다
 * (= 그룹 없음 = 어느 쪽 경기에든 들어갈 수 있다).
 */
export function genderGroupOf(
  ids: Iterable<string>,
  genderOf: (id: string) => "M" | "F" | "U" | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const g = genderOf(id);
    if (g === "M" || g === "F") out[id] = g;
  }
  return out;
}
