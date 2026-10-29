import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { CODE_TTL_MS, OAUTH_SCOPES, parseScopes, randomToken, sha256 } from "@/lib/oauth.server";

interface LinkRow {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  icon_url: string | null;
  redirect_uris: string[];
  secret_hash: string | null;
  revoked_at: string | null;
  owner: { username: string | null; display_name: string | null } | null;
}

async function loadLink(clientId: string | null) {
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("oauth_links")
    .select("id, name, description, website, icon_url, redirect_uris, secret_hash, revoked_at, owner:profiles!owner_id(username, display_name)")
    .eq("id", clientId)
    .maybeSingle();
  const link = data as unknown as LinkRow | null;
  return link && !link.revoked_at ? link : null;
}

/**
 * What the consent screen shows. Validates the request first, so a bad
 * client_id or redirect never reaches a "Authorise" button.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const link = await loadLink(url.searchParams.get("client_id"));
  if (!link) return NextResponse.json({ error: "This app isn't registered with Disband, or it has been removed." }, { status: 404 });
  const redirect = url.searchParams.get("redirect_uri") ?? link.redirect_uris[0];
  if (!redirect || !link.redirect_uris.includes(redirect)) {
    return NextResponse.json({ error: "That redirect URL isn't registered for this app." }, { status: 400 });
  }
  const scopes = parseScopes(url.searchParams.get("scope"));
  if (!scopes) return NextResponse.json({ error: "This app asked for permissions Disband doesn't offer." }, { status: 400 });
  if (url.searchParams.get("response_type") && url.searchParams.get("response_type") !== "code") {
    return NextResponse.json({ error: "Only the authorization-code flow is supported." }, { status: 400 });
  }
  if (!link.secret_hash && !url.searchParams.get("code_challenge")) {
    return NextResponse.json({ error: "This app must use PKCE (code_challenge)." }, { status: 400 });
  }
  return NextResponse.json({
    app: {
      id: link.id,
      name: link.name,
      description: link.description,
      website: link.website,
      icon_url: link.icon_url,
      owner: link.owner?.display_name || link.owner?.username || null,
    },
    redirect_uri: redirect,
    scopes: scopes.map((s) => ({ id: s, label: OAUTH_SCOPES[s] })),
  });
}

/** The signed-in person approved: mint a single-use code and hand back the redirect. */
export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`oauth-authorize:${user.id}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as {
    client_id?: string; redirect_uri?: string; scope?: string; state?: string;
    code_challenge?: string; code_challenge_method?: string;
  };
  const link = await loadLink(body.client_id ?? null);
  if (!link) return NextResponse.json({ error: "Unknown app." }, { status: 404 });
  const redirect = body.redirect_uri ?? link.redirect_uris[0];
  if (!redirect || !link.redirect_uris.includes(redirect)) return NextResponse.json({ error: "Unregistered redirect URL." }, { status: 400 });
  const scopes = parseScopes(body.scope);
  if (!scopes) return NextResponse.json({ error: "Unknown scope." }, { status: 400 });
  const challenge = body.code_challenge?.trim() || null;
  const method = challenge ? (body.code_challenge_method === "plain" ? "plain" : "S256") : null;
  if (!link.secret_hash && !challenge) return NextResponse.json({ error: "PKCE is required for this app." }, { status: 400 });
  if (challenge && !/^[A-Za-z0-9\-._~]{43,128}$/.test(challenge)) return NextResponse.json({ error: "Malformed code_challenge." }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const code = randomToken("dsb_ac_", 24);
  const { error } = await supabase.from("oauth_codes").insert({
    code_hash: sha256(code),
    link_id: link.id,
    user_id: user.id,
    redirect_uri: redirect,
    scopes,
    code_challenge: challenge,
    code_challenge_method: method,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("oauth_grants").upsert(
    { user_id: user.id, link_id: link.id, scopes, updated_at: new Date().toISOString() },
    { onConflict: "user_id,link_id" },
  );

  const target = new URL(redirect);
  target.searchParams.set("code", code);
  if (body.state) target.searchParams.set("state", body.state.slice(0, 500));
  return NextResponse.json({ redirect: target.toString() });
}
