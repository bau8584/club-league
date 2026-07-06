import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useLeagueStore } from "@/lib/league-store";
import { isPushSupported, isPushConfigured, getPushEnabled, enablePush, disablePush, iosNeedsInstall } from "@/lib/push";
import { cn } from "@/lib/utils";

// 경기 알림(웹 푸시) 옵트인 토글. VAPID 미설정이면 아예 렌더 안 함.
export function PushToggle({ leagueId, variant = "icon" }: { leagueId?: string | null; variant?: "icon" | "row" }) {
  const { myPlayerId } = useLeagueStore();
  const [configured] = useState(() => isPushConfigured());
  const [supported] = useState(() => isPushSupported() && isPushConfigured());
  const [needsInstall] = useState(() => isPushConfigured() && iosNeedsInstall());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    getPushEnabled().then(setEnabled);
  }, [supported]);

  // VAPID 미설정이면 숨김. 아이폰 사파리(홈 화면 미추가)면 안내 버튼 노출.
  if (!configured) return null;
  if (!supported && !needsInstall) return null;

  // 아이폰: 홈 화면에 추가해야 알림 가능 → 안내
  if (needsInstall) {
    const guide = () =>
      toast("아이폰은 홈 화면에 추가한 뒤 알림을 켤 수 있어요.", {
        description: "사파리 하단 공유 버튼 → '홈 화면에 추가' → 추가된 아이콘으로 열기 → 🔔 알림 켜기",
        duration: 8000,
      });
    if (variant === "row") {
      return (
        <button type="button" onClick={guide} className="flex w-full items-center gap-2 px-1 py-1 text-xs font-bold text-muted-foreground">
          <Bell className="size-4" /> 경기 알림 <span className="ml-auto text-[10px]">홈 화면 추가 필요</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={guide}
        title="아이폰은 홈 화면에 추가 후 알림 가능"
        className="flex size-9 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 transition-all active:scale-95"
      >
        <Bell className="size-5" />
      </button>
    );
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success("경기 알림을 껐습니다.");
      } else {
        const r = await enablePush(leagueId, myPlayerId);
        if (r.ok) { setEnabled(true); toast.success("경기 알림을 켰습니다. 배정·도전장이 오면 알려드려요!"); }
        else if (r.reason === "denied") toast.error("브라우저에서 알림이 차단되어 있어요. 사이트 알림 권한을 허용해 주세요.");
        else if (r.reason === "no-auth") toast.error("로그인 후 이용할 수 있어요.");
        else toast.error("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center gap-2 px-1 py-1 text-xs font-bold text-foreground disabled:opacity-50"
      >
        {enabled ? <BellRing className="size-4 text-neon-blue" /> : <Bell className="size-4 text-muted-foreground" />}
        경기 알림 {enabled ? "켜짐" : "꺼짐"}
        <span className="ml-auto text-[10px] font-bold text-muted-foreground">{enabled ? "끄기" : "켜기"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={enabled ? "경기 알림 켜짐 (끄려면 클릭)" : "경기 알림 켜기"}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border transition-all active:scale-95",
        enabled
          ? "border-neon-blue/40 bg-neon-blue/10 text-neon-blue"
          : "border-border/60 bg-card/60 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/40"
      )}
    >
      {enabled ? <BellRing className="size-5" /> : <Bell className="size-5" />}
    </button>
  );
}
