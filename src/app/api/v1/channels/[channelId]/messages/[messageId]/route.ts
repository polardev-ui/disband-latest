import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { resolveMessageId } from "@/lib/bot-ids";
import { normalizeEmbeds } from "@/lib/embeds";
import { normalizeComponents } from "@/lib/bot-commands";

type Params = { params: Promise<{ channelId: string; messageId: string }> };

function statusFor(error: { message?: string }): number {
  if (/not found/i.test(error.message ?? "")) return 404;
  if (/permission denied/i.test(error.message ?? "")) return 403;
  return botJsonError(error);
}

/** One message, with a summary of its reactions (messages.read). */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId, messageId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_get_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });
    return NextResponse.json({ message: data });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId] GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/**
 * Edit a message (messages.write). A bot can edit its own; with a role that
 * has Manage Messages it can edit anyone's in a channel it can see.
 * `messageId` is the message's id or its numeric display_id.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId, messageId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A JSON object of message fields is required" }, { status: 400 });
    }

    const input = body as { content?: unknown; embeds?: unknown; components?: unknown };
    const patch: Record<string, unknown> = {};

    if ("content" in input) {
      if (typeof input.content !== "string") {
        return NextResponse.json({ error: "content must be text" }, { status: 400 });
      }
      patch.content = input.content;
    }

    if ("embeds" in input) {
      if (input.embeds === null) {
        patch.embeds = null;
      } else {
        const embeds = normalizeEmbeds(input.embeds);
        if (!embeds.ok) return NextResponse.json({ error: embeds.error }, { status: 400 });
        patch.embeds = embeds.embeds;
      }
    }

    if ("components" in input) {
      if (input.components === null) {
        patch.components = null;
      } else {
        const components = normalizeComponents(input.components);
        if (!components.ok) return NextResponse.json({ error: components.error }, { status: 400 });
        patch.components = components.value;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_edit_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
      p_patch: patch,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ message: data });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/**
 * Delete a message (messages.delete). A bot can always delete its own; with
 * a role that has Manage Messages it can delete anyone's, in any channel it
 * can see. `messageId` is the message's id or its numeric display_id.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
    const { channelId, messageId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { error } = await service.rpc("bot_delete_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
