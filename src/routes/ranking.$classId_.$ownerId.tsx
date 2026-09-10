import { createFileRoute } from "@tanstack/react-router";
import { RankingEntry } from "@/features/classroom/RankingEntry";

/**
 * 교실 화면 — 선생님이 만든 주소.
 *
 * 주소가 세션이 아니라 소유자를 가리킨다. 세션을 가리키면 수업마다 주소가 바뀌어 태블릿을
 * 매번 다시 연결해야 하지만, 소유자를 가리키면 한 번 띄워두고 그 선생님이 지금 돌리는
 * 수업을 계속 따라간다. 한 번 설정하고 잊는 물건이 된다.
 *
 * 파일 이름의 `$classId_` 뒤 밑줄은 "이 화면을 /ranking/$classId 안에 끼워 넣지 말라"는
 * 표시다. 밑줄이 없으면 부모가 자기 화면을 그리고 이 화면은 영영 나오지 않는다 — 주소에
 * 선생님이 들어 있어도 화면은 그 값을 못 받아, 조용히 소유자 없는 화면이 된다.
 */
export const Route = createFileRoute("/ranking/$classId_/$ownerId")({
  head: () => ({
    meta: [
      { title: "교실 화면" },
      { name: "description", content: "로그인 없이 볼 수 있는 대기열과 등급." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => {
    const { classId, ownerId } = Route.useParams();
    return <RankingEntry classId={classId} ownerId={ownerId} />;
  },
});
