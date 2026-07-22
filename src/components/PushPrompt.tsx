import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { useLeagueStore } from "@/lib/league-store";
import { isPushSupported, isPushConfigured, enablePush, iosNeedsInstall } from "@/lib/push";

const KEY = "push-prompt-v1";
const RENAG_MS = 3 * 24 * 60 * 60 * 1000; // '나중에' 누르면 3일 뒤 다시 안내

// 첫 방문 알림 켜기 안내 배너.
// 웹 푸시는 사용자가 직접 허용해야만 켜지므로(기본 켜짐 불가), 클릭 한 번을 부드럽게 유도한다.
export function PushPrompt({ leagueId }: { leagueId?: string | null }) {
  const { myPlayerId, session } = useLeagueStore();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session) return;                         // 로그인 상태에서만
    if (!isPushConfigured() || !isPushSupported()) return;
    if (iosNeedsInstall()) return;                // 아이폰(홈화면 미추가)은 별도 안내
    if (Notification.permission !== "default") return; // 이미 허용/차단했으면 안 띄움
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const { dismissedAt } = JSON.parse(raw);
        if (dismissedAt && Date.now() - dismissedAt < RENAG_MS) return;
      }
    } catch { /* ignore */ }
    const t = setTimeout(() => setShow(true), 1200); // 진입 직후 살짝 뒤에
    return () => clearTimeout(t);
  }, [session]);

  if (!show) return null;

  const later = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ dismissedAt: Date.now() })); } catch { /* ignore */ }
    setShow(false);
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await enablePush(leagueId, myPlayerId);
      if (r.ok) {
        try { localStorage.setItem(KEY, JSON.stringify({ enabled: true })); } catch { /* ignore */ }
        toast.success("경기 알림을 켰어요. 예약·도전장·결과가 오면 알려드릴게요!");
        setShow(false);
      } else if (r.reason === "denied") {
        toast.error("브라우저에서 알림이 차단됐어요. 주소창 옆 자물쇠 → 알림 허용으로 바꿔주세요.");
        later();
      } else if (r.reason === "no-auth") {
        toast.error("로그인 후 이용할 수 있어요.");
        setShow(false);
      } else {
        toast.error("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-neon-blue/30 bg-neon-blue/5 p-3 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neon-blue/15 text-neon-blue">
        <Bell className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-foreground">경기 알림을 켤까요?</p>
        <p className="text-[11px] text-muted-foreground">예약·도전장·경기 결과가 오면 앱이 꺼져 있어도 바로 알려드려요.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={enable} disabled={busy}
          className="rounded-xl bg-neon-blue px-3 py-2 text-xs font-black text-white transition-all hover:bg-neon-blue/90 active:scale-95 disabled:opacity-60">
          켜기
        </button>
        <button type="button" onClick={later} title="나중에"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
