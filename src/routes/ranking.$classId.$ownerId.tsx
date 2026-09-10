import { createFileRoute } from "@tanstack/react-router";
import { RankingEntry } from "@/features/classroom/RankingEntry";

/**
 * 교실 화면 — 선생님이 만든 주소.
 *
 * 주소가 세션이 아니라 소유자를 가리킨다. 세션을 가리키면 수업마다 주소가 바뀌어 태블릿을
 * 매번 다시 연결해야 하지만, 소유자를 가리키면 한 번 띄워두고 그 선생님이 지금 돌리는
 * 수업을 계속 따라간다. 한 번 설정하고 잊는 물건이 된다.
 */
export const Route = createFileRoute("/ranking/$classId/$ownerId")({
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
