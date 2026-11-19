import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapDiscordTemplate, parseTemplateCode } from "@/lib/discord-template";

/*
 Look up a Discord server template (discord.new/CODE) and return it mapped
 for create_server_from_template. Templates are public on Discord's side;
 this only exists because Discord's API can't be called from the browser.
*/
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limit = rateLimit(`discord:template:${user.id}`, 20, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const code = parseTemplateCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!code) {
    return NextResponse.json({ error: "That doesn't look like a Discord template link." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`https://discord.com/api/v10/guilds/templates/${encodeURIComponent(code)}`, {
      headers: { "User-Agent": "DisbandTemplateImport (https://disband.dev, 1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 });
  }

  if (res.status === 404) {
    return NextResponse.json({ error: "Discord couldn't find that template. Check the link, or it may have been deleted." }, { status: 404 });
  }
  if (res.status === 429) {
    return NextResponse.json({ error: "Discord is busy. Try again in a minute." }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Discord couldn't load that template right now." }, { status: 502 });
  }

  try {
    const raw = await res.json();
    return NextResponse.json(mapDiscordTemplate(raw, code));
  } catch {
    return NextResponse.json({ error: "That template couldn't be read." }, { status: 502 });
  }
}
