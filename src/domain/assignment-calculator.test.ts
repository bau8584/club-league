import { describe, expect, it } from "bun:test";
import {
  calculateAssignment,
  type AssignmentHistoryMatch,
  type AssignmentPlayer
} from "./assignment-calculator";

const players = (n: number): AssignmentPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

const flat = (m: { teamA: string[]; teamB: string[] }) => [...m.teamA, ...m.teamB];

describe("calculateAssignment", () => {
  it("한 번의 호출로 여러 경기를 뽑아도 같은 사람이 겹치지 않는다", () => {
    const out = calculateAssignment({ participants: players(16), count: 4 });
    expect(out.matches).toHaveLength(4);
    const all = out.matches.flatMap(flat);
    expect(new Set(all).size).toBe(16);
  });

  it("큐에 든 사람은 후보에서 빠진다", () => {
    const out = calculateAssignment({
      participants: players(12),
      busyPlayerIds: ["p1", "p2", "p3", "p4"],
      count: 2
    });
    const all = new Set(out.matches.flatMap(flat));
    for (const id of ["p1", "p2", "p3", "p4"]) expect(all.has(id)).toBe(false);
  });

  it("큐 경기를 판 수로 세어 덜 뛴 사람을 먼저 넣는다", () => {
    // p1~p4는 이미 큐에 한 판 잡혀 있다. 판 수를 안 세면 0판으로 보여 또 뽑힌다.
    const queued: AssignmentHistoryMatch[] = [{ teamA: ["p1", "p2"], teamB: ["p3", "p4"] }];
    const out = calculateAssignment({
      participants: players(8),
      busyPlayerIds: [],
      history: queued,
      count: 1
    });
    expect(flat(out.matches[0]).sort()).toEqual(["p5", "p6", "p7", "p8"]);
  });

  it("학교 정책은 안 만난 조합을 우선한다", () => {
    const history: AssignmentHistoryMatch[] = [
      { teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
      { teamA: ["p5", "p6"], teamB: ["p7", "p8"] }
    ];
    const out = calculateAssignment({
      participants: players(8),
      history,
      count: 1,
      policy: "school"
    });
    const m = out.matches[0];
    const partners = [...m.teamA, ...m.teamB];
    // 모두 판 수가 같으므로 선택 자체는 자유롭고, 파트너 반복만 피하면 된다.
    const repeated = [
      ["p1", "p2"],
      ["p3", "p4"],
      ["p5", "p6"],
      ["p7", "p8"]
    ].some(([a, b]) => {
      const sameTeam = (t: string[]) => t.includes(a) && t.includes(b);
      return sameTeam(m.teamA) || sameTeam(m.teamB);
    });
    expect(repeated).toBe(false);
    expect(partners).toHaveLength(4);
  });

  it("실력 균형: 두 팀의 rating 합 차이를 줄인다", () => {
    const out = calculateAssignment({
      participants: [
        { id: "a", rating: 1600 },
        { id: "b", rating: 1000 },
        { id: "c", rating: 1500 },
        { id: "d", rating: 1100 }
      ],
      count: 1,
      policy: "club"
    });
    const rating: Record<string, number> = { a: 1600, b: 1000, c: 1500, d: 1100 };
    const sum = (t: string[]) => t.reduce((acc, id) => acc + rating[id], 0);
    const m = out.matches[0];
    expect(Math.abs(sum(m.teamA) - sum(m.teamB))).toBeLessThanOrEqual(200);
  });

  it("인원이 모자라면 shortfall로 알리고 억지로 뽑지 않는다", () => {
    const out = calculateAssignment({ participants: players(6), count: 2 });
    expect(out.matches).toHaveLength(1);
    expect(out.shortfall).toBe(1);
  });

  it("후보가 모자라면 큐에 든 사람을 완화해 쓰되 표시한다", () => {
    const out = calculateAssignment({
      participants: players(5),
      busyPlayerIds: ["p1", "p2"],
      count: 1
    });
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0].relaxedPlayerIds.length).toBe(1);
  });

  it("단식(teamSize 1)도 지원한다", () => {
    const out = calculateAssignment({ participants: players(4), teamSize: 1, count: 2 });
    expect(out.matches).toHaveLength(2);
    for (const m of out.matches) {
      expect(m.teamA).toHaveLength(1);
      expect(m.teamB).toHaveLength(1);
    }
  });

  it("같은 seed면 같은 결과가 나온다", () => {
    const args = { participants: players(12), count: 3, seed: 7 } as const;
    expect(calculateAssignment({ ...args }).matches).toEqual(
      calculateAssignment({ ...args }).matches
    );
  });

  it("반복 호출 시뮬레이션: 판 수가 균등해지고 커버리지가 넓어진다", () => {
    const roster = players(20);
    let history: AssignmentHistoryMatch[] = [];
    for (let session = 0; session < 15; session++) {
      const out = calculateAssignment({
        participants: roster,
        history,
        count: 5,
        policy: "school",
        seed: session
      });
      history = [...history, ...out.matches.map((m) => ({ teamA: m.teamA, teamB: m.teamB }))];
    }

    const counts = new Map<string, number>();
    const partners = new Set<string>();
    for (const m of history) {
      for (const id of [...m.teamA, ...m.teamB]) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const t of [m.teamA, m.teamB]) partners.add([...t].sort().join("|"));
    }
    const values = roster.map((p) => counts.get(p.id) ?? 0);
    // 판 수 편차는 1판 이내
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    // 파트너 조합 150쌍 중 상당수를 실제로 채운다 (총 150팀 생성)
    expect(partners.size).toBeGreaterThanOrEqual(120);
  });
});
