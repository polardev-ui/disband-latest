import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/*
 Bot moderation for Disband staff (Settings → Management → Bots). Search any
 bot, see where it is installed and what it has posted, and warn its owner
 or switch it off. Deactivating sets revoked_at, which every bot endpoint
 already refuses, and is logged with the reason the owner is told.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staff(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Unavailable" }, { status: 503 }) };
  const { data: isStaff } = await supabase.rpc("is_platform_staff", { p_user: user.id });
  if (!isStaff) return { error: NextResponse.json({ error: "Only Disband staff can do that." }, { status: 403 }) };
  return { supabase, user };
}

type BotRow = {
  id: string; user_id: string; owner_id: string; name: string; avatar_url: string | null; description: string | null;
  scopes: string[]; revoked_at: string | null; created_at: string; last_seen_at: string | null;
};
const BOT_COLUMNS = "id, user_id, owner_id, name, avatar_url, description, scopes, revoked_at, created_at, last_seen_at";

export async function GET(req: Request) {
  const r = await staff(req);
  if ("error" in r) return r.error;
  const { supabase } = r;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "Bad bot id" }, { status: 400 });
    const { data: bot } = await supabase.from("bots").select(BOT_COLUMNS).eq("id", id).maybeSingle();
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    const b = bot as BotRow;
    const [{ data: owner }, { data: grants }, { data: messages }, { data: log }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", b.owner_id).maybeSingle(),
      supabase.from("bot_grants").select("server_id, scopes, created_at").eq("bot_id", b.id),
      supabase.from("messages").select("id, content, created_at, channel_id").eq("author_id", b.user_id).order("created_at", { ascending: false }).limit(25),
      supabase.from("bot_moderation_log").select("action, reason, created_at, actor_id").eq("bot_id", b.id).order("created_at", { ascending: false }).limit(20),
    ]);
    const serverIds = (grants ?? []).map((g: { server_id: string }) => g.server_id);
    const channelIds = [...new Set((messages ?? []).map((m: { channel_id: string }) => m.channel_id))];
    const [{ data: servers }, { data: channels }] = await Promise.all([
      serverIds.length ? supabase.from("servers").select("id, name, icon_url, suspended_at").in("id", serverIds) : Promise.resolve({ data: [] }),
      channelIds.length ? supabase.from("channels").select("id, name, server_id").in("id", channelIds) : Promise.resolve({ data: [] }),
    ]);
    const channelById = new Map((channels ?? []).map((c: { id: string; name: string; server_id: string }) => [c.id, c]));
    return NextResponse.json({
      bot: b,
      owner,
      installs: (grants ?? []).map((g: { server_id: string; scopes: string[]; created_at: string }) => ({
        ...g,
        server: (servers ?? []).find((s: { id: string }) => s.id === g.server_id) ?? null,
      })),
      messages: (messages ?? []).map((m: { id: string; content: string | null; created_at: string; channel_id: string }) => ({
        ...m,
        channel: channelById.get(m.channel_id)?.name ?? null,
      })),
      log: log ?? [],
    });
  }

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  let rows: BotRow[] = [];
  if (UUID.test(q)) {
    const { data } = await supabase.from("bots").select(BOT_COLUMNS).or(`id.eq.${q},user_id.eq.${q},owner_id.eq.${q}`).limit(25);
    rows = (data ?? []) as BotRow[];
  } else {
    // Escape the LIKE wildcards and PostgREST's own delimiters.
    const term = q.replace(/[%_,()\\]/g, " ").trim();
    const byName = supabase.from("bots").select(BOT_COLUMNS).order("created_at", { ascending: false }).limit(25);
    const { data: named } = term ? await byName.ilike("name", `%${term}%`) : await byName;
    rows = (named ?? []) as BotRow[];
    if (term) {
      const { data: owners } = await supabase.from("profiles").select("id").ilike("username", `%${term}%`).limit(10);
      const ownerIds = (owners ?? []).map((o: { id: string }) => o.id);
      if (ownerIds.length) {
        const { data: owned } = await supabase.from("bots").select(BOT_COLUMNS).in("owner_id", ownerIds).limit(25);
        for (const b of (owned ?? []) as BotRow[]) if (!rows.some((x) => x.id === b.id)) rows.push(b);
      }
    }
  }

  const ownerIds = [...new Set(rows.map((b) => b.owner_id))];
  const botIds = rows.map((b) => b.id);
  const [{ data: owners }, { data: grants }] = await Promise.all([
    ownerIds.length ? supabase.from("profiles").select("id, username, display_name").in("id", ownerIds) : Promise.resolve({ data: [] }),
    botIds.length ? supabase.from("bot_grants").select("bot_id").in("bot_id", botIds) : Promise.resolve({ data: [] }),
  ]);
  const installs = new Map<string, number>();
  for (const g of (grants ?? []) as { bot_id: string }[]) installs.set(g.bot_id, (installs.get(g.bot_id) ?? 0) + 1);
  return NextResponse.json({
    bots: rows.slice(0, 40).map((b) => ({
      ...b,
      owner: (owners ?? []).find((o: { id: string }) => o.id === b.owner_id) ?? null,
      installs: installs.get(b.id) ?? 0,
    })),
  });
}

/** { bot_id, action: "warn" | "deactivate" | "reactivate", reason } */
export async function POST(req: Request) {
  const r = await staff(req);
  if ("error" in r) return r.error;
  const { supabase, user } = r;
  const limit = rateLimit(`bot-moderation:${user.id}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { bot_id?: string; action?: string; reason?: string };
  const action = body.action;
  const reason = (body.reason ?? "").trim().slice(0, 500);
  if (!body.bot_id || !UUID.test(body.bot_id)) return NextResponse.json({ error: "Bad bot id" }, { status: 400 });
  if (action !== "warn" && action !== "deactivate" && action !== "reactivate") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Give a reason. The owner sees it." }, { status: 400 });

  const { data: bot } = await supabase.from("bots").select("id, name, owner_id, revoked_at").eq("id", body.bot_id).maybeSingle();
  if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

  if (action === "deactivate") {
    if (bot.revoked_at) return NextResponse.json({ error: "It's already off." }, { status: 409 });
    await supabase.from("bots").update({ revoked_at: new Date().toISOString() }).eq("id", bot.id);
  }
  if (action === "reactivate") {
    // Only a bot staff switched off can be switched back on; an owner's own
    // revoke stays revoked.
    const { data: last } = await supabase.from("bot_moderation_log").select("action").eq("bot_id", bot.id)
      .in("action", ["deactivate", "reactivate"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!bot.revoked_at || last?.action !== "deactivate") return NextResponse.json({ error: "Only a bot staff deactivated can be reactivated." }, { status: 409 });
    await supabase.from("bots").update({ revoked_at: null }).eq("id", bot.id);
  }

  const { error: logError } = await supabase.from("bot_moderation_log").insert({ bot_id: bot.id, actor_id: user.id, action, reason });
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  const title = action === "warn" ? `A warning about ${bot.name}` : action === "deactivate" ? `${bot.name} has been deactivated` : `${bot.name} is back on`;
  const lead = action === "warn"
    ? "Disband staff reviewed your bot and found a problem. Fix it to keep the bot running."
    : action === "deactivate"
      ? "Disband staff switched your bot off for breaking the Terms of Service. Its token no longer works."
      : "Disband staff have switched your bot back on.";
  await supabase.from("notifications").insert({ user_id: bot.owner_id, type: "system", title, body: `${lead} Reason: ${reason}`, link: null });
  return NextResponse.json({ ok: true });
}
