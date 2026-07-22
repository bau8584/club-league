import { supabase } from "../supabaseClient";

// 대상 선수들에게 웹 푸시 요청 (best-effort). 발송은 Supabase Edge Function(send-push)이 처리.
export async function notifyPlayers(
  playerIds: (string | null | undefined)[],
  msg: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  const ids = playerIds.filter(Boolean) as string[];
  if (ids.length === 0) return;
  try {
    // 로그인 세션이 있으면 invoke가 사용자 JWT를 자동 첨부한다.
    await supabase.functions.invoke("send-push", { body: { playerIds: ids, ...msg } });
  } catch {
    /* 푸시는 부가기능 — 실패해도 앱 흐름에 영향 없음 */
  }
}
