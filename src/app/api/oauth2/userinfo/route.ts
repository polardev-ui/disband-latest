import { getServiceSupabase } from "@/lib/supabase/server";
import { oauthCaller, oauthError, oauthJson, OAUTH_CORS } from "@/lib/oauth.server";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

/** Who signed in: the fields their scopes allow. */
export async function GET(req: Request) {
  const caller = await oauthCaller(req);
  if (!caller) return oauthError("invalid_token", "Missing, expired or revoked access token.", 401);
  const supabase = getServiceSupabase();
  if (!supabase) return oauthError("temporarily_unavailable", "Try again shortly.", 503);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, banner_url, accent_color, created_at")
    .eq("id", caller.userId)
    .maybeSingle();
  if (!profile) return oauthError("invalid_token", "That account no longer exists.", 401);

  const info: Record<string, unknown> = {
    id: profile.id,
    sub: profile.id,
    username: profile.username,
    display_name: profile.display_name ?? profile.username,
    avatar_url: profile.avatar_url,
    banner_url: profile.banner_url,
    accent_color: profile.accent_color,
    created_at: profile.created_at,
  };
  if (caller.scopes.includes("email")) {
    const { data } = await supabase.auth.admin.getUserById(caller.userId);
    info.email = data.user?.email ?? null;
    info.email_verified = !!data.user?.email_confirmed_at;
  }
  return oauthJson(info);
}
