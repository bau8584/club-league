import { describe, expect, it } from "bun:test";
import { parseRoster, parseRosterDetailed, type ParsedRow } from "./roster-parser";

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

/** 실제로 붙여넣어진 나이스·엑셀 형식(2026-09-15 DB에서 확인). */
const r = (nickname: string, grade: number | null, classNum: number | null, studentNo: number | null, extra: Partial<ParsedRow> = {}) =>
  ({ nickname, group: null, grade, classNum, studentNo, ...extra });

describe("parseRoster — 새 형식 (school)", () => {
  it("번호와 이름이 붙어 있다: 20전진형", () => {
    expect(parseRoster("20전진형\n1김가람", true)).toEqual([
      r("전진형", null, null, 20),
      r("김가람", null, null, 1),
    ]);
  });

  it("나이스 학번이 붙어 있다: 619최건희 / 6110한재석 / 51201홍길동", () => {
    expect(parseRoster("619최건희\n6110한재석\n51201홍길동", true)).toEqual([
      r("최건희", 6, 1, 9),
      r("한재석", 6, 1, 10),
      r("홍길동", 5, 12, 1),
    ]);
  });

  it("학번이 따로 칸으로 와도 같다: 51201 홍길동", () => {
    expect(parseRoster("51201\t홍길동", true)).toEqual([r("홍길동", 5, 12, 1)]);
  });

  it("나이스 학급명렬표 한 줄 통째: 5학년12반 1 강우준 남 2015.03.02", () => {
    expect(parseRoster("5학년12반 1 강우준 남 2015.03.02", true)).toEqual([
      r("강우준", 5, 12, 1, { gender: "M" }),
    ]);
  });

  it("머리글 줄은 건너뛴다", () => {
    expect(parseRoster("번호 이름 성별\n1 김규빈 남\n2 이서연 여", true)).toEqual([
      r("김규빈", null, null, 1, { gender: "M" }),
      r("이서연", null, null, 2, { gender: "F" }),
    ]);
    expect(parseRoster("학년\t반\t번호\t성명\t생년월일\n3\t2\t15\t홍길동\t150302", true)).toEqual([
      r("홍길동", 3, 2, 15),
    ]);
  });

  it("성별 칸: 남/여/남자/여자/M/F", () => {
    expect(parseRoster("1 김규빈 남자\n2 이서연 F\n3 박준 m", true)).toEqual([
      r("김규빈", null, null, 1, { gender: "M" }),
      r("이서연", null, null, 2, { gender: "F" }),
      r("박준", null, null, 3, { gender: "M" }),
    ]);
  });

  it("엑셀에서 성별 열이 줄로 쪼개져 오면 바로 윗줄 학생에게 붙인다", () => {
    expect(parseRoster("김규빈\n남\n이서연\n여", true)).toEqual([
      r("김규빈", null, null, null, { gender: "M" }),
      r("이서연", null, null, null, { gender: "F" }),
    ]);
  });

  it("날짜 칸은 버린다: 2015.03.02 / 150302 / 2015-03-02 / 20150302", () => {
    expect(parseRoster("1 홍길동 2015.03.02\n2 김철수 150302\n3 이영희 2015-03-02\n4 박민 20150302", true)).toEqual([
      r("홍길동", null, null, 1),
      r("김철수", null, null, 2),
      r("이영희", null, null, 3),
      r("박민", null, null, 4),
    ]);
  });

  it("1. / 1) / ① 은 번호다", () => {
    expect(parseRoster("1. 홍길동\n2) 김철수\n③ 이영희", true)).toEqual([
      r("홍길동", null, null, 1),
      r("김철수", null, null, 2),
      r("이영희", null, null, 3),
    ]);
  });

  it("이름 없이 번호만이면 '5번'으로 받는다(번호만 명단)", () => {
    expect(parseRoster("5\n6 5 1\n7", true)).toEqual([
      r("5번", null, null, 5, { nameless: true }),
      r("1번", 6, 5, 1, { nameless: true }),
      r("7번", null, null, 7, { nameless: true }),
    ]);
  });

  it("단위가 일부만 있으면 남은 숫자는 이름 쪽부터 번호→반→학년으로 채운다", () => {
    expect(parseRoster("2반 15 홍길동", true)).toEqual([r("홍길동", null, 2, 15)]);
    expect(parseRoster("3학년 2 15 홍길동", true)).toEqual([r("홍길동", 3, 2, 15)]);
  });

  it("점수·RP 열이 딸려 와도 학번으로 오해하지 않는다(학년·반·번호가 전부 1 이상일 때만 학번)", () => {
    expect(parseRoster("1 홍길동 1000\n홍길동 1200\n2 김철수 100", true)).toEqual([
      r("홍길동", null, null, 1),
      r("홍길동", null, null, null),
      r("김철수", null, null, 2),
    ]);
  });

  it("이름 뒤에 붙은 한두 자리 숫자는 번호다", () => {
    expect(parseRoster("홍길동 25", true)).toEqual([r("홍길동", null, null, 25)]);
  });

  it("성별 글자로 시작하는 이름은 이름이다", () => {
    expect(parseRoster("남궁민\n여진구\n15 남궁민 남", true)).toEqual([
      r("남궁민", null, null, null),
      r("여진구", null, null, null),
      r("남궁민", null, null, 15, { gender: "M" }),
    ]);
  });

  it("성별이 없는 줄엔 gender 키를 만들지 않는다(다시 붙여넣어도 기존 성별을 지우지 않게)", () => {
    const [row] = parseRoster("15 홍길동", true);
    expect("gender" in row).toBe(false);
  });
});

describe("parseRosterDetailed — 줄 단위", () => {
  it("나이스 명렬표 통째(머리글 + 학번 열)", () => {
    const { rows, skipped } = parseRosterDetailed("학번\t성명\t성별\t생년월일\n51201\t홍길동\t남\t2015.03.02\n51202\t김영희\t여\t2015.05.11", true);
    expect(rows).toEqual([
      r("홍길동", 5, 12, 1, { gender: "M" }),
      r("김영희", 5, 12, 2, { gender: "F" }),
    ]);
    expect(skipped).toEqual([{ line: "학번\t성명\t성별\t생년월일", reason: "header" }]);
  });

  it("붙일 학생이 없는 성별 줄, 날짜만 있는 줄은 건너뛰고 알려 준다", () => {
    const { rows, skipped } = parseRosterDetailed("남\n홍길동\n남\n여\n2015.03.02", true);
    expect(rows).toEqual([r("홍길동", null, null, null, { gender: "M" })]);
    expect(skipped.map((s) => s.line)).toEqual(["남", "여", "2015.03.02"]);
  });
});
