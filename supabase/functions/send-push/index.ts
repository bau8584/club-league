// 웹 푸시 발송 Edge Function.
// Cloudflare 배포 파이프라인이 대시보드 비밀을 유지하지 못해, 발송을 Supabase로 옮겼다.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge 런타임이 자동 주입한다.
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 만 함수 시크릿으로 설정하면 된다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@0.5.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@club-league.app";
  if (!url || !service || !vapidPublic || !vapidPrivate) {
    return json({
      error: "push-not-configured",
      have: {
        SUPABASE_URL: !!url,
        SUPABASE_SERVICE_ROLE_KEY: !!service,
        VAPID_PUBLIC_KEY: !!vapidPublic,
        VAPID_PRIVATE_KEY: !!vapidPrivate,
        VAPID_SUBJECT: !!Deno.env.get("VAPID_SUBJECT"),
      },
    }, 503);
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // 로그인한 사용자만 발송 요청 가능
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  let body: { playerIds?: string[]; title?: string; body?: string; url?: string; tag?: string };
  try { body = await req.json(); } catch { return json({ error: "bad-json" }, 400); }
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.filter(Boolean) : [];
  if (playerIds.length === 0) return json({ sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("player_id", playerIds);
  if (!subs || subs.length === 0) return json({ sent: 0 });

  const vapid = { subject: vapidSubject, publicKey: vapidPublic, privateKey: vapidPrivate };
  const message = {
    data: {
      title: body.title || "클럽 리그",
      body: body.body || "",
      url: body.url || "/",
      tag: body.tag,
    },
    options: { ttl: 1800, urgency: "high" as const },
  };

  let sent = 0;
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        const payload = await buildPushPayload(
          message,
          { endpoint: s.endpoint, expirationTime: null, keys: { auth: s.auth, p256dh: s.p256dh } },
          vapid,
        );
        const res = await fetch(s.endpoint, { method: payload.method, headers: payload.headers, body: payload.body });
        if (res.status === 404 || res.status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else if (res.ok) {
          sent++;
        }
      } catch {
        /* 개별 실패 무시 */
      }
    }),
  );
  return json({ sent });
});
