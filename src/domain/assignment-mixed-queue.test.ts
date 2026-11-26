import { describe, expect, it } from "bun:test";
import { calculateAssignment, type AssignmentPlayer } from "./assignment-calculator";

/**
 * 11-26 학교 리그(남녀 따로, 단식·복식 섞어 [+1]) 실사용에서 나온 두 증상의 재발 막기.
 * 1) 놀던 사람이 모자랄 때 줄에 선 사람을 가장 적게 다시 써야 한다(넷 다 재사용 X).
 * 2) 판 수가 같으면 1인당 덜 뛴 성별이 먼저(인원 많은 성별이 계속 뽑히던 것).
 */
const people = (prefix: string, n: number): AssignmentPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));
const genderMap = (men: AssignmentPlayer[], women: AssignmentPlayer[]) => {
  const g: Record<string, string> = {};
  for (const p of men) g[p.id] = "M";
  for (const p of women) g[p.id] = "F";
  return g;
};

describe("섞어 넣기(남녀 따로) — 11-26 재발 막기", () => {
  it("놀던 사람이 모자라면 줄에 선 사람을 가장 적게 다시 쓴다", () => {
    // 남 4명은 모두 줄에, 여 3명만 놀고 있고(방금 끝나 1판) 여 1명은 줄에. → 여 3 + 줄의 여 1(재사용 1)이 답.
    // 판 수가 남녀 같아 남자가 앵커가 되기 쉽다 — 예전엔 그때 줄에 선 남자 넷을 또 넣었다.
    const men = people("m", 4);
    const women = people("f", 4);
    for (let seed = 0; seed < 60; seed++) {
      const out = calculateAssignment({
        participants: [...men, ...women],
        busyPlayerIds: ["m1", "m2", "m3", "m4", "f4"],
        playHistory: [
          { teamA: ["f1", "f2"], teamB: ["f3", "f4"] },
          { teamA: ["m1", "m2"], teamB: ["m3", "m4"] },
          { teamA: ["f4"], teamB: [] },
        ],
        count: 1,
        teamSize: 2,
        policy: "diversity",
        seed,
        groupOf: genderMap(men, women),
      });
      expect(out.matches).toHaveLength(1);
      expect(out.matches[0].relaxedPlayerIds).toHaveLength(1);
    }
  });

  it("판 수가 같으면 1인당 덜 뛴 성별을 먼저 뽑는다", () => {
    // 남 2명·여 3명이 놀고 있고 모두 1판. 줄까지 합쳐 여자가 1인당 더 뛰었다 → 단식은 남자.
    const men = people("m", 4);
    const women = people("f", 6);
    for (let seed = 0; seed < 60; seed++) {
      const out = calculateAssignment({
        participants: [...men, ...women],
        busyPlayerIds: ["m3", "m4", "f4", "f5", "f6"],
        playHistory: [
          { teamA: ["m1"], teamB: ["m2"] },
          { teamA: ["f1", "f2"], teamB: ["f3", "f4"] },
          { teamA: ["f5", "f6"], teamB: ["f4", "f1"] },
          { teamA: ["m3"], teamB: ["m4"] },
          { teamA: ["f2"], teamB: ["f3"] },
        ],
        count: 1,
        teamSize: 1,
        policy: "diversity",
        seed,
        groupOf: genderMap(men, women),
      });
      expect(out.matches).toHaveLength(1);
      // 놀고 있는 남자 m1·m2 는 1판, 여자 f1·f2·f3 은 2판이라 이건 판 수만으로도 남자다.
      expect([...out.matches[0].teamA, ...out.matches[0].teamB].every((id) => id.startsWith("m"))).toBe(true);
    }
  });

  it("개인 판 수가 똑같아도 성별 1인당 판 수가 적은 쪽이 먼저", () => {
    // 놀던 사람 전원 1판. 줄에 선 여자가 많아 여자 1인당 판 수가 더 높다.
    const men = people("m", 4);
    const women = people("f", 7);
    for (let seed = 0; seed < 60; seed++) {
      const out = calculateAssignment({
        participants: [...men, ...women],
        busyPlayerIds: ["m3", "m4", "f4", "f5", "f6", "f7"],
        playHistory: [
          { teamA: ["m1"], teamB: ["m2"] },
          { teamA: ["m3", "m4"], teamB: [] },
          { teamA: ["f1", "f2"], teamB: ["f3", "f4"] },
          { teamA: ["f4", "f5"], teamB: ["f6", "f7"] },
          { teamA: ["f5", "f6", "f7"], teamB: [] },
        ],
        count: 1,
        teamSize: 1,
        policy: "diversity",
        seed,
        groupOf: genderMap(men, women),
      });
      const ids = [...out.matches[0].teamA, ...out.matches[0].teamB];
      expect(ids.every((id) => id.startsWith("m"))).toBe(true);
    }
  });
});
