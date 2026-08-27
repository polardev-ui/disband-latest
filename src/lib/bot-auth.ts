import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export type BotScope = "messages.read" | "messages.write" | "members.read" | "channels.manage";

export const BOT_SCOPES: BotScope[] = ["messages.read", "messages.write", "members.read", "channels.manage"];

export interface BotActor {
  botId: string;
  userId: string;
  ownerId: string;
  name: string;
  avatarUrl: string | null;
  scopes: string[];
}

/** One-way hash used for bot tokens — the raw token is never stored. */
export function hashBotToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isBotScope(value: string): value is BotScope {
  return (BOT_SCOPES as string[]).includes(value);
}

/**
 * Authenticates a request using the `Authorization: Bot <token>` scheme.
 * Returns the bot actor or null when the token is missing, unknown, or revoked.
 */
export async function authenticateBot(request: NextRequest): Promise<BotActor | null> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bot ") ? header.slice(4).trim() : null;
  if (!token) return null;

  const service = getServiceSupabase();
  if (!service) return null;

  const { data } = await service
    .from("bots")
    .select("id, user_id, owner_id, name, avatar_url, scopes, revoked_at")
    .eq("token_hash", hashBotToken(token))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Fire-and-forget presence update.
  void service
    .from("bots")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    botId: data.id,
    userId: data.user_id,
    ownerId: data.owner_id,
    name: data.name,
    avatarUrl: data.avatar_url,
    scopes: data.scopes ?? [],
  };
}

export function botJsonError(error: { message?: string } | null | undefined): number {
  const msg = error?.message ?? "";
  if (/revoked|not a member|does not have|permission|read-only|restricted|Only the/.test(msg)) return 403;
  if (/not found|content is required|too long|invalid|expired|already been used|Reply target/.test(msg)) return 400;
  if (/too quickly|rate limit/.test(msg)) return 429;
  return 500;
}
