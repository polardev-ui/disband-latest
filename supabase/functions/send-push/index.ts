// Supabase Edge Function: send-push
// Sends an APNs push to all of a user's registered devices.
//
// Invoked by a Database Webhook / trigger with JSON:
//   { "user_id": "<uuid>", "title": "…", "body": "…", "link": "…"? }
//
// Required secrets (set with `supabase secrets set …`):
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (com.wsgpolar.disband),
//   APNS_PRIVATE_KEY  (contents of the .p8, including BEGIN/END lines),
//   APNS_HOST         (api.push.apple.com  |  api.sandbox.push.apple.com),
//   WEBHOOK_SECRET    (shared secret checked on each request),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided in Supabase).

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
  // Shared-secret check (the trigger sends this header).
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { user_id, title, body, link } = await req.json();
  if (!user_id || !body) return new Response("Bad request", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: tokens } = await supabase
    .from("device_tokens").select("token").eq("user_id", user_id).eq("platform", "ios");
  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const jwt = await apnsJwt();
  const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";
  const topic = Deno.env.get("APNS_BUNDLE_ID")!;
  const payload = JSON.stringify({
    aps: { alert: { title: title ?? "Disband", body }, sound: "default" },
    link: link ?? null,
  });

  let sent = 0;
  await Promise.all((tokens ?? []).map(async ({ token }) => {
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

  return new Response(JSON.stringify({ sent }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
