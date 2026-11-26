import { describe, expect, it } from "bun:test";
import { courtMixOf, mixedRoundSizes, mixedSeparatePlan, nextKind, sizesLabel, type QueuedKind } from "./court-mix";

const mix31 = { courts: 3, singles: 1 };

describe("courtMixOf — 섞기는 줄서기·복식·코트·단식 코트가 다 있을 때만", () => {
  it("코트 3·단식 1·복식 → 섞기", () => {
    expect(courtMixOf({ court_count: 3, single_courts: 1, match_type: "double" })).toEqual(mix31);
  });
  it("단식 코트가 없거나·코트를 안 세거나·단식 수업·다 같이면 지금 그대로(null)", () => {
    expect(courtMixOf({ court_count: 3, single_courts: null, match_type: "double" })).toBeNull();
    expect(courtMixOf({ court_count: 3, single_courts: 0, match_type: "double" })).toBeNull();
    expect(courtMixOf({ court_count: null, single_courts: 1, match_type: "double" })).toBeNull();
    expect(courtMixOf({ court_count: 3, single_courts: 1, match_type: "single" })).toBeNull();
    expect(courtMixOf({ court_count: 3, single_courts: 1, match_type: "double", queue_mode: "simultaneous" })).toBeNull();
    expect(courtMixOf({ court_count: 3, single_courts: 3, match_type: "double" })).toBeNull();
    expect(courtMixOf(null)).toBeNull();
  });
});

describe("nextKind — 줄의 비율을 코트 비율에 맞춘다", () => {
  it("코트 3·단식 1이면 복·단·복·복·단·복", () => {
    const q = { d: 0, s: 0 };
    const seq: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = nextKind(q, mix31);
      seq.push(t);
      if (t === 2) q.d++;
      else q.s++;
    }
    expect(seq).toEqual([2, 1, 2, 2, 1, 2]);
  });
  it("줄에 단식이 모자라면 단식", () => {
    expect(nextKind({ d: 4, s: 0 }, mix31)).toBe(1);
    expect(nextKind({ d: 0, s: 2 }, mix31)).toBe(2);
  });
});

describe("mixedRoundSizes — 섞기의 [다음 경기 채우기]", () => {
  it("수업 첫 채우기(줄 없음) 23명: 다 쓰고 1명만 남는다", () => {
    const sizes = mixedRoundSizes(23, { d: 0, s: 0 }, mix31);
    expect(sizes.reduce((n, t) => n + t * 2, 0)).toBe(22);
    expect(sizesLabel(sizes)).toBe("복식 4 · 단식 3");
  });
  it("줄이 있으면 4명은 밖에 남기고, 복식이 안 되는 2~3명은 단식으로", () => {
    // 놀고 있는 13명 − 남김 4 = 9명 → 복식 1(4) + 단식 2(4), 1명 남음.
    const sizes = mixedRoundSizes(13, { d: 2, s: 1 }, mix31);
    expect(sizes).toEqual([2, 1, 1]);
  });
  it("남길 몫을 채우느라 0경기면, 방금 끝난 넷 말고도 놀고 있을 때 한 경기는 넣는다", () => {
    expect(mixedRoundSizes(5, { d: 2, s: 1 }, mix31)).toEqual([2]);
    expect(mixedRoundSizes(5, { d: 2, s: 0 }, mix31)).toEqual([1]);
    // 방금 끝난 넷(또는 그보다 적게)뿐이면 기다린다 — 끝난 친구들끼리 또 붙는다.
    expect(mixedRoundSizes(4, { d: 2, s: 1 }, mix31)).toEqual([]);
    expect(mixedRoundSizes(3, { d: 2, s: 0 }, mix31)).toEqual([]);
  });
});

describe("mixedSeparatePlan — 남녀 따로 + 섞기", () => {
  it("여 13·남 10, 줄 없음: 성별마다 섞어 거의 다 쓴다", () => {
    const p = mixedSeparatePlan({ m: 10, f: 13, u: 0 }, [], mix31);
    const used = (s: number[]) => s.reduce((n, t) => n + t * 2, 0);
    expect(used(p.f)).toBe(12);
    expect(used(p.m)).toBe(10);
    expect(p.f).toContain(1);
    expect(p.m).toContain(1);
  });
  it("성별마다 자기 줄의 종류를 본다", () => {
    const rows: QueuedKind[] = [
      { size: 2, gender: "M" }, { size: 2, gender: "M" },
      { size: 2, gender: "F" },
    ];
    // 남자 줄은 복식 둘 → 남자 다음은 단식부터. 여자 줄은 복식 하나 → 여자 다음은 단식부터.
    const p = mixedSeparatePlan({ m: 8, f: 9, u: 0 }, rows, mix31);
    expect(p.m[0]).toBe(1);
    expect(p.f[0]).toBe(1);
  });
});
