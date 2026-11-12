import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/bot-ids";
import { isMe, rpcError, withBot } from "@/lib/bot-route";

type Params = { params: Promise<{ userId: string }> };

const STATUS_MAX = 64;

/**
 * `@me`: the bot's own profile, custom status, and account scopes.
 * Anyone else: their public profile, if they share a space with the bot
 * where it holds members.read.
 */
export async function GET(request: NextRequest, { params }: Params) {
  return withBot(request, "read", "v1 users GET", async (bot, service) => {
    const { userId } = await params;
    const me = isMe(userId) || userId === bot.userId;
    if (!me && !isUuid(userId)) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data: user, error } = await service.rpc("bot_get_user", {
      p_bot_id: bot.botId,
      p_user_id: me ? bot.userId : userId,
    });
    if (error) return rpcError(error);
    if (!me) return NextResponse.json({ user });

    const { data: status } = await service
      .from("profiles")
      .select("status_note")
      .eq("id", bot.userId)
      .maybeSingle();
    return NextResponse.json({
      user: { ...(user as Record<string, unknown>), status_text: (status as { status_note?: string | null } | null)?.status_note ?? null },
      bot: { id: bot.botId, name: bot.name, scopes: bot.scopes },
    });
  });
}

/**
 * `@me` only: sets the bot's custom status, shown on its profile and in the
 * member list. `{ "status_text": "Watching 12 servers" }`; null clears it.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  return withBot(request, "write", "v1 users PATCH", async (bot, service) => {
    const { userId } = await params;
    if (!isMe(userId) && userId !== bot.userId) {
      return NextResponse.json({ error: "A bot can only change its own profile" }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { status_text?: unknown } | null;
    if (!body || !("status_text" in body)) {
      return NextResponse.json({ error: "status_text is required (null clears it)" }, { status: 400 });
    }
    if (body.status_text !== null && typeof body.status_text !== "string") {
      return NextResponse.json({ error: "Invalid status_text: send a string or null" }, { status: 400 });
    }
    // eslint-disable-next-line no-control-regex
    const text = (body.status_text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (text.length > STATUS_MAX) {
      return NextResponse.json({ error: `status_text is too long (max ${STATUS_MAX} characters)` }, { status: 400 });
    }

    const { error } = await service
      .from("profiles")
      .update({ status_note: text || null, status_expires_at: null })
      .eq("id", bot.userId);
    if (error) return rpcError(error);
    return NextResponse.json({ user: { id: bot.userId, status_text: text || null } });
  });
}
