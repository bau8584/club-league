/**
 * 대진 계산기에 넘기는 "실력" 한 숫자.
 *
 * 급수를 둔 리그는 급수가 먼저다 — 급수는 회원이 합의한 공식 등급이라 "왜 C급이 B급보다
 * 위로 잡혔지?"가 생기면 설명할 수 없다. 그래서 급수 간 간격은 RP 차이가 절대 넘지 못한다.
 *
 * 다만 같은 급 안에서는 RP로 줄을 세운다. 급수가 2~3개뿐인 동호회는 한 급에 수십 명이
 * 몰리는데(모멘텀: 초심 33명), 그 안을 전부 같은 실력으로 보면 [실력] 프리셋이 사실상
 * 무작위가 된다. 49판 뛴 사람과 처음 온 사람이 같은 급인 건 급수 탓이지 실력이 같아서가 아니다.
 *
 * 급수 미지정은 최하 급으로 친다. 동호회 관행상 신입은 제일 아래에서 시작하고, RP를 그대로
 * 쓰면 RP 1200인 미지정 회원이 A급 위로 올라가는 일이 생긴다.
 *
 * 급수가 없는 리그(학교)는 RP 그대로다.
 */

export interface SkillLevel {
  name: string;
}

/** 급수 하나가 차지하는 폭 중 RP가 움직일 수 있는 비율. 급수 간 간격은 항상 이보다 크다. */
const RP_SHARE = 0.4;
/** RP 1점이 급수 폭 안에서 몇 점으로 환산되는가. 초심 950~1400이 ±폭 안에 대체로 들어오게. */
const RP_SCALE = 0.4;
const RP_CENTER = 1000;

export function skillRating(
  player: { group?: string | null; rp: number },
  /** 높은 급 → 낮은 급 순. 둘 미만이면 급수를 쓰지 않는다. */
  levels: SkillLevel[],
): number {
  if (levels.length < 2) return player.rp;
  const step = 1000 / (levels.length - 1);
  let idx = player.group ? levels.findIndex((l) => l.name === player.group) : -1;
  if (idx < 0) idx = levels.length - 1;
  const base = (levels.length - 1 - idx) * step;
  const cap = step * RP_SHARE;
  const offset = Math.max(-cap, Math.min(cap, (player.rp - RP_CENTER) * RP_SCALE));
  return base + offset;
}
