import { describe, expect, it } from "bun:test";
import {
  calculateAssignment,
  type AssignmentHistoryMatch,
  type AssignmentPlayer,
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
      count: 2,
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
      count: 1,
    });
    expect(flat(out.matches[0]).sort()).toEqual(["p5", "p6", "p7", "p8"]);
  });

  it("[다양성 우선]은 안 만난 조합을 우선한다", () => {
    const history: AssignmentHistoryMatch[] = [
      { teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
      { teamA: ["p5", "p6"], teamB: ["p7", "p8"] },
    ];
    const out = calculateAssignment({
      participants: players(8),
      history,
      count: 1,
      policy: "diversity",
    });
    const m = out.matches[0];
    const partners = [...m.teamA, ...m.teamB];
    // 모두 판 수가 같으므로 선택 자체는 자유롭고, 파트너 반복만 피하면 된다.
    const repeated = [
      ["p1", "p2"],
      ["p3", "p4"],
      ["p5", "p6"],
      ["p7", "p8"],
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
        { id: "d", rating: 1100 },
      ],
      count: 1,
      policy: "balanced",
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
      count: 1,
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
      calculateAssignment({ ...args }).matches,
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
        policy: "diversity",
        seed: session,
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

describe("배정 프리셋", () => {
  // 실력이 뚜렷하게 갈리는 8명. 강한 4명(s1~s4)과 약한 4명(w1~w4).
  const skewed = [
    { id: "s1", rating: 1800 },
    { id: "s2", rating: 1750 },
    { id: "s3", rating: 1700 },
    { id: "s4", rating: 1650 },
    { id: "w1", rating: 900 },
    { id: "w2", rating: 880 },
    { id: "w3", rating: 860 },
    { id: "w4", rating: 840 },
  ];
  const isStrong = (id: string) => id.startsWith("s");

  it("[실력 우선]은 비슷한 실력끼리 붙인다", () => {
    const out = calculateAssignment({ participants: skewed, count: 1, policy: "skill", seed: 1 });
    const ids = flat(out.matches[0]);
    // 강-약이 섞이지 않는다: 넷 다 같은 급.
    expect(ids.every(isStrong) || ids.every((id) => !isStrong(id))).toBe(true);
  });

  it("[다양성 우선]은 안 만난 조합을 실력보다 앞에 둔다", () => {
    // 강한 넷은 이미 서로 다 만났다. 실력만 보면 또 그들끼리 붙어야 한다.
    const history: AssignmentHistoryMatch[] = [
      { teamA: ["s1", "s2"], teamB: ["s3", "s4"] },
      { teamA: ["s1", "s3"], teamB: ["s2", "s4"] },
      { teamA: ["s1", "s4"], teamB: ["s2", "s3"] },
    ];
    const diversity = calculateAssignment({
      participants: skewed,
      history,
      playHistory: [],
      count: 1,
      policy: "diversity",
      seed: 1,
    });
    const skill = calculateAssignment({
      participants: skewed,
      history,
      playHistory: [],
      count: 1,
      policy: "skill",
      seed: 1,
    });
    const mixed = (ids: string[]) => ids.some(isStrong) && ids.some((id) => !isStrong(id));
    // 다양성은 새 조합을 찾아 강-약을 섞고, 실력 우선은 같은 급을 고수한다.
    expect(mixed(flat(diversity.matches[0]))).toBe(true);
    expect(mixed(flat(skill.matches[0]))).toBe(false);
  });

  it("[다양성 우선]의 실력 제약은 느슨하다 — 만족하는 조합이 없으면 막지 않는다", () => {
    // 실력 차가 어떻게 나눠도 한계를 넘는 4명. 그래도 대진은 나온다.
    const out = calculateAssignment({
      participants: [
        { id: "a", rating: 2000 },
        { id: "b", rating: 1900 },
        { id: "c", rating: 100 },
        { id: "d", rating: 90 },
      ],
      count: 1,
      policy: "diversity",
      balanceLimit: 50,
    });
    expect(out.matches).toHaveLength(1);
  });

  it("세 프리셋이 실제로 다른 결과를 낸다", () => {
    // 실력이 고르게 퍼진 8명 + 약간의 만남 이력. 세 기준이 서로 다른 대진을 고른다.
    const roster = [
      { id: "a", rating: 1870 },
      { id: "b", rating: 808 },
      { id: "c", rating: 1057 },
      { id: "d", rating: 1180 },
      { id: "e", rating: 1430 },
      { id: "f", rating: 1630 },
      { id: "g", rating: 836 },
      { id: "h", rating: 1178 },
    ];
    const history: AssignmentHistoryMatch[] = [
      { teamA: ["g", "h"], teamB: ["d", "e"] },
      { teamA: ["b", "a"], teamB: ["d", "f"] },
    ];
    const run = (policy: "diversity" | "balanced" | "skill") =>
      JSON.stringify(
        calculateAssignment({
          participants: roster,
          history,
          playHistory: [],
          count: 1,
          policy,
          seed: 1,
        }).matches.map((m) => [m.teamA, m.teamB]),
      );
    expect(new Set([run("diversity"), run("balanced"), run("skill")]).size).toBe(3);
  });

  it("rating이 없으면 실력 항이 빠지고 프리셋과 무관하게 대진은 나온다", () => {
    for (const policy of ["diversity", "balanced", "skill"] as const) {
      const out = calculateAssignment({ participants: players(8), count: 2, policy });
      expect(out.matches).toHaveLength(2);
    }
  });
});

describe("그룹 제약(남녀 따로) — groupOf", () => {
  /** 남 m명·여 f명·미지정 u명. 그룹은 M/F 만 넣고 U는 비워 둔다(= 어느 쪽이든 되는 사람). */
  const gendered = (m: number, f: number, u = 0) => {
    const participants: AssignmentPlayer[] = [];
    const groupOf: Record<string, string> = {};
    for (let i = 1; i <= m; i++) {
      participants.push({ id: `m${i}` });
      groupOf[`m${i}`] = "M";
    }
    for (let i = 1; i <= f; i++) {
      participants.push({ id: `f${i}` });
      groupOf[`f${i}`] = "F";
    }
    for (let i = 1; i <= u; i++) participants.push({ id: `u${i}` });
    return { participants, groupOf };
  };
  const groupsIn = (m: { teamA: string[]; teamB: string[] }) =>
    new Set(
      flat(m)
        .map((id) => id[0].toUpperCase())
        .filter((c) => c !== "U"),
    );

  it("남 8·여 8 복식 4경기 — 어느 경기도 안 섞인다", () => {
    const out = calculateAssignment({ ...gendered(8, 8), count: 4 });
    expect(out.matches).toHaveLength(4);
    expect(out.shortfall).toBe(0);
    for (const m of out.matches) expect(groupsIn(m).size).toBe(1);
    expect(new Set(out.matches.flatMap(flat)).size).toBe(16);
  });

  it("남 3·여 4·미지정 1 복식 — 미지정이 남자 쪽에 붙어 2경기", () => {
    const out = calculateAssignment({ ...gendered(3, 4, 1), count: 2 });
    expect(out.matches).toHaveLength(2);
    expect(out.shortfall).toBe(0);
    const withU = out.matches.find((m) => flat(m).includes("u1"))!;
    expect(withU).toBeDefined();
    expect(flat(withU).sort()).toEqual(["m1", "m2", "m3", "u1"]);
    for (const m of out.matches) expect(groupsIn(m).size).toBe(1);
  });

  it("남 5·여 7 복식 count 3 — 2경기 + shortfall 1, 섞인 경기 없음", () => {
    const out = calculateAssignment({ ...gendered(5, 7), count: 3 });
    expect(out.matches).toHaveLength(2);
    expect(out.shortfall).toBe(1);
    for (const m of out.matches) expect(groupsIn(m).size).toBe(1);
  });

  it("남 2·여 6 단식 — 남 1경기, 여 3경기(앵커가 막히면 다음 앵커로 넘어간다)", () => {
    const out = calculateAssignment({ ...gendered(2, 6), teamSize: 1, count: 4 });
    expect(out.matches).toHaveLength(4);
    expect(out.shortfall).toBe(0);
    const byGroup = { M: 0, F: 0 };
    for (const m of out.matches) {
      const g = groupsIn(m);
      expect(g.size).toBe(1);
      byGroup[[...g][0] as "M" | "F"]++;
    }
    expect(byGroup).toEqual({ M: 1, F: 3 });
  });

  it("완화(큐에 든 사람 재사용)도 같은 그룹 안에서만 한다", () => {
    // 남자는 3명이 놀고 1명이 큐에 있다. 여자는 충분하다.
    const out = calculateAssignment({
      ...gendered(4, 4),
      busyPlayerIds: ["m4"],
      count: 2,
    });
    expect(out.matches).toHaveLength(2);
    const mMatch = out.matches.find((m) => groupsIn(m).has("M"))!;
    expect(flat(mMatch).sort()).toEqual(["m1", "m2", "m3", "m4"]);
    expect(mMatch.relaxedPlayerIds).toEqual(["m4"]);
    const fMatch = out.matches.find((m) => groupsIn(m).has("F"))!;
    expect(fMatch.relaxedPlayerIds).toEqual([]);
  });

  it("groupOf 없이 돌리면 이전 계산기와 결과가 같다(스냅샷)", () => {
    // groupOf 를 도입하기 직전 코드로 뽑아 둔 결과. 섞어서 모드는 한 글자도 달라지면 안 된다.
    const rated = (n: number): AssignmentPlayer[] =>
      Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rating: 1000 + ((i * 137) % 400) }));
    const got: Record<string, unknown> = {};
    for (const seed of [1, 7, 42]) {
      for (const policy of ["diversity", "balanced", "skill"] as const) {
        const r = calculateAssignment({
          participants: rated(13),
          busyPlayerIds: ["p2", "p9"],
          history: [
            { teamA: ["p1", "p3"], teamB: ["p4", "p5"] },
            { teamA: ["p2", "p6"], teamB: ["p9", "p7"] },
          ],
          count: 4,
          policy,
          seed,
        });
        got[`${policy}-${seed}`] = r.matches.map((m) => [m.teamA, m.teamB, m.relaxedPlayerIds]);
        got[`${policy}-${seed}-single`] = calculateAssignment({
          participants: rated(9),
          teamSize: 1,
          count: 5,
          policy,
          seed,
        }).matches.map((m) => [m.teamA, m.teamB, m.relaxedPlayerIds]);
      }
    }
    expect(got).toEqual(SNAPSHOT_BEFORE_GROUPS);
  });
});

