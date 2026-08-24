import { createFileRoute } from "@tanstack/react-router";
import { LeagueApp } from "./class.$classId";

// school(학교) 리그 전용 라우트. club의 /class/$classId 와 완전히 동일한 컴포넌트 트리를
// 공유하되(LeagueApp), URL만 분리해 club의 기존 운영 링크(/class/$classId)를 보존한다.
// club/school 분기 자체는 리그 데이터의 league_type/settings(matchInputMode 등)로 처리된다.
export const Route = createFileRoute("/school/$classId")({
  head: () => ({
    meta: [
      { title: "학교 스포츠 리그 · 티어 시스템" },
      { name: "description", content: "학교 스포츠 리그 & 티어 랭킹 시스템." },
    ],
  }),
  component: () => {
    const { classId } = Route.useParams();
    return <LeagueApp classId={classId} />;
  },
});
