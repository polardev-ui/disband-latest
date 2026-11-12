import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited, type BotBucket } from "@/lib/bot-gateway-guard";

export type AuthedBot = NonNullable<Awaited<ReturnType<typeof authenticateBot>>>;

/**
 * The steps every v1 bot route takes, in order: the token, the service
 * client, then the rate limit bucket. `run` does the rest; anything it
 * throws is logged under `label` and answered with a 500.
 */
export async function withBot(
  request: NextRequest,
  bucket: BotBucket,
  label: string,
  run: (bot: AuthedBot, service: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
    const gate = await checkBotRateLimit(service, bucket, bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
    return await run(bot, service);
  } catch (err) {
    console.error(`${label} error`, err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** A database function's error, as the API's JSON error. */
export function rpcError(error: { message?: string }): Response {
  return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
}

/** Is this users-path segment `@me`, however it was encoded? */
export function isMe(segment: string): boolean {
  try {
    return decodeURIComponent(segment).trim().toLowerCase() === "@me";
  } catch {
    return false;
  }
}

/** The `limit` query parameter, clamped to 1…max. */
export function limitParam(request: NextRequest, fallback: number, max: number): number {
  const raw = Number(request.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}