const SNAPSHOT_BEFORE_GROUPS = {
  "diversity-1": [
    [["p12", "p10"], ["p8", "p11"], []],
    [["p13", "p7"], ["p1", "p4"], []],
    [["p5", "p6"], ["p2", "p3"], ["p2"]],
  ],
  "diversity-1-single": [
    [["p1"], ["p4"], []],
    [["p5"], ["p8"], []],
    [["p2"], ["p7"], []],
    [["p6"], ["p3"], []],
  ],
  "balanced-1": [
    [["p12", "p10"], ["p8", "p11"], []],
    [["p13", "p7"], ["p1", "p4"], []],
    [["p5", "p6"], ["p2", "p3"], ["p2"]],
  ],
  "balanced-1-single": [
    [["p1"], ["p4"], []],
    [["p5"], ["p8"], []],
    [["p2"], ["p7"], []],
    [["p6"], ["p3"], []],
  ],
  "skill-1": [
    [["p12", "p3"], ["p8", "p11"], []],
    [["p13", "p4"], ["p10", "p7"], []],
    [["p1", "p6"], ["p5", "p2"], ["p2"]],
  ],
  "skill-1-single": [
    [["p1"], ["p4"], []],
    [["p5"], ["p8"], []],
    [["p2"], ["p7"], []],
    [["p6"], ["p3"], []],
  ],
  "diversity-7": [
    [["p11", "p10"], ["p13", "p8"], []],
    [["p12", "p6"], ["p5", "p3"], []],
    [["p1", "p9"], ["p7", "p4"], ["p9"]],
  ],
  "diversity-7-single": [
    [["p1"], ["p4"], []],
    [["p7"], ["p2"], []],
    [["p5"], ["p8"], []],
    [["p6"], ["p3"], []],
  ],
  "balanced-7": [
    [["p11", "p10"], ["p13", "p8"], []],
    [["p12", "p6"], ["p5", "p3"], []],
    [["p1", "p9"], ["p7", "p4"], ["p9"]],
  ],
  "balanced-7-single": [
    [["p1"], ["p4"], []],
    [["p7"], ["p2"], []],
    [["p5"], ["p8"], []],
    [["p6"], ["p3"], []],
  ],
  "skill-7": [
    [["p11", "p8"], ["p6", "p3"], []],
    [["p10", "p7"], ["p13", "p4"], []],
    [["p12", "p9"], ["p1", "p5"], ["p9"]],
  ],
  "skill-7-single": [
    [["p1"], ["p4"], []],
    [["p7"], ["p2"], []],
    [["p5"], ["p8"], []],
    [["p6"], ["p3"], []],
  ],
  "diversity-42": [
    [["p10", "p11"], ["p13", "p8"], []],
    [["p12", "p6"], ["p5", "p3"], []],
    [["p4", "p7"], ["p1", "p9"], ["p9"]],
  ],
  "diversity-42-single": [
    [["p4"], ["p1"], []],
    [["p6"], ["p9"], []],
    [["p5"], ["p2"], []],
    [["p7"], ["p8"], []],
  ],
  "balanced-42": [
    [["p10", "p11"], ["p13", "p8"], []],
    [["p12", "p6"], ["p5", "p3"], []],
    [["p4", "p7"], ["p1", "p9"], ["p9"]],
  ],
  "balanced-42-single": [
    [["p4"], ["p1"], []],
    [["p6"], ["p9"], []],
    [["p5"], ["p2"], []],
    [["p7"], ["p8"], []],
  ],
  "skill-42": [
    [["p10", "p7"], ["p13", "p4"], []],
    [["p12", "p3"], ["p8", "p11"], []],
    [["p6", "p9"], ["p1", "p5"], ["p9"]],
  ],
  "skill-42-single": [
    [["p4"], ["p1"], []],
    [["p6"], ["p9"], []],
    [["p5"], ["p2"], []],
    [["p7"], ["p8"], []],
  ],
};
