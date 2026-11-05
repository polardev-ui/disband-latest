import { NextResponse } from "next/server";

/**
 * Art for a game shown in someone's activity, looked up by name (and the
 * Discord application id when the desktop app knows it), so every viewer sees
 * a picture even when the player's client had none.
 *
 * Order: the Discord application's icon, then a Steam store match, then
 * Discord's detectable-games list by name. Results (including "none") are
 * cached per instance and at the CDN.
 */

type Art = { url: string | null };
const cache = new Map<string, { art: Art; at: number }>();
const TTL_MS = 24 * 3600_000;
const UA = { "User-Agent": "Disband (https://www.disband.dev)" };

let detectable: { at: number; byName: Map<string, { id: string; icon: string | null }> } | null = null;

/**
 * Spaces, case and punctuation ignored, so a process name ("CrosshairX",
 * "wallpaper_engine") meets the store title ("Crosshair X", "Wallpaper Engine").
 */
function keyOf(name: string) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

async function discordIcon(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${id}/rpc`, { headers: UA });
    if (!res.ok) return null;
    const app = (await res.json()) as { icon?: string | null };
    return app.icon ? `https://cdn.discordapp.com/app-icons/${id}/${app.icon}.png?size=160` : null;
  } catch {
    return null;
  }
}

async function steamArt(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=GB`,
      { headers: UA },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: { id: number; name: string }[] };
    const want = keyOf(name);
    // Only an exact (normalised) title match: a near miss is the wrong game,
    // and "ARK" matching three different ARK games is no match at all.
    const matches = (json.items ?? []).filter((i) => keyOf(i.name) === want);
    const hit = matches.length === 1 ? matches[0] : undefined;
    return hit ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${hit.id}/header.jpg` : null;
  } catch {
    return null;
  }
}

async function detectableArt(name: string): Promise<string | null> {
  try {
    if (!detectable || Date.now() - detectable.at > TTL_MS) {
      const res = await fetch("https://discord.com/api/v10/applications/detectable", { headers: UA });
      if (!res.ok) return null;
      const list = (await res.json()) as {
        id: string; name: string; icon_hash?: string | null; icon?: string | null; aliases?: string[];
        executables?: { name?: string }[];
      }[];
      const byName = new Map<string, { id: string; icon: string | null }>();
      // Names and alternative names first, for every game; executable names
      // (a bare process name like "wallpaper_engine" is often the .exe) only
      // fill gaps, and generic ones ("game", "launcher") are skipped.
      const GENERIC = new Set(["game", "launcher", "client", "app", "main", "start", "play", "setup", "unity", "win64", "x64", "shipping"]);
      for (const g of list) {
        const entry = { id: g.id, icon: g.icon_hash ?? g.icon ?? null };
        for (const k of [g.name, ...(g.aliases ?? [])]) {
          const key = keyOf(k ?? "");
          if (key.length >= 2 && !byName.has(key)) byName.set(key, entry);
        }
      }
      for (const g of list) {
        const entry = { id: g.id, icon: g.icon_hash ?? g.icon ?? null };
        for (const e of g.executables ?? []) {
          const key = keyOf((e.name ?? "").split("/").pop()!.replace(/\.(exe|app)$/i, ""));
          if (key.length >= 5 && !GENERIC.has(key) && !byName.has(key)) byName.set(key, entry);
        }
      }
      detectable = { at: Date.now(), byName };
    }
    const g = detectable.byName.get(keyOf(name));
    if (!g) return null;
    if (g.icon) return `https://cdn.discordapp.com/app-icons/${g.id}/${g.icon}.png?size=160`;
    return discordIcon(g.id);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 100);
  const app = url.searchParams.get("app") ?? "";
  if (!name && !app) return NextResponse.json({ error: "name or app required" }, { status: 400 });
  if (app && !/^\d{15,22}$/.test(app)) return NextResponse.json({ error: "Bad application id" }, { status: 400 });

  const key = `${app}|${keyOf(name)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(hit.art);

  let found: string | null = null;
  if (app) found = await discordIcon(app);
  if (!found && name) found = await steamArt(name.replace(/[_]+/g, " "));
  if (!found && name) found = await detectableArt(name);

  const art = { url: found };
  if (cache.size > 5000) cache.clear();
  cache.set(key, { art, at: Date.now() });
  return reply(art);
}

function reply(art: Art) {
  return NextResponse.json(art, {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
