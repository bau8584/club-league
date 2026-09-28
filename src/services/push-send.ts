import { supabase } from "../supabaseClient";

// 대상 선수들에게 웹 푸시 요청. 발송은 Supabase Edge Function(send-push)이 처리.
// 발송 결과는 토스트로 띄우지 않는다 — 결과 창의 확인 버튼을 가리고, 받을 사람이 0명인
// 리그에서는 매 경기 "알림을 켜지 않았어요"만 떴다(2026-09-28). 문제 추적은 콘솔로.
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
      return;
    }
    if (data && (data as { error?: string }).error === "push-not-configured") {
      console.warn("[push] not configured", (data as { have?: Record<string, boolean> }).have);
      return;
    }
    console.info("[push] sent", (data as { sent?: number })?.sent);
  } catch (e) {
    console.warn("[push] send failed", e);
  }
}
