import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSeekChatMessage } from "@/lib/deepseek";

/**
 * Tether's identity server-side.
 *
 * Tether is a first-class system account, NOT a community member. Its identity
 * is anchored on a stable email so the account survives renames, and it may
 * never be discovered by grabbing a username some human happens to own (that
 * was the original bug: looking up username='tether' found the human squatter
 * and authored every reply with *their* account).
 */

export const TETHER_EMAIL = "tether@disband.dev";
export const TETHER_USERNAME = "tether";
export const TETHER_FALLBACK_USERNAME = "tether_ai";
export const TETHER_DISPLAY_NAME = "Tether";
export const TETHER_AVATAR_URL = "https://www.disband.dev/logo-app.png";

// Cached per instance so provisioning happens once; harmless if another
// instance provisions first (all lookups are idempotent).
let cachedTetherUserId: string | null = null;

type ServiceClient = NonNullable<ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>>;

/** Find an auth user by email, walking pages until found or the store is exhausted. */
async function findAuthUserByEmail(service: ServiceClient, email: string): Promise<string | null> {
  const needle = email.toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === needle);
    if (hit) return hit.id;
    if (!data || data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Make sure the Tether profile looks right (name, bot flag, logo avatar, and
 * the reserved username). Tries the reserved username first, then a fallback,
 * then a per-id suffix. Idempotent and safe to run on every ask.
 */
async function syncTetherProfile(service: ServiceClient, id: string): Promise<boolean> {
  const suffix = id.replace(/-/g, "").slice(0, 8);
  const candidates = [TETHER_USERNAME, TETHER_FALLBACK_USERNAME, `tether_${suffix}`];

  for (const username of candidates) {
    const { error } = await service
      .from("profiles")
      .upsert(
        {
          id,
          username,
          display_name: TETHER_DISPLAY_NAME,
          is_bot: true,
          avatar_url: TETHER_AVATAR_URL,
          // Aero subscribers can DM Tether directly (0102); without this the
          // upsert would leave a freshly provisioned Tether un-DM-able.
          bot_dm_enabled: true,
        },
        { onConflict: "id" },
      );
    if (!error) return true;
  }
  return false;
}

/**
 * Resolve Tether's user id, provisioning the account on first use.
 *
 * Order of discovery (never a plain username grab):
 *   1. an existing Tether: profile with is_bot=true owning the reserved name,
 *   2. the auth user registered with the stable email (created by an earlier
 *      ask whose profile sync failed halfway),
 *   3. create the auth user, then sync its profile.
 */
export async function ensureTetherUser(service: ServiceClient): Promise<string | null> {
  if (cachedTetherUserId) return cachedTetherUserId;

  // 1) Already provisioned correctly (bot owns 'tether').
  const { data: botProfile } = await service
    .from("profiles")
    .select("id")
    .eq("username", TETHER_USERNAME)
    .eq("is_bot", true)
    .maybeSingle();
  if (botProfile?.id) {
    cachedTetherUserId = botProfile.id;
    void syncTetherProfile(service, botProfile.id);
    return botProfile.id;
  }

  // 2) Auth user with our email already exists (profile sync failed before).
  const existingId = await findAuthUserByEmail(service, TETHER_EMAIL);
  if (existingId) {
    const synced = await syncTetherProfile(service, existingId);
    if (synced) {
      cachedTetherUserId = existingId;
      return existingId;
    }
  }

  // 3) Provision fresh.
  const password = randomBytes(24).toString("base64url");
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: TETHER_EMAIL,
    password,
    email_confirm: true,
  });
  if (!createError && created?.user?.id) {
    const synced = await syncTetherProfile(service, created.user.id);
    if (synced) {
      cachedTetherUserId = created.user.id;
      return created.user.id;
    }
    // Profile creation failed (schema drift) — clean up so retries are clean.
    await service.auth.admin.deleteUser(created.user.id).catch(() => {});
    return null;
  }

  // A concurrent instance likely won the race: rediscover by email.
  const retryId = await findAuthUserByEmail(service, TETHER_EMAIL);
  if (retryId && (await syncTetherProfile(service, retryId))) {
    cachedTetherUserId = retryId;
    return retryId;
  }
  return null;
}

export type TetherSurface = "server" | "dm" | "group";

/** Real-time broadcast topic matching the client's useTypingPresence scope. */
export function typingTopic(surface: TetherSurface, containerId: string): string {
  if (surface === "server") return `typing:ch:${containerId}`;
  if (surface === "dm") return `typing:dm:${containerId}`;
  return `typing:group:${containerId}`;
}

