import { describe, expect, it } from "bun:test";
import { calculateAssignment, type AssignmentPlayer } from "./assignment-calculator";

const players = (n: number): AssignmentPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const flat = (m: { teamA: string[]; teamB: string[] }) => [...m.teamA, ...m.teamB];

describe("같이 안 붙이기", () => {
  it("여러 번 채워도 떼어 놓은 두 사람은 한 경기에 안 들어간다", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const teamSize of [1, 2] as const) {
        const out = calculateAssignment({
          participants: players(10),
          count: 5,
          teamSize,
          seed,
          apart: [["p1", "p2"], ["p3", "p4"]],
        });
        for (const m of out.matches) {
          const f = flat(m);
          expect(f.includes("p1") && f.includes("p2")).toBe(false);
          expect(f.includes("p3") && f.includes("p4")).toBe(false);
        }
      }
    }
  });

  it("그 둘만 남으면 붙이지 않고 안 뽑는다", () => {
    const out = calculateAssignment({ participants: players(2), count: 1, teamSize: 1, apart: [["p1", "p2"]] });
    expect(out.matches).toHaveLength(0);
  });

  it("큐에 든 사람을 다시 쓰는 완화 단계에서도 풀리지 않는다", () => {
    const out = calculateAssignment({
      participants: players(4),
      busyPlayerIds: ["p3", "p4"],
      count: 1,
      teamSize: 1,
      apart: [["p1", "p2"]],
    });
    for (const m of out.matches) {
      const f = flat(m);
      expect(f.includes("p1") && f.includes("p2")).toBe(false);
    }
  });
});
