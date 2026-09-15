import { describe, expect, it } from "bun:test";
import { genderGroupOf, separateRoundBreakdown, separateRoundCount } from "./gender-split";

describe("separateRoundCount", () => {
  it("남 11·여 12 복식 → 2 + 3 = 5 (섞어서와 같음)", () => {
    expect(separateRoundCount({ m: 11, f: 12, u: 0 }, 4)).toBe(5);
  });
  it("남 5·여 7 복식 → 1 + 1 = 2 (섞어서는 3)", () => {
    expect(separateRoundCount({ m: 5, f: 7, u: 0 }, 4)).toBe(2);
  });
  it("미지정은 한 경기가 더 나오는 쪽에 붙는다", () => {
    // 남 3 + U 1 → 남 1경기. 여 4 → 1경기. 합 2.
    expect(separateRoundCount({ m: 3, f: 4, u: 1 }, 4)).toBe(2);
    expect(separateRoundBreakdown({ m: 3, f: 4, u: 1 }, 4)).toEqual({ m: 1, f: 1 });
    // 남 4·여 3·U 1 → 여자 쪽에 붙어야 2경기.
    expect(separateRoundBreakdown({ m: 4, f: 3, u: 1 }, 4)).toEqual({ m: 1, f: 1 });
  });
});

describe("genderGroupOf", () => {
  it("M/F 만 그룹을 갖고 U 는 빠진다", () => {
    const g = (id: string) => ({ a: "M", b: "F", c: "U" })[id] as "M" | "F" | "U";
    expect(genderGroupOf(["a", "b", "c"], g)).toEqual({ a: "M", b: "F" });
  });
});
