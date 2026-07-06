import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createClient } from "@supabase/supabase-js";
import { buildPushPayload } from "@block65/webcrypto-web-push";

type PushEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// 웹 푸시 발송: 로그인 검증 → 대상 선수 구독 조회(service_role) → buildPushPayload 전송
async function handlePushSend(request: Request, env: PushEnv): Promise<Response> {
  const url = env.SUPABASE_URL;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    // 어떤 값이 빠졌는지 진단(값은 노출하지 않고 존재 여부만)
    return jsonResponse(
      {
        error: "push-not-configured",
        have: {
          SUPABASE_URL: !!url,
          SUPABASE_SERVICE_ROLE_KEY: !!service,
          VAPID_PUBLIC_KEY: !!env.VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY: !!env.VAPID_PRIVATE_KEY,
        },
      },
      503,
    );
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  // 로그인한 사용자만 발송 요청 가능(익명 스팸 방지)
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { playerIds?: string[]; title?: string; body?: string; url?: string; tag?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: "bad-json" }, 400); }
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.filter(Boolean) : [];
  if (playerIds.length === 0) return jsonResponse({ sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("player_id", playerIds);
  if (!subs || subs.length === 0) return jsonResponse({ sent: 0 });

  const vapid = {
    subject: env.VAPID_SUBJECT || "mailto:noreply@club-league.app",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
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
        const res = await fetch(s.endpoint, { method: payload.method, headers: payload.headers, body: payload.body as BodyInit });
        if (res.status === 404 || res.status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id); // 만료 구독 정리
        } else if (res.ok) {
          sent++;
        }
      } catch {
        /* 개별 실패 무시 */
      }
    }),
  );
  return jsonResponse({ sent });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // 웹 푸시 발송 엔드포인트 (TanStack 라우팅 이전에 가로챔)
      if (request.method === "POST" && new URL(request.url).pathname === "/api/push") {
        return await handlePushSend(request, env as PushEnv);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
