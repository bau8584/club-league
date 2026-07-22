import { useMemo, useState } from "react";
import { BellRing, Swords, X } from "lucide-react";
import { useLeagueStore } from "@/lib/league-store";
import type { Student } from "@/lib/league-types";

const dn = (p: { name: string; nickname?: string | null }) => p.nickname || p.name;

// 내가 배정된 '호출된' 대진(입장) 또는 나에게 온 '도전장'을 화면 중앙에 크게 띄운다.
const DISMISS_KEY = "dismissed-sched";
const RECENT_MS = 3 * 60 * 60 * 1000; // 최근 3시간 내 호출/도전만 배너로 표시

export function ScheduledMatchBanner() {
  const { scheduledMatches, myPlayerId, students, respondChallenge } = useLeagueStore();
  // '확인'한 배너는 새로고침해도 다시 안 뜨도록 localStorage에 보관
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; }
  });
  const [busy, setBusy] = useState(false);

  const dismissId = (id: string) => setDismissed((p) => {
    const next = [...new Set([...p, id])];
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-100))); } catch { /* ignore */ }
    return next;
  });

  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const mine = useMemo(() => {
    if (!myPlayerId) return [];
    const now = Date.now();
    return scheduledMatches.filter((m) => {
      if (dismissed.includes(m.id)) return false;
      // 오래된(3시간 초과) 호출/도전은 자동 무시 — 남은 행이 매번 다시 뜨는 것 방지
      const created = m.created_at ? new Date(m.created_at).getTime() : now;
      if (now - created > RECENT_MS) return false;
      if (m.status === "called") {
        // 예약(player_ids) / 관리자 대진(슬롯) 양쪽에서 내가 참가자인지 확인
        const parts = (m.player_ids?.length
          ? m.player_ids
          : [m.player_a_id, m.player_b_id, m.player_a2_id, m.player_b2_id]).filter(Boolean) as string[];
        return parts.includes(myPlayerId);
      }
      if (m.status === "challenge") {
        // 지목당한 사람(=player_b)에게만 도전장 배너
        return [m.player_b_id, m.player_b2_id].includes(myPlayerId);
      }
      return false;
    });
  }, [scheduledMatches, myPlayerId, dismissed]);

  if (mine.length === 0) return null;

  const teamLabel = (ids: (string | null)[]) =>
    ids.filter(Boolean).map((id) => { const s = byId.get(id as string); return s ? dn(s) : "?"; }).join(" · ");

  const current = mine[0];
  const isChallenge = current.status === "challenge";
  // 예약 호출: 팀 미정(참가자 풀). 관리자 대진/도전장은 A/B 팀 확정.
  const isReservation = !isChallenge && (current.player_ids?.length ?? 0) > 0;
  const reservationOthers = isReservation
    ? teamLabel((current.player_ids || []).filter((id) => id && id !== myPlayerId))
    : "";

  // 입장(called): 상대팀 / 도전장: 도전자(player_a)
  const myTeam = [current.player_a_id, current.player_a2_id].includes(myPlayerId)
    ? [current.player_a_id, current.player_a2_id]
    : [current.player_b_id, current.player_b2_id];
  const otherTeam = [current.player_a_id, current.player_a2_id].includes(myPlayerId)
    ? [current.player_b_id, current.player_b2_id]
    : [current.player_a_id, current.player_a2_id];
  const partner = teamLabel(myTeam.filter((id) => id && id !== myPlayerId));
  const opponent = teamLabel(otherTeam);

  const dismiss = () => dismissId(current.id);
  const respond = async (accept: boolean) => {
    setBusy(true);
    try { await respondChallenge(current.id, accept); }
    finally { setBusy(false); dismiss(); }
  };

  const accent = isChallenge ? "amber" : "neon-green";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className={cnAccent(
        "relative w-full max-w-lg overflow-hidden rounded-3xl border-2 bg-card animate-in zoom-in-95 duration-300",
        isChallenge ? "border-amber-500/60 shadow-[0_0_60px_rgba(245,158,11,0.35)]" : "border-neon-green/60 shadow-[0_0_60px_rgba(16,185,129,0.35)]"
      )}>
        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-transparent to-transparent ${isChallenge ? "via-amber-500" : "via-neon-green"}`} />

        <button type="button" onClick={dismiss} className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground" title="닫기">
          <X className="size-5" />
        </button>

        <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12">
          <div className={`relative mb-5 flex size-20 items-center justify-center rounded-2xl ${isChallenge ? "bg-amber-500/20 text-amber-500" : "bg-neon-green/20 text-neon-green"}`}>
            {isChallenge ? <Swords className="size-10 animate-pulse" /> : <BellRing className="size-10 animate-bounce" />}
            <span className={`absolute -inset-1.5 rounded-2xl border-2 animate-ping opacity-40 ${isChallenge ? "border-amber-500/40" : "border-neon-green/40"}`} />
          </div>

          <p className={`text-[13px] font-black uppercase tracking-[0.25em] ${isChallenge ? "text-amber-500" : "text-neon-green"}`}>
            {isChallenge ? "CHALLENGE" : "MATCH CALL"}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {isChallenge ? "도전장 도착!" : "경기 입장!"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isChallenge ? "당신에게 도전장이 왔습니다. 받아들이시겠습니까?" : "운영진이 대진을 배정했습니다. 코트로 입장하세요."}
          </p>

          <div className="mt-6 w-full space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-5">
            {isReservation ? (
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-lg font-black text-neon-blue">나{reservationOthers ? ` · ${reservationOthers}` : ""}</span>
                <span className="text-[11px] font-bold text-muted-foreground">팀은 코트에서 정하세요</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 text-lg font-black">
                <span className="text-neon-blue">나{partner ? ` · ${partner}` : ""}</span>
                <span className="text-xs font-black text-muted-foreground">VS</span>
                <span className="text-foreground">{opponent || "상대"}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-muted-foreground">
              <span>{current.match_type === "double" ? "복식" : "단식"}</span>
              {current.court && <><span>·</span><span>{current.court}</span></>}
            </div>
          </div>

          {isChallenge ? (
            <div className="mt-7 grid w-full grid-cols-2 gap-3">
              <button type="button" disabled={busy} onClick={() => respond(false)}
                className="rounded-2xl border border-border/50 py-4 text-base font-black text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive active:scale-[0.98] disabled:opacity-50">
                거절
              </button>
              <button type="button" disabled={busy} onClick={() => respond(true)}
                className="rounded-2xl bg-amber-500 py-4 text-base font-black text-white shadow-lg transition-all hover:bg-amber-500/90 active:scale-[0.98] disabled:opacity-50">
                {busy ? "..." : "수락 ⚔️"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={dismiss}
              className="mt-7 w-full rounded-2xl bg-neon-green py-4 text-lg font-black text-white shadow-lg transition-all hover:bg-neon-green/90 active:scale-[0.98]">
              입장 확인
            </button>
          )}

          {mine.length > 1 && <p className="mt-3 text-[11px] font-bold text-muted-foreground">대기 중 {mine.length - 1}건 더</p>}
        </div>
      </div>
    </div>
  );
}

// 간단 클래스 결합 (cn 대체 — 로컬 사용)
function cnAccent(...parts: string[]) {
  return parts.filter(Boolean).join(" ");
}
