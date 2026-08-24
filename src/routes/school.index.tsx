import { createFileRoute } from "@tanstack/react-router";
import { Lobby } from "../components/Lobby";

// 학교용 입구(랜딩/로비). club용 로비(/)와 같은 컴포넌트를 공유하되 schoolMode로
// 문구를 학교 대상으로 바꾸고, 새 리그 개설 시 '학교 리그'를 기본 선택한다.
export const Route = createFileRoute("/school/")({
  head: () => ({
    meta: [
      { title: "학교 스포츠 리그 로비" },
      { name: "description", content: "학급·학교 리그를 선택하거나 새 학기 리그전을 개설하세요." },
    ],
  }),
  component: () => <Lobby schoolMode />,
});
