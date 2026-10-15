import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ANON_DOWNLOAD_GRACE_DAYS, ANON_TIERS, type AnonTier } from "@/lib/anon-accounts";

/**
 * Anonymous-account server helpers.
 *
 * The pepper is deliberately separate from the service-role key so rotating
 * the key never invalidates every account number, but falls back to it so the
 * feature still works before ANON_ACCOUNT_SECRET is configured. Rotating the
 * pepper invalidates every existing account number, so treat it as permanent.
 */
function pepper(): string {
  return (
    process.env.ANON_ACCOUNT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "disband-anon-accounts"
  );
}

const MAX_ROWS = 5000;

/** SHA-256(pepper + digits). Deterministic lookup key for a 16-digit number. */
export function hashAccountNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  return createHash("sha256").update(`${pepper()}:${digits}`).digest("hex");
}

/** A uniformly random 16-digit number (leading zeros allowed). */
export function generateAccountNumber(): string {
  let out = "";
  for (let i = 0; i < 16; i += 1) out += randomInt(0, 10).toString();
  return out;
}

/** A random `@disband.dev` address, e.g. `xyzkdf1259napsfhas@disband.dev`. */
export function generateAnonEmail(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(20);
  let local = "";
  for (let i = 0; i < bytes.length; i += 1) {
    local += alphabet[bytes[i] % alphabet.length];
  }
  return `${local}@disband.dev`;
}

