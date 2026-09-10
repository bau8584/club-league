import { useEffect, useMemo, useRef } from "react";
import { useLeagueStore } from "@/lib/league-store";
import { sessionClassKeys, soleClassScope, type ClassScope } from "@/domain/session-scope";

export type SessionScope = {
  /** 지금 수업 중인 세션의 id. 바뀌면 새 수업이다 — 필터를 다시 끌어올 신호로 쓴다. */
  sessionId: string | null;
  /** 세션이 돌고 있는 반들("5-4"). 학년 대전이면 여럿. */
  classKeys: string[];
  /** 반이 하나일 때만 채워진다. 필터 기본값으로 쓸 수 있는 형태. */
  scope: ClassScope | null;
};

/**
 * 수업 중인 반을 화면들이 함께 읽는 창구.
 *
 * 경기 결과 입력·랭킹·하이라이트가 이 값을 필터 **기본값**으로 쓴다. 잠그지는 않는다 —
 * 교사가 다른 반을 보러 가면 그대로 두고, 다시 끌어오는 건 `sessionId`가 바뀔 때뿐이다.
 * (반이 바뀌면 새 세션이 열리므로 "반이 바뀌면 새 수업"이라는 기존 규칙과 맞물린다.)
 *
 * 세션은 교사 계정으로만 열린다(`sessionOwnerId`가 학교 리그에서 자기 uid를 쓴다).
 * 학생 계정에는 세션이 없으므로 이 훅은 조용히 빈 값을 돌려준다 — 학생 화면이나
 * 공개 순위표가 남의 반으로 끌려갈 일이 구조적으로 없다.
 */
export function useSessionScope(): SessionScope {
  const { assignmentSession, students } = useLeagueStore();
  const playerIds = assignmentSession?.player_ids;
  return useMemo(() => {
    if (!assignmentSession || !playerIds || playerIds.length === 0) {
      return { sessionId: null, classKeys: [], scope: null };
    }
    const classKeys = sessionClassKeys(playerIds, students);
    return { sessionId: assignmentSession.id, classKeys, scope: soleClassScope(classKeys) };
  }, [assignmentSession, playerIds, students]);
}

/**
 * 이미 씨앗을 뿌린 화면·세션 조합. **모듈 수준**에 둔다.
 *
 * 컴포넌트 안의 ref로 두면 탭을 옮길 때 화면이 언마운트되면서 기억이 지워져, 돌아올
 * 때마다 필터가 다시 수업 반으로 끌려간다. 교사가 "전체"로 바꿔 놓고 하이라이트를
 * 보고 오면 순위표가 도로 우리 반으로 돌아가 있는 식이다. 규칙은 "새 수업일 때만
 * 이긴다"이지 "화면을 열 때마다 이긴다"가 아니다.
 *
 * 새로고침하면 지워진다 — 그건 맞는 동작이다. 앱을 새로 연 것은 새 시작이다.
 */
const seededScreens = new Set<string>();

/**
 * 수업이 시작되면 그 반을 필터 기본값으로 한 번 끌어온다.
 *
 * `screen`은 화면마다 다른 이름을 준다(같은 세션이라도 순위표와 하이라이트는 각각
 * 한 번씩 받아야 한다). 반이 여럿인 수업(학년 대전)에서는 아무것도 하지 않는다.
 */
export function useSeedFromSession(
  screen: string,
  /**
   * 화면이 이 값을 받을 준비가 됐는가. **반드시 넘겨야 한다.**
   *
   * 준비되지 않았을 때 그냥 건너뛰기만 하면 다시 시도할 길이 없다 — 이 효과는
   * 세션이 바뀔 때만 도는데, 세션은 이미 준비돼 있고 바뀌지 않기 때문이다.
   * (세션 쪽 학생 목록은 스토어에서 오고 화면의 명단은 props 로 와서, 준비 시점이
   * 어긋날 수 있다. 그때 한 번 놓치면 그 수업 내내 필터가 옛 반에 머문다.)
   * 그래서 준비 여부를 의존성에 넣어, 준비되는 순간 다시 돌게 한다.
   */
  ready: boolean,
  apply: (scope: ClassScope) => void,
): void {
  const { sessionId, classKeys, scope } = useSessionScope();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  // 세션 행은 반을 바꿔도 그대로 재사용된다(apiUpsertAssignmentSession 이 같은 행을
  // 덮어쓴다). 그래서 id 만 보면 [명단 바꾸기]로 5-8 → 5-10 으로 옮겨도 "같은 수업"이
  // 되어 필터가 따라오지 않았다. 새로고침해야만 바뀌던 것이 이 때문이다.
  //
  // 무엇이 바뀌면 새 수업인가는 이미 정해져 있다 — **반 구성**이다(SessionRoster 의
  // classesChanged 도 같은 기준을 쓴다). 몇 명이 빠지는 건 지각·조퇴이므로 필터를
  // 건드리지 않아야 한다. 그래서 참석자 명단이 아니라 반 목록을 열쇠에 넣는다.
  const classSig = classKeys.join(",");
  useEffect(() => {
    if (!ready || !sessionId || !scope) return;
    const key = `${screen}:${sessionId}:${classSig}`;
    if (seededScreens.has(key)) return;
    seededScreens.add(key);
    applyRef.current(scope);
  }, [screen, ready, sessionId, classSig, scope]);
}
