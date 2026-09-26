import "server-only";

/**
 * The official @disband account and the broadcast rail behind it.
 *
 * What this is for: an owner-only way to address every account on Disband, or
 * one named account, from an identity that cannot be mistaken for a person.
 * Notices that happen automatically — a Sentinel suspension, a restriction being
 * applied or lapsing — go down the same path, so there is exactly one place
 * where a message to a user is composed and delivered.
 *
 * Why notifications and not a DM: get_or_create_dm_thread requires an accepted
 * friendship, so a system account could never reach the ~95% of Disband who are
 * not friends with it. The database already refuses DM threads to bots outright
 * (0097), and that refusal is deliberate, so this does not go around it.
 *
 * Why email is opt-in per send: a broadcast to the whole userbase is ~9.5k
 * emails. That has to be a decision somebody makes on purpose, every time.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { getResendEmailStatus, sendTrackedResendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/bug-reports";

export type BroadcastAudience = "everyone" | "user";
export type BroadcastKind = "announcement" | "account_action" | "restriction" | "service_notice";

export interface SendBroadcastInput {
  audience: BroadcastAudience;
  targetUserId?: string | null;
  kind: BroadcastKind;
  title: string;
  body: string;
  link?: string | null;
  /** Off by default. A whole-userbase send must be a deliberate choice. */
  sendEmail?: boolean;
  actor?: string | null;
}

export interface SendBroadcastResult {
  broadcastId: string;
  recipientCount: number;
  emailRequested: number;
  emailSent: number;
  emailFailed: number;
  emailFailures: Array<{ userId: string; username: string | null; reason: string }>;
}

/**
 * Templates for the notices an owner sends most often.
 *
 * Kept here rather than in the UI so the copy is reviewable in one place and
 * the automated path can reuse it. The wording for account actions and
 * restrictions is deliberately plain: it says what happened to your account and
 * what to do next, and nothing about the material that triggered it.
 */
export const BROADCAST_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  kind: BroadcastKind;
  title: string;
  body: string;
  build: (opts: { days?: number | null; ability?: string; until?: string }) => { title: string; body: string };
}> = [
  {
    id: "announcement",
    label: "General announcement",
    description: "A notice for everyone on Disband.",
    kind: "announcement",
    title: "Something has changed on Disband",
    body: "",
    build: () => ({ title: "Something has changed on Disband", body: "" }),
  },
  {
    id: "account_violation",
    label: "Account violation",
    description: "Tells one account that it broke the rules.",
    kind: "account_action",
    title: "Your account has broken the Disband rules",
    body:
      "Your account has broken the Disband rules and [what happened] has been actioned. " +
      "If you think this is a mistake, contact support and we will look again.",
    build: () => ({
      title: "Your account has broken the Disband rules",
      body:
        "Your account has broken the Disband rules and [what happened] has been actioned. " +
        "If you think this is a mistake, contact support and we will look again.",
    }),
  },
  {
    id: "lost_abilities",
    label: "Lost the ability to like or type",
    description:
      "Explains a temporary restriction and exactly when it ends. Applying the " +
      "restriction itself sends this automatically; use this template to explain it further.",
    kind: "restriction",
    title: "You cannot like or type on Disband for a while",
    body:
      "You cannot [like / type] on Disband until [date]. This is a temporary limit, not a " +
      "permanent ban, and it ends on its own. Everything else on your account still works.",
    build: ({ ability, until }) => ({
      title: `You cannot ${ability ?? "like or type"} on Disband for a while`,
      body:
        `You cannot ${ability ?? "like or type"} on Disband until ${until ?? "[date]"}. ` +
        "This is a temporary limit, not a permanent ban, and it ends on its own. " +
        "Everything else on your account still works.",
    }),
  },
  {
    id: "service_notice",
    label: "Service issue",
    description: "Outage, degraded feature, or a fix that has shipped.",
    kind: "service_notice",
    title: "A part of Disband is not working",
    body:
      "[What is broken] until [when]. Nothing you did caused it, and nothing will be lost.",
    build: () => ({
      title: "A part of Disband is not working",
      body: "[What is broken] until [when]. Nothing you did caused it, and nothing will be lost.",
    }),
  },
];

