import { createFileRoute } from "@tanstack/react-router";
import { RankingEntry } from "@/features/classroom/RankingEntry";

// 무인증 공개 화면. 로그인 없이 열 수 있는 공유용 링크로, club/school 모두 쓴다.
// 개인 상세는 제공하지 않으며 본명(name)도 노출하지 않는다.
//
// 학교 리그는 교실 화면(대기열 + 등급 묶음)으로, 동호회는 기존 순위표로 간다.
// 어느 쪽인지는 RankingEntry 가 리그를 읽어 정한다.
export const Route = createFileRoute("/ranking/$classId")({
  head: () => ({
    meta: [
      { title: "리그 순위표" },
      { name: "description", content: "로그인 없이 볼 수 있는 리그 공개 순위표." },
      // 명단이 검색엔진에 색인되지 않도록 막는다(링크를 받은 사람만 보는 화면).
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => {
    const { classId } = Route.useParams();
    return <RankingEntry classId={classId} />;
  },
});
