import { createFileRoute } from "@tanstack/react-router";
import { Lobby } from "../components/Lobby";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "스포츠 리그 로비" },
      { name: "description", content: "리그(리그)를 선택하거나 새 학기 새로운 리그전을 창설하세요." },
    ],
  }),
  component: LobbyRouteComponent,
});

function LobbyRouteComponent() {
  return <Lobby />;
}
