// Supabase Edge Function: send-call-push
// Sends a PushKit "VoIP" push to a user's iOS devices so an incoming Disband
// call can ring the phone like a real call — lock screen, system swipe-to-answer
// — even when the app is backgrounded or fully killed.
//
// Invoked by the caller's app (iOS `CallManager.startCall` and the web
// `useCallManager.startCall`) with JSON:
//   { "calleeId": "<uuid>", "callId": "<id>", "callerName": "…", "from": "<uuid>"? }
//
// The caller must be signed in: the Authorization bearer token is the caller's
// session, and `from` (if sent) must match the token's user. A `x-webhook-secret`
// request can bypass that check for future server-side triggers.
//
// Required secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID,
//   APNS_PRIVATE_KEY (contents of the .p8, including BEGIN/END lines),
//   APNS_HOST (api.push.apple.com | api.sandbox.push.apple.com),
//   WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

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

Deno.serve(async (req) => {
  const { calleeId, callId, callerName, from } = await req.json();
  if (!calleeId || !callId) return new Response("Bad request", { status: 400 });

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
    if (!token) return new Response("Unauthorized", { status: 401 });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return new Response("Unauthorized", { status: 401 });
    callerId = user.id;
    if (from && from !== user.id) return new Response("Forbidden", { status: 403 });
  }
  const { data: tokens } = await supabase
    .from("device_tokens").select("token")
    .eq("user_id", calleeId).eq("platform", "ios-voip");
  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const jwt = await apnsJwt();
  const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";
  const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
  // VoIP pushes use the `.voip` topic; a normal .p8 APNs key signs them too.
  const topic = `${bundleId}.voip`;
  const payload = JSON.stringify({
    callId,
    from: callerId,
    callerName: callerName ?? "Disband call",
    type: "voice",
  });

  let sent = 0;
  await Promise.all((tokens ?? []).map(async ({ token }) => {
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
    if (res.ok) sent++;
    // 410 = token no longer valid → clean it up.
    else if (res.status === 410) {
      await supabase.from("device_tokens").delete().eq("token", token);
    }
  }));

  return new Response(JSON.stringify({ sent }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});