const EMAIL_FROM = process.env.RESEND_FROM_EMAIL ?? "Disband <onboarding@resend.dev>";
const EMAIL_REPLY_TO = process.env.SUPPORT_EMAIL ?? undefined;

function buildEmailHtml(title: string, body: string, link: string | null): string {
  const cta = link
    ? `<p><a href="${escapeHtml(link)}" style="background:#5865f2;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open Disband</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f5f7;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;letter-spacing:.02em">DISBAND</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;white-space:pre-wrap">${escapeHtml(body)}</p>
    ${cta}
    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
      This is an automated message from the official Disband account. Disband will never ask you for your password.
    </p>
  </div>
</body></html>`;
}

/**
 * Emails of the human recipients, for a delivery pass.
 *
 * Read in SQL, not from PostgREST: auth.users is invisible to the REST API, so
 * there is no way to ask for it from TypeScript. The raffle resolves its
 * winner's address the same way.
 */
async function fetchRecipients(broadcastId: string) {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data, error } = await service.rpc("broadcast_recipient_emails", {
    p_broadcast_id: broadcastId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ user_id: string; username: string | null; email: string | null }>;
}

/**
 * Sends the email half of a broadcast and records each outcome.
 *
 * Failures are collected and returned rather than thrown: the in-app
 * notification is already delivered at this point, and a provider outage should
 * not turn a successful send into a 500. The caller reports the shortfall.
 */
export async function deliverBroadcastEmail(
  broadcastId: string,
  opts: { subject: string; html: string },
): Promise<{ sent: number; failed: number; failures: Array<{ userId: string; username: string | null; reason: string }> }> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const recipients = await fetchRecipients(broadcastId);
  const failures: Array<{ userId: string; username: string | null; reason: string }> = [];
  let sent = 0;

  for (const row of recipients) {
    const username = row.username ?? null;
    if (!row.email) {
      failures.push({ userId: row.user_id, username, reason: "no email address on the account" });
      continue;
    }

    try {
      const emailId = await sendTrackedResendEmail({
        to: row.email,
        subject: opts.subject,
        html: opts.html,
        from: EMAIL_FROM,
        ...(EMAIL_REPLY_TO ? { replyTo: EMAIL_REPLY_TO } : {}),
      });
      sent += 1;
      await service
        .from("broadcast_deliveries")
        .update({ email_id: emailId, email_status: "queued" })
        .eq("broadcast_id", broadcastId)
        .eq("user_id", row.user_id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ userId: row.user_id, username, reason });
      await service
        .from("broadcast_deliveries")
        .update({ email_status: `failed: ${reason}`.slice(0, 200) })
        .eq("broadcast_id", broadcastId)
        .eq("user_id", row.user_id);
    }
  }

  await service
    .from("official_broadcasts")
    .update({ email_sent: sent, email_failed: failures.length })
    .eq("id", broadcastId);

  return { sent, failed: failures.length, failures };
}

export async function sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResult> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data, error } = await service.rpc("broadcast_send", {
    p_audience: input.audience,
    p_target_user_id: input.targetUserId ?? null,
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    p_link: input.link ?? null,
    p_send_email: input.sendEmail ?? false,
    p_actor: input.actor ?? null,
    p_origin: "admin",
  });
  if (error) throw new Error(error.message);

  const row = (data as Array<{ sent_broadcast_id: string; sent_recipient_count: number }>)?.[0];
  if (!row) throw new Error("broadcast_send returned no result.");
  const broadcastId = row.sent_broadcast_id;

  if (!input.sendEmail) {
    return {
      broadcastId,
      recipientCount: row.sent_recipient_count,
      emailRequested: 0,
      emailSent: 0,
      emailFailed: 0,
      emailFailures: [],
    };
  }

  const email = await deliverBroadcastEmail(broadcastId, {
    subject: input.title,
    html: buildEmailHtml(input.title, input.body, input.link ?? null),
  });

  return {
    broadcastId,
    recipientCount: row.sent_recipient_count,
    emailRequested: row.sent_recipient_count,
    emailSent: email.sent,
    emailFailed: email.failed,
    emailFailures: email.failures,
  };
}

