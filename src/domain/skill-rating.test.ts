import { describe, expect, test } from "bun:test";
import { skillRating } from "./skill-rating";

const L = ["선출", "A급", "B급", "C급", "D급", "초심"].map((name) => ({ name }));

describe("skillRating", () => {
  test("급수가 없는 리그는 RP 그대로", () => {
    expect(skillRating({ group: null, rp: 1234 }, [])).toBe(1234);
    expect(skillRating({ group: "초심", rp: 1234 }, [{ name: "초심" }])).toBe(1234);
  });

  test("급수가 먼저 — 낮은 급의 최고 RP가 높은 급의 최저 RP를 넘지 못한다", () => {
    const cTop = skillRating({ group: "C급", rp: 9999 }, L);
    const bBottom = skillRating({ group: "B급", rp: 0 }, L);
    expect(cTop).toBeLessThan(bBottom);
  });

  test("같은 급 안에서는 RP 순", () => {
    const a = skillRating({ group: "초심", rp: 1400 }, L);
    const b = skillRating({ group: "초심", rp: 1097 }, L);
    const c = skillRating({ group: "초심", rp: 953 }, L);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  test("급수 미지정은 최하 급 취급", () => {
    expect(skillRating({ group: null, rp: 1200 }, L)).toBe(skillRating({ group: "초심", rp: 1200 }, L));
    expect(skillRating({ group: "없는급", rp: 1200 }, L)).toBe(skillRating({ group: "초심", rp: 1200 }, L));
  });

  test("급수 순서와 방향 — 선출이 가장 크다", () => {
    expect(skillRating({ group: "선출", rp: 1000 }, L)).toBe(1000);
    expect(skillRating({ group: "초심", rp: 1000 }, L)).toBe(0);
  });
});
