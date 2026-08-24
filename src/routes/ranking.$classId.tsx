import { createFileRoute } from "@tanstack/react-router";
import { PublicRanking } from "@/features/leaderboard/PublicRanking";

// 무인증 공개 순위표(B안). 로그인 없이 열 수 있는 공유용 링크로, club/school 모두 쓴다.
// 개인 상세는 제공하지 않으며 본명(name)도 노출하지 않는다.
export const Route = createFileRoute("/ranking/$classId")({
  head: () => ({
    meta: [
      { title: "리그 순위표" },
      { name: "description", content: "로그인 없이 볼 수 있는 리그 공개 순위표." },
    ],
  }),
  component: () => {
    const { classId } = Route.useParams();
    return <PublicRanking classId={classId} />;
  },
});
