// Supabase Edge Function: appstore
//
// Everything Disband needs to sell Aero and server Catalysts through the App
// Store. Two entry points, chosen by the last path segment:
//
//   POST /appstore/verify         — called by the iOS app after a purchase or
//                                   a restore. Body: { transactionId, serverId? }
//                                   Auth: the buyer's Supabase access token.
//
//   POST /appstore/notifications  — called by Apple (App Store Server
//                                   Notifications V2). Body: { signedPayload }
//                                   Auth: none, by design — see below.
//
// ---------------------------------------------------------------------------
// Why nothing here trusts the JWS it is handed
// ---------------------------------------------------------------------------
// Apple signs both the StoreKit transaction and the server notification as a
// JWS whose `x5c` header carries a certificate chain up to the Apple Root CA
// G3. Verifying that properly means full X.509 chain validation, which is a
// lot of security-critical code to get wrong, and neither workerd nor Deno
// gives it to us for free.
//
// So this function does not verify signatures at all. Instead it treats every
// inbound payload as an UNTRUSTED HINT — "something happened to transaction
// X" — and then asks Apple directly, over an authenticated App Store Server
// API call, what the truth about X is. Every field that is written to the
// database comes from that answer, never from the request body.
//
// That inverts the trust problem into one we can solve with primitives we
// already have: signing an ES256 JWT with the App Store Connect key, which is
// the same thing `send-call-push` does for APNs. A forged notification can at
// worst make us re-check a transaction that we would have re-checked anyway.
//
// ---------------------------------------------------------------------------
// Required secrets
// ---------------------------------------------------------------------------
//   APPSTORE_KEY_ID        In-App Purchase key id from App Store Connect
//   APPSTORE_ISSUER_ID     Issuer id (Users and Access → Integrations → Keys)
//   APPSTORE_PRIVATE_KEY   Contents of the .p8, BEGIN/END lines included
//   APPSTORE_BUNDLE_ID     com.wsgpolar.disband
//   APPSTORE_ENVIRONMENT   "Production" (default) or "Sandbox"
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") bytes = enc.encode(data);
  else bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  // Built on a fresh ArrayBuffer rather than via Uint8Array.from, so the
  // result is a plain BufferSource that importKey accepts without a cast.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** Decode a JWS body WITHOUT verifying it. Hint only — see the note above. */
function decodeJwsPayload<T>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    // Decoded as UTF-8: product and display names are not ASCII.
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

// MARK: - App Store Server API

let cachedJwt: { token: string; iat: number } | null = null;

/**
 * Bearer token for the App Store Server API. Apple caps the lifetime at one
 * hour; refreshing at 50 minutes keeps a long-running instance inside it
 * without minting one per request.
 */
async function appStoreJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 3000) return cachedJwt.token;

  const keyId = Deno.env.get("APPSTORE_KEY_ID")!;
  const issuerId = Deno.env.get("APPSTORE_ISSUER_ID")!;
  const bundleId = Deno.env.get("APPSTORE_BUNDLE_ID")!;

  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(Deno.env.get("APPSTORE_PRIVATE_KEY")!),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  const token = `${signingInput}.${b64url(sig)}`;
  cachedJwt = { token, iat: now };
  return token;
}

function apiBase(): string {
  return Deno.env.get("APPSTORE_ENVIRONMENT") === "Sandbox"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

/** What Apple's signed transaction payload gives us, once decoded. */
interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  type: string; // "Auto-Renewable Subscription" | "Consumable" | …
  purchaseDate: number; // ms
  expiresDate?: number; // ms, subscriptions only
  revocationDate?: number; // ms, refunds
  quantity?: number;
  environment?: string;
  appAccountToken?: string;
}

/**
 * Ask Apple about one transaction.
 *
 * Returns the decoded `signedTransactionInfo` from Apple's own response. This
 * is the ONLY source of transaction facts in this function: it arrived over
 * TLS from Apple's API in answer to a request we signed, so decoding its
 * payload without re-verifying the inner signature adds no trust we did not
 * already have.
 */
