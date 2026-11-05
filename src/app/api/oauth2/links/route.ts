import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { LINK_COLUMNS, cleanRedirects, randomToken, sha256 } from "@/lib/oauth.server";

const MAX_LINKS = 25;

/** Your Links. */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("oauth_links")
    .select(LINK_COLUMNS)
    .eq("owner_id", user.id)
    .is("revoked_at", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}

/** Make a Link. The secret comes back once and is stored only as a hash. */
export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`oauth-link:${user.id}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; website?: string; redirect_uris?: unknown };
  const name = (body.name ?? "").trim();
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Give it a name of 2 to 40 characters." }, { status: 400 });
  const redirects = cleanRedirects(body.redirect_uris);
  if (!redirects) return NextResponse.json({ error: "Add at least one redirect URL. Each must be https (http only for localhost)." }, { status: 400 });
  const website = body.website?.trim() || null;
  if (website && !/^https?:\/\//i.test(website)) return NextResponse.json({ error: "The website should start with https://" }, { status: 400 });

  const { count } = await supabase.from("oauth_links").select("id", { count: "exact", head: true }).eq("owner_id", user.id).is("revoked_at", null);
  if ((count ?? 0) >= MAX_LINKS) return NextResponse.json({ error: `You can have up to ${MAX_LINKS} Links.` }, { status: 400 });

  const secret = randomToken("dsb_cs_");
  const { data, error } = await supabase
    .from("oauth_links")
    .insert({ owner_id: user.id, name, website, redirect_uris: redirects, secret_hash: sha256(secret), secret_prefix: secret.slice(0, 11) })
    .select(LINK_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data, client_secret: secret });
}
