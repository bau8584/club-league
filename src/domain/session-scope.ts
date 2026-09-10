import { classKeyOf, type Student } from "@/lib/league-types";

/**
 * 수업 중인 반 — 세션이 지금 어느 반으로 돌아가고 있는가.
 *
 * 세션 행에는 반이 없다(`AssignmentSession`은 `player_ids`만 든다). 그래서 참석자에서
 * 역산한다. 반이 바뀌면 그것이 곧 새 수업이므로, 이 값이 곧 "지금 수업"의 이름이다.
 *
 * 이 계산은 원래 SessionRoster 안에만 있었다. 경기 결과 입력·랭킹·하이라이트가 같은
 * 답을 필요로 하므로 밖으로 뺀다 — 같은 질문에 화면마다 다른 답이 나오면 안 된다.
 */
export function sessionClassKeys(playerIds: string[], students: Student[]): string[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const set = new Set<string>();
  for (const id of playerIds) {
    const s = byId.get(id);
    if (s) set.add(classKeyOf(s));
  }
  return Array.from(set).sort();
}

export type ClassScope = { grade: number | null; classNum: number | null };

/**
 * 반이 **하나일 때만** 그 반을 돌려준다. 여러 반이면 `null`.
 *
 * 학년 대전처럼 여러 반을 섞은 세션에서 "학년만" 걸어 주는 절충안은 쓰지 않는다.
 * 고른 적 없는 옆 반이 섞여 나오면 필터가 거짓말을 하는 셈이고, 왜 그런지 화면에
 * 설명할 자리도 없다. 애매하면 아무것도 하지 않는 편이 낫다.
 *
 * 반이 하나라도 축이 다 있으리란 보장은 없다("5학년"만 있고 반이 없는 명단 등).
 * 있는 축만 채우고 없는 축은 `null`로 둔다.
 */
export function soleClassScope(keys: string[]): ClassScope | null {
  if (keys.length !== 1) return null;
  const key = keys[0]!;
  if (key === "") return null;
  const [g, c] = key.split("-");
  const grade = g ? Number(g) : NaN;
  const classNum = c ? Number(c) : NaN;
  const scope: ClassScope = {
    grade: Number.isFinite(grade) ? grade : null,
    classNum: Number.isFinite(classNum) ? classNum : null,
  };
  return scope.grade == null && scope.classNum == null ? null : scope;
}
