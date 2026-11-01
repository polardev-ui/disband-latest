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
      description?: string | null;
      tags?: string[];
      termsUrl?: string | null;
      privacyUrl?: string | null;
      isPublic?: boolean;
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

    if (body.description !== undefined) {
      const d = body.description?.trim() || null;
      if (d && d.length > 400) return NextResponse.json({ error: "Description can be up to 400 characters." }, { status: 400 });
      updates.description = d;
    }

    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
        : [];
      if (tags.length > 5 || tags.some((t) => t.length > 20 || t.includes(","))) {
        return NextResponse.json({ error: "Up to 5 tags, each up to 20 characters." }, { status: 400 });
      }
      updates.tags = tags;
    }

    for (const [key, column] of [["termsUrl", "terms_url"], ["privacyUrl", "privacy_url"]] as const) {
      const raw = body[key];
      if (raw === undefined) continue;
      const v = raw?.trim() || null;
      if (v && (!/^https:\/\/\S+$/.test(v) || v.length > 500)) {
        return NextResponse.json({ error: "Links must start with https://" }, { status: 400 });
      }
      updates[column] = v;
    }

    if (typeof body.isPublic === "boolean") updates.is_public = body.isPublic;

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
