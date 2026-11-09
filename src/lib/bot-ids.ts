import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The bot API takes either kind of id for roles and messages: the uuid, or
 * the numeric snowflake (`display_id`, migration 0040 for messages and 0242
 * for roles) that bot developers coming from Discord expect. Both resolve to
 * the uuid the database functions take. Unknown or malformed ids resolve to
 * null, which callers answer with 404.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNOWFLAKE = /^\d{1,19}$/;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export async function resolveRoleId(service: SupabaseClient, roleId: string): Promise<string | null> {
  const id = roleId.trim();
  if (UUID.test(id)) return id.toLowerCase();
  if (!SNOWFLAKE.test(id)) return null;
  const { data } = await service.from("server_roles").select("id").eq("display_id", id).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function resolveMessageId(service: SupabaseClient, messageId: string, channelId: string): Promise<string | null> {
  const id = messageId.trim();
  if (UUID.test(id)) return id.toLowerCase();
  if (!SNOWFLAKE.test(id)) return null;
  const { data } = await service
    .from("messages")
    .select("id")
    .eq("display_id", id)
    .eq("channel_id", channelId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
