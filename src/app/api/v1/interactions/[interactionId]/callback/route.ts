import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { normalizeEmbeds } from "@/lib/embeds";
import { normalizeComponents } from "@/lib/bot-commands";

/*
 Answer an interaction (a slash command or a button press) within 15 minutes.

   { "content": "...", "embeds": [...], "components": [...] }
       posts a reply in the channel, shown as "@kai used /weather".
   { "update": true, ... }
       for a button press: edits the message the button is on instead.

 Up to 5 answers per interaction, so a bot can send follow-ups. Answering
 does not need messages.write: the member asked the bot directly.
*/
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ interactionId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { interactionId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(interactionId)) {
      return NextResponse.json({ error: "Interaction not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      content?: string | null;
      embeds?: unknown;
      components?: unknown;
      update?: boolean;
    };
    const embeds = body.embeds === undefined ? null : normalizeEmbeds(body.embeds);
    if (embeds && !embeds.ok) return NextResponse.json({ error: embeds.error }, { status: 400 });
    const components = normalizeComponents(body.components);
    if (!components.ok) return NextResponse.json({ error: components.error }, { status: 400 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const update = body.update === true;
    const { data: message, error } = await service.rpc("bot_interaction_respond", {
      p_bot_id: bot.botId,
      p_interaction_id: interactionId,
      p_content: body.content ?? null,
      // On an update, leaving a field out keeps it; an empty list clears it.
      p_embeds: embeds ? embeds.embeds : null,
      p_components: components.value ?? (update && body.components !== undefined ? [] : null),
      p_update: update,
    });
    if (error) {
      const status = /Interaction not found|Message not found/.test(error.message) ? 404 : botJsonError(error);
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ message }, { status: update ? 200 : 201 });
  } catch (err) {
    console.error("v1/interactions callback error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
