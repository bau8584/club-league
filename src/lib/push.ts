import { supabase } from "../supabaseClient";
import { VAPID_PUBLIC_KEY } from "./push-public-key";

// VAPID 공개키: 커밋된 상수(권장) 우선, 없으면 빌드 환경변수. 둘 다 없으면 푸시 비활성.
const VAPID_PUBLIC =
  (VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.trim()) ||
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined);

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushConfigured(): boolean {
  return !!VAPID_PUBLIC;
}

// iOS(아이폰/아이패드) 여부 — iPadOS는 Mac으로 위장하므로 터치포인트로 보정
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// 홈 화면에 추가된 PWA(standalone)로 실행 중인지
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// 아이폰인데 아직 홈 화면 추가를 안 해서 푸시를 못 켜는 상태
export function iosNeedsInstall(): boolean {
  return isIOS() && !isStandalone();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function register(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

// 현재 이 브라우저가 푸시 구독 중인지
export async function getPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    if (Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// 알림 켜기: 권한 요청 → 구독 생성 → DB 저장
export async function enablePush(
  leagueId?: string | null,
  playerId?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC) return { ok: false, reason: "no-vapid" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await register();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-auth" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      league_id: leagueId ?? null,
      player_id: playerId ?? null,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// 알림 끄기: 구독 해제 + DB 삭제
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* best-effort */
  }
}

// 내 연동 선수 id가 바뀌었을 때 구독 레코드의 player_id 갱신(선택)
export async function updatePushPlayer(leagueId?: string | null, playerId?: string | null): Promise<void> {
  try {
    if (!(await getPushEnabled())) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    await supabase.from("push_subscriptions")
      .update({ league_id: leagueId ?? null, player_id: playerId ?? null })
      .eq("endpoint", sub.endpoint);
  } catch { /* ignore */ }
}
