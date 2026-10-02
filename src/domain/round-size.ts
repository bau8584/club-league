/**
 * [한 바퀴]가 몇 경기를 짤까 — 줄서기(코트보다 사람이 많은 운영)에서 "밖에 몇 명은 남겨 둔다".
 *
 * 놀고 있는 사람을 전부 줄에 세우면, 한 판이 끝났을 때 노는 사람이 방금 끝난 그 넷뿐이라
 * 계산기가 고를 수 있는 건 편 나누기뿐이다(ㄱㄴ/ㄷㄹ → ㄱㄷ/ㄴㄹ → ㄱㄹ/ㄴㄷ). 밖에 몇 명이
 * 남아 있으면 끝난 넷과 섞여 새 조합이 나온다. 실제 기록: 같은 넷 재대결 69판(무작위 기대 2판).
 *
 * 줄이 비었으면 남기지 않는다 — 그때 남기면 코트가 논다. 코트 수를 몰라도 되는 규칙이다.
 */
export function keepOutCount(perMatch: number): number {
  // 단식은 두 명만 남기면 후보가 모자라 같은 상대가 또 나온다(모의 실험) — 두 경기 분량.
  return perMatch <= 2 ? perMatch * 2 : perMatch;
}

/**
 * @param games    지금처럼 셌을 때의 경기 수(놀고 있는 사람 ÷ 경기당 인원, 남녀 따로면 그 합)
 * @param free     놀고 있는 사람 수
 * @param queued   줄에 이미 있는 경기 수(대기 + 진행)
 */
export function roundGamesKeepingOut(
  games: number,
  free: number,
  perMatch: number,
  queued: number,
): number {
  if (queued === 0) return games;
  const keep = keepOutCount(perMatch);
  let n = games;
  while (n > 0 && free - n * perMatch < keep) n--;
  return n;
}

/** [+1경기]가 같은 넷(단식은 둘) 재대결이라 넣지 않고 선생님께 물어야 할 때 돌려주는 값. */
export const REGROUP_NEEDS_CONFIRM = -1;
