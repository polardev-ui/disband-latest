import { randomBytes, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmbeds, safeEmbedUrl, type Embed } from "@/lib/embeds";

/*
 Server side of Discord-compatible webhooks.

 URL:   https://disband.dev/webhook/<server key>/<token>
        (also served at /api/webhooks/<server key>/<token>)
 Body:  Discord's Execute Webhook — content, username, avatar_url, embeds,
        allowed_mentions, tts (ignored), flags (ignored); JSON, or
        multipart/form-data with the JSON in `payload_json`.
 Reply: 204 No Content, or the message object when ?wait=true.
 Errors use Discord's shape: { message, code } with the same status codes,
 and 429s carry { message, retry_after, global } plus Retry-After.
*/

export const WEBHOOK_BASE_URL = (process.env.WEBHOOK_BASE_URL ?? "https://disband.dev").replace(/\/$/, "");
export const WEBHOOK_CONTENT_MAX = 2000;

export function webhookUrl(serverKey: string, token: string): string {
  return `${WEBHOOK_BASE_URL}/webhook/${serverKey}/${token}`;
}

/** 26 random digits. */
export function generateWebhookToken(): string {
  let out = "";
  for (let i = 0; i < 26; i++) out += randomInt(0, 10).toString();
  return out;
}

export const isServerKey = (v: string) => /^[0-9]{8}$/.test(v);
export const isWebhookToken = (v: string) => /^[0-9]{26}$/.test(v);

// Discord's JSON error codes for the cases we can hit.
export const DISCORD_CODES = {
  unknownWebhook: 10015,
  unknownMessage: 10008,
  unknownChannel: 10003,
  invalidBody: 50035,
  emptyMessage: 50006,
} as const;

export function discordError(message: string, code: number, status: number): NextResponse {
  return NextResponse.json({ message, code }, { status });
}

export function discordRateLimited(retryAfterSeconds: number): NextResponse {
  const retry = Math.max(0.5, retryAfterSeconds);
  return NextResponse.json(
    { message: "You are being rate limited.", retry_after: retry, global: false },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(retry)),
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset-After": String(retry),
        "X-RateLimit-Scope": "shared",
      },
    },
  );
}

export interface ExecutePayload {
  content: string | null;
  username: string | null;
  avatar_url: string | null;
  embeds: Embed[];
  parseUsers: boolean;
  parseEveryone: boolean;
  hasFiles: boolean;
}

/** Read a JSON or multipart body the way Discord does. */
export async function readWebhookBody(request: Request): Promise<{ ok: true; body: Record<string, unknown>; hasFiles: boolean } | { ok: false; response: NextResponse }> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      let body: Record<string, unknown> = {};
      const payload = form.get("payload_json");
      if (typeof payload === "string") body = JSON.parse(payload) as Record<string, unknown>;
      for (const key of ["content", "username", "avatar_url"]) {
        const v = form.get(key);
        if (typeof v === "string" && body[key] == null) body[key] = v;
      }
      let hasFiles = false;
      for (const [, v] of form.entries()) if (typeof v !== "string") hasFiles = true;
      return { ok: true, body, hasFiles };
    }
    if (type.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(await request.text());
      return { ok: true, body: Object.fromEntries(form.entries()), hasFiles: false };
    }
    const text = await request.text();
    return { ok: true, body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, hasFiles: false };
  } catch {
    return { ok: false, response: discordError("400: Bad Request", DISCORD_CODES.invalidBody, 400) };
  }
}

