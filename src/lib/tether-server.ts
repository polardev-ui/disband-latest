import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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