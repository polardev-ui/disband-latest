import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

/*
 "Sign in with Disband": an OAuth 2.0 provider for the Links developers make
 in Settings. Authorization-code flow, with PKCE (S256) required for apps that
 have no secret. Codes, access tokens and refresh tokens are random strings
 handed out once and stored only as SHA-256 hashes.
*/

export const OAUTH_SCOPES = {
  identify: "Your username, display name and avatar",
  email: "Your email address",
  "activities.write": "Show what you're playing in their game on your profile",
} as const;
export type OAuthScope = keyof typeof OAUTH_SCOPES;

export const CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 3600_000;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "identify email" or "identify,email" → validated, de-duplicated scopes. */
export function parseScopes(raw: string | null | undefined): OAuthScope[] | null {
  const parts = (raw ?? "identify").split(/[\s,+]+/).map((s) => s.trim()).filter(Boolean);
  const scopes = [...new Set(parts.length ? parts : ["identify"])];
  if (!scopes.every((s): s is OAuthScope => s in OAUTH_SCOPES)) return null;
  return scopes as OAuthScope[];
}

/** Redirect URIs must be https (or http on a local host for development). */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** What a Link's owner sees of it. Never the secret hash. */
export const LINK_COLUMNS = "id, name, description, website, icon_url, redirect_uris, secret_prefix, created_at";

/** Clean a redirect list: trimmed, valid, unique, at most ten. */
export function cleanRedirects(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const list = [...new Set(raw.map((u) => String(u).trim()).filter(Boolean))];
  if (list.length === 0 || list.length > 10 || !list.every(isValidRedirectUri)) return null;
  return list;
}

/** PKCE: S256 is base64url(sha256(verifier)); plain is the verifier itself. */
export function pkceMatches(verifier: string, challenge: string, method: string | null): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = method === "plain" ? verifier : createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Token and user-info endpoints are called from other sites' servers and SPAs. */
export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function oauthJson(body: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { ...OAUTH_CORS, "Cache-Control": "no-store", Pragma: "no-cache", ...extra },
  });
}

/** RFC 6749 error body. */
export function oauthError(error: string, description: string, status = 400) {
  return oauthJson({ error, error_description: description }, status);
}

export interface OAuthCaller {
  userId: string;
  linkId: string;
  scopes: string[];
}

/** The user and app behind a `Bearer` access token, or null. */
export async function oauthCaller(req: Request): Promise<OAuthCaller | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith("dsb_at_") || token.length > 200) return null;
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("oauth_tokens")
    .select("user_id, link_id, scopes, expires_at, revoked_at, oauth_links!inner(revoked_at)")
    .eq("access_hash", sha256(token))
    .maybeSingle();
  const row = data as {
    user_id: string; link_id: string; scopes: string[]; expires_at: string; revoked_at: string | null;
    oauth_links: { revoked_at: string | null } | null;
  } | null;
  if (!row || row.revoked_at || row.oauth_links?.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return { userId: row.user_id, linkId: row.link_id, scopes: row.scopes };
}

/** Issue a fresh access + refresh token pair. */
export async function issueTokens(linkId: string, userId: string, scopes: string[]) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("Unavailable");
  const access = randomToken("dsb_at_");
  const refresh = randomToken("dsb_rt_");
  const { error } = await supabase.from("oauth_tokens").insert({
    access_hash: sha256(access),
    refresh_hash: sha256(refresh),
    link_id: linkId,
    user_id: userId,
    scopes,
    expires_at: new Date(Date.now() + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope: scopes.join(" "),
  };
}
