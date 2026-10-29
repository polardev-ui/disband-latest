import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/oauth.server";

type Params = { params: Promise<{ id: string }> };

/** A new client secret. The old one stops working immediately. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`oauth-secret:${user.id}`, 5, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { data } = await supabase.from("oauth_links").select("owner_id, revoked_at").eq("id", id).maybeSingle();
  if (!data || data.owner_id !== user.id || data.revoked_at) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  const secret = randomToken("dsb_cs_");
  const { error } = await supabase.from("oauth_links").update({ secret_hash: sha256(secret), secret_prefix: secret.slice(0, 11) }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client_secret: secret });
}
