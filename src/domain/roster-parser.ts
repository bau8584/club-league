/**
 * 명단 붙여넣기 파서 — 순수 함수. UI(AdminStudentManage)에서 떼어 테스트가 붙게 했다.
 *
 * 학교 명단은 "한 줄을 칸으로 나눈 뒤 칸마다 정체를 판별"한다. 실제로 들어온 형식이
 * 아홉 가지였고(docs/PLAN-post-launch.md 3-2), 띄어쓰기가 정확할 때만 읽던 옛 파서는
 * 그중 셋만 읽었다. 칸의 정체는 아래 순서로 정한다.
 *
 *   단위 붙은 숫자(3학년·2반·15번) → 그 뜻 그대로
 *   날짜(2015.03.02 / 150302 / 20150302) → 버림
 *   성별(남/여/남자/여자/M/F) → 성별
 *   1. 1) ① → 번호
 *   숫자+이름이 붙은 칸(20전진형 · 619최건희) → 숫자를 떼어 번호 또는 학번
 *   맨숫자 3~5자리 → 학번(첫 자리 학년, 끝 두 자리 번호, 가운데 반)
 *   맨숫자 1~2자리 → 위치로: 이름 쪽부터 번호 → 반 → 학년
 *   나머지 글자 → 이름(여럿이면 공백으로 이어 붙임 — 외국 이름)
 *
 * 줄 단위 규칙: 머리글 줄(번호 이름 성별 …)은 건너뛰고, 성별만 있는 줄은 바로 윗줄에
 * 붙이고(엑셀 세로 복사), 숫자만 있는 줄은 "5번"이라는 이름으로 받는다(번호만 명단).
 *
 * 옛 파서가 읽던 입력의 결과는 그대로다 — roster-parser.test.ts 의 "기존 동작 고정".
 */
import type { Gender } from "@/lib/league-types";

// 한 줄 = 한 명. 칸은 탭/콤마(그리고 school 모드에선 공백)로 구분.
//   club  : 1칸 → 닉네임 / 2칸 → 레벨, 닉네임
//   school: 위 주석의 규칙
export type ParsedRow = {
  nickname: string;
  group: string | null;
  grade: number | null;
  classNum: number | null;
  studentNo: number | null;
  /** 성별 칸이 있을 때만 붙는다. 없으면 키 자체가 없다 — 다시 붙여넣어도 기존 성별을 지우지 않게. */
  gender?: Gender;
  /** 이름 없이 번호만 있던 줄. 이름은 "5번"으로 채워져 있다. */
  nameless?: true;
};

export type ParseResult = {
  rows: ParsedRow[];
  /** 건너뛴 줄. 미리보기에서 "머리글 1줄 건너뜀"처럼 보여 준다. */
  skipped: { line: string; reason: "header" | "unreadable" }[];
};

export function parseRoster(text: string, isSchool = false): ParsedRow[] {
  return parseRosterDetailed(text, isSchool).rows;
}

export function parseRosterDetailed(text: string, isSchool = false): ParseResult {
  const rows: ParsedRow[] = [];
  const skipped: ParseResult["skipped"] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isSchool) {
      const parsed = parseSchoolLine(line);
      if (parsed.kind === "row") rows.push(parsed.row);
      else if (parsed.kind === "gender") {
        // 엑셀에서 성별 열만 따로 줄로 쪼개진 경우. 바로 윗줄 학생에게 붙인다.
        const prev = rows[rows.length - 1];
        if (prev && prev.gender === undefined) prev.gender = parsed.gender;
        else skipped.push({ line, reason: "unreadable" });
      } else skipped.push({ line, reason: parsed.kind });
      continue;
    }
    const cells = line.split(/[\t,]/).map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    let nickname = "";
    let group: string | null = null;
    if (cells.length === 1) {
      nickname = cells[0];
    } else {
      group = cells[0];
      nickname = cells[1];
    }
    if (!nickname) continue;
    rows.push({ nickname, group: group || null, grade: null, classNum: null, studentNo: null });
  }
  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// 학교 명단 한 줄

type SchoolLine =
  | { kind: "row"; row: ParsedRow }
  | { kind: "gender"; gender: Gender }
  | { kind: "header" }
  | { kind: "unreadable" };

/** 머리글로 쓰이는 낱말. 줄의 글자 칸이 전부 이것뿐이면 머리글 줄이다. */
const HEADER_WORDS = new Set([
  "번호", "번", "연번", "순번", "no", "no.", "num", "#",
  "이름", "성명", "name", "학생명", "학생",
  "성별", "gender", "sex",
  "학년", "반", "학급", "학번", "grade", "class",
  "생년월일", "생일", "birth", "birthday",
  "비고", "메모", "note", "remark",
]);

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function detectGender(cell: string): Gender | null {
  const t = cell.toLowerCase();
  if (t === "남" || t === "남자" || t === "m" || t === "male") return "M";
  if (t === "여" || t === "여자" || t === "f" || t === "female") return "F";
  return null;
}

function isDate(cell: string): boolean {
  // 2015.03.02 / 2015-03-02 / 2015/03/02 / 2015.03.02. / 150302 / 20150302
  return /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\.?$/.test(cell) || /^\d{6}$/.test(cell) || /^\d{8}$/.test(cell);
}

/**
 * 나이스 학번(3~5자리)을 학년/반/번호로 나눈다. 첫 자리 학년, 끝 두 자리 번호가 원칙이고
 * 세 자리는 한 자리씩(619 → 6학년 1반 9번). 네 자리는 반 한 자리 + 번호 두 자리를 먼저 보고
 * (6110 → 6-1-10), 번호가 0이면 반 두 자리 + 번호 한 자리로 본다(6110 은 6-11-0 이 아니다).
 */
