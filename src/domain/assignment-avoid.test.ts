import { describe, expect, it } from "bun:test";
import { calculateAssignment } from "./assignment-calculator";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
const key = (m: { teamA: string[]; teamB: string[] }) => [...m.teamA, ...m.teamB].sort().join("|");

describe("지운 대진 감점(avoidGroups)", () => {
  it("다른 길이 있으면 방금 지운 넷을 피한다", () => {
    const base = { participants: ids.map((id) => ({ id })), count: 1, teamSize: 2 as const };
    const first = calculateAssignment(base).matches[0];
    const again = calculateAssignment({ ...base, avoidGroups: [[...first.teamA, ...first.teamB]] }).matches[0];
    expect(key(again)).not.toBe(key(first));
  });
  it("인원이 딱 넷이면 그대로 뽑는다(금지가 아니다)", () => {
    const out = calculateAssignment({
      participants: ["a", "b", "c", "d"].map((id) => ({ id })),
      count: 1,
      avoidGroups: [["a", "b", "c", "d"]],
    });
    expect(out.matches).toHaveLength(1);
  });
});

describe("같은 셋 반복 감점", () => {
  it("같은 셋이 이미 모였으면 다른 조합을 고른다", () => {
    const out = calculateAssignment({
      participants: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
      history: [{ teamA: ["a", "b"], teamB: ["c", "x"] }],
      count: 1,
    });
    const k = key(out.matches[0]);
    expect(["a", "b", "c"].every((id) => k.includes(id))).toBe(false);
  });
});
