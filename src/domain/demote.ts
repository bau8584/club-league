import { getTier, getTierSubdivision, type TierName } from "@/lib/league-types";

/**
 * 레드카드 강등 감점 — 몇 점을 깎으면 한 단계(골드1→골드2) 또는 한 티어(골드1→실버1) 아래로
 * 떨어지는지. 떨어진 자리의 맨 위에 서도록 가장 적게 깎는다. 더 내려갈 곳이 없으면 null.
 * 기준점이 리그마다 달라 공식 대신 1점씩 내려 보며 바뀌는 지점을 찾는다(많아야 수백 번).
 */
export function demoteAmount(
  rp: number,
  kind: "step" | "tier",
  thresholds?: Record<TierName, number>,
): number | null {
  const floor = thresholds?.Bronze ?? 0;
  const key = (r: number) => (kind === "tier" ? getTier(r, thresholds) : `${getTier(r, thresholds)}${getTierSubdivision(r, thresholds)}`);
  const now = key(rp);
  for (let d = 1; rp - d >= floor; d++) {
    if (key(rp - d) !== now) return d;
  }
  return null;
}
