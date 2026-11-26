/**
 * 단식 코트 섞기 — 복식 수업에서 코트 몇 개를 단식으로 돌릴 때 무엇을 몇 경기 넣나(2026-11-26).
 *
 * 선생님은 코트 3개 중 하나를 단식으로 쓰면서 [+복식][+복식][+단식]을 손으로 눌렀다(한 수업 23번).
 * [다음 경기 채우기]·자동 채우기는 복식만 만들어서 쓸 수가 없었다. 단식 코트 수를 정해 두면
 * 채우기가 줄(경기 중 + 대기)의 종류 비율을 코트 비율에 맞춰 섞는다.
 * 어느 줄이 어느 코트로 가는지는 서버가 정한다(db/migrations/2026-11-26_single_courts.sql).
 *
 * 순수 계산이라 스토어(실제 채우기)와 화면(안내 문구·버튼 잠금)이 같은 답을 낸다.
 */
import type { TeamSize } from "./assignment-calculator";
import type { GenderCounts } from "./gender-split";
import { keepOutCount } from "./round-size";

export interface CourtMix {
  courts: number;
  singles: number;
}

/**
 * 섞기인가. 줄서기 + 복식 + 코트 + 단식 코트 1개 이상(코트 수 미만)일 때만.
 * 그 밖에는 null — 지금과 똑같이 한 종류로 채운다.
 */
export function courtMixOf(s?: {
  court_count?: number | null;
  single_courts?: number | null;
  match_type?: string | null;
  queue_mode?: string | null;
} | null): CourtMix | null {
  const courts = s?.court_count ?? 0;
  const singles = s?.single_courts ?? 0;
  if (!s || s.queue_mode === "simultaneous" || s.match_type === "single") return null;
  if (courts <= 0 || singles <= 0 || singles >= courts) return null;
  return { courts, singles };
}

/** 줄에 든 종류별 경기 수. d = 복식, s = 단식. */
export interface KindCounts {
  d: number;
  s: number;
}

/**
 * 다음 한 경기의 종류 — 넣은 뒤의 비율이 코트 비율(단식 S : 복식 N−S)에 더 가까워지는 쪽.
 * 같으면 복식. 코트 3·단식 1이면 복·단·복·복·단·복… 으로 간다.
 */
export function nextKind(q: KindCounts, mix: CourtMix): TeamSize {
  const t = q.d + q.s + 1;
  const wantS = mix.singles * t - mix.courts * q.s;
  const wantD = (mix.courts - mix.singles) * t - mix.courts * q.d;
  return wantS > wantD ? 1 : 2;
}

/**
 * 섞기의 [다음 경기 채우기] — 넣을 순서대로 종류 목록.
 *
 * 놀고 있는 사람을 다 쓰되, 줄에 경기가 남아 있으면 복식 한 경기 분량(4명)은 밖에 남긴다
 * (round-size.ts 와 같은 까닭 — 끝난 넷끼리만 다시 묶이지 않게). 차례가 복식인데 4명이 안 되면
 * 단식으로 넣는다 — 그래서 복식으로 나누고 2~3명이 남으면 그 아이들이 단식을 한다.
 * 남길 몫을 채우느라 0경기가 되면, 5명 이상 놀고 있을 때(방금 끝난 넷 말고도 있을 때) 한 경기는 넣는다.
 */
export function mixedRoundSizes(
  free: number,
  queued: KindCounts,
  mix: CourtMix,
  keep: number = queued.d + queued.s > 0 ? keepOutCount(4) : 0,
): TeamSize[] {
  const order = (q: KindCounts): TeamSize[] => (nextKind(q, mix) === 2 ? [2, 1] : [1, 2]);
  const q = { ...queued };
  const out: TeamSize[] = [];
  let budget = free - keep;
  for (;;) {
    const t = order(q).find((size) => size * 2 <= budget);
    if (!t) break;
    out.push(t);
    budget -= t * 2;
    if (t === 2) q.d++;
    else q.s++;
  }
  // 방금 끝난 조는 많아야 넷(복식)이다. 그보다 많이 놀고 있으면 한 경기는 넣는다.
  if (out.length === 0 && free > 4) {
    const t = order(queued).find((size) => size * 2 <= free);
    if (t) out.push(t);
  }
  return out;
}

/** 줄 한 줄의 종류와 성별(남녀 따로일 때). 성별을 모르는 줄은 null — 남녀 양쪽에 센다. */
export interface QueuedKind {
  size: TeamSize;
  gender: "M" | "F" | null;
}

export function kindCounts(rows: QueuedKind[]): KindCounts {
  const c = { d: 0, s: 0 };
  for (const r of rows) {
    if (r.size === 2) c.d++;
    else c.s++;
  }
  return c;
}

/**
 * 남녀 따로 + 섞기 — 남녀를 따로 세어 각자 섞는다. 남기는 인원은 성별 인원에 비례한다
 * (separateGamesKeepingOut 과 같은 규칙). 미지정(u)은 쓰는 인원이 가장 많아지는 쪽에 붙인다.
 */
export function mixedSeparatePlan(
  free: GenderCounts,
  rows: QueuedKind[],
  mix: CourtMix,
): { m: TeamSize[]; f: TeamSize[]; uToM: number } {
  const mRows = rows.filter((r) => r.gender !== "F");
  const fRows = rows.filter((r) => r.gender !== "M");
  const used = (p: TeamSize[]) => p.reduce((n, t) => n + t * 2, 0);
  let best = { m: [] as TeamSize[], f: [] as TeamSize[], uToM: 0 };
  for (let a = 0; a <= free.u; a++) {
    const mFree = free.m + a;
    const fFree = free.f + free.u - a;
    const total = mFree + fFree;
    const keepOf = (n: number, q: QueuedKind[]) =>
      q.length > 0 && total > 0 ? Math.ceil((keepOutCount(4) * n) / total) : 0;
    const m = mixedRoundSizes(mFree, kindCounts(mRows), mix, keepOf(mFree, mRows));
    const f = mixedRoundSizes(fFree, kindCounts(fRows), mix, keepOf(fFree, fRows));
    const better =
      used(m) + used(f) > used(best.m) + used(best.f) ||
      (used(m) + used(f) === used(best.m) + used(best.f) && m.length + f.length > best.m.length + best.f.length);
    if (better) best = { m, f, uToM: a };
  }
  return best;
}

/** 안내 문구용 — 종류 목록을 "복식 3 · 단식 2" 로. */
export function sizesLabel(sizes: TeamSize[]): string {
  const d = sizes.filter((t) => t === 2).length;
  const s = sizes.length - d;
  return [d ? `복식 ${d}` : "", s ? `단식 ${s}` : ""].filter(Boolean).join(" · ");
}
