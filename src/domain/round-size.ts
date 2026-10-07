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
  keep: number = keepOutCount(perMatch),
): number {
  if (queued === 0) return games;
  let n = games;
  while (n > 0 && free - n * perMatch < keep) n--;
  return n;
}

/** [+1경기]가 같은 넷(단식은 둘) 재대결이라 넣지 않고 선생님께 물어야 할 때 돌려주는 값. */
export const REGROUP_NEEDS_CONFIRM = -1;

/**
 * 남녀 따로일 때의 [다음 경기 채우기] — 남녀를 따로 세어 각자 밖에 남긴다.
 *
 * 합쳐서 세면 "밖에 4명"이 전부 여자일 수 있다. 그러면 남자 경기가 끝났을 때 섞을 남자가
 * 밖에 없어 방금 끝난 남자 넷이 그대로 다시 묶인다. 줄도 성별마다 따로 본다 — 여자 줄이
 * 비었는데 남자 줄이 있다고 여자를 남겨 두면 여자 코트가 논다.
 * 미지정(u)은 어느 쪽에든 붙을 수 있어 a명을 남자 쪽에 붙이는 모든 나누기 중 경기가 가장 많은 것.
 *
 * 남기는 인원은 성별 인원에 비례한다(10-06 컬링: 남 12·여 8에 똑같이 4명씩 남기니 여자 경기가
 * 0~1개로 줄었다). 그리고 한 경기 분량보다 많이 놀고 있는 성별은 최소 1경기를 받는다 —
 * 딱 한 경기 분량(방금 끝난 넷뿐일 수 있다)이면 그대로 기다린다.
 */
export function separateGamesKeepingOut(
  free: { m: number; f: number; u: number },
  queued: { m: number; f: number },
  perMatch: number,
): { m: number; f: number; uToM: number } {
  let best = { m: 0, f: 0, uToM: 0 };
  for (let a = 0; a <= free.u; a++) {
    const mFree = free.m + a;
    const fFree = free.f + free.u - a;
    const total = mFree + fFree;
    const keepOf = (n: number) => (total > 0 ? Math.ceil((keepOutCount(perMatch) * n) / total) : 0);
    const one = (n: number, q: number) => {
      const g = roundGamesKeepingOut(Math.floor(n / perMatch), n, perMatch, q, keepOf(n));
      return g === 0 && n > perMatch ? 1 : g;
    };
    const m = one(mFree, queued.m);
    const f = one(fFree, queued.f);
    if (m + f > best.m + best.f) best = { m, f, uToM: a };
  }
  return best;
}
