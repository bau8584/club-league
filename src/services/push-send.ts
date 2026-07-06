import { supabase } from "../supabaseClient";

// 대상 선수들에게 웹 푸시 요청 (best-effort). 발송은 CF Worker /api/push 가 처리.
export async function notifyPlayers(
  playerIds: (string | null | undefined)[],
  msg: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  const ids = playerIds.filter(Boolean) as string[];
  if (ids.length === 0) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ playerIds: ids, ...msg }),
    });
  } catch {
    /* 푸시는 부가기능 — 실패해도 앱 흐름에 영향 없음 */
  }
}
