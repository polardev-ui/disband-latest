import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { generateWebhookToken } from "@/lib/webhooks.server";
import { MAX_PER_CHANNEL, audit, authorize, cleanAvatar, jsonError, serializeWebhook, type WebhookRow } from "@/lib/server-webhooks.server";

export const dynamic = "force-dynamic";

const COLUMNS = "id, server_id, channel_id, name, avatar_url, token, created_at, last_used_at, created_by, author_id";
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const service = getServiceSupabase();
  if (!service || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await service.from("webhooks").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as WebhookRow | null) ?? null;
}

/** PATCH { name?, avatar_url?, channel_id?, reset_token? } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const row = await load(id);
  if (!row) return jsonError("Webhook not found.", 404);
  const auth = await authorize(request, row.server_id);
  if (!auth.ok) return auth.response;
  const { service, userId } = auth;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; avatar_url?: unknown; channel_id?: unknown; reset_token?: unknown };
  const patch: Partial<WebhookRow> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return jsonError("Give the webhook a name.", 400);
    patch.name = name;
  }
  const avatar = cleanAvatar(body.avatar_url);
  if (avatar !== undefined) patch.avatar_url = avatar;
  if (typeof body.channel_id === "string" && body.channel_id !== row.channel_id) {
    const { data: ch } = await service.from("channels").select("id, server_id, type").eq("id", body.channel_id).maybeSingle();
    if (!ch || ch.server_id !== row.server_id || ch.type !== "text") return jsonError("Pick a text channel in this space.", 400);
    const { count } = await service.from("webhooks").select("id", { count: "exact", head: true }).eq("channel_id", ch.id).is("deleted_at", null);
    if ((count ?? 0) >= MAX_PER_CHANNEL) return jsonError(`That channel already has ${MAX_PER_CHANNEL} webhooks.`, 400);
    patch.channel_id = ch.id;
  }
  if (body.reset_token === true) patch.token = generateWebhookToken();

  if (Object.keys(patch).length === 0) return jsonError("Nothing to change.", 400);
  const { data: updated, error } = await service.from("webhooks").update(patch).eq("id", id).select(COLUMNS).single();
  if (error || !updated) return jsonError("Could not save the webhook.", 500);

  // Keep the posting identity in step so new messages show the new look.
  if (patch.name !== undefined || patch.avatar_url !== undefined) {
    await service
      .from("profiles")
      .update({ ...(patch.name !== undefined ? { display_name: patch.name } : {}), ...(patch.avatar_url !== undefined ? { avatar_url: patch.avatar_url } : {}) })
      .eq("id", row.author_id);
  }
  await audit(service, row.server_id, userId, body.reset_token === true ? "webhook.token_reset" : "webhook.update", updated as WebhookRow, {
    changed: Object.keys(patch).filter((k) => k !== "token"),
  });
  const { data: key } = await service.rpc("ensure_server_webhook_key", { p_server_id: row.server_id });
  return NextResponse.json({ webhook: serializeWebhook(updated as WebhookRow, key as string) });
}

/** DELETE — the webhook stops working; messages it already posted stay. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const row = await load(id);
  if (!row) return jsonError("Webhook not found.", 404);
  const auth = await authorize(request, row.server_id);
  if (!auth.ok) return auth.response;
  await auth.service.from("webhooks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await audit(auth.service, row.server_id, auth.userId, "webhook.delete", row);
  return new NextResponse(null, { status: 204 });
}
