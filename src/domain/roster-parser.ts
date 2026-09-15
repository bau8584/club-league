/**
 * 명단 붙여넣기 파서 — 순수 함수. UI(AdminStudentManage)에서 떼어 테스트가 붙게 했다.
 *
 * 이 파일의 첫 커밋은 기존 parseRoster 를 글자 그대로 옮긴 것이다. 지금 되는 입력은
 * 결과가 그대로여야 하므로(docs/PLAN-post-launch.md 0번), 그 동작을 roster-parser.test.ts 에
 * 먼저 고정하고 나서 새 파서를 얹는다.
 */
import type { Gender } from "@/lib/league-types";

// 한 줄 = 한 명. 칸은 탭/콤마(그리고 school 모드에선 공백)로 구분.
//   club  : 1칸 → 닉네임 / 2칸 → 레벨, 닉네임
//   school: "3 2 15 홍길동" 또는 "3학년 2반 15번 홍길동" → 학년/반/번호/이름
export type ParsedRow = {
  nickname: string;
  group: string | null;
  grade: number | null;
  classNum: number | null;
  studentNo: number | null;
  gender?: Gender;
};

export function parseRoster(text: string, isSchool = false): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isSchool) {
      // 앞쪽 숫자 칸으로 학년/반/번호를 읽는다.
      //   단위(학년·반·번)가 붙어 있으면 그 뜻을 그대로 따르고,
      //   단위가 전혀 없으면 "번호가 이름 바로 앞"이라는 관례로 오른쪽부터 채운다.
      //   3 2 15 홍길동 → 학년·반·번호 / 2 15 홍길동 → 반·번호 / 15 홍길동 → 번호
      //   단위가 없는 두 숫자는 "3학년 2반 홍길동"처럼 번호 없는 명단과 구별할 수
      //   없으므로, 그런 명단은 단위를 붙여야 정확히 인식된다.
      const cells = line.split(/[\t,\s]+/).map((c) => c.trim()).filter(Boolean);
      let grade: number | null = null, classNum: number | null = null, studentNo: number | null = null;
      const bare: number[] = [];
      let i = 0;
      for (; i < cells.length; i++) {
        const m = cells[i].match(/^(\d+)(학년|반|번)?$/);
        if (!m) break;
        const v = Number(m[1]);
        if (m[2] === "학년") grade = v;
        else if (m[2] === "반") classNum = v;
        else if (m[2] === "번") studentNo = v;
        else bare.push(v);
      }
      const name = cells.slice(i).join(" ").trim();
      if (!name) continue;
      if (grade === null && classNum === null && studentNo === null) {
        // 단위가 하나도 없을 때만 위치로 판단한다(오른쪽 = 번호).
        if (bare.length >= 3) { grade = bare[0]; classNum = bare[1]; studentNo = bare[2]; }
        else if (bare.length === 2) { classNum = bare[0]; studentNo = bare[1]; }
        else if (bare.length === 1) { studentNo = bare[0]; }
      } else {
        // 단위가 섞여 있으면 남은 숫자를 비어 있는 축에 학년→반→번호 순으로 채운다.
        for (const v of bare) {
          if (grade === null) grade = v;
          else if (classNum === null) classNum = v;
          else if (studentNo === null) studentNo = v;
        }
      }
      out.push({ nickname: name, group: null, grade, classNum, studentNo });
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
    out.push({ nickname, group: group || null, grade: null, classNum: null, studentNo: null });
  }
  return out;
}
