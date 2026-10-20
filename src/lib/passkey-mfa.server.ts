import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { HIDDEN_PASSKEY_TOTP_NAME, type PasskeySummary } from "@/lib/passkey-mfa-shared";

const AUTH_TIMEOUT_MS = 10_000;
const PASSKEY_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

export interface PasskeyMfaRow {
  user_id: string;
  factor_id: string;
  secret_encrypted: string;
}

export interface GoTrueFactor {
  id: string;
  factor_type?: string;
  friendly_name?: string | null;
  status?: string;
}

export interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user?: unknown;
}

interface GoTrueResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

interface JwtClaims {
  sub?: string;
  aal?: string;
  amr?: unknown;
  session_id?: string;
  iat?: number;
  exp?: number;
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 16384) return null;
  return token;
}

export function decodeJwtClaims(token: string): JwtClaims | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

export function amrMethods(claims: JwtClaims | null): string[] {
  if (!claims || !Array.isArray(claims.amr)) return [];
  return claims.amr.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && "method" in entry) {
      const method = (entry as { method?: unknown }).method;
      return typeof method === "string" ? [method] : [];
    }
    return [];
  });
}

function gotrueConfig(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

function authErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  for (const key of ["msg", "error_description", "message", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

async function gotrueRequest<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<GoTrueResult<T>> {
  const config = gotrueConfig();
  if (!config) {
    return { ok: false, status: 503, data: null, error: "Supabase is not configured." };
  }

  const headers = new Headers({ apikey: config.anon });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");

  try {
    const response = await fetch(`${config.url}/auth/v1${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      data: (data as T | null) ?? null,
      error: response.ok ? null : authErrorMessage(data, "Supabase Auth rejected the request."),
    };
  } catch {
    return { ok: false, status: 502, data: null, error: "Could not reach Supabase Auth." };
  }
}

export async function listGoTrueFactors(token: string): Promise<GoTrueResult<GoTrueFactor[]>> {
  // GoTrue does not expose GET /factors; the current user's factors are
  // embedded in the /user response (auth-js derives listFactors from it).
  const result = await gotrueRequest<{ factors?: GoTrueFactor[] }>("/user", token);
  if (!result.ok) return { ...result, data: null };
  const factors = Array.isArray(result.data?.factors) ? result.data.factors : [];
  return { ok: true, status: result.status, data: factors, error: null };
}

export async function listGoTruePasskeys(token: string): Promise<GoTrueResult<PasskeySummary[]>> {
  const result = await gotrueRequest<PasskeySummary[] | { passkeys?: PasskeySummary[] }>(
    "/passkeys",
    token,
  );
  if (!result.ok) return { ...result, data: null };
  const data = result.data;
  const passkeys = Array.isArray(data)
    ? data
    : Array.isArray(data?.passkeys)
      ? data.passkeys
      : [];
  return { ok: true, status: result.status, data: passkeys, error: null };
}

export async function unenrollGoTrueFactor(
  token: string,
  factorId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const result = await gotrueRequest<unknown>(
    `/factors/${encodeURIComponent(factorId)}`,
    token,
    { method: "DELETE" },
  );
  if (result.ok || result.status === 404) return { ok: true, error: null };
  return { ok: false, error: result.error ?? "Could not remove the hidden factor." };
}

export async function getPasskeyMfaRow(userId: string): Promise<PasskeyMfaRow | null> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service role is not configured.");
  const { data, error } = await service
    .from("passkey_mfa")
    .select("user_id, factor_id, secret_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PasskeyMfaRow | null) ?? null;
}

export async function savePasskeyMfaRow(
  userId: string,
  factorId: string,
  secretEncrypted: string,
): Promise<void> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service role is not configured.");
  const { error } = await service.from("passkey_mfa").upsert(
    {
      user_id: userId,
      factor_id: factorId,
      secret_encrypted: secretEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function deletePasskeyMfaRow(userId: string): Promise<void> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service role is not configured.");
  const { error } = await service.from("passkey_mfa").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export function passkeyEncryptionConfigured(): boolean {
  try {
    return encryptionKey().length === 32;
  } catch {
    return false;
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.PASSKEY_MFA_KEY?.trim();
  if (!raw) throw new Error("PASSKEY_MFA_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PASSKEY_MFA_KEY must be 32 bytes of base64.");
  return key;
}

export function encryptPasskeySecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPasskeySecret(payload: string): string {
  const [ivPart, tagPart, ciphertextPart] = payload.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Stored passkey secret is malformed.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotp(secret: string, at = Date.now()): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(at / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/[\s=]+/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid TOTP secret.");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export async function verifyTotpWithToken(
  token: string,
  factorId: string,
  secret: string,
): Promise<{ session: GoTrueSession | null; error: string | null }> {
  const challenge = await gotrueRequest<{ id?: string }>(
    `/factors/${encodeURIComponent(factorId)}/challenge`,
    token,
    { method: "POST", body: {} },
  );
  if (!challenge.ok || !challenge.data?.id) {
    return { session: null, error: challenge.error ?? "Could not start the verification." };
  }

  const verify = await gotrueRequest<GoTrueSession>(
    `/factors/${encodeURIComponent(factorId)}/verify`,
    token,
    {
      method: "POST",
      body: {
        challenge_id: challenge.data.id,
        code: generateTotp(secret),
      },
    },
  );
  if (!verify.ok || !verify.data?.access_token) {
    return { session: null, error: verify.error ?? "Could not complete the verification." };
  }
  const session = verify.data;
  return {
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    },
    error: null,
  };
}

export function validatePasskeyEnrollmentFactor(
  factors: GoTrueFactor[],
  factorId: string,
): string | null {
  const factor = factors.find((entry) => entry.id === factorId);
  if (!factor) return "The hidden verification factor was not found.";
  if (factor.factor_type !== "totp") return "The hidden verification factor has the wrong type.";
  if (factor.friendly_name !== HIDDEN_PASSKEY_TOTP_NAME) {
    return "The hidden verification factor has the wrong name.";
  }
  if (factor.status !== "unverified" && factor.status !== "verified") {
    return "The hidden verification factor is not ready.";
  }
  return null;
}

export function validatePasskeySessions(
  passwordToken: string,
  passkeyToken: string,
  passwordUserId: string,
  passkeyUserId: string,
): string | null {
  if (passwordUserId !== passkeyUserId) return "Those sign-ins belong to different accounts.";

  const passwordClaims = decodeJwtClaims(passwordToken);
  const passkeyClaims = decodeJwtClaims(passkeyToken);
  if (!passwordClaims || !passkeyClaims) return "Could not read the sign-in tokens.";

  const passwordMethods = amrMethods(passwordClaims);
  if (!passwordMethods.includes("password")) {
    return "The first step was not a password sign-in. Sign in with your password and try again.";
  }

  const passkeyMethods = amrMethods(passkeyClaims);
  const passkeyMethod = passkeyMethods.some((method) =>
    ["passkey", "webauthn", "mfa/webauthn"].includes(method),
  );
  if (!passkeyMethod) return "The second step was not a passkey sign-in.";

  if (!passwordClaims.session_id || !passkeyClaims.session_id) {
    return "Those sign-ins are missing a session identifier.";
  }
  if (passwordClaims.session_id === passkeyClaims.session_id) {
    return "A fresh passkey sign-in is required.";
  }

  if (passwordClaims.sub !== passwordUserId || passkeyClaims.sub !== passkeyUserId) {
    return "The sign-in identity could not be verified.";
  }
  const now = Date.now();
  if (![passwordClaims, passkeyClaims].every((claims) => typeof claims.exp === "number" && claims.exp * 1000 > now)) {
    return "Your sign-in has expired. Sign in again.";
  }
  // Token refresh changes iat; only the authentication event proves a recent ceremony.
  const events = Array.isArray(passkeyClaims.amr) ? passkeyClaims.amr : [];
  const authenticatedAt = Math.max(0, ...events.flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const { method, timestamp } = event as { method?: string; timestamp?: number };
    return ["passkey", "webauthn", "mfa/webauthn"].includes(method ?? "") && typeof timestamp === "number" ? [timestamp * 1000] : [];
  }));
  if (!authenticatedAt || now - authenticatedAt > PASSKEY_SESSION_MAX_AGE_MS || authenticatedAt > now + 30_000) {
    return "The passkey sign-in has expired. Use your passkey again.";
  }

  return null;
}

export function getSafeSession(session: GoTrueSession): GoTrueSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
}

/** A passkey ceremony can authorise only one elevation, even across concurrent requests. */
export async function consumePasskeySession(userId: string, token: string): Promise<boolean> {
  const sessionId = decodeJwtClaims(token)?.session_id;
  if (!sessionId) return false;
  const service = getServiceSupabase();
  if (!service) throw new Error("Service role is not configured.");
  const { error } = await service.from("passkey_mfa_uses").insert({ session_id: sessionId, user_id: userId });
  if (error?.code === "23505") return false;
  if (error) throw new Error("Could not record passkey verification.");
  return true;
}
