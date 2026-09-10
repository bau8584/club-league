import { describe, expect, it } from "bun:test";
import {
  computeAwards,
  computeDayStats,
  computeHighlights,
  type HighlightMatch,
  type HighlightPlayer,
} from "./highlight-calculator";

/**
 * 경기 한 건. 배열에 넣은 순서대로 1분씩 뒤로 밀린다 — 연승은 시간 순서를 타므로
 * 픽스처에서 "먼저 뛴 판"이 눈에 보여야 한다.
 */
const day = (
  rows: [
    winners: string[],
    losers: string[],
    scoreWin: number,
    scoreLose: number,
    type?: "single" | "double",
  ][],
): HighlightMatch[] =>
  rows.map(([winnerIds, loserIds, scoreWin, scoreLose, matchType], i) => ({
    id: `m${i + 1}`,
    date: `2026-09-10T09:${String(i).padStart(2, "0")}:00.000Z`,
    winnerIds,
    loserIds,
    scoreWin,
    scoreLose,
    matchType: matchType ?? (winnerIds.length > 1 ? "double" : "single"),
  }));

const cardFor = (cards: { key: string; playerId: string }[], key: string) =>
  cards.find((c) => c.key === key) ?? null;
const listFor = (lists: { key: string; playerIds: string[] }[], key: string) =>
  lists.find((l) => l.key === key) ?? null;

describe("computeAwards — 동점과 배정", () => {
  it("2연승이 여러 명이면 연승왕 카드가 아니라 전승 목록으로 내려간다", () => {
    const matches = day([
      [["a"], ["d"], 21, 19],
      [["b"], ["e"], 21, 15],
      [["c"], ["f"], 21, 10],
      [["a"], ["e"], 21, 17],
      [["b"], ["f"], 21, 12],
      [["c"], ["d"], 21, 14],
    ]);
    const { day: stats, awards } = computeHighlights({ matches });

    expect(stats.maxStreak).toBe(2);
    expect(cardFor(awards.cards, "연승왕")).toBeNull();
    expect(listFor(awards.lists, "전승")?.playerIds).toEqual(["a", "b", "c"]);
  });

  it("동점자가 둘이면 더 적은 경기로 달성한 학생이 카드를 받는다", () => {
    // p1도 p2도 완봉승 1번. 다만 p1은 세 경기를 뛰었고 p2는 한 경기만 뛰었다.
    const matches = day([
      [["p1"], ["x"], 2, 0],
      [["p2"], ["y"], 2, 0],
      [["p1"], ["z"], 2, 1],
      [["w"], ["p1"], 2, 1],
    ]);
    const { awards } = computeHighlights({ matches });

    expect(cardFor(awards.cards, "완봉승")?.playerId).toBe("p2");
  });

  it("출전 수까지 같으면 학년·반·번호 순으로 갈린다", () => {
    const matches = day([
      [["p1"], ["x"], 2, 0],
      [["p2"], ["y"], 2, 0],
      [["p1"], ["z"], 2, 1],
      [["p2"], ["w"], 2, 1],
    ]);
    const players: HighlightPlayer[] = [
      { id: "p1", grade: 6, classNum: 2, studentNo: 1 },
      { id: "p2", grade: 5, classNum: 9, studentNo: 30 },
    ];
    const { awards } = computeHighlights({ matches, players });

    // 출전 2경기 · 완봉 1번으로 완전히 같다. 5학년이 먼저다.
    expect(cardFor(awards.cards, "완봉승")?.playerId).toBe("p2");
  });

  it("같은 입력을 두 번 넣으면 항상 같은 결과가 나온다 (입력 순서에 의존하지 않는다)", () => {
    const matches = day([
      [["a"], ["d"], 21, 19],
      [["b"], ["e"], 21, 15],
      [["c"], ["f"], 21, 10],
      [["a"], ["e"], 21, 17],
      [["b"], ["f"], 21, 12],
      [["c"], ["d"], 21, 14],
    ]);
    const first = computeHighlights({ matches }).awards;
    const again = computeHighlights({ matches }).awards;
    const reversed = computeHighlights({ matches: [...matches].reverse() }).awards;

    expect(again).toEqual(first);
    expect(reversed).toEqual(first);
  });

  it("한 학생이 여러 상의 최댓값이어도 카드는 하나만 받는다", () => {
    const matches = day([
      [["s"], ["x"], 2, 0],
      [["s"], ["y"], 2, 1],
      [["s"], ["z"], 2, 1],
      [["a"], ["x"], 2, 1],
      [["b"], ["y"], 2, 1],
      [["a"], ["z"], 2, 0],
    ]);
    const { awards } = computeHighlights({ matches });

    const mine = awards.cards.filter((c) => c.playerId === "s");
    expect(mine).toHaveLength(1);
    // 카드는 서로 다른 사람에게 간다.
    expect(new Set(awards.cards.map((c) => c.playerId)).size).toBe(awards.cards.length);
  });

  it("드문 상이 흔한 상보다 먼저 배정된다", () => {
    // u는 대이변러이면서 최다 출전 후보이기도 하다. 드문 쪽을 먼저 가져가야 한다.
    const matches = day([
      [["u"], ["h"], 21, 10],
      [["u"], ["c"], 21, 15],
      [["d"], ["e"], 21, 5],
      [["d"], ["f"], 21, 19],
      [["g"], ["c"], 21, 18],
    ]);
    const players: HighlightPlayer[] = [
      { id: "u", rp: 1 },
      { id: "h", rp: 3 },
    ];
    const { awards } = computeHighlights({ matches, players, tierOf: (rp) => rp });

    expect(cardFor(awards.cards, "대이변러")?.playerId).toBe("u");
    expect(cardFor(awards.cards, "최다 출전")?.playerId).not.toBe("u");
  });

  it("최다승은 배정 대상이 아니다 — 동점이면 동점자를 전부 그대로 내보낸다", () => {
    const matches = day([
      [["a"], ["x"], 21, 10],
      [["a"], ["y"], 21, 12],
      [["b"], ["x"], 21, 14],
      [["b"], ["y"], 21, 19],
    ]);
    const { day: stats, awards } = computeHighlights({ matches });

    expect(stats.topWinners).toEqual({ playerIds: ["a", "b"], wins: 2 });
    expect(awards.cards.some((c) => c.key === "최다승")).toBe(false);
  });
});

