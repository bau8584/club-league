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
 * 따로 모드의 한 바퀴 = 남 바퀴 + 여 바퀴. 미지정은 어느 쪽에 붙느냐로 한 경기가
 * 갈릴 수 있어 두 경우 중 큰 쪽을 잡는다. 실제보다 많이 잡혀도 계산기가 인원이
 * 안 모이면 shortfall 로 멈추니 안전하다.
 */
export function separateRoundCount(free: GenderCounts, perMatch: number): number {
  const withM = Math.floor((free.m + free.u) / perMatch) + Math.floor(free.f / perMatch);
  const withF = Math.floor(free.m / perMatch) + Math.floor((free.f + free.u) / perMatch);
  return Math.max(withM, withF);
}

/** 따로 모드일 때 남/여 각각 몇 경기인지(안내 문구용). 미지정은 남는 쪽에 붙는 셈으로 센다. */
export function separateRoundBreakdown(
  free: GenderCounts,
  perMatch: number,
): { m: number; f: number } {
  const withM = { m: Math.floor((free.m + free.u) / perMatch), f: Math.floor(free.f / perMatch) };
  const withF = { m: Math.floor(free.m / perMatch), f: Math.floor((free.f + free.u) / perMatch) };
  return withM.m + withM.f >= withF.m + withF.f ? withM : withF;
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
