import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { generateWebhookToken } from "@/lib/webhooks.server";
import { MAX_PER_CHANNEL, audit, cleanAvatar, serializeWebhook, type WebhookRow } from "@/lib/server-webhooks.server";

type Params = { params: Promise<{ webhookId: string }> };
type Service = NonNullable<ReturnType<typeof getServiceSupabase>>;

const COLUMNS = "id, server_id, channel_id, name, avatar_url, token, created_at, last_used_at, created_by, author_id";

async function load(service: Service, id: string): Promise<WebhookRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await service.from("webhooks").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as WebhookRow | null) ?? null;
}

async function authorizeBot(
  service: Service,
  botId: string,
  serverId: string,
): Promise<{ userId: string } | { error: string; status: number }> {
  const { data, error } = await service.rpc("bot_actor", {
    p_bot_id: botId,
    p_server_id: serverId,
    p_scopes: ["webhooks.manage"],
    p_permission: "manage_webhooks",
  });
  if (error) return { error: error.message, status: botJsonError(error) };
  return { userId: data as string };
}

async function canUseChannel(service: Service, userId: string, channelId: string, serverId: string): Promise<boolean> {
  const { data: channel } = await service
    .from("channels")
    .select("id, server_id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.server_id !== serverId || channel.type !== "text") return false;
  const { data } = await service.rpc("channel_permission_for", {
    p_actor: userId,
    p_channel_id: channelId,
    p_permission: "view",
  });
  return data === true;
}

async function canViewChannel(service: Service, userId: string, channelId: string): Promise<boolean> {
  const { data } = await service.rpc("channel_permission_for", {
    p_actor: userId,
    p_channel_id: channelId,
    p_permission: "view",
  });
  return data === true;
}

/** Webhook detail, including its posting URL. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { webhookId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const row = await load(service, webhookId);
    if (!row) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

    const auth = await authorizeBot(service, bot.botId, row.server_id);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Webhook URLs are posting credentials. A bot that cannot view the
    // channel must not be able to read, rotate, move, or delete its webhooks.
    if (!(await canViewChannel(service, auth.userId, row.channel_id))) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const { data: key } = await service.rpc("ensure_server_webhook_key", { p_server_id: row.server_id });
    return NextResponse.json({ webhook: serializeWebhook(row, key as string) });
  } catch (err) {
    console.error("v1/webhooks/[webhookId] GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Update a webhook: { name?, avatar_url?, channel_id?, reset_token? }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { webhookId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      avatar_url?: unknown;
      channel_id?: unknown;
      reset_token?: unknown;
    };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const row = await load(service, webhookId);
    if (!row) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

    const auth = await authorizeBot(service, bot.botId, row.server_id);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Webhook URLs are posting credentials. A bot that cannot view the
    // channel must not be able to read, rotate, move, or delete its webhooks.
    if (!(await canViewChannel(service, auth.userId, row.channel_id))) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const patch: Partial<WebhookRow> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return NextResponse.json({ error: "Give the webhook a name" }, { status: 400 });
      patch.name = name;
    }

    const avatar = cleanAvatar(body.avatar_url);
    if (body.avatar_url !== undefined && avatar === undefined) {
      return NextResponse.json({ error: "avatar_url must be an https image URL or null" }, { status: 400 });
    }
    if (avatar !== undefined) patch.avatar_url = avatar;

    if (typeof body.channel_id === "string" && body.channel_id !== row.channel_id) {
      if (!(await canUseChannel(service, auth.userId, body.channel_id, row.server_id))) {
        return NextResponse.json({ error: "Pick a text channel in this space" }, { status: 404 });
      }
      const { count } = await service
        .from("webhooks")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", body.channel_id)
        .is("deleted_at", null);
      if ((count ?? 0) >= MAX_PER_CHANNEL) {
        return NextResponse.json({ error: `That channel already has ${MAX_PER_CHANNEL} webhooks` }, { status: 400 });
      }
      patch.channel_id = body.channel_id;
    }

    if (body.reset_token === true) patch.token = generateWebhookToken();

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: updated, error } = await service
      .from("webhooks")
      .update(patch)
      .eq("id", webhookId)
      .select(COLUMNS)
      .single();
    if (error || !updated) return NextResponse.json({ error: "Could not save the webhook" }, { status: 500 });

    if (patch.name !== undefined || patch.avatar_url !== undefined) {
      await service
        .from("profiles")
        .update({
          ...(patch.name !== undefined ? { display_name: patch.name } : {}),
          ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {}),
        })
        .eq("id", row.author_id);
    }

    await audit(
      service,
      row.server_id,
      bot.userId,
      body.reset_token === true ? "webhook.token_reset" : "webhook.update",
      updated as WebhookRow,
      { changed: Object.keys(patch).filter((key) => key !== "token"), bot_id: bot.botId },
    );

    const { data: key } = await service.rpc("ensure_server_webhook_key", { p_server_id: row.server_id });
    return NextResponse.json({ webhook: serializeWebhook(updated as WebhookRow, key as string) });
  } catch (err) {
    console.error("v1/webhooks/[webhookId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Delete a webhook (soft delete). Messages it already posted stay. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { webhookId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const row = await load(service, webhookId);
    if (!row) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

    const auth = await authorizeBot(service, bot.botId, row.server_id);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Webhook URLs are posting credentials. A bot that cannot view the
    // channel must not be able to read, rotate, move, or delete its webhooks.
    if (!(await canViewChannel(service, auth.userId, row.channel_id))) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    await service.from("webhooks").update({ deleted_at: new Date().toISOString() }).eq("id", webhookId);
    await audit(service, row.server_id, bot.userId, "webhook.delete", row, { bot_id: bot.botId });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("v1/webhooks/[webhookId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