describe("computeDayStats — 상대값 기준", () => {
  it("2점제 경기(2:0, 2:1)에서 압승과 접전이 갈린다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a"], ["b"], 2, 0],
        [["c"], ["d"], 2, 1],
      ]),
    });

    expect(stats.blowoutThreshold).toBe(2);
    expect(stats.perPlayer.get("a")?.blowoutWins).toBe(1);
    expect(stats.perPlayer.get("a")?.closeWins).toBe(0);
    expect(stats.perPlayer.get("c")?.closeWins).toBe(1);
    expect(stats.perPlayer.get("c")?.blowoutWins).toBe(0);
    // 완봉은 점수 체계와 무관하게 언제나 성립한다.
    expect(stats.perPlayer.get("a")?.shutoutWins).toBe(1);
  });

  it("21점제 경기(21:9, 15:13)에서도 같은 코드로 갈린다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a"], ["b"], 21, 9],
        [["c"], ["d"], 15, 13],
      ]),
    });

    expect(stats.perPlayer.get("a")?.blowoutWins).toBe(1);
    expect(stats.perPlayer.get("a")?.closeWins).toBe(0);
    expect(stats.perPlayer.get("c")?.closeWins).toBe(1);
    expect(stats.perPlayer.get("c")?.blowoutWins).toBe(0);
  });

  it("그 날 최대 연승이 2면 연승왕 카드가 나오지 않는다", () => {
    const matches = day([
      [["a"], ["b"], 21, 19],
      [["a"], ["c"], 21, 10],
      [["b"], ["c"], 21, 15],
    ]);
    const { day: stats, awards } = computeHighlights({ matches });

    expect(stats.maxStreak).toBe(2);
    expect(cardFor(awards.cards, "연승왕")).toBeNull();
  });

  it("경기가 1건뿐인 날에는 상이 억지로 만들어지지 않는다", () => {
    const { awards } = computeHighlights({ matches: day([[["a"], ["b"], 21, 19]]) });

    // 점수차가 한 개뿐이라 상위/하위 25%가 성립하지 않는다. 침묵이 거짓보다 낫다.
    expect(awards.cards).toEqual([]);
    expect(awards.lists).toEqual([]);
  });

  it("점수차가 전부 같은 날에는 압승도 접전도 내지 않는다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a"], ["b"], 2, 1],
        [["c"], ["d"], 2, 1],
        [["e"], ["f"], 2, 1],
      ]),
    });

    expect(stats.blowoutThreshold).toBeNull();
    expect(stats.closeThreshold).toBeNull();
  });
});

