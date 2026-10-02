import { createFileRoute } from "@tanstack/react-router";
import { ScoreInputView } from "@/features/classroom/ScoreInputView";

// 점수입력판 — 교사가 연 QR(열쇠 링크)로 학생이 로그인 없이 결과를 넣는다. /input?k=열쇠
// 열쇠는 그날만, 교사가 닫거나 새로 만들면 바로 무효. 공개 순위표(/ranking)와는 다른 링크다.
export const Route = createFileRoute("/input")({
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s.k === "string" ? s.k : "" }),
  head: () => ({
    meta: [
      { title: "점수입력판" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => {
    const { k } = Route.useSearch();
    return <ScoreInputView inputKey={k} />;
  },
});