/** Tell every client in a conversation that Tether is typing. Best-effort. */
export async function broadcastTetherTyping(
  service: ServiceClient,
  topic: string,
  tetherUserId: string,
): Promise<void> {
  try {
    const ch = service.channel(topic, { config: { broadcast: { self: false } } });
    const subscribed = await Promise.race([
      new Promise<boolean>((resolve) => {
        ch.subscribe((status) => resolve(status === "SUBSCRIBED"));
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    if (subscribed) {
      await ch.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: tetherUserId, name: TETHER_DISPLAY_NAME },
      });
      // Give the socket a beat to flush the frame before tearing it down.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await service.removeChannel(ch);
  } catch {
    // Typing is cosmetic; never fail the ask over it.
  }
}

/** How many prior messages of a conversation to hand the model. */
const CONTEXT_WINDOW = 20;

/**
 * One row of a Tether conversation, normalised across the three surfaces so the
 * context builder and the model don't care whether the ask came from a channel,
 * a DM thread, or a group chat.
 */
export interface TetherContextMessage {
  authorId: string;
  content: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  containerId: string;
  createdAt: string | null;
}

/**
 * Load the conversation Tether is answering in, oldest-first, ending with the
 * message that triggered the ask.
 *
 * Only `CONTEXT_WINDOW` messages are read and the query is keyed on the
 * container's (id, created_at) index, so this stays cheap no matter how long
 * the channel is. Read with the service role, so the caller must have already
 * proven the user can see `current` — visibility of one message implies
 * visibility of its container.
 */
export async function buildTetherContextWindow(
  service: ServiceClient,
  surface: TetherSurface,
  current: TetherContextMessage,
  limit: number = CONTEXT_WINDOW,
): Promise<TetherContextMessage[]> {
  // Each surface stores the same shape under a different table + container key.
  const target =
    surface === "server"
      ? { table: "messages", key: "channel_id" as const }
      : surface === "dm"
        ? { table: "dm_messages", key: "thread_id" as const }
        : { table: "group_messages", key: "group_id" as const };

  type Row = {
    author_id: string | null;
    content: string | null;
    attachment_url: string | null;
    attachment_type: string | null;
    created_at: string | null;
  };

  try {
    let query = service
      .from(target.table)
      .select("author_id, content, attachment_url, attachment_type, created_at")
      .eq(target.key, current.containerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Never let the triggering message come back inside its own history.
    if (current.createdAt) query = query.lt("created_at", current.createdAt);

    const { data, error } = await query;
    if (error) throw error;

    const prior = ((data ?? []) as Row[])
      .map((r): TetherContextMessage => ({
        authorId: r.author_id ?? "",
        content: r.content ?? "",
        attachmentUrl: r.attachment_url,
        attachmentType: r.attachment_type,
        containerId: current.containerId,
        createdAt: r.created_at,
      }))
      // The query is newest-first; the model wants oldest-first.
      .reverse();

    // A trigger message with no timestamp would also come back as its own
    // neighbour, so drop anything sharing the exact instant we already hold.
    const withoutDuplicates = current.createdAt
      ? prior.filter((m) => m.createdAt !== current.createdAt)
      : prior;

    return [...withoutDuplicates, current];
  } catch {
    // History is an enhancement, not a requirement — answering the message in
    // front of us is what matters.
    return [current];
  }
}

/**
 * Flatten a conversation into model messages.
 *
 * Tether's own replies become `assistant` turns so the model can see what it
 * already said instead of repeating itself, and everything else becomes a
 * `user` turn. Consecutive same-role turns are merged: the OpenAI-shaped
 * endpoints DeepSeek serves are happier with alternating roles, and it keeps
 * the prompt smaller.
 *
 * `finalImageDataUrl`, when set, is attached to the last message — that is the
 * ask, and it is the only turn allowed to carry a picture, because DeepSeek
 * rejects image parts on non-user roles and on anything but the newest turn.
 */
export function tetherHistoryMessages(
  rows: TetherContextMessage[],
  tetherUserId: string,
  opts: { finalImageDataUrl?: string | null } = {},
): DeepSeekChatMessage[] {
  const out: DeepSeekChatMessage[] = [];

  rows.forEach((row, index) => {
    const isLast = index === rows.length - 1;
    const text = (row.content ?? "").trim();
    const role: "user" | "assistant" = row.authorId === tetherUserId ? "assistant" : "user";

    if (isLast && opts.finalImageDataUrl) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: text || "What do you think?" },
          { type: "image_url", image_url: { url: opts.finalImageDataUrl } },
        ],
      });
      return;
    }

    // An attachment-only message still needs *something* in its turn.
    const body = text || (row.attachmentUrl ? "(sent an attachment)" : "(sent an empty message)");

    const previous = out[out.length - 1];
    if (previous && previous.role === role && typeof previous.content === "string") {
      previous.content = `${previous.content}\n${body}`;
    } else {
      out.push({ role, content: body });
    }
  });

  return out;
}