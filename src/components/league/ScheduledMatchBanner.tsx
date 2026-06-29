import { useMemo, useState } from "react";
import { BellRing, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import type { Student } from "@/lib/league-types";

const dn = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;

// 내가 배정된 '호출된' 대진이 있으면 상단에 입장 배너를 띄운다.
export function ScheduledMatchBanner() {
  const { scheduledMatches, myPlayerId, students } = useLeagueStore();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const mine = useMemo(() => {
    if (!myPlayerId) return [];
    return scheduledMatches.filter(
      (m) =>
        m.status === "called" &&
        !dismissed.includes(m.id) &&
        [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id].includes(myPlayerId)
    );
  }, [scheduledMatches, myPlayerId, dismissed]);

  if (mine.length === 0) return null;

  const teamLabel = (ids: (string | null)[]) =>
    ids.filter(Boolean).map((id) => { const s = byId.get(id as string); return s ? dn(s) : "?"; }).join("·");

  return (
    <div className="mb-4 space-y-2">
      {mine.map((m) => {
        const myTeamIds = [m.player_a_id, m.player_a2_id].includes(myPlayerId)
          ? [m.player_b_id, m.player_b2_id]
          : [m.player_a_id, m.player_a2_id];
        const opponent = teamLabel(myTeamIds);
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-2xl border border-neon-green/40 bg-neon-green/10 px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-2"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neon-green/20 text-neon-green">
              <BellRing className="size-5 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">경기에 배정되었습니다 — 입장하세요!</p>
              <p className="truncate text-[11px] text-muted-foreground">
                상대: <span className="font-bold text-foreground">{opponent || "상대"}</span>
                {m.court ? ` · ${m.court}` : ""} · {m.match_type === "double" ? "복식" : "단식"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissed((p) => [...p, m.id])}
              className="shrink-0 rounded-lg bg-neon-green px-3 py-1.5 text-xs font-black text-white transition-all hover:bg-neon-green/90 active:scale-95"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => setDismissed((p) => [...p, m.id])}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="닫기"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
