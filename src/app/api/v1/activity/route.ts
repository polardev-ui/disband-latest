import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { oauthCaller, oauthError, oauthJson, OAUTH_CORS } from "@/lib/oauth.server";
import { sanitizeActivity } from "@/lib/activity";

/*
 Custom Rich Presence for developers. A game (or its server) holding a
 Sign in with Disband token with the activities.write scope sets what the
 player is doing:

   PUT /api/v1/activity
   Authorization: Bearer dsb_at_…
   { "details": "Ranked match", "state": "Round 3 of 12",
     "started_at": "2026-10-29T14:00:00Z", "large_image": "https://…",
     "expires_in": 600 }

 The game's name is always the Link's name, so a token can't claim to be a
 different game. expires_in is capped at an hour; renew while playing, or
 DELETE when the session ends.
*/

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

export async function PUT(req: Request) {
  const caller = await oauthCaller(req);
  if (!caller) return oauthError("invalid_token", "Missing, expired or revoked access token.", 401);
  if (!caller.scopes.includes("activities.write")) return oauthError("insufficient_scope", "This token needs the activities.write scope.", 403);
  const limit = rateLimit(`activity:${caller.userId}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const supabase = getServiceSupabase();
  if (!supabase) return oauthError("temporarily_unavailable", "Try again shortly.", 503);
  const { data: link } = await supabase.from("oauth_links").select("name").eq("id", caller.linkId).maybeSingle();
  if (!link) return oauthError("invalid_token", "That app no longer exists.", 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return oauthError("invalid_request", "Send a JSON body.");
  const ttl = Math.max(30, Math.min(3600, Number(body.expires_in ?? 600) || 600)) * 1000;
  const activity = sanitizeActivity(body, { name: link.name, source: "api", applicationId: caller.linkId, ttlMs: ttl });
  if (!activity) return oauthError("invalid_request", "Couldn't read that activity.");

  const { error } = await supabase
    .from("profiles")
    .update({ activity, activity_updated_at: new Date().toISOString() })
    .eq("id", caller.userId);
  if (error) return oauthError("server_error", error.message, 500);
  return oauthJson({ activity });
}

export async function DELETE(req: Request) {
  const caller = await oauthCaller(req);
  if (!caller) return oauthError("invalid_token", "Missing, expired or revoked access token.", 401);
  if (!caller.scopes.includes("activities.write")) return oauthError("insufficient_scope", "This token needs the activities.write scope.", 403);
  const supabase = getServiceSupabase();
  if (!supabase) return oauthError("temporarily_unavailable", "Try again shortly.", 503);
  // Only clear an activity this app set; never someone's detected game.
  const { data: profile } = await supabase.from("profiles").select("activity").eq("id", caller.userId).maybeSingle();
  const current = (profile?.activity ?? null) as { application_id?: string | null } | null;
  if (current?.application_id === caller.linkId) {
    await supabase.from("profiles").update({ activity: null, activity_updated_at: new Date().toISOString() }).eq("id", caller.userId);
  }
  return oauthJson({ ok: true });
}