describe("computeAwards — 종목", () => {
  it("복식이 없는 날에는 복식 짝꿍이 나오지 않는다", () => {
    const { day: stats, awards } = computeHighlights({
      matches: day([
        [["a"], ["b"], 21, 10],
        [["a"], ["c"], 21, 19],
      ]),
    });

    expect(stats.hasDoubles).toBe(false);
    expect(awards.duo).toBeNull();
  });

  it("복식이 있는 날에는 함께 가장 많이 이긴 조합을 낸다", () => {
    const { awards } = computeHighlights({
      matches: day([
        [["p1", "p2"], ["p3", "p4"], 2, 1],
        [["p1", "p2"], ["p5", "p6"], 2, 0],
        [["p3", "p4"], ["p5", "p6"], 2, 1],
      ]),
    });

    expect(awards.duo).toEqual({ playerIds: ["p1", "p2"], wins: 2 });
  });

  it("단식과 복식이 섞인 날 승수가 합산된다", () => {
    const stats = computeDayStats({
      matches: day([
        [["s"], ["a"], 21, 10],
        [["s"], ["b"], 21, 19],
        [["s", "c"], ["d", "e"], 21, 15],
      ]),
    });

    expect(stats.hasSingles).toBe(true);
    expect(stats.hasDoubles).toBe(true);
    expect(stats.singles).toBe(2);
    expect(stats.doubles).toBe(1);
    expect(stats.perPlayer.get("s")?.wins).toBe(3);
    expect(stats.perPlayer.get("s")?.maxStreak).toBe(3);
  });
});

