import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * 탭을 옮겨도 살아남는 화면 상태.
 *
 * 랭킹·하이라이트는 탭을 벗어나면 언마운트되고, 돌아오면 `useState`의 초기값으로
 * 되돌아간다. 그래서 수업 반으로 맞춰 둔 필터도, 교사가 손으로 고른 "전체"도 똑같이
 * 풀렸다. 수업 반 시딩은 반이 바뀔 때 한 번만 도는 것이 규칙이므로, 돌아올 때마다
 * 다시 채워 주는 것으로는 풀 수 없다 — 그러면 손으로 바꾼 선택을 매번 되돌리게 된다.
 *
 * 그래서 **값 자체를 화면 밖에 둔다.** 시딩이든 손으로 고른 것이든 마지막 값이 남고,
 * 다시 들어오면 그대로 이어진다.
 *
 * 새로고침하면 지워진다. 앱을 새로 연 것은 새 시작이고, 그때는 시딩이 다시 돈다.
 * (경기 결과 입력의 반 필터는 새로고침 너머까지 기억해야 해서 localStorage 를 쓴다 —
 *  이건 그보다 짧은 기억이면 충분한 자리다.)
 */
const store = new Map<string, unknown>();

export function useStickyState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  // useState 와 같은 자리에 끼워 넣는 물건이라 함수형 갱신도 받아야 한다
  // (setGrade(prev => ...) 처럼 쓰는 곳이 이미 있다).
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
