import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isBotScope } from "@/lib/bot-auth";

/**
 * The bot's public install link: one URL anyone can open to add the bot to
 * a space they manage, with the permissions picked here. Asking again with
 * the same permissions returns the same link; new permissions replace it.
 */
export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`bot:install-link:${user.id}`, 20, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const { botId, scopes } = (await req.json().catch(() => ({}))) as { botId?: string; scopes?: unknown };
  if (typeof botId !== "string" || !Array.isArray(scopes) || !scopes.every((s) => typeof s === "string" && isBotScope(s))) {
    return NextResponse.json({ error: "Pick a bot and its permissions." }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  const { data, error } = await supabase.rpc("bot_install_link", { p_bot_id: botId, p_actor_id: user.id, p_scopes: scopes });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ code: data, url: `${checkoutOrigin(req)}/bot-invite/${data}` });
}
