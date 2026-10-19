import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createWebhookIdentity, generateWebhookToken } from "@/lib/webhooks.server";
import {
  MAX_PER_CHANNEL,
  MAX_PER_SERVER,
  audit,
  authorize,
  jsonError,
  randomWebhookName,
  serializeWebhook,
  type WebhookRow,
} from "@/lib/server-webhooks.server";

export const dynamic = "force-dynamic";

const COLUMNS = "id, server_id, channel_id, name, avatar_url, token, created_at, last_used_at, created_by, author_id";

/** GET ?serverId= — the space's webhooks, newest first. */
export async function GET(request: NextRequest) {
  const serverId = request.nextUrl.searchParams.get("serverId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) return jsonError("serverId is required.", 400);
  const auth = await authorize(request, serverId);
  if (!auth.ok) return auth.response;
  const { service } = auth;

  const [{ data: rows }, { data: key }] = await Promise.all([
    service.from("webhooks").select(COLUMNS).eq("server_id", serverId).is("deleted_at", null).order("created_at", { ascending: false }),
    service.rpc("ensure_server_webhook_key", { p_server_id: serverId }),
  ]);
  const list = (rows ?? []) as WebhookRow[];
  const creatorIds = [...new Set(list.map((r) => r.created_by).filter((x): x is string => !!x))];
  const { data: creators } = creatorIds.length
    ? await service.from("profiles").select("id, username, display_name, avatar_url").in("id", creatorIds)
    : { data: [] };
  const byId = new Map((creators ?? []).map((c) => [c.id as string, c]));
  return NextResponse.json({
    webhooks: list.map((r) => serializeWebhook(r, key as string, r.created_by ? byId.get(r.created_by) ?? null : null)),
  });
}

/** POST { serverId, channelId? } — a new webhook with a playful default name. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { serverId?: string; channelId?: string; name?: string };
  const serverId = body.serverId ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) return jsonError("serverId is required.", 400);
  const auth = await authorize(request, serverId);
  if (!auth.ok) return auth.response;
  const { service, userId } = auth;

  const limit = rateLimit(`webhook-create:${userId}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  // The channel: the one asked for, or the space's first text channel.
  const { data: channels } = await service
    .from("channels")
    .select("id, type, position")
    .eq("server_id", serverId)
    .eq("type", "text")
    .order("position", { ascending: true });
  const channelId = body.channelId && (channels ?? []).some((c) => c.id === body.channelId) ? body.channelId : channels?.[0]?.id;
  if (!channelId) return jsonError("Create a text channel first.", 400);

  const { count: perServer } = await service.from("webhooks").select("id", { count: "exact", head: true }).eq("server_id", serverId).is("deleted_at", null);
  if ((perServer ?? 0) >= MAX_PER_SERVER) return jsonError(`A space can have up to ${MAX_PER_SERVER} webhooks.`, 400);
  const { count: perChannel } = await service.from("webhooks").select("id", { count: "exact", head: true }).eq("channel_id", channelId).is("deleted_at", null);
  if ((perChannel ?? 0) >= MAX_PER_CHANNEL) return jsonError(`A channel can have up to ${MAX_PER_CHANNEL} webhooks.`, 400);

  const name = (body.name?.trim() || randomWebhookName()).slice(0, 80);
  const { data: key } = await service.rpc("ensure_server_webhook_key", { p_server_id: serverId });

  let authorId: string;
  try {
    authorId = await createWebhookIdentity(service, name, null);
  } catch (err) {
    console.error("[server-webhooks] identity", err);
    return jsonError("Could not create the webhook. Try again.", 500);
  }

  // Tokens are unique; retry on the (astronomically unlikely) collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await service
      .from("webhooks")
      .insert({ server_id: serverId, channel_id: channelId, author_id: authorId, name, token: generateWebhookToken(), created_by: userId })
      .select("id, server_id, channel_id, name, avatar_url, token, created_at, last_used_at, created_by, author_id")
      .single();
    if (!error && row) {
      await audit(service, serverId, userId, "webhook.create", row as WebhookRow, { channel_id: channelId });
      return NextResponse.json({ webhook: serializeWebhook(row as WebhookRow, key as string) }, { status: 201 });
    }
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error("[server-webhooks] insert", error);
      break;
    }
  }
  return jsonError("Could not create the webhook. Try again.", 500);
}
