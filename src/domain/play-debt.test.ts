import { describe, expect, it } from "bun:test";
import { calculateAssignment } from "./assignment-calculator";
import { carriedPlayDebt } from "./play-debt";

const day = (dayKey: string, ...games: string[][]) =>
  games.map((playerIds) => ({ dayKey, playerIds }));

describe("carriedPlayDebt", () => {
  it("지난 출석일에 평균보다 덜 뛴 만큼이 빚이다", () => {
    // 지난주: a,b,c 는 3판, d 는 1판 → 평균 2.5, d 의 빚 1.5
    const past = day("2026-09-04", ["a", "b"], ["a", "c"], ["b", "c"], ["a", "b"], ["c", "d"]);
    // a=3 b=3 c=3 d=1 → avg 2.5
    expect(carriedPlayDebt(past, ["a", "b", "c", "d"])).toEqual({ d: 1.5 });
  });

  it("결석한 날은 빚이 아니다 — 마지막으로 뛴 날만 본다", () => {
    const past = [
      ...day("2026-09-01", ["a", "b"], ["a", "b"], ["a", "d"]), // d 1판, 평균 (3+2+1)/3=2 → 빚 1
      ...day("2026-09-04", ["a", "b"], ["a", "b"]), // d 결석
    ];
    expect(carriedPlayDebt(past, ["a", "b", "d"])).toEqual({ d: 1 });
  });

  it("빚은 캡을 넘지 않고, 기록 없는 사람은 빚이 없다", () => {
    const past = day(
      "2026-09-04",
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
      ["a", "b"],
      ["a", "d"],
    );
    // a=6 b=5 d=1 → avg 4, d 의 빚 3 → 캡 2
    expect(carriedPlayDebt(past, ["a", "b", "d", "new"])).toEqual({ d: 2 });
  });

  it("빚이 있는 사람은 오늘 대진에 먼저 들어간다", () => {
    const participants = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => ({ id }));
    // 오늘 모두 0판인 상태에서 1경기(단식)만 뽑으면, 빚 진 p5·p6 가 뽑혀야 한다.
    const out = calculateAssignment({
      participants,
      count: 1,
      teamSize: 1,
      playHistory: [],
      playCountOffset: { p5: -2, p6: -2 },
      seed: 1,
    });
    expect(out.matches).toHaveLength(1);
    expect([...out.matches[0].teamA, ...out.matches[0].teamB].sort()).toEqual(["p5", "p6"]);
    // 결과 판 수에는 빚이 섞이지 않는다.
    expect(out.playCounts.p5).toBe(1);
    expect(out.playCounts.p1).toBe(0);
  });
});
