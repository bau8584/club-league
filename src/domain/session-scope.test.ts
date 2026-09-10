import { describe, expect, it } from "bun:test";
import { sessionClassKeys, soleClassScope } from "./session-scope";
import type { Student } from "@/lib/league-types";

const s = (id: string, grade: number | null, classNum: number | null): Student =>
  ({ id, name: id, grade, classNum, rp: 1000 }) as unknown as Student;

describe("sessionClassKeys", () => {
  const roster = [s("a", 5, 4), s("b", 5, 4), s("c", 6, 1), s("d", null, null)];

  it("참석자가 속한 반만 모은다 — 명단 전체가 아니라", () => {
    expect(sessionClassKeys(["a", "b"], roster)).toEqual(["5-4"]);
  });

  it("여러 반이 섞이면 전부 돌려준다(학년 대전)", () => {
    expect(sessionClassKeys(["a", "c"], roster)).toEqual(["5-4", "6-1"]);
  });

  it("명단에 없는 id는 조용히 건너뛴다 — 학생이 빠진 뒤 남은 세션 행이 있다", () => {
    expect(sessionClassKeys(["a", "없는id"], roster)).toEqual(["5-4"]);
  });

  it("참석자가 없으면 빈 배열", () => {
    expect(sessionClassKeys([], roster)).toEqual([]);
  });
});

describe("soleClassScope", () => {
  it("반이 하나면 학년·반으로 풀어 준다", () => {
    expect(soleClassScope(["5-4"])).toEqual({ grade: 5, classNum: 4 });
  });

  it("여러 반이면 null — 학년만 걸어주는 절충은 하지 않는다", () => {
    expect(soleClassScope(["5-4", "5-7"])).toBeNull();
  });

  it("반이 없으면 null", () => {
    expect(soleClassScope([])).toBeNull();
  });

  it("반 미지정(빈 키)은 필터로 쓸 수 없다", () => {
    expect(soleClassScope([""])).toBeNull();
  });

  it("있는 축만 채운다 — 학년만 있는 명단", () => {
    expect(soleClassScope(["5-"])).toEqual({ grade: 5, classNum: null });
  });

  it("있는 축만 채운다 — 반만 있는 명단", () => {
    expect(soleClassScope(["-4"])).toEqual({ grade: null, classNum: 4 });
  });
});