export interface BroadcastHistoryEntry {
  id: string;
  audience: string;
  targetUsername: string | null;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  sendEmail: boolean;
  origin: string;
  recipientCount: number;
  emailSent: number;
  emailFailed: number;
  createdAt: string;
}

export async function listBroadcasts(limit = 25): Promise<BroadcastHistoryEntry[]> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data, error } = await service
    .from("official_broadcasts")
    .select(
      "id, audience, target_username, kind, title, body, link, send_email, origin, recipient_count, email_sent, email_failed, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    audience: r.audience,
    targetUsername: r.target_username,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    sendEmail: r.send_email,
    origin: r.origin,
    recipientCount: r.recipient_count,
    emailSent: r.email_sent,
    emailFailed: r.email_failed,
    createdAt: r.created_at,
  }));
}

export interface DeliverySummary {
  notified: number;
  pushPending: number;
  pushDispatched: number;
  pushFailed: number;
  emails: Record<string, number>;
}

/** Honest per-recipient status for one broadcast, for the panel to display. */
export async function getDeliverySummary(broadcastId: string): Promise<DeliverySummary> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data, error } = await service.rpc("broadcast_delivery_summary", {
    p_broadcast_id: broadcastId,
  });
  if (error) throw new Error(error.message);
  return data as DeliverySummary;
}

/**
 * Re-reads the provider's view of each emailed recipient.
 *
 * Same posture as the raffle: opened/clicked count as delivered, terminal states
 * are sticky, and a provider failure leaves the last known status alone rather
 * than overwriting it with a guess.
 */
export async function refreshBroadcastEmailStatus(broadcastId: string): Promise<{ checked: number; updated: number }> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data, error } = await service
    .from("broadcast_deliveries")
    .select("user_id, email_id, email_status")
    .eq("broadcast_id", broadcastId)
    .not("email_id", "is", null)
    .limit(2000);
  if (error) throw new Error(error.message);

  // Terminal in the same sense the raffle uses it: opened/clicked mean it
  // arrived, and anything past this point is not worth re-asking about.
  const TERMINAL = new Set(["delivered", "opened", "clicked", "bounced", "complained", "failed"]);
  let checked = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const row of (data ?? []) as Array<{ user_id: string; email_id: string; email_status: string | null }>) {
    if (row.email_status && TERMINAL.has(row.email_status)) continue;
    const status = await getResendEmailStatus(row.email_id);
    // The provider is unreachable or has never heard of the id. Leave the last
    // known status alone rather than overwriting it with a guess.
    if (!status || status.lastEvent === "unknown") continue;
    checked += 1;
    if (status.lastEvent === row.email_status) continue;
    await service
      .from("broadcast_deliveries")
      .update({ email_status: status.lastEvent, email_checked_at: now })
      .eq("broadcast_id", broadcastId)
      .eq("user_id", row.user_id);
    updated += 1;
  }

  return { checked, updated };
}

/** Resolves a username or user id to a real, non-bot account. */
export async function resolveRecipient(query: string): Promise<
  { id: string; username: string | null; displayName: string | null } | { error: string }
> {
  const service = getServiceSupabase();
  if (!service) return { error: "Service not available" };

  const trimmed = query.trim().replace(/^@/, "");
  if (!trimmed) return { error: "Enter a username." };

  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const { data, error } = await service
    .from("profiles")
    .select("id, username, display_name, is_bot")
    .eq(looksLikeUuid ? "id" : "username", looksLikeUuid ? trimmed : trimmed.toLowerCase())
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "No account with that name." };
  if (data.is_bot) return { error: "That is a bot account, not a person." };

  return { id: data.id, username: data.username, displayName: data.display_name };
}

/** How many humans a whole-userbase send would reach right now. */
export async function countHumanAudience(): Promise<number> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { count, error } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_bot", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
