import { getServiceSupabase } from "@/lib/supabase/server";
import { OAUTH_CORS, sha256 } from "@/lib/oauth.server";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

/** RFC 7009: revoke an access or refresh token. Always 200, so it can't be used to probe tokens. */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const token = type.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as { token?: string }).token
    : new URLSearchParams(await req.text()).get("token");
  const supabase = getServiceSupabase();
  if (token && supabase) {
    const hash = sha256(token);
    const now = new Date().toISOString();
    await supabase.from("oauth_tokens").update({ revoked_at: now }).eq("access_hash", hash).is("revoked_at", null);
    await supabase.from("oauth_tokens").update({ revoked_at: now }).eq("refresh_hash", hash).is("revoked_at", null);
  }
  return new Response(null, { status: 200, headers: OAUTH_CORS });
}
