import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type AppInfo = { name: string; icon_url: string | null };

// Names rarely change; a per-instance cache keeps the desktop app from
// asking Discord again for every Rich Presence update.
const cache = new Map<string, { info: AppInfo | null; at: number }>();
const TTL_MS = 6 * 3600_000;

/**
 * The name and icon behind a Rich Presence application id. Games that speak
 * Discord's protocol send only a numeric id; Discord publishes the name for
 * it. A Disband Link id resolves to the Link.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(hit.info);

  let info: AppInfo | null = null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const supabase = getServiceSupabase();
    const { data } = supabase ? await supabase.from("oauth_links").select("name, icon_url, revoked_at").eq("id", id).maybeSingle() : { data: null };
    if (data && !data.revoked_at) info = { name: data.name, icon_url: data.icon_url };
  } else if (/^\d{15,22}$/.test(id)) {
    try {
      const res = await fetch(`https://discord.com/api/v10/applications/${id}/rpc`, { headers: { "User-Agent": "Disband (https://www.disband.dev)" } });
      if (res.ok) {
        const app = (await res.json()) as { name?: string; icon?: string | null };
        if (app.name) info = { name: app.name, icon_url: app.icon ? `https://cdn.discordapp.com/app-icons/${id}/${app.icon}.png?size=128` : null };
      }
    } catch {
      // Unknown or unreachable: the caller falls back to the process name.
    }
  } else {
    return NextResponse.json({ error: "Bad application id" }, { status: 400 });
  }
  cache.set(id, { info, at: Date.now() });
  return reply(info);
}

function reply(info: AppInfo | null) {
  return NextResponse.json(info ?? { error: "Unknown application" }, {
    status: info ? 200 : 404,
    headers: { "Cache-Control": "public, max-age=21600" },
  });
}
