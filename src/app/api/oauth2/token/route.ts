import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { issueTokens, oauthError, oauthJson, OAUTH_CORS, pkceMatches, sameHash, sha256 } from "@/lib/oauth.server";

/** Form-encoded per RFC 6749, with JSON accepted too. Client credentials may also arrive as HTTP Basic. */
async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const params: Record<string, string> = {};
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") params[k] = v;
  } else {
    const form = new URLSearchParams(await req.text());
    for (const [k, v] of form) params[k] = v;
  }
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":");
    if (id && !params.client_id) params.client_id = decodeURIComponent(id);
    if (secret && !params.client_secret) params.client_secret = decodeURIComponent(secret);
  }
  return params;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = rateLimit(`oauth-token:${ip}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const p = await readParams(req);
  const supabase = getServiceSupabase();
  if (!supabase) return oauthError("temporarily_unavailable", "Try again shortly.", 503);
  if (!p.client_id || !/^[0-9a-f-]{36}$/i.test(p.client_id)) return oauthError("invalid_client", "Unknown client_id.", 401);

  const { data: link } = await supabase.from("oauth_links").select("id, secret_hash, revoked_at").eq("id", p.client_id).maybeSingle();
  if (!link || link.revoked_at) return oauthError("invalid_client", "Unknown client_id.", 401);
  // A secret, when sent, must be right. Apps without one prove themselves with PKCE below.
  if (p.client_secret) {
    if (!link.secret_hash || !sameHash(sha256(p.client_secret), link.secret_hash)) return oauthError("invalid_client", "Wrong client_secret.", 401);
  }

  if (p.grant_type === "authorization_code") {
    if (!p.code) return oauthError("invalid_request", "Missing code.");
    const { data: code } = await supabase
      .from("oauth_codes")
      .select("code_hash, link_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at")
      .eq("code_hash", sha256(p.code))
      .maybeSingle();
    if (!code || code.link_id !== link.id) return oauthError("invalid_grant", "That code isn't valid.");
    if (code.used_at || new Date(code.expires_at).getTime() <= Date.now()) return oauthError("invalid_grant", "That code has expired or was already used.");
    if (p.redirect_uri && p.redirect_uri !== code.redirect_uri) return oauthError("invalid_grant", "redirect_uri doesn't match the one used to get the code.");
    if (code.code_challenge) {
      if (!p.code_verifier || !pkceMatches(p.code_verifier, code.code_challenge, code.code_challenge_method)) {
        return oauthError("invalid_grant", "code_verifier doesn't match.");
      }
    } else if (!p.client_secret) {
      return oauthError("invalid_client", "This app must send its client_secret.", 401);
    }
    // Single use, claimed atomically: a second exchange of the same code finds it used.
    const { data: claimed } = await supabase
      .from("oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", code.code_hash)
      .is("used_at", null)
      .select("code_hash");
    if (!claimed?.length) return oauthError("invalid_grant", "That code was already used.");
    return oauthJson(await issueTokens(link.id, code.user_id, code.scopes));
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError("invalid_request", "Missing refresh_token.");
    const { data: old } = await supabase
      .from("oauth_tokens")
      .select("id, link_id, user_id, scopes, refresh_expires_at, revoked_at")
      .eq("refresh_hash", sha256(p.refresh_token))
      .maybeSingle();
    if (!old || old.link_id !== link.id || old.revoked_at) return oauthError("invalid_grant", "That refresh token isn't valid.");
    if (!old.refresh_expires_at || new Date(old.refresh_expires_at).getTime() <= Date.now()) return oauthError("invalid_grant", "That refresh token has expired.");
    // Refresh tokens rotate on every use (the old pair dies below), which is
    // what keeps a public app's refresh token safe without a secret.
    const { data: grant } = await supabase.from("oauth_grants").select("user_id").eq("user_id", old.user_id).eq("link_id", link.id).maybeSingle();
    if (!grant) return oauthError("invalid_grant", "The person removed this app's access.");
    await supabase.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", old.id);
    return oauthJson(await issueTokens(link.id, old.user_id, old.scopes));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
