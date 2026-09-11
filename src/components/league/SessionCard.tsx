import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClipboardCheck, ListOrdered } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import { classKeyOf, classLabel, type ScheduledMatch } from "@/lib/league-types";
import { useQueueRows } from "@/lib/use-queue-rows";
import { SessionRoster } from "./SessionRoster";
import { MatchQueue } from "./MatchQueue";

/**
 * 오늘 수업 — 출석과 대진을 한 카드의 두 단계로 묶는다.
 *
 * 둘은 나란한 기능이 아니라 한 줄기다. 출석의 유일한 쓸모가 "이 명단에서만 대진을 뽑는다"는
 * 것이고, 대진은 명단 없이는 시작조차 못 한다. 카드를 따로 세워 두면 처음 보는 사람에게는
 * 서로 무관한 기능 둘로 보이므로, 껍데기를 하나로 합치고 안에서 1단계·2단계로 나눈다.
 *
 * 카드 제목이 곧 세션의 신원(어느 반, 몇 명, 무슨 종목)이다. 그래서 접힌 출석이 따로
 * 요약을 들고 있을 필요가 없다 — 그 문장은 여기로 올라왔다.
 */
export function SessionCard({
  canManage,
  onRecordRow,
}: {
  canManage: boolean;
  onRecordRow: (row: ScheduledMatch) => void;
}) {
  const { students, assignmentSession, matches } = useLeagueStore();
  const { queue, myTurn } = useQueueRows();
  // 명단 펼침. 세션이 없으면 접을 것이 없다 — 명단을 정하는 것이 지금 할 일이다.
  const [rosterOpen, setRosterOpen] = useState(false);

  const present = assignmentSession?.player_ids ?? [];
  const hasSession = !!assignmentSession && present.length > 0;

  // 지금 세션이 어느 반으로 돌아가는지. 반 정보가 없는 명단이면 붙일 이름이 없다.
  const sessionText = (() => {
    const keys = new Set<string>();
    for (const id of present) {
      const s = students.find((x) => x.id === id);
      if (s) keys.add(classKeyOf(s));
    }
    const list = Array.from(keys).sort();
    if (list.length === 1 && list[0] === "") return "";
    return list.map(classLabel).join(", ");
  })();

  /**
   * 세션이 시작된 뒤 아직 한 판도 못 뛴 참석자 수.
   * 출석 명단은 지금 이 세션에만 있다(리그당 1행, 이력 없음) — 그래서 이 물음에 답할 수 있는
   * 자리는 여기뿐이다. 하이라이트는 지난 날짜도 여니 경기 기록만 다룬다.
   */
  const idleCount = (() => {
    if (!hasSession) return 0;
    const from = new Date(assignmentSession!.started_at).getTime();
    const played = new Set<string>();
    for (const m of matches ?? []) {
      if (new Date(m.date).getTime() < from) continue;
      for (const pid of [m.playerAId, m.playerBId, m.playerA2Id, m.playerB2Id])
        if (pid) played.add(pid);
    }
    return present.filter((id) => !played.has(id)).length;
  })();

  // 관리자가 아니면 고칠 수 있는 것이 대기열뿐이다 → 카드가 곧 대기열이고 단계도 하나다.
  if (!canManage) {
    return (
      <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
            <ListOrdered className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-tight text-foreground">
              대기열 ({queue.length})
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {queue.length === 0
                ? "아직 대기 중인 경기가 없어요."
                : myTurn >= 0
                  ? `내 차례 ${myTurn + 1}번째예요.`
                  : "위에서부터 코트에 들어갑니다."}
            </p>
          </div>
        </div>
        <MatchQueue canManage={false} onRecordRow={onRecordRow} />
      </Card>
    );
  }

  return (
    <Card className="border border-border/40 bg-card/50 p-5 shadow-lg backdrop-blur">
      {/* 제목이 곧 정체다 — 이 카드는 대기열이다. 어느 반 몇 명인지는 부제로 내린다.
          종목과 대기 경기 수는 바로 아래 목록에서 눈으로 보이니 적지 않는다. */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
          <ListOrdered className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-foreground">대기열</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {hasSession
              ? `${sessionText ? `${sessionText} · ` : ""}참석 ${present.length}명${idleCount > 0 ? ` (미출전 ${idleCount})` : ""}`
              : "출석을 정하면 그 명단으로 대진을 뽑아요."}
          </p>
        </div>
        {/* 명단은 수업당 한 번 정한다. 지각·조퇴나 반 교체는 여기서 다시 연다. */}
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-black transition-all",
            hasSession
              ? "border-border/40 text-muted-foreground hover:text-foreground"
              : "border-neon-green/50 bg-neon-green/15 text-neon-green hover:bg-neon-green/25",
          )}
        >
          <ClipboardCheck className="size-3.5" />
          {hasSession ? "명단 바꾸기" : "출석 정하기"}
        </button>
      </div>

      <SessionRoster open={rosterOpen} onOpenChange={setRosterOpen} />

      <MatchQueue canManage onRecordRow={onRecordRow} />
    </Card>
  );
}
