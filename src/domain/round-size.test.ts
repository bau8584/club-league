import { describe, expect, it } from "bun:test";
import { roundGamesKeepingOut, separateGamesKeepingOut } from "./round-size";

describe("roundGamesKeepingOut", () => {
  it("줄이 비면 남기지 않는다", () => expect(roundGamesKeepingOut(2, 8, 4, 0)).toBe(2));
  it("줄이 있으면 한 경기 분량을 남긴다", () => expect(roundGamesKeepingOut(2, 8, 4, 1)).toBe(1));
  it("5명·코트 2 단식: 한 경기 끝나 3명 놀면 1경기", () => expect(roundGamesKeepingOut(1, 3, 2, 1)).toBe(1));
  it("10명·코트 3 복식: 한 경기 끝나 6명 놀면 1경기", () => expect(roundGamesKeepingOut(1, 6, 4, 1)).toBe(1));
  it("방금 끝난 넷뿐이면 0", () => expect(roundGamesKeepingOut(1, 4, 4, 3)).toBe(0));
});

describe("separateGamesKeepingOut", () => {
  it("남녀 각자 남긴다 — 남 8·여 4, 둘 다 줄 있음 → 남 1·여 0", () => {
    expect(separateGamesKeepingOut({ m: 8, f: 4, u: 0 }, { m: 1, f: 1 }, 4)).toMatchObject({ m: 1, f: 0 });
  });
  it("여자 줄이 비었으면 여자는 남기지 않는다", () => {
    expect(separateGamesKeepingOut({ m: 4, f: 4, u: 0 }, { m: 2, f: 0 }, 4)).toMatchObject({ m: 0, f: 1 });
  });
  it("합쳐 세면 1경기 나오던 남 4·여 4(줄 있음)는 0경기", () => {
    expect(separateGamesKeepingOut({ m: 4, f: 4, u: 0 }, { m: 1, f: 1 }, 4)).toMatchObject({ m: 0, f: 0 });
  });
  it("미지정은 경기가 더 나오는 쪽에", () => {
    expect(separateGamesKeepingOut({ m: 6, f: 0, u: 2 }, { m: 0, f: 0 }, 4)).toMatchObject({ m: 2, f: 0, uToM: 2 });
  });
});

describe("separateGamesKeepingOut — 성별 인원에 비례해 남김", () => {
  it("남 12·여 8 둘 다 줄이 있어도 여자 경기가 0이 안 된다", () => {
    const r = separateGamesKeepingOut({ m: 12, f: 8, u: 0 }, { m: 1, f: 1 }, 4);
    expect(r.f).toBeGreaterThan(0);
    expect(r.m).toBeGreaterThan(0);
  });
  it("여 7명(한 경기 분량보다 많음)이면 최소 1경기", () => {
    expect(separateGamesKeepingOut({ m: 12, f: 7, u: 0 }, { m: 1, f: 1 }, 4).f).toBe(1);
  });
});
