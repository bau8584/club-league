import { describe, expect, it } from "bun:test";
import { parseRoster } from "./roster-parser";

/** 학교 명단 한 줄의 기대값을 짧게 쓴다. */
const row = (nickname: string, grade: number | null, classNum: number | null, studentNo: number | null) =>
  ({ nickname, group: null, grade, classNum, studentNo });

/**
 * 배포 당시(2026-09-15) 잘 되던 입력. 새 파서도 이 결과를 그대로 내야 한다.
 * 실제 리그 명단에서 가장 많이 들어온 세 형식 + 단위가 섞인 경우.
 */
describe("parseRoster — 기존 동작 고정 (school)", () => {
  it("이름만", () => {
    expect(parseRoster("강유아\n김민준", true)).toEqual([
      row("강유아", null, null, null),
      row("김민준", null, null, null),
    ]);
  });

  it("번호 이름", () => {
    expect(parseRoster("15 홍길동\n16 김철수", true)).toEqual([
      row("홍길동", null, null, 15),
      row("김철수", null, null, 16),
    ]);
  });

  it("반 번호 이름", () => {
    expect(parseRoster("2 15 홍길동", true)).toEqual([row("홍길동", null, 2, 15)]);
  });

  it("학년 반 번호 이름", () => {
    expect(parseRoster("3 2 15 홍길동", true)).toEqual([row("홍길동", 3, 2, 15)]);
  });

  it("단위가 붙은 칸은 그 뜻대로", () => {
    expect(parseRoster("3학년 2반 16번 김철수", true)).toEqual([row("김철수", 3, 2, 16)]);
    expect(parseRoster("3학년 2반 홍길동", true)).toEqual([row("홍길동", 3, 2, null)]);
    expect(parseRoster("15번 홍길동", true)).toEqual([row("홍길동", null, null, 15)]);
  });

  it("단위가 섞이면 남은 숫자를 학년→반→번호 순으로 채운다", () => {
    expect(parseRoster("3학년 2 15 홍길동", true)).toEqual([row("홍길동", 3, 2, 15)]);
  });

  it("탭·콤마·공백 어느 것으로 나눠도 같다", () => {
    expect(parseRoster("3\t2\t15\t홍길동", true)).toEqual([row("홍길동", 3, 2, 15)]);
    expect(parseRoster("3,2,15,홍길동", true)).toEqual([row("홍길동", 3, 2, 15)]);
  });

  it("외국 이름처럼 띄어쓴 이름은 공백으로 이어 붙인다", () => {
    expect(parseRoster("12 JANCHIVDORJ MUNKHDUL (뭉흐둘)", true)).toEqual([
      row("JANCHIVDORJ MUNKHDUL (뭉흐둘)", null, null, 12),
    ]);
  });

  it("빈 줄은 건너뛴다", () => {
    expect(parseRoster("\n15 홍길동\n\n\n", true)).toEqual([row("홍길동", null, null, 15)]);
  });

  it("완성형이 아닌 낱자 이름도 이름이다(테스트 입력)", () => {
    expect(parseRoster("김ㅐㅐ\n잏ㅎ", true)).toEqual([
      row("김ㅐㅐ", null, null, null),
      row("잏ㅎ", null, null, null),
    ]);
  });
});

describe("parseRoster — 기존 동작 고정 (club)", () => {
  it("1칸 → 닉네임, 2칸 → 레벨, 닉네임", () => {
    expect(parseRoster("영희\nA조, 길동이\nB조\t철수")).toEqual([
      { nickname: "영희", group: null, grade: null, classNum: null, studentNo: null },
      { nickname: "길동이", group: "A조", grade: null, classNum: null, studentNo: null },
      { nickname: "철수", group: "B조", grade: null, classNum: null, studentNo: null },
    ]);
  });

  it("동호회는 공백으로 나누지 않는다(닉네임에 띄어쓰기 허용)", () => {
    expect(parseRoster("길동 형")).toEqual([
      { nickname: "길동 형", group: null, grade: null, classNum: null, studentNo: null },
    ]);
  });
});