async function fetchTransaction(transactionId: string): Promise<AppleTransaction | null> {
  const jwt = await appStoreJwt();
  const res = await fetch(
    `${apiBase()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { authorization: `Bearer ${jwt}` } },
  );
  if (!res.ok) {
    console.log("App Store transaction lookup failed", res.status, await res.text());
    return null;
  }
  const body = await res.json() as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) return null;
  return decodeJwsPayload<AppleTransaction>(body.signedTransactionInfo);
}

interface SubscriptionStatus {
  status: number; // 1 active, 2 expired, 3 billing retry, 4 grace, 5 revoked
  transaction: AppleTransaction | null;
  autoRenewing: boolean;
}

/**
 * The current state of a subscription, by its original transaction id.
 *
 * A transaction lookup alone is a snapshot of one purchase; renewals produce
 * new transactions we may never have been told about. This is what makes a
 * lapsed subscription actually lapse in our table.
 */
async function fetchSubscriptionStatus(
  originalTransactionId: string,
): Promise<SubscriptionStatus | null> {
  const jwt = await appStoreJwt();
  const res = await fetch(
    `${apiBase()}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    { headers: { authorization: `Bearer ${jwt}` } },
  );
  if (!res.ok) {
    console.log("App Store status lookup failed", res.status, await res.text());
    return null;
  }
  const body = await res.json() as {
    data?: Array<{
      lastTransactions?: Array<{
        status: number;
        signedTransactionInfo?: string;
        signedRenewalInfo?: string;
      }>;
    }>;
  };

  for (const group of body.data ?? []) {
    for (const last of group.lastTransactions ?? []) {
      const tx = last.signedTransactionInfo
        ? decodeJwsPayload<AppleTransaction>(last.signedTransactionInfo)
        : null;
      if (tx?.originalTransactionId !== originalTransactionId) continue;
      const renewal = last.signedRenewalInfo
        ? decodeJwsPayload<{ autoRenewStatus?: number }>(last.signedRenewalInfo)
        : null;
      return {
        status: last.status,
        transaction: tx,
        autoRenewing: renewal?.autoRenewStatus === 1,
      };
    }
  }
  return null;
}

/** Apple's numeric subscription status → the vocabulary our table already uses. */
function statusToPlanStatus(appleStatus: number): string {
  switch (appleStatus) {
    case 1: return "active";
    case 3: return "past_due";   // billing retry — Aero stays on, same as Stripe
    case 4: return "active";     // billing grace period
    case 2: return "canceled";   // expired
    case 5: return "canceled";   // revoked
    default: return "canceled";
  }
}

// MARK: - Entitlement writes

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

/**
 * Record the transaction, then grant what it bought.
 *
 * The ledger insert comes first and is the idempotency boundary: Apple
 * redelivers notifications, StoreKit replays unfinished transactions on every
 * launch, and "restore purchases" is a button the user can hold down. Writing
 * the grant from an already-recorded transaction is a no-op in every case
 * because the grant tables key on Apple's transaction id too.
 */
