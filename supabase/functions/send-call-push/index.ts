// Supabase Edge Function: send-call-push
// Sends an incoming-call push to a user's devices so a Disband call can ring
// even when the app is backgrounded or fully killed.
//   - iOS: PushKit "VoIP" push (lock screen, system swipe-to-answer).
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

  const { calleeId, callId, callerName, from } = await req.json();
  if (!calleeId || !callId) return new Response("Bad request", { status: 400, headers: cors });

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
    if (!token) return new Response("Unauthorized", { status: 401, headers: cors });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(`Unauthorized: ${JSON.stringify(error)}`, { status: 401, headers: cors });
    }
    callerId = user.id;
    if (from && from !== user.id) return new Response("Forbidden", { status: 403, headers: cors });
  }

  const { data: iosTokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "ios-voip");
  const { data: androidTokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "android");
  const registered = (iosTokens?.length ?? 0) + (androidTokens?.length ?? 0);
  if (!registered) return new Response(JSON.stringify({ sent: 0, registered: 0, statuses: [] }), { status: 200, headers: cors });

  let sent = 0;
  const statuses: number[] = [];
  const dataPayload = {
    callId,
    from: callerId,
    callerName: callerName ?? "Disband call",
    type: "voice",
  };

  // iOS: PushKit VoIP push.
  if (iosTokens?.length) {
    const jwt = await apnsJwt();
    const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";
    const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
    // VoIP pushes use the `.voip` topic; a normal .p8 APNs key signs them too.
    const topic = `${bundleId}.voip`;
    const payload = JSON.stringify(dataPayload);

    await Promise.all((iosTokens ?? []).map(async ({ token }) => {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": topic,
          "apns-push-type": "voip",
          "apns-priority": "10",
        },
        body: payload,
      });
      statuses.push(res.status);
      if (res.ok) sent++;
      // 410 = token no longer valid → clean it up.
      else if (res.status === 410) {
        await supabase.from("device_tokens").delete().eq("token", token);
      }
    }));
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

  console.log("send-call-push result", { calleeId, caller: callerId, registered, sent, statuses });

  return new Response(JSON.stringify({ sent, registered, statuses }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});