export function expiryForTier(tier: AnonTier, from: Date = new Date()): { expiresAt: Date; purgeAfter: Date } {
  const expiresAt = new Date(from.getTime() + ANON_TIERS[tier].days * 24 * 60 * 60 * 1000);
  const purgeAfter = new Date(expiresAt.getTime() + ANON_DOWNLOAD_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return { expiresAt, purgeAfter };
}

function anonKeyClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Mint a session for an email without a password: generate a magic link and
 * immediately verify its hashed token. `generateLink` does not send any email.
 */
export async function mintSessionForEmail(
  email: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  const service = getServiceSupabase();
  const anon = anonKeyClient();
  if (!service || !anon) return null;

  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return null;

  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  const session = verified?.session;
  if (verifyError || !session?.access_token || !session.refresh_token) return null;

  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

export interface AnonRecord {
  id: string;
  user_id: string | null;
  tier: AnonTier;
  expires_at: string;
  purge_after: string;
  expires_processed_at: string | null;
  data_purged_at: string | null;
  purged_reason: string | null;
}

const RECORD_COLUMNS =
  "id, user_id, tier, expires_at, purge_after, expires_processed_at, data_purged_at, purged_reason";

export async function findAnonByNumber(number: string): Promise<AnonRecord | null> {
  const service = getServiceSupabase();
  if (!service) return null;
  const { data } = await service
    .from("anonymous_accounts")
    .select(RECORD_COLUMNS)
    .eq("number_hash", hashAccountNumber(number))
    .maybeSingle();
  return (data as AnonRecord | null) ?? null;
}

/**
 * Assemble the JSON snapshot of everything tied to a user. Reads through the
 * service role because by the time this runs the account may already be
 * expired (no session to apply RLS to).
 */
export async function buildAnonSnapshot(
  uid: string,
  record: Pick<AnonRecord, "tier" | "expires_at" | "purge_after">,
): Promise<Record<string, unknown>> {
  const service = getServiceSupabase();
  if (!service) throw new Error("service role unavailable");

  const many = async (table: string, column: string, value: string) => {
    const { data } = await service.from(table).select("*").eq(column, value).limit(MAX_ROWS);
    return (data as Record<string, unknown>[] | null) ?? [];
  };

  const [profile, memberships, groupMemberships, messages, dmMessages, groupMessages,
    reactions, notes, userNotes, favoriteGifs, pinned, notifications, friendships] =
    await Promise.all([
      service.from("profiles").select("*").eq("id", uid).maybeSingle().then((r) => r.data ?? null),
      many("server_members", "user_id", uid),
      many("group_chat_members", "user_id", uid),
      many("messages", "author_id", uid),
      many("dm_messages", "author_id", uid),
      many("group_messages", "author_id", uid),
      many("message_reactions", "user_id", uid),
      many("notes", "user_id", uid),
      many("user_notes", "author_id", uid),
      many("favorite_gifs", "user_id", uid),
      service
        .from("pinned_messages")
        .select("*")
        .or(`author_id.eq.${uid},pinner_id.eq.${uid}`)
        .limit(MAX_ROWS)
        .then((r) => (r.data as Record<string, unknown>[] | null) ?? []),
      many("notifications", "user_id", uid),
      service
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
        .limit(MAX_ROWS)
        .then((r) => (r.data as Record<string, unknown>[] | null) ?? []),
    ]);

  const serverIds = memberships.map((m) => m.server_id as string).filter(Boolean);
  let servers: Record<string, unknown>[] = [];
  if (serverIds.length > 0) {
    const { data } = await service.from("servers").select("*").in("id", serverIds);
    servers = (data as Record<string, unknown>[] | null) ?? [];
  }

  return {
    export: {
      generated_at: new Date().toISOString(),
      account_type: "anonymous",
      tier: record.tier,
      tier_label: ANON_TIERS[record.tier]?.label ?? record.tier,
      expires_at: record.expires_at,
      purge_after: record.purge_after,
      note: "Attachments and media files referenced here are hosted separately and are not included in this file.",
    },
    profile,
    servers,
    server_memberships: memberships,
    group_chat_memberships: groupMemberships,
    messages,
    dm_messages: dmMessages,
    group_messages: groupMessages,
    reactions,
    notes,
    user_notes: userNotes,
    favorite_gifs: favoriteGifs,
    pinned_messages: pinned,
    notifications,
    friendships,
  };
}

/**
 * Expire one account: snapshot it, then delete the live auth user (and, by
 * cascade, everything tied to it). Idempotent — a processed account is left
 * alone. Returns true when the account now has a snapshot.
 */
export async function processExpiredAnonAccount(record: AnonRecord): Promise<boolean> {
  const service = getServiceSupabase();
  if (!service) return false;
  if (record.expires_processed_at) return true;

  if (!record.user_id) {
    // No live user to snapshot or delete; just mark it processed.
    await service
      .from("anonymous_accounts")
      .update({ expires_processed_at: new Date().toISOString() })
      .eq("id", record.id);
    return false;
  }

  let snapshot: Record<string, unknown> | null = null;
  try {
    snapshot = await buildAnonSnapshot(record.user_id, record);
  } catch (err) {
    // Try again on the next sweep rather than deleting data we failed to copy.
    console.error("[anon] snapshot failed", err);
    return false;
  }

  const { error: snapshotError } = await service
    .from("anonymous_accounts")
    .update({ snapshot, expires_processed_at: new Date().toISOString() })
    .eq("id", record.id);
  if (snapshotError) {
    console.error("[anon] snapshot store failed", snapshotError.message);
    return false;
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(record.user_id);
  if (deleteError && !/not found/i.test(deleteError.message)) {
    // Snapshot is stored; the sweep will retry the delete next tick.
    console.error("[anon] deleteUser failed after snapshot", deleteError.message);
    return true;
  }
  // The FK set NULL already; make it explicit in case the user was long gone.
  await service.from("anonymous_accounts").update({ user_id: null }).eq("id", record.id);
  return true;
}

/** Snapshot-and-wipe every account whose lifetime has ended. */
export async function expireDueAnonymousAccounts(): Promise<{ scanned: number; expired: number }> {
  const service = getServiceSupabase();
  if (!service) return { scanned: 0, expired: 0 };

  const { data } = await service
    .from("anonymous_accounts")
    .select(RECORD_COLUMNS)
    .is("expires_processed_at", null)
    .lte("expires_at", new Date().toISOString())
    .limit(100);

  const rows = (data as AnonRecord[] | null) ?? [];
  let expired = 0;
  for (const row of rows) {
    if (await processExpiredAnonAccount(row)) expired += 1;
  }
  return { scanned: rows.length, expired };
}

export async function getAnonSnapshot(id: string): Promise<Record<string, unknown> | null> {
  const service = getServiceSupabase();
  if (!service) return null;
  const { data } = await service
    .from("anonymous_accounts")
    .select("snapshot")
    .eq("id", id)
    .maybeSingle();
  return (data?.snapshot as Record<string, unknown> | null) ?? null;
}

/**
 * Permanently remove the private snapshot (the "deny the copy" path, or the end
 * of the window). Keeps the registry row so the number still resolves.
 */
export async function purgeAnonymousAccount(record: AnonRecord, reason: string): Promise<boolean> {
  const service = getServiceSupabase();
  if (!service) return false;

  if (record.user_id) {
    const { error } = await service.auth.admin.deleteUser(record.user_id);
    if (error && !/not found/i.test(error.message)) {
      console.error("[anon] deleteUser failed", error.message);
      return false;
    }
  }

  const { error: markError } = await service
    .from("anonymous_accounts")
    .update({
      snapshot: null,
      data_purged_at: new Date().toISOString(),
      purged_reason: reason,
      user_id: null,
    })
    .eq("id", record.id);
  if (markError) {
    console.error("[anon] failed to mark purged", markError.message);
    return false;
  }
  return true;
}

/** Purge every account whose download window has closed. */
export async function purgeDueAnonymousAccounts(): Promise<{ scanned: number; purged: number }> {
  const service = getServiceSupabase();
  if (!service) return { scanned: 0, purged: 0 };

  const { data } = await service
    .from("anonymous_accounts")
    .select(RECORD_COLUMNS)
    .is("data_purged_at", null)
    .lte("purge_after", new Date().toISOString())
    .limit(100);

  const rows = (data as AnonRecord[] | null) ?? [];
  let purged = 0;
  for (const row of rows) {
    if (await purgeAnonymousAccount(row, "expired_window_closed")) purged += 1;
  }
  return { scanned: rows.length, purged };
}
