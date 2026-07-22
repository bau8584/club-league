import { supabase } from "../supabaseClient";
import { toast } from "sonner";

// 대상 선수들에게 웹 푸시 요청. 발송은 Supabase Edge Function(send-push)이 처리.
// 발송 결과를 토스트로 보여줘, 운영진이 알림이 나갔는지 바로 확인할 수 있게 한다.
export async function notifyPlayers(
  playerIds: (string | null | undefined)[],
  msg: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  const ids = playerIds.filter(Boolean) as string[];
  if (ids.length === 0) return;
  try {
    // 로그인 세션이 있으면 invoke가 사용자 JWT를 자동 첨부한다.
    const { data, error } = await supabase.functions.invoke("send-push", { body: { playerIds: ids, ...msg } });
    if (error) {
      console.warn("[push] invoke error", error);
      toast.warning("알림 발송 서버에 연결하지 못했어요. (Edge Function 배포 확인)", { duration: 3500 });
      return;
    }
    if (data && (data as { error?: string }).error === "push-not-configured") {
      const have = (data as { have?: Record<string, boolean> }).have || {};
      const missing = Object.entries(have).filter(([, v]) => !v).map(([k]) => k).join(", ");
      toast.warning(`푸시 설정 미완료: ${missing || "시크릿 확인 필요"}`, { duration: 4000 });
      return;
    }
    const sent = (data as { sent?: number })?.sent;
    if (typeof sent === "number") {
      toast.success(sent > 0 ? `🔔 ${sent}명에게 알림을 보냈어요.` : "알림 대상이 아직 알림을 켜지 않았어요.", { duration: 2500 });
    }
  } catch (e) {
    console.warn("[push] send failed", e);
  }
}
