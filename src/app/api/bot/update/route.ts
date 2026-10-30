import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { isBotScope } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", `owner:${user.id}`);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as {
      botId?: string;
      name?: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      bio?: string | null;
      scopes?: string[];
    };

    if (!body.botId) {
      return NextResponse.json({ error: "botId is required." }, { status: 400 });
    }

    // Verify ownership
    const { data: bot } = await service
      .from("bots")
      .select("id, user_id, name, scopes")
      .eq("id", body.botId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!bot) {
      return NextResponse.json({ error: "Bot not found or not owned by you." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 25) {
        return NextResponse.json({ error: "Bot name must be between 1 and 25 characters." }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.avatarUrl !== undefined) {
      updates.avatar_url = body.avatarUrl;
    }

    if (body.bannerUrl !== undefined) {
      // banner_url lives on the linked profile, not the bots table
    }

    if (body.scopes !== undefined) {
      if (!Array.isArray(body.scopes) || body.scopes.length === 0 || !body.scopes.every(isBotScope)) {
        return NextResponse.json({ error: "Invalid scopes." }, { status: 400 });
      }
      updates.scopes = body.scopes;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await service.from("bots").update(updates).eq("id", body.botId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Update the linked profile (display name, avatar, bio)
    const profileUpdates: Record<string, unknown> = {};
    if (body.name !== undefined) profileUpdates.display_name = body.name.trim();
    if (body.avatarUrl !== undefined) profileUpdates.avatar_url = body.avatarUrl;
    if (body.bio !== undefined) profileUpdates.bio = body.bio?.trim() || null;
    if (body.bannerUrl !== undefined) profileUpdates.banner_url = body.bannerUrl;

    if (Object.keys(profileUpdates).length > 0) {
      await service.from("profiles").update(profileUpdates).eq("id", bot.user_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("bot/update error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
