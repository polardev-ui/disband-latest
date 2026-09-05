// Supabase Edge Function: send-push
// Sends an alert push to all of a user's registered devices.
//   - iOS: APNs alert push.
//   - Android: FCM v1 data push → the app's MessagingService shows a heads-up
//     notification (suppressed when you're already viewing that conversation).
//
// Invoked by a Database Webhook / trigger with JSON:
//   { "user_id": "<uuid>", "title": "…", "body": "…", "link": "…"?, "source": "…"? }
//
// Required secrets (set with `supabase secrets set …`):
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (com.wsgpolar.disband),
//   APNS_PRIVATE_KEY  (contents of the .p8, including BEGIN/END lines),
//   APNS_HOST         (api.push.apple.com  |  api.sandbox.push.apple.com),
//   WEBHOOK_SECRET    (shared secret checked on each request),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided in Supabase),
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
  // Shared-secret check (the trigger sends this header).
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { user_id, title, body, link, source } = await req.json();
  if (!user_id || !body) return new Response("Bad request", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: iosTokens } = await supabase
    .from("device_tokens").select("token").eq("user_id", user_id).eq("platform", "ios");
  const { data: androidTokens } = await supabase
    .from("device_tokens").select("token").eq("user_id", user_id).eq("platform", "android");
  const registered = (iosTokens?.length ?? 0) + (androidTokens?.length ?? 0);
  if (!registered) return new Response(JSON.stringify({ sent: 0, registered: 0 }), { status: 200 });

  let sent = 0;

  // iOS: APNs alert push.
  if (iosTokens?.length) {
    const jwt = await apnsJwt();
    const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";
    const topic = Deno.env.get("APNS_BUNDLE_ID")!;
    const payload = JSON.stringify({
      aps: { alert: { title: title ?? "Disband", body }, sound: "default" },
      link: link ?? null,
      // The conversation this is about, so a client already showing it can
      // suppress the banner instead of interrupting the chat you are reading.
      source: source ?? null,
    });

    await Promise.all((iosTokens ?? []).map(async ({ token }) => {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        body: payload,
      });
      if (res.ok) sent++;
      // 410 = token no longer valid → clean it up.
      else if (res.status === 410) {
        await supabase.from("device_tokens").delete().eq("token", token);
      }
    }));
  }

  // Android: FCM v1 data push (data keys must be strings). The app builds the
  // heads-up notification itself so the foreground suppression by `source` works.
  if (androidTokens?.length) {
    const cfg = loadFcmConfig();
    const data = {
      title: title ?? "Disband",
      body,
      link: link ?? "",
      source: source ?? "",
    };
    for (const { token } of androidTokens ?? []) {
      if (!cfg) continue;
      const { status, unregistered } = await sendFcm(cfg, token, {
        token,
        data,
        android: { priority: "high" },
      });
      if (status === 200) sent++;
      else if (unregistered) {
        await supabase.from("device_tokens").delete().eq("token", token);
      }
    }
  }

  return new Response(JSON.stringify({ sent, registered }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});