/** Validate an Execute Webhook body. */
export function parseExecute(body: Record<string, unknown>, hasFiles: boolean): { ok: true; payload: ExecutePayload } | { ok: false; response: NextResponse } {
  const content = typeof body.content === "string" ? body.content : null;
  if (content && content.length > WEBHOOK_CONTENT_MAX) {
    return { ok: false, response: discordError(`Invalid Form Body: content: Must be ${WEBHOOK_CONTENT_MAX} or fewer in length.`, DISCORD_CODES.invalidBody, 400) };
  }

  // Discord accepts `embeds`, and `embed` from older clients.
  const rawEmbeds = body.embeds ?? (body.embed ? [body.embed] : undefined);
  const norm = normalizeEmbeds(rawEmbeds);
  if (!norm.ok) return { ok: false, response: discordError(`Invalid Form Body: ${norm.error}`, DISCORD_CODES.invalidBody, 400) };

  if (!content?.trim() && norm.embeds.length === 0) {
    return {
      ok: false,
      response: discordError(
        hasFiles ? "Cannot send an empty message (file uploads aren't supported by Disband webhooks yet)" : "Cannot send an empty message",
        DISCORD_CODES.emptyMessage,
        400,
      ),
    };
  }

  const username = typeof body.username === "string" ? body.username.trim().slice(0, 80) || null : null;
  if (username && /disband|clyde/i.test(username)) {
    return { ok: false, response: discordError('Invalid Form Body: username: Username cannot contain "disband"', DISCORD_CODES.invalidBody, 400) };
  }

  // allowed_mentions: absent means "parse everything", like Discord.
  let parseUsers = true;
  let parseEveryone = true;
  const am = body.allowed_mentions as { parse?: unknown; users?: unknown } | undefined;
  if (am && typeof am === "object") {
    const parse = Array.isArray(am.parse) ? am.parse.map(String) : [];
    parseUsers = parse.includes("users") || (Array.isArray(am.users) && am.users.length > 0);
    parseEveryone = parse.includes("everyone");
  }

  return {
    ok: true,
    payload: {
      content,
      username,
      avatar_url: safeEmbedUrl(body.avatar_url) ?? null,
      embeds: norm.embeds,
      parseUsers,
      parseEveryone,
      hasFiles,
    },
  };
}

interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  mentions: string[] | null;
  embeds: Embed[] | null;
  webhook: { id: string; name: string; avatar_url: string | null } | null;
  created_at: string;
  edited_at: string | null;
  display_id: number;
}

/** A message in Discord's object shape (ids are Disband's numeric message ids). */
export function toDiscordMessage(row: MessageRow, serverId: string) {
  return {
    id: String(row.display_id),
    type: 0,
    content: row.content,
    channel_id: row.channel_id,
    guild_id: serverId,
    author: {
      id: row.author_id,
      username: row.webhook?.name ?? "Webhook",
      avatar: row.webhook?.avatar_url ?? null,
      discriminator: "0000",
      bot: true,
    },
    attachments: [],
    embeds: row.embeds ?? [],
    mentions: (row.mentions ?? []).map((id) => ({ id })),
    mention_roles: [],
    mention_everyone: /@(everyone|here)\b/i.test(row.content),
    pinned: false,
    tts: false,
    timestamp: row.created_at,
    edited_timestamp: row.edited_at,
    flags: 0,
    components: [],
    webhook_id: row.webhook?.id ?? null,
  };
}

/** Map a webhook RPC failure to Discord's error. */
export function webhookRpcError(error: { message?: string; code?: string }): NextResponse {
  const msg = error.message ?? "";
  if (/Unknown Webhook/.test(msg)) return discordError("Unknown Webhook", DISCORD_CODES.unknownWebhook, 404);
  if (/Unknown Message/.test(msg)) return discordError("Unknown Message", DISCORD_CODES.unknownMessage, 404);
  if (/Unknown Channel/.test(msg)) return discordError("Unknown Channel", DISCORD_CODES.unknownChannel, 404);
  if (/too quickly|rate limit/i.test(msg)) return discordRateLimited(/minute/i.test(msg) ? 30 : 2);
  if (/word/i.test(msg)) return discordError(`Invalid Form Body: content: ${msg}`, DISCORD_CODES.invalidBody, 400);
  console.error("[webhook] rpc error", error);
  return discordError("500: Internal Server Error", 0, 500);
}

/**
 Create the identity a webhook posts as: a bot profile backed by an auth user
 nobody can sign in to (random address, random password, never revealed).
*/
export async function createWebhookIdentity(service: SupabaseClient, name: string, avatarUrl: string | null): Promise<string> {
  const handle = `webhook_${randomBytes(6).toString("hex")}`;
  const { data, error } = await service.auth.admin.createUser({
    email: `${handle}@webhooks.disband.dev`,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { username: handle, display_name: name, webhook: "true" },
  });
  if (error || !data?.user) throw new Error(error?.message ?? "Could not create the webhook identity");
  const id = data.user.id;
  const { data: updated } = await service
    .from("profiles")
    .update({ is_bot: true, display_name: name, avatar_url: avatarUrl })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (!updated) {
    await service.from("profiles").insert({ id, username: handle, display_name: name, avatar_url: avatarUrl, is_bot: true });
  }
  return id;
}