function splitStudentId(digits: string): { grade: number; classNum: number; studentNo: number } | null {
  const n = digits.length;
  if (n < 3 || n > 5) return null;
  const grade = Number(digits[0]);
  if (n === 3) return { grade, classNum: Number(digits[1]), studentNo: Number(digits[2]) };
  if (n === 4) {
    const a = { grade, classNum: Number(digits[1]), studentNo: Number(digits.slice(2)) };
    if (a.studentNo >= 1) return a;
    return { grade, classNum: Number(digits.slice(1, 3)), studentNo: Number(digits[3]) };
  }
  return { grade, classNum: Number(digits.slice(1, 3)), studentNo: Number(digits.slice(3)) };
}

/** "5학년12반" 처럼 단위가 연달아 붙은 칸을 "5학년" "12반" 으로 벌린다. 뒤에 글자가 남으면 그것도 한 칸. */
function splitUnits(cell: string): string[] {
  const out: string[] = [];
  let rest = cell;
  for (;;) {
    const m = rest.match(/^(\d+)(학년|반|번)/);
    if (!m) break;
    out.push(m[0]);
    rest = rest.slice(m[0].length);
  }
  if (out.length === 0) return [cell];
  if (rest) out.push(rest);
  return out;
}

function parseSchoolLine(line: string): SchoolLine {
  const cells = line
    .split(/[\t,\s]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap(splitUnits);

  let grade: number | null = null, classNum: number | null = null, studentNo: number | null = null;
  let gender: Gender | undefined;
  /** 단위 없는 1~2자리 숫자. 위치로 뜻을 정하므로 모아 뒀다가 마지막에 배분한다. */
  const bare: number[] = [];
  const words: string[] = [];
  let sawId = false;

  const takeId = (digits: string) => {
    const id = splitStudentId(digits);
    if (!id) return false;
    grade = grade ?? id.grade;
    classNum = classNum ?? id.classNum;
    studentNo = studentNo ?? id.studentNo;
    sawId = true;
    return true;
  };

  for (const cell of cells) {
    let m: RegExpMatchArray | null;
    if ((m = cell.match(/^(\d+)(학년|반|번)$/))) {
      const v = Number(m[1]);
      if (m[2] === "학년") grade = v;
      else if (m[2] === "반") classNum = v;
      else studentNo = v;
      continue;
    }
    if (isDate(cell)) continue;
    const g = detectGender(cell);
    if (g) { gender = g; continue; }
    // 1. / 1) / ①
    if ((m = cell.match(/^(\d{1,2})[.)]$/))) { bare.push(Number(m[1])); continue; }
    if (cell.length === 1 && CIRCLED.includes(cell)) { bare.push(CIRCLED.indexOf(cell) + 1); continue; }
    if (/^\d+$/.test(cell)) {
      if (cell.length <= 2) bare.push(Number(cell));
      else if (!takeId(cell)) { /* 6자리 이상은 날짜/학적번호 — 버린다 */ }
      continue;
    }
    // 숫자+이름이 붙은 칸: 20전진형 / 619최건희. 숫자 뒤가 글자로 시작해야 한다.
    if ((m = cell.match(/^(\d{1,5})([^\d\s.)].*)$/))) {
      const digits = m[1];
      if (digits.length <= 2) bare.push(Number(digits));
      else takeId(digits);
      words.push(m[2]);
      continue;
    }
    words.push(cell);
  }

  const nameWords = words.filter((w) => !HEADER_WORDS.has(w.toLowerCase()));
  if (words.length > 0 && nameWords.length === 0 && bare.length === 0 && !sawId && gender === undefined) {
    return { kind: "header" };
  }
  if (words.length === 0 && bare.length === 0 && !sawId && grade === null && classNum === null && studentNo === null) {
    return gender ? { kind: "gender", gender } : { kind: "unreadable" };
  }

  // 단위 없는 숫자를 위치로 배분한다.
  if (grade === null && classNum === null && studentNo === null && !sawId) {
    // 단위가 하나도 없을 때: 3 2 15 → 학년·반·번호 / 2 15 → 반·번호 / 15 → 번호 (옛 규칙 그대로)
    if (bare.length >= 3) { grade = bare[0]; classNum = bare[1]; studentNo = bare[2]; }
    else if (bare.length === 2) { classNum = bare[0]; studentNo = bare[1]; }
    else if (bare.length === 1) { studentNo = bare[0]; }
  } else {
    // 단위가 섞였으면 남은 숫자를 이름에 가까운 쪽부터 번호 → 반 → 학년 순으로 비어 있는 축에.
    for (const v of bare.slice().reverse()) {
      if (studentNo === null) studentNo = v;
      else if (classNum === null) classNum = v;
      else if (grade === null) grade = v;
    }
  }

  const name = nameWords.join(" ").trim();
  if (name) {
    const row: ParsedRow = { nickname: name, group: null, grade, classNum, studentNo };
    if (gender) row.gender = gender;
    return { kind: "row", row };
  }
  // 이름 없이 번호만: "5번"으로 받는다. 번호조차 없으면 읽을 수 없는 줄.
  if (studentNo !== null) {
    const row: ParsedRow = { nickname: `${studentNo}번`, group: null, grade, classNum, studentNo, nameless: true };
    if (gender) row.gender = gender;
    return { kind: "row", row };
  }
  return { kind: "unreadable" };
}
