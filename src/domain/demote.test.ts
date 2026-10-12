import { describe, expect, it } from "bun:test";
import { demoteAmount } from "./demote";
import { getTier, getTierSubdivision } from "@/lib/league-types";

const at = (r: number) => `${getTier(r)}${getTierSubdivision(r)}`;

describe("demoteAmount", () => {
  it("골드1 → 골드2 맨 위", () => {
    const d = demoteAmount(1390, "step")!;
    expect(at(1390)).toBe("Gold1");
    expect(at(1390 - d)).toBe("Gold2");
    expect(at(1390 - d + 1)).toBe("Gold1");
  });
  it("골드1 → 실버 맨 위(실버1)", () => {
    const d = demoteAmount(1390, "tier")!;
    expect(at(1390 - d)).toBe("Silver1");
  });
  it("브론즈 맨 아래면 더 못 내림", () => {
    expect(demoteAmount(0, "step")).toBeNull();
    expect(demoteAmount(100, "tier")).toBeNull();
  });
});