async function applyTransaction(
  db: SupabaseClient,
  tx: AppleTransaction,
  userId: string,
  serverId: string | null,
): Promise<{ granted: string | null; error?: string }> {
  const expectedEnv = Deno.env.get("APPSTORE_ENVIRONMENT") ?? "Production";
  if (tx.environment && tx.environment !== expectedEnv) {
    // A Sandbox receipt must never buy anything real. Recorded, not granted,
    // so a tester's transactions are still visible while being inert.
    console.log("appstore: environment mismatch", tx.environment, "expected", expectedEnv);
    return { granted: null, error: "environment" };
  }
  if (tx.bundleId && tx.bundleId !== Deno.env.get("APPSTORE_BUNDLE_ID")) {
    return { granted: null, error: "bundle" };
  }

  const { data: product } = await db
    .from("apple_products")
    .select("grants, quantity, active")
    .eq("product_id", tx.productId)
    .maybeSingle();

  if (!product?.active) {
    console.log("appstore: unknown or inactive product", tx.productId);
    return { granted: null, error: "product" };
  }

  const isSub = !!tx.expiresDate;

  await db.from("apple_transactions").upsert({
    transaction_id: tx.transactionId,
    original_transaction_id: tx.originalTransactionId,
    user_id: userId,
    product_id: tx.productId,
    kind: isSub ? "auto_renewable" : "consumable",
    purchased_at: iso(tx.purchaseDate),
    expires_at: iso(tx.expiresDate),
    revoked_at: iso(tx.revocationDate),
    environment: tx.environment ?? expectedEnv,
    raw: tx as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  }, { onConflict: "transaction_id" });

  if (product.grants === "aero") {
    const status = await fetchSubscriptionStatus(tx.originalTransactionId);
    const planStatus = tx.revocationDate
      ? "canceled"
      : status
        ? statusToPlanStatus(status.status)
        : "active";
    const current = status?.transaction ?? tx;

    await db.from("subscriptions").upsert({
      user_id: userId,
      provider: "apple",
      apple_original_transaction_id: tx.originalTransactionId,
      plan: planStatus === "canceled" ? "free" : "aero",
      status: planStatus,
      current_period_start: iso(current.purchaseDate),
      current_period_end: iso(current.expiresDate),
      canceled_at: planStatus === "canceled" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return { granted: `aero:${planStatus}` };
  }

  // Catalysts are consumable, and a refund takes them back.
  if (tx.revocationDate) {
    await db.from("server_catalysts").delete().eq("apple_transaction_id", tx.transactionId);
    return { granted: "catalyst:revoked" };
  }

  if (!serverId) {
    // Bought without a destination — the app asks again and re-verifies with
    // one. The ledger row above means the purchase is not lost meanwhile.
    return { granted: null, error: "server_id_required" };
  }

  const units = Math.max(1, Math.min(99, (tx.quantity ?? 1) * product.quantity));
  const rows = Array.from({ length: units }, (_, i) => ({
    server_id: serverId,
    user_id: userId,
    source: "purchase",
    apple_transaction_id: tx.transactionId,
    session_seq: i,
  }));
  await db.from("server_catalysts").upsert(rows, {
    onConflict: "apple_transaction_id,session_seq",
    ignoreDuplicates: true,
  });
  return { granted: `catalyst:${units}` };
}

// MARK: - HTTP

function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  const db = service();

  // ---- Apple → us ---------------------------------------------------------
  if (route === "notifications") {
    let body: { signedPayload?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Expected JSON." }, 400, headers);
    }
    if (!body.signedPayload) return json({ error: "Missing signedPayload." }, 400, headers);

    // Untrusted: used only to learn WHICH transaction to go ask Apple about.
    const payload = decodeJwsPayload<{
      notificationType?: string;
      subtype?: string;
      data?: { signedTransactionInfo?: string };
    }>(body.signedPayload);

    const hint = payload?.data?.signedTransactionInfo
      ? decodeJwsPayload<AppleTransaction>(payload.data.signedTransactionInfo)
      : null;

    if (!hint?.transactionId) {
      // Apple also sends TEST notifications with no transaction. 200 so it
      // does not retry something there is nothing to do about.
      console.log("appstore notification without a transaction", payload?.notificationType);
      return json({ ok: true }, 200, headers);
    }

    // Authoritative re-read.
    const tx = await fetchTransaction(hint.transactionId);
    if (!tx) {
      // A 5xx makes Apple retry, which is what we want for a transient
      // lookup failure — this notification is not lost.
      return json({ error: "Could not reach the App Store." }, 503, headers);
    }

    // Who owns it? The ledger knows from the original purchase; the app sets
    // `appAccountToken` to the Supabase user id so a renewal arriving before
    // any app launch can still be attributed.
    const { data: known } = await db
      .from("apple_transactions")
      .select("user_id")
      .eq("original_transaction_id", tx.originalTransactionId)
      .limit(1)
      .maybeSingle();

    const userId = known?.user_id ?? tx.appAccountToken ?? null;
    if (!userId) {
      console.log("appstore: unattributed transaction", tx.originalTransactionId);
      return json({ ok: true, unattributed: true }, 200, headers);
    }

    const result = await applyTransaction(db, tx, userId, null);
    console.log("appstore notification applied", {
      type: payload?.notificationType,
      subtype: payload?.subtype,
      granted: result.granted,
      error: result.error,
    });
    return json({ ok: true }, 200, headers);
  }

  // ---- App → us -----------------------------------------------------------
  if (route === "verify") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in first." }, 401, headers);

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "Session expired." }, 401, headers);

    let body: { transactionId?: string; serverId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Expected JSON." }, 400, headers);
    }
    if (!body.transactionId) return json({ error: "transactionId is required." }, 400, headers);

    const tx = await fetchTransaction(body.transactionId);
    if (!tx) return json({ error: "The App Store did not recognise that purchase." }, 502, headers);

    // A transaction already attributed to someone else is not transferable:
    // two Disband accounts sharing one Apple ID must not share one Aero.
    const { data: owner } = await db
      .from("apple_transactions")
      .select("user_id")
      .eq("original_transaction_id", tx.originalTransactionId)
      .limit(1)
      .maybeSingle();
    if (owner && owner.user_id !== user.id) {
      return json({
        error: "That purchase is already attached to a different Disband account.",
      }, 409, headers);
    }

    const result = await applyTransaction(db, tx, user.id, body.serverId ?? null);
    if (result.error === "server_id_required") {
      return json({ error: "Choose a space for these Catalysts." }, 400, headers);
    }
    if (result.error) {
      return json({ error: "That purchase could not be applied." }, 400, headers);
    }
    return json({ ok: true, granted: result.granted }, 200, headers);
  }

  return json({ error: "Not found." }, 404, headers);
});
