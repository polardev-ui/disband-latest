import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { safeEmbedUrl } from "@/lib/embeds";
import { webhookUrl } from "@/lib/webhooks.server";

/*
 Shared pieces of the webhook management API (Server Settings › Integrations).
 Everything here acts for a signed-in member who holds Manage Webhooks.
*/

export const MAX_PER_CHANNEL = 15;
export const MAX_PER_SERVER = 50;

// Default names, like Discord's playful ones but our own.
const NAMES = ["Hookshot", "Carrier Pigeon", "Signal Flare", "Courier", "Lighthouse", "Paper Plane"];
export const randomWebhookName = () => NAMES[Math.floor(Math.random() * NAMES.length)];

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function authorize(
  request: NextRequest,
  serverId: string,
): Promise<{ ok: true; userId: string; service: SupabaseClient } | { ok: false; response: NextResponse }> {
  const user = await getUserFromRequest(request);
  if (!user) return { ok: false, response: jsonError("Not authenticated.", 401) };
  const service = getServiceSupabase();
  if (!service) return { ok: false, response: jsonError("Webhooks are unavailable right now.", 503) };
  const { data: allowed } = await service.rpc("user_has_server_permission", {
    p_server_id: serverId,
    p_user_id: user.id,
    p_permission: "manage_webhooks",
  });
  if (allowed !== true) return { ok: false, response: jsonError("You need the Manage Webhooks permission.", 403) };
  return { ok: true, userId: user.id, service };
}

export interface WebhookRow {
  id: string;
  server_id: string;
  channel_id: string;
  name: string;
  avatar_url: string | null;
  token: string;
  created_at: string;
  last_used_at: string | null;
  created_by: string | null;
  author_id: string;
}

export function serializeWebhook(row: WebhookRow, serverKey: string, creator?: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null) {
  return {
    id: row.id,
    name: row.name,
    avatar_url: row.avatar_url,
    channel_id: row.channel_id,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    created_by: creator ?? null,
    url: webhookUrl(serverKey, row.token),
  };
}

export async function audit(service: SupabaseClient, serverId: string, actorId: string, action: string, row: { id: string; name: string }, details: Record<string, unknown> = {}) {
  await service.from("audit_log").insert({
    server_id: serverId,
    actor_id: actorId,
    action,
    target_type: "webhook",
    target_id: row.id,
    details: { name: row.name, ...details },
  });
}

export function cleanAvatar(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  return safeEmbedUrl(v) ?? undefined;
}