describe("computeAwards — 학교용 지표", () => {
  const prior = day([
    [["a"], ["b"], 21, 10],
    [["a"], ["b"], 21, 12],
  ]);

  it("지난 기록이 없으면 친구 넓히기·첫 승·리그 데뷔를 아예 내지 않는다", () => {
    // priorMatches를 안 주면 오늘 만난 전원이 "처음 만난 상대"가 되어 버린다. 침묵이 낫다.
    const { day: stats, awards } = computeHighlights({
      matches: day([
        [["a"], ["c"], 21, 10],
        [["a"], ["d"], 21, 12],
      ]),
    });

    expect(stats.hasHistory).toBe(false);
    expect(cardFor(awards.cards, "친구 넓히기")).toBeNull();
    expect(listFor(awards.lists, "첫 승")).toBeNull();
    expect(listFor(awards.lists, "리그 데뷔")).toBeNull();
  });

  it("오늘 처음 만난 상대가 가장 많은 학생이 친구 넓히기를 받는다", () => {
    // a는 b와만 놀던 학생. 오늘 c·d를 처음 만났다.
    const { awards } = computeHighlights({
      matches: day([
        [["a"], ["c"], 21, 10],
        [["a"], ["d"], 21, 12],
        [["b"], ["c"], 21, 15],
      ]),
      priorMatches: prior,
    });

    expect(cardFor(awards.cards, "친구 넓히기")?.playerId).toBe("a");
  });

  it("친구 넓히기가 사다리 맨 위라 다른 상에 묶여 사라지지 않는다", () => {
    const { awards } = computeHighlights({
      matches: day([
        [["a"], ["c"], 2, 0],
        [["a"], ["d"], 2, 1],
        [["b"], ["c"], 2, 1],
      ]),
      priorMatches: prior,
    });

    // a는 완봉승·최다 출전 후보이기도 하다. 승패와 무관한 자리를 먼저 가져간다.
    expect(cardFor(awards.cards, "친구 넓히기")?.playerId).toBe("a");
    expect(awards.cards.filter((c) => c.playerId === "a")).toHaveLength(1);
  });

  it("복식 짝꿍은 만난 상대로 세지 않는다", () => {
    const stats = computeDayStats({
      matches: day([[["a", "x"], ["c", "d"], 2, 1]]),
      priorMatches: prior,
    });

    // a가 오늘 만난 사람은 c·d 둘이다. 같은 편 x는 만난 게 아니라 같이 뛴 것이다.
    expect(stats.perPlayer.get("a")?.newOpponents).toBe(2);
  });

  it("한 번도 못 이기던 학생의 첫 승을 목록으로 낸다", () => {
    // b는 지난 기록이 2패뿐이다.
    const { awards } = computeHighlights({
      matches: day([
        [["b"], ["a"], 21, 19],
        [["a"], ["b"], 21, 10],
      ]),
      priorMatches: prior,
    });

    expect(listFor(awards.lists, "첫 승")?.playerIds).toEqual(["b"]);
  });

  it("오늘 처음 뛴 학생은 첫 승이 아니라 리그 데뷔다", () => {
    const { awards } = computeHighlights({
      matches: day([
        [["new1"], ["a"], 21, 10],
        [["a"], ["new1"], 21, 12],
      ]),
      priorMatches: prior,
    });

    expect(listFor(awards.lists, "리그 데뷔")?.playerIds).toEqual(["new1"]);
    expect(listFor(awards.lists, "첫 승")).toBeNull();
  });

  it("티어 승급은 오늘 오간 RP를 되돌려 경기 전 티어와 견준다", () => {
    const matches: HighlightMatch[] = day([[["a"], ["b"], 21, 10]]).map((m) => ({
      ...m,
      rpDeltaByPlayer: { a: 20, b: -20 },
    }));
    const { awards } = computeHighlights({
      matches,
      players: [
        { id: "a", rp: 1005 }, // 경기 전 985 → 승급
        { id: "b", rp: 980 }, //  경기 전 1000 → 강등(내보내지 않는다)
      ],
      priorMatches: prior,
      tierOf: (rp) => (rp >= 1000 ? 1 : 0),
    });

    expect(listFor(awards.lists, "티어 승급")?.playerIds).toEqual(["a"]);
  });

  it("지난 수업엔 RP가 줄었는데 오늘 올린 학생만 나아진 학생으로 낸다", () => {
    const priorRp: HighlightMatch[] = [
      // 지난 수업(09-03): a는 -20, b는 +20
      {
        id: "h1",
        date: "2026-09-03T09:00:00.000Z",
        dayKey: "2026-09-03",
        winnerIds: ["b"],
        loserIds: ["a"],
        scoreWin: 21,
        scoreLose: 10,
        rpDeltaByPlayer: { a: -20, b: 20 },
      },
    ];
    const matches: HighlightMatch[] = day([
      [["a"], ["b"], 21, 19],
      [["a"], ["b"], 21, 15],
    ]).map((m) => ({ ...m, dayKey: "2026-09-10", rpDeltaByPlayer: { a: 10, b: -10 } }));

    const { awards } = computeHighlights({ matches, priorMatches: priorRp });

    expect(listFor(awards.lists, "나아진 학생")?.playerIds).toEqual(["a"]);
  });

  it("나빠진 학생은 내지 않는다", () => {
    const priorRp: HighlightMatch[] = [
      {
        id: "h1",
        date: "2026-09-03T09:00:00.000Z",
        dayKey: "2026-09-03",
        winnerIds: ["a"],
        loserIds: ["b"],
        scoreWin: 21,
        scoreLose: 10,
        rpDeltaByPlayer: { a: 20, b: -20 },
      },
    ];
    const matches: HighlightMatch[] = day([
      [["b"], ["a"], 21, 19],
      [["b"], ["a"], 21, 15],
    ]).map((m) => ({ ...m, dayKey: "2026-09-10", rpDeltaByPlayer: { a: -10, b: 10 } }));

    const { awards } = computeHighlights({ matches, priorMatches: priorRp });

    // a는 지난 수업보다 나빠졌다. 반 전체가 보는 화면에 그런 목록은 없다.
    expect(listFor(awards.lists, "나아진 학생")?.playerIds).toEqual(["b"]);
    expect(awards.lists.some((l) => l.key.includes("나빠"))).toBe(false);
  });
});

