import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { LINK_COLUMNS, cleanRedirects } from "@/lib/oauth.server";

type Params = { params: Promise<{ id: string }> };

async function ownLink(req: Request, id: string) {
  const user = await getRouteUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Unavailable" }, { status: 503 }) };
  const { data } = await supabase.from("oauth_links").select("id, owner_id, revoked_at").eq("id", id).maybeSingle();
  if (!data || data.owner_id !== user.id || data.revoked_at) {
    return { error: NextResponse.json({ error: "Link not found." }, { status: 404 }) };
  }
  return { supabase, user };
}

/** Rename it, or change its website, description, icon or redirect URLs. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await ownLink(req, id);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string; website?: string | null; description?: string | null; icon_url?: string | null; redirect_uris?: unknown;
  };
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Give it a name of 2 to 40 characters." }, { status: 400 });
    patch.name = name;
  }
  if (body.website !== undefined) {
    const website = body.website?.trim() || null;
    if (website && !/^https?:\/\//i.test(website)) return NextResponse.json({ error: "The website should start with https://" }, { status: 400 });
    patch.website = website;
  }
  if (body.description !== undefined) patch.description = body.description?.trim().slice(0, 300) || null;
  if (body.icon_url !== undefined) {
    const icon = body.icon_url?.trim() || null;
    if (icon && !/^https:\/\//i.test(icon)) return NextResponse.json({ error: "The icon must be an https URL." }, { status: 400 });
    patch.icon_url = icon;
  }
  if (body.redirect_uris !== undefined) {
    const redirects = cleanRedirects(body.redirect_uris);
    if (!redirects) return NextResponse.json({ error: "Each redirect URL must be https (http only for localhost)." }, { status: 400 });
    patch.redirect_uris = redirects;
  }
  const { data, error } = await r.supabase.from("oauth_links").update(patch).eq("id", id).select(LINK_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}

/** Delete it: its tokens stop working at once. */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const r = await ownLink(req, id);
  if ("error" in r) return r.error;
  const now = new Date().toISOString();
  await r.supabase.from("oauth_links").update({ revoked_at: now, secret_hash: null }).eq("id", id);
  await r.supabase.from("oauth_tokens").update({ revoked_at: now }).eq("link_id", id).is("revoked_at", null);
  await r.supabase.from("oauth_grants").delete().eq("link_id", id);
  return NextResponse.json({ ok: true });
}
