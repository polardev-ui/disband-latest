import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  assignGuildRole,
  ensureGuildRole,
  exchangeCode,
  fetchDiscordUser,
  verifyOAuthState,
} from "@/lib/discord";
import { PUBLIC_ENV } from "@/lib/public-env";

function backTo(guild: string, params: Record<string, string>): NextResponse {
  const url = new URL(`${PUBLIC_ENV.webAppUrl}/discord-connect`);
  url.searchParams.set("guild", guild);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const code = query.get("code") ?? "";
  const state = query.get("state") ?? "";

  const payload = await verifyOAuthState(state);
  if (!code || !payload) {
    return backTo(payload?.guild ?? "", { error: "connect-failed" });
  }

  try {
    const accessToken = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(accessToken);

    const supabase = getServiceSupabase();
    if (!supabase) throw new Error("Service not available");

    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", payload.userId)
      .maybeSingle();
    const roleName = (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      discordUser.username
    ).slice(0, 32);

    const role = await ensureGuildRole(payload.guild, roleName);
    await assignGuildRole(payload.guild, discordUser.id, role.id);

    const { error } = await supabase.from("discord_links").upsert(
      {
        user_id: payload.userId,
        discord_user_id: discordUser.id,
        discord_username: discordUser.username,
        guild_id: payload.guild,
        role_id: role.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("Could not save the link");

    return backTo(payload.guild, { linked: "1" });
  } catch (err) {
    console.error("Discord callback error:", err);
    return backTo(payload.guild, { error: "connect-failed" });
  }
}