describe("computeDayStats — 명경기와 반 집계", () => {
  const classes: HighlightPlayer[] = [
    { id: "a1", classKey: "5-4" },
    { id: "a2", classKey: "5-4" },
    { id: "a3", classKey: "5-4" },
    { id: "b1", classKey: "5-7" },
    { id: "b2", classKey: "5-7" },
  ];

  it("명경기는 접전 중 총득점이 가장 높은 판이다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a"], ["b"], 21, 3], // 총득점은 낮지만 학살
        [["c"], ["d"], 30, 29], // 접전이면서 가장 오래 주고받았다
        [["e"], ["f"], 15, 14], // 접전이지만 총득점이 낮다
      ]),
    });

    expect(stats.bestMatch?.matchId).toBe("m2");
    expect(stats.bestMatch?.totalScore).toBe(59);
  });

  it("접전 기준이 없는 날에는 명경기도 없다", () => {
    const stats = computeDayStats({ matches: day([[["a"], ["b"], 21, 19]]) });

    expect(stats.closeThreshold).toBeNull();
    expect(stats.bestMatch).toBeNull();
  });

  it("반 집계는 순위가 아니라 집계다 — 안 뛴 반은 목록에 없다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a1"], ["a2"], 2, 1],
        [["a1"], ["a3"], 2, 0],
        [["b1"], ["b2"], 2, 1],
      ]),
      // 5-9반 학생은 명단에 있지만 오늘 안 뛰었다.
      players: [...classes, { id: "c1", classKey: "5-9" }],
    });

    expect(stats.classSummary).toEqual([
      { classKey: "5-4", matches: 2, players: 3 },
      { classKey: "5-7", matches: 1, players: 2 },
    ]);
  });

  it("반 정보가 없는 명단에서는 반 집계가 통째로 비어 있다", () => {
    const stats = computeDayStats({
      matches: day([[["a"], ["b"], 2, 1]]),
      players: [{ id: "a" }, { id: "b", classKey: null }],
    });

    expect(stats.classSummary).toEqual([]);
    expect(stats.crossClass).toEqual([]);
  });

  it("반대항 경기가 없으면 반대항 집계도 없다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a1"], ["a2"], 2, 1],
        [["b1"], ["b2"], 2, 1],
      ]),
      players: classes,
    });

    expect(stats.crossClass).toEqual([]);
  });

  it("반대항 경기는 반끼리의 승패로 센다", () => {
    const stats = computeDayStats({
      matches: day([
        [["a1"], ["b1"], 2, 1],
        [["a2"], ["b2"], 2, 0],
        [["b1"], ["a3"], 2, 1],
      ]),
      players: classes,
    });

    expect(stats.crossClass).toEqual([{ a: "5-4", b: "5-7", winsA: 2, winsB: 1 }]);
    // 반대항 경기도 양쪽 반의 경기 수에 들어간다.
    expect(stats.classSummary.map((c) => c.matches)).toEqual([3, 3]);
  });

  it("반이 섞인 복식 팀은 어느 반의 승리인지 말할 수 없으므로 반대항이 아니다", () => {
    const stats = computeDayStats({
      matches: day([[["a1", "b1"], ["a2", "b2"], 2, 1]]),
      players: classes,
    });

    expect(stats.crossClass).toEqual([]);
  });
});

describe("computeAwards — 경계값", () => {
  it("그 날 경기가 0건이면 빈 결과를 돌려준다", () => {
    const { day: stats, awards } = computeHighlights({ matches: [] });

    expect(stats.total).toBe(0);
    expect(stats.playerCount).toBe(0);
    expect(stats.topWinners).toBeNull();
    expect(stats.avgAppearances).toBe(0);
    expect(awards).toEqual({ cards: [], lists: [], duo: null });
  });

  it("삭제된 학생이 낀 경기에서 터지지 않는다", () => {
    // gone 은 명단에 없다(삭제됨). 계산은 id만으로 끝까지 돌아야 한다.
    const matches = day([
      [["gone"], ["a"], 2, 0],
      [["gone"], ["b"], 2, 1],
      [["a"], ["b"], 2, 1],
    ]);
    const { day: stats, awards } = computeHighlights({
      matches,
      players: [{ id: "a", grade: 5, classNum: 1, studentNo: 3 }],
    });

    expect(stats.perPlayer.get("gone")?.wins).toBe(2);
    expect(awards.cards.length).toBeGreaterThan(0);
  });

  it("반 정보가 없는 명단(전원 null)에서도 결정적으로 한 명을 고른다", () => {
    const matches = day([
      [["p1"], ["x"], 2, 0],
      [["p2"], ["y"], 2, 0],
      [["p1"], ["z"], 2, 1],
      [["p2"], ["w"], 2, 1],
    ]);
    const players: HighlightPlayer[] = [
      { id: "p1", grade: null, classNum: null, studentNo: null, name: null },
      { id: "p2", grade: null, classNum: null, studentNo: null, name: null },
    ];
    const stats = computeDayStats({ matches, players });

    // 명단 순서를 뒤집어도 같은 사람이 나온다 — 마지막 축(id)까지 결정적이다.
    expect(computeAwards(stats, players)).toEqual(computeAwards(stats, [...players].reverse()));
    expect(cardFor(computeAwards(stats, players).cards, "완봉승")?.playerId).toBe("p1");
  });
});
