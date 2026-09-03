/**
 * JWS (compact) JWT verification against Apple's App Store public signing keys.
 *
 * StoreKit 2 hands the client a signed transaction as a JWS:
 *   `<b64url(header)>.<b64url(payload)>.<b64url(signature)>`
 * The signature is an ES256 (ECDSA P-256) signature over the first two
 * segments, and Apple signs with keys it rotates and publishes as a JWKS. We
 * pull that JWKS, cache it for a short TTL, and verify against the matching
 * key id each call.
 */

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
// Apple's keys rotate; give a short-ish cache so a rotation is picked up
// quickly without hammering Apple on every verify.
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;

interface Jwk {
  kty: string;
  kid: string;
  use?: string;
  alg: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
  aud?: string;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(APPLE_JWKS_URL, {
    headers: { Accept: "application/json" },
    // Don't follow Apple's redirect with our server's proxy creds; be explicit.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Apple JWKS: ${res.status}`);
  }
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  // Keep only the keys Apple publishes for App Store / App Store Server (EC,
  // P-256, ES256). Keys are one entry per `kid`.
  const appStoreKeys = keys.filter(
    (k) => k.kty === "EC" && k.crv === "P-256" && k.alg === "ES256",
  );
  jwksCache = { keys: appStoreKeys, fetchedAt: Date.now() };
  return appStoreKeys;
}

function b64urldecode(s: string): Uint8Array<ArrayBuffer> {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = globalThis.atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifySignature(
  headerSegment: string,
  signingInput: string,
  signatureSegment: string,
): Promise<boolean> {
  let parsedHeader: { alg?: string; kid?: string; x5c?: unknown };
  try {
    parsedHeader = JSON.parse(new TextDecoder().decode(b64urldecode(headerSegment)));
  } catch {
    return false;
  }
  if (parsedHeader.alg !== "ES256") return false;

  const keys = await fetchJwks();
  // Prefer the key id in the header; fall back to trying every EC key.
  const candidates = parsedHeader.kid
    ? keys.filter((k) => k.kid === parsedHeader.kid)
    : keys;
  if (candidates.length === 0) return false;

  const subtle = globalThis.crypto.subtle;
  const signatureBytes = b64urldecode(signatureSegment);

  for (const key of candidates) {
    try {
      const publicKey = await subtle.importKey(
        "jwk",
        key,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      // WebCrypto expects the raw r||s concatenation, which is exactly what a
      // JOSE compact signature holds for P-256 (64 bytes).
      const valid = await subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signatureBytes,
        new TextEncoder().encode(signingInput),
      );
      if (valid) return true;
    } catch {
      // Try the next candidate key.
    }
  }
  return false;
}

/**
 * The decoded + (optionally) verified payload of an App Store signed
 * transaction. Subset of Apple's `JWSTransactionDecodedPayload`.
 */
export interface AppStoreTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  type: string; // "Auto-RenewableSubscription", "Non-RenewingSubscription", ...
  inAppOwnershipType?: string;
  signedDate: number; // ms epoch
  expiresDate?: number; // ms epoch
  revocationDate?: number;
  quantity?: number;
}

/**
 * Splits, decodes and cryptographically verifies a StoreKit 2 signed
 * transaction JWS. Returns `null` if any structural or signature check fails.
 */
export async function verifyAppStoreTransaction(jws: string): Promise<AppStoreTransaction | null> {
  const segments = jws.split(".");
  if (segments.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urldecode(payloadSegment)));
  } catch {
    return null;
  }

  const signingInput = `${headerSegment}.${payloadSegment}`;
  const valid = await verifySignature(headerSegment, signingInput, signatureSegment);
  if (!valid) return null;

  const transactionId = payload.transactionId;
  const originalTransactionId = payload.originalTransactionId;
  const bundleId = payload.bundleId;
  const productId = payload.productId;
  if (
    typeof transactionId !== "string" ||
    typeof originalTransactionId !== "string" ||
    typeof bundleId !== "string" ||
    typeof productId !== "string"
  ) {
    return null;
  }

  return {
    transactionId,
    originalTransactionId,
    bundleId,
    productId,
    type: typeof payload.type === "string" ? payload.type : "",
    inAppOwnershipType: typeof payload.inAppOwnershipType === "string"
      ? payload.inAppOwnershipType
      : undefined,
    signedDate: typeof payload.signedDate === "number" ? payload.signedDate : 0,
    expiresDate: typeof payload.expiresDate === "number" ? payload.expiresDate : undefined,
    revocationDate: typeof payload.revocationDate === "number"
      ? payload.revocationDate
      : undefined,
  };
}
