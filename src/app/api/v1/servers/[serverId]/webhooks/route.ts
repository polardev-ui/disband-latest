import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { createWebhookIdentity, generateWebhookToken } from "@/lib/webhooks.server";
import {
  MAX_PER_CHANNEL,
  MAX_PER_SERVER,
  audit,
  cleanAvatar,
  randomWebhookName,
  serializeWebhook,
  type WebhookRow,
} from "@/lib/server-webhooks.server";

type Params = { params: Promise<{ serverId: string }> };

const COLUMNS = "id, server_id, channel_id, name, avatar_url, token, created_at, last_used_at, created_by, author_id";

async function authorizeBot(
  service: NonNullable<ReturnType<typeof getServiceSupabase>>,
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

async function canViewChannel(
  service: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const { data } = await service.rpc("channel_permission_for", {
    p_actor: userId,
    p_channel_id: channelId,
    p_permission: "view",
  });
  return data === true;
}

/** Webhooks in a space, newest first. URLs are usable immediately. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const auth = await authorizeBot(service, bot.botId, serverId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [{ data: rows }, { data: key }] = await Promise.all([
      service.from("webhooks").select(COLUMNS).eq("server_id", serverId).is("deleted_at", null).order("created_at", { ascending: false }),
      service.rpc("ensure_server_webhook_key", { p_server_id: serverId }),
    ]);

    // A webhook URL can post into its channel. Do not disclose webhooks that
    // live in a private channel the bot cannot view.
    const visible = await Promise.all(
      ((rows ?? []) as WebhookRow[]).map(async (row) =>
        (await canViewChannel(service, auth.userId, row.channel_id)) ? row : null,
      ),
    );

    return NextResponse.json({
      webhooks: visible
        .filter((row): row is WebhookRow => row !== null)
        .map((row) => serializeWebhook(row, key as string)),
    });
  } catch (err) {
    console.error("v1/servers/[serverId]/webhooks GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Create a webhook: { channel_id, name?, avatar_url? }. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      channel_id?: string;
      name?: string;
      avatar_url?: unknown;
    };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const auth = await authorizeBot(service, bot.botId, serverId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // The channel is required; a webhook must not be created somewhere the
    // bot cannot see.
    if (typeof body.channel_id !== "string") {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }
    const { data: channel } = await service
      .from("channels")
      .select("id, server_id, type")
      .eq("id", body.channel_id)
      .maybeSingle();
    if (!channel || channel.server_id !== serverId || channel.type !== "text") {
      return NextResponse.json({ error: "Pick a text channel in this space" }, { status: 404 });
    }

    const { data: canView } = await service.rpc("channel_permission_for", {
      p_actor: auth.userId,
      p_channel_id: channel.id,
      p_permission: "view",
    });
    if (canView !== true) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const [{ count: perServer }, { count: perChannel }] = await Promise.all([
      service.from("webhooks").select("id", { count: "exact", head: true }).eq("server_id", serverId).is("deleted_at", null),
      service.from("webhooks").select("id", { count: "exact", head: true }).eq("channel_id", channel.id).is("deleted_at", null),
    ]);
    if ((perServer ?? 0) >= MAX_PER_SERVER) {
      return NextResponse.json({ error: `A space can have up to ${MAX_PER_SERVER} webhooks` }, { status: 400 });
    }
    if ((perChannel ?? 0) >= MAX_PER_CHANNEL) {
      return NextResponse.json({ error: `A channel can have up to ${MAX_PER_CHANNEL} webhooks` }, { status: 400 });
    }

    const avatar = cleanAvatar(body.avatar_url);
    if (body.avatar_url !== undefined && avatar === undefined) {
      return NextResponse.json({ error: "avatar_url must be an https image URL or null" }, { status: 400 });
    }
    const name = (body.name?.trim() || randomWebhookName()).slice(0, 80);

    const { data: key } = await service.rpc("ensure_server_webhook_key", { p_server_id: serverId });

    let authorId: string;
    try {
      authorId = await createWebhookIdentity(service, name, avatar ?? null);
    } catch (err) {
      console.error("[v1/webhooks] identity", err);
      return NextResponse.json({ error: "Could not create the webhook" }, { status: 500 });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: row, error } = await service
        .from("webhooks")
        .insert({
          server_id: serverId,
          channel_id: channel.id,
          author_id: authorId,
          name,
          avatar_url: avatar ?? null,
          token: generateWebhookToken(),
          created_by: bot.userId,
        })
        .select(COLUMNS)
        .single();

      if (!error && row) {
        await audit(service, serverId, bot.userId, "webhook.create", row as WebhookRow, {
          channel_id: channel.id,
          bot_id: bot.botId,
        });
        return NextResponse.json({ webhook: serializeWebhook(row as WebhookRow, key as string) }, { status: 201 });
      }
      if (error && !/duplicate|unique/i.test(error.message)) {
        console.error("[v1/webhooks] insert", error);
        break;
      }
    }

    return NextResponse.json({ error: "Could not create the webhook" }, { status: 500 });
  } catch (err) {
    console.error("v1/servers/[serverId]/webhooks POST error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
