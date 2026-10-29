import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

/** The apps you have signed in to with Disband. */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("oauth_grants")
    .select("link_id, scopes, created_at, updated_at, link:oauth_links!link_id(name, website, icon_url, revoked_at)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const grants = ((data ?? []) as unknown as { link: { revoked_at: string | null } | null }[]).filter((g) => g.link && !g.link.revoked_at);
  return NextResponse.json({ grants });
}

/** Take an app's access away: its tokens for you stop working at once. */
export async function DELETE(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const linkId = new URL(req.url).searchParams.get("link_id");
  if (!linkId) return NextResponse.json({ error: "Which app?" }, { status: 400 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  await supabase.from("oauth_grants").delete().eq("user_id", user.id).eq("link_id", linkId);
  await supabase.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).eq("link_id", linkId).is("revoked_at", null);
  return NextResponse.json({ ok: true });
}
