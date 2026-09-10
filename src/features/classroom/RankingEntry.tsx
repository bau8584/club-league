import { useEffect, useState } from "react";
import { apiFetchLeaguePublic } from "@/services/league-api";
import { PublicRanking } from "@/features/leaderboard/PublicRanking";
import { ClassroomView } from "./ClassroomView";

/**
 * 공개 화면의 갈림길.
 *
 * 학교 리그는 교실 화면(대기열 + 등급 묶음)으로, 동호회는 지금까지의 순위표 그대로.
 * 동호회에는 학년·반이 없어 "어느 반이에요?"라는 물음 자체가 성립하지 않고, 리그 하나가
 * 곧 모임 하나라 500명을 좁힐 이유도 없다.
 */
export function RankingEntry({ classId, ownerId }: { classId: string; ownerId?: string }) {
  const [type, setType] = useState<"club" | "school" | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetchLeaguePublic(classId).then(({ data }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : data;
      setType(row?.league_type === "school" ? "school" : "club");
    });
    return () => { alive = false; };
  }, [classId]);

  if (type === null) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-5">
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    );
  }
  if (type === "club") return <PublicRanking classId={classId} />;
  return <ClassroomView classId={classId} ownerId={ownerId ?? null} />;
}
