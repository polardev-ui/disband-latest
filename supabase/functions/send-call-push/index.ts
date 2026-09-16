// Supabase Edge Function: send-call-push
// Sends an incoming-call push to a user's devices so a Disband call can ring
// even when the app is backgrounded or fully killed.
//   - iOS: PushKit "VoIP" push (lock screen, system swipe-to-answer), with a
//     plain alert push as the fallback for devices that never registered one.
//   - Android: FCM v1 data push → the app's MessagingService routes it to the
//     call manager, which rings with the full in-app call UI.
//
// Invoked by the caller's app (iOS `CallManager.startCall`, web
// `useCallManager.startCall`, Android `CallManager.startCall`) with JSON:
//   { "calleeId": "<uuid>", "callId": "<id>", "callerName": "…", "from": "<uuid>"? }
//
// The caller must be signed in: the Authorization bearer token is the caller's
// session, and `from` (if sent) must match the token's user. A `x-webhook-secret`
// request can bypass that check for future server-side triggers.
//
// Required secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID,
//   APNS_PRIVATE_KEY (contents of the .p8, including BEGIN/END lines),
//   APNS_HOST (api.push.apple.com | api.sandbox.push.apple.com),
//   WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   FCM_SERVICE_ACCOUNT (JSON: {project_id, client_email, private_key})
//     — or the trio FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") bytes = enc.encode(data);
  else bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// MARK: - APNs (iOS)

// Cache the APNs JWT (valid up to ~1h; refresh well within that).
let cachedJwt: { token: string; iat: number } | null = null;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, sb-lifetime, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/**
 * Every response carries the CORS headers.
 *
 * The success response did not, so a push that was sent perfectly well was
 * discarded by the browser before the caller ever saw it — which reads exactly
 * like the push never happening.
 */
function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 1500) return cachedJwt.token;

  const keyId = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(Deno.env.get("APNS_PRIVATE_KEY")!),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput),
  );
  const token = `${signingInput}.${b64url(sig)}`;
  cachedJwt = { token, iat: now };
  return token;
}

// MARK: - FCM (Android)

interface FcmConfig { projectId: string; clientEmail: string; privateKey: string; }

function loadFcmConfig(): FcmConfig | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j.project_id && j.client_email && j.private_key) {
        return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
      }
    } catch {
      return null;
    }
  }
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

const FCM_TOKEN_URI = Deno.env.get("FCM_TOKEN_URI") ?? "https://oauth2.googleapis.com/token";

// Cache the OAuth2 access token (valid ~1h; refresh well within that).
let cachedFcmToken: { token: string; exp: number } | null = null;

async function fcmAccessToken(cfg: FcmConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcmToken && now < cachedFcmToken.exp - 120) return cachedFcmToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: cfg.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: FCM_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(cfg.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(FCM_TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  cachedFcmToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

/** Send one FCM v1 message; 404 means the token is unregistered. */
async function sendFcm(
  cfg: FcmConfig, token: string, message: Record<string, unknown>,
): Promise<{ status: number; unregistered: boolean }> {
  const access = await fcmAccessToken(cfg);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${access}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  const unregistered = res.status === 404;
  if (!res.ok && !unregistered) {
    console.log("FCM send error", res.status, await res.text());
  }
  return { status: res.status, unregistered };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  // A body that is not JSON threw here, and the runtime's own 500 carries no
  // CORS headers — so the browser reported a CORS failure for what was really
  // a bad request, and the actual cause was invisible.
  let body: {
    calleeId?: string; callId?: string; callerName?: string; from?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400, cors);
  }
  const { calleeId, callId, from } = body ?? {};
  let callerName = "Disband call";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof calleeId !== "string" || typeof callId !== "string" || !uuid.test(calleeId) || callId.length > 100 || !/^[0-9a-f:-]+$/i.test(callId)) return json({ error: "calleeId and callId are required." }, 400, cors);

  // Identify the caller: either a trusted server/webhook or the user whose
  // access token signs this request. `from` is never trusted from the client
  // — it's forced to the authenticated user so no one can spoof a call.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let callerId = "";
  const webhookSecret = req.headers.get("x-webhook-secret");
  if (webhookSecret && webhookSecret === Deno.env.get("WEBHOOK_SECRET")) {
    callerId = from ?? "server";
  } else {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in to place a call." }, 401, cors);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return json({ error: "Session expired — sign in again." }, 401, cors);
    }
    callerId = user.id;
    if (callId !== [callerId, calleeId].sort().join(":")) return json({ error: "Invalid call identity." }, 400, cors);
    if (from && from !== user.id) return json({ error: "Forbidden" }, 403, cors);
    // An authenticated token alone must not ring arbitrary phones or bypass blocks.
    const [friendship, blocked, ban, restriction] = await Promise.all([
      supabase.from("friendships").select("id").eq("status", "accepted")
        .or(`and(requester_id.eq.${callerId},addressee_id.eq.${calleeId}),and(requester_id.eq.${calleeId},addressee_id.eq.${callerId})`).limit(1),
      supabase.rpc("is_blocked_between", { p_a: callerId, p_b: calleeId }),
      supabase.from("platform_bans").select("user_id").eq("user_id", callerId).limit(1),
      supabase.from("account_restrictions").select("id").eq("user_id", callerId).eq("restriction", "send_messages").limit(1),
    ]);
    if ([friendship, blocked, ban, restriction].some(r => r.error)) return json({ error: "Call authorization unavailable." }, 503, cors);
    if (!friendship.data?.length || blocked.data || ban.data?.length || restriction.data?.length) return json({ error: "You cannot ring this user." }, 403, cors);
    const { error: limitError } = await supabase.rpc("platform_rate_limit", { p_key: `call-push:${callerId}`, p_max: 6, p_window_seconds: 60 });
    if (limitError) return json({ error: "Call limit reached. Try again shortly." }, 429, cors);

  }

  // Display identity comes from the caller's profile, never arbitrary client text.
  if (uuid.test(callerId)) {
    const { data: profile } = await supabase.from("profiles").select("display_name,username").eq("id", callerId).maybeSingle();
    callerName = profile?.display_name || profile?.username || "Disband call";
  }

  const { data: voipTokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "ios-voip");
  const { data: alertTokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "ios");
  const { data: androidTokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "android");

  /**
   * A PushKit token is the good path — it rings through CallKit even from a
   * killed app — but most installs do not have one: it is registered only by
   * builds new enough to ask for it, so the great majority of devices had a
   * normal `ios` token and nothing else, and this function answered "nobody to
   * ring" and returned silently. An alert push is a worse ring than CallKit,
   * but it is a ring, so it is what those devices get.
   */
  const iosTokens = voipTokens ?? [];
  const voipTokenSet = new Set(iosTokens.map((t) => t.token));
  const fallbackTokens = (alertTokens ?? []).filter((t) => !voipTokenSet.has(t.token));

  const registered = iosTokens.length + fallbackTokens.length + (androidTokens?.length ?? 0);
  if (!registered) {
    // Logged, because "the callee has no device registered" and "the push
    // failed" look identical from the caller and are fixed differently.
    console.log("send-call-push: no devices", { calleeId, caller: callerId });
    return json({ sent: 0, registered: 0, statuses: [] }, 200, cors);
  }

  let sent = 0;
  const statuses: number[] = [];
  const dataPayload = {
    callId,
    from: callerId,
    callerName: callerName ?? "Disband call",
    type: "voice",
  };

  // iOS: PushKit VoIP push, then a plain alert for devices without one.
  if (iosTokens.length || fallbackTokens.length) {
    const jwt = await apnsJwt();
    const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";
    const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;

    const push = async (
      token: string,
      topic: string,
      pushType: "voip" | "alert",
      payload: string,
    ) => {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": topic,
          "apns-push-type": pushType,
          "apns-priority": "10",
          // A ring is worthless once the call has stopped ringing.
          ...(pushType === "alert"
            ? { "apns-expiration": String(Math.floor(Date.now() / 1000) + 45) }
            : {}),
        },
        body: payload,
      });
      statuses.push(res.status);
      if (res.ok) sent++;
      // 410 = token no longer valid → clean it up.
      else if (res.status === 410) {
        await supabase.from("device_tokens").delete().eq("token", token);
      } else {
        console.log("APNs error", pushType, res.status, await res.text());
      }
    };

    // VoIP pushes use the `.voip` topic; a normal .p8 APNs key signs them too.
    const voipPayload = JSON.stringify(dataPayload);
    // The alert carries the same data, so tapping it opens the same call.
    const alertPayload = JSON.stringify({
      aps: {
        alert: {
          title: callerName ?? "Disband",
          body: "Incoming call",
        },
        sound: "default",
        "interruption-level": "time-sensitive",
        "thread-id": `call:${callId}`,
      },
      ...dataPayload,
    });

    await Promise.all([
      ...iosTokens.map(({ token }) => push(token, `${bundleId}.voip`, "voip", voipPayload)),
      ...fallbackTokens.map(({ token }) => push(token, bundleId, "alert", alertPayload)),
    ]);
  }

  // Android: FCM v1 data push (data keys must be strings).
  if (androidTokens?.length) {
    const cfg = loadFcmConfig();
    for (const { token } of androidTokens ?? []) {
      if (!cfg) { statuses.push(501); continue; }
      const { status, unregistered } = await sendFcm(cfg, token, {
        token,
        data: dataPayload,
        android: { priority: "high" },
      });
      statuses.push(status);
      if (status === 200) sent++;
      else if (unregistered) {
        await supabase.from("device_tokens").delete().eq("token", token);
      }
    }
  }

  console.log("send-call-push result", {
    calleeId, caller: callerId, registered, sent, statuses,
    voip: iosTokens.length, alertFallback: fallbackTokens.length,
    android: androidTokens?.length ?? 0,
  });

  return json({ sent, registered, statuses }, 200, cors);
});