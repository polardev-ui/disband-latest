import { getServiceSupabase } from "@/lib/supabase/server";
import {
  sendTrackedResendEmail,
  getResendEmailStatus,
  type ResendDeliveryStatus,
} from "@/lib/resend";
// escapeHtml lives in bug-reports today but is a generic utility, and a second
// copy of an HTML-escaping routine in a module that builds emails is exactly the
// kind of thing that later drifts into an injection hole.
import { escapeHtml } from "@/lib/bug-reports";

/**
 * PlayStation 5 (or $600) giveaway: entry standings, the draw, and delivery
 * tracking for the winner's email.
 *
 * The arithmetic and the draw itself live in SQL (migration 0098) so the pool
 * can be snapshotted and audited. This module is the orchestration around it:
 * open the draw record, count entries, run the draw, tell the winner, tell the
 * owner what happened, and keep checking whether the email actually landed.
 *
 * Delivery is the part that is easy to get wrong. Resend accepting a message
 * proves only that the API took it; the address can still bounce. So the
 * provider's message id is stored and its outcome is polled, and the owner is
 * told the real status rather than "sent".
 */

// The published draw date. 12:00 UTC on the 15th is 7am US Eastern and midday
// UTC, so the draw genuinely falls on the 15th for the owner rather than on the
// evening of the 14th, which is what 00:00 UTC would give. Overridable so a
// rescheduled raffle is a config change rather than a code change.
const DEFAULT_DRAW_AT = "2026-12-15T12:00:00.000Z";

// The published entry window opens when the raffle page went live. The draw's
// promo_end defaults to the draw moment itself, so every qualifying action up
// to the draw counts.
const DEFAULT_PROMO_START = "2026-09-26T00:00:00.000Z";

const RESPONSE_DAYS = 7;

export type RaffleDrawStatus = "open" | "drawn" | "claimed" | "expired";

export interface RaffleDraw {
  id: string;
  prize: string;
  status: RaffleDrawStatus;
  promo_start: string;
  promo_end: string;
  winner_user_id: string | null;
  runner_up_user_id: string | null;
  winner_email: string | null;
  runner_up_email: string | null;
  winner_entries: number | null;
  runner_up_entries: number | null;
  drawn_at: string | null;
  response_deadline: string | null;
  winner_email_id: string | null;
  winner_delivery_status: RaffleDeliveryStatus;
  winner_delivery_checked_at: string | null;
  winner_delivery_detail: string | null;
  claimed_at: string | null;
  prize_choice: "console" | "gift_card" | null;
  created_at: string;
}

/** Storage-side statuses. `unknown` means the provider reported something we do not model. */
export type RaffleDeliveryStatus =
  | "not_sent"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "unknown";

export interface RaffleStanding {
  user_id: string;
  username: string | null;
  entries: number;
  review_entries: number;
  referral_entries: number;
  verified_referrals: number;
  review_id: string | null;
  review_recorded_at: string | null;
}

export interface RaffleConfig {
  drawAt: string;
  promoStart: string;
  promoEnd: string;
  adminEmail: string | null;
}

export function getRaffleConfig(): RaffleConfig {
  const drawAt = process.env.RAFFLE_DRAW_AT?.trim() || DEFAULT_DRAW_AT;
  return {
    drawAt,
    promoStart: process.env.RAFFLE_PROMO_START?.trim() || DEFAULT_PROMO_START,
    // The window closes at the draw itself, so nothing qualifying is left out.
    promoEnd: process.env.RAFFLE_PROMO_END?.trim() || drawAt,
    adminEmail:
      process.env.RAFFLE_ADMIN_EMAIL?.trim() ||
      process.env.OWNER_EMAIL?.trim() ||
      null,
  };
}

function requireService() {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service role is not configured.");
  return service;
}

/**
 * Returns the raffle's draw record, creating it on first use.
 *
 * The record is the source of truth for the entry window, so it is created once
 * and never re-derived: if the configuration changed later, the already-open
 * draw keeps the window it was opened with. Re-running is a no-op.
 */
export async function ensureActiveDraw(): Promise<RaffleDraw> {
  const service = requireService();
  const config = getRaffleConfig();

  const { data: existing, error: readError } = await service
    .from("raffle_draws")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw new Error(`Could not read the raffle draw: ${readError.message}`);
  if (existing) return existing as RaffleDraw;

  const { data: created, error: createError } = await service
    .from("raffle_draws")
    .insert({ promo_start: config.promoStart, promo_end: config.promoEnd })
    .select("*")
    .single();

  if (createError) throw new Error(`Could not open the raffle draw: ${createError.message}`);
  return created as RaffleDraw;
}

export async function getDraw(drawId: string): Promise<RaffleDraw | null> {
  const service = requireService();
  const { data, error } = await service
    .from("raffle_draws")
    .select("*")
    .eq("id", drawId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the raffle draw: ${error.message}`);
  return (data as RaffleDraw | null) ?? null;
}

/** Every account with at least one entry, strongest first. */
export async function getStandings(limit = 50): Promise<RaffleStanding[]> {
  const service = requireService();
  const draw = await ensureActiveDraw();

  const { data, error } = await service.rpc("raffle_entry_counts", {
    p_since: draw.promo_start,
    p_until: draw.promo_end,
  });
  if (error) throw new Error(`Could not count raffle entries: ${error.message}`);

  const rows = (data as RaffleStanding[] | null) ?? [];
  return rows.sort((a, b) => b.entries - a.entries).slice(0, Math.max(1, limit));
}

/** Snapshot of the pool for a draw, used for the audit report. */
export async function getPool(drawId: string): Promise<RaffleStanding[]> {
  const service = requireService();
  const { data, error } = await service
    .from("raffle_entries")
    .select("user_id, username, entries, review_entries, referral_entries, verified_referrals")
    .eq("raffle_id", drawId);
  if (error) throw new Error(`Could not read the raffle pool: ${error.message}`);
  return ((data as RaffleStanding[] | null) ?? []).sort((a, b) => b.entries - a.entries);
}

/**
 * Runs the draw and emails both the winner and the owner.
 *
 * Guarded twice: the window must have opened, and the draw must actually be
 * today unless `force` is set. A misconfigured cron that fires early is the
 * obvious way to accidentally draw a raffle two months early and invalidate it,
 * so that is refused rather than merely discouraged.
 */
export async function runDraw(options: { force?: boolean } = {}): Promise<{
  draw: RaffleDraw;
  winner: { userId: string; email: string; entries: number; username: string | null };
  runnerUp: { userId: string; email: string; entries: number; username: string | null } | null;
  winnerEmail: WinnerEmailOutcome;
  ownerReport: { delivered: boolean; error?: string };
}> {
  const service = requireService();
  const config = getRaffleConfig();
  const draw = await ensureActiveDraw();

  if (draw.status !== "open") {
    throw new Error(
      `This raffle was already drawn on ${draw.drawn_at ?? "an earlier run"} (status: ${draw.status}).`,
    );
  }

  if (!options.force && Date.now() < new Date(config.drawAt).getTime()) {
    throw new Error(
      `The draw is scheduled for ${config.drawAt} and has not opened yet. Pass force to draw early.`,
    );
  }

  const { data, error } = await service.rpc("raffle_draw_winner", { p_draw_id: draw.id });
  if (error) throw new Error(`The draw failed: ${error.message}`);

  const result = (data as Array<{
    winner_user_id: string;
    winner_email: string;
    winner_entries: number;
    runner_up_user_id: string | null;
    runner_up_email: string | null;
    runner_up_entries: number | null;
  }> | null)?.[0];

  if (!result?.winner_user_id) throw new Error("The draw returned no winner.");

  const pool = await getPool(draw.id);

  const winner = {
    userId: result.winner_user_id,
    email: result.winner_email,
    entries: result.winner_entries,
    username: pool.find((row) => row.user_id === result.winner_user_id)?.username ?? null,
  };
  const runnerUp = result.runner_up_user_id
    ? {
        userId: result.runner_up_user_id,
        email: result.runner_up_email ?? "",
        entries: result.runner_up_entries ?? 0,
        username: pool.find((row) => row.user_id === result.runner_up_user_id)?.username ?? null,
      }
    : null;

  // From here the draw is committed and the record will not leave `drawn`
  // again, so nothing below may be allowed to abort before the owner has been
  // told. A failure to reach the winner must not become a silent one: the
  // owner gets the report either way, with the failure stated on it, and
  // resendWinnerEmail() can put it right.
  const fresh = (await getDraw(draw.id))!;
  const winnerEmail = fresh.winner_email
    ? await emailWinner(fresh, winner.username)
    : {
        emailId: null,
        sent: false,
        error: "The winner has no email address on their account, so they could not be reached.",
      };

  const ownerReport = await emailOwner({
    draw: fresh,
    winner,
    runnerUp,
    pool,
    winnerEmail,
  });

  return { draw: (await getDraw(draw.id))!, winner, runnerUp, winnerEmail, ownerReport };
}

export interface WinnerEmailOutcome {
  emailId: string | null;
  /** True once the mail provider accepted the message. NOT proof of delivery. */
  sent: boolean;
  error?: string;
}

async function emailWinner(draw: RaffleDraw, username: string | null): Promise<WinnerEmailOutcome> {
  const deadline = draw.response_deadline ?? new Date(Date.now() + RESPONSE_DAYS * 86400000).toISOString();

  let emailId: string;
  try {
    emailId = await sendTrackedResendEmail({
      to: draw.winner_email!,
      subject: "You won the Disband PlayStation 5 giveaway",
      html: buildWinnerEmailHtml({ username, deadline }),
    });
  } catch (error) {
    return {
      emailId: null,
      sent: false,
      error: `The winner's email could not be sent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // The mail is on its way. Recording the id is what makes the delivery
  // checkable later, so a failure here is reported rather than swallowed — but
  // it is not a failure to send.
  try {
    const service = requireService();
    const { error } = await service.rpc("raffle_mark_email_sent", {
      p_draw_id: draw.id,
      p_email_id: emailId,
    });
    if (error) {
      return { emailId, sent: true, error: `Sent as ${emailId}, but the id could not be recorded: ${error.message}` };
    }
  } catch (error) {
    return { emailId, sent: true, error: `Sent as ${emailId}, but the id could not be recorded: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { emailId, sent: true };
}

async function emailOwner(input: {
  draw: RaffleDraw;
  winner: { username: string | null; email: string; entries: number };
  runnerUp: { username: string | null; email: string; entries: number } | null;
  pool: RaffleStanding[];
  winnerEmail: WinnerEmailOutcome;
}): Promise<{ delivered: boolean; error?: string }> {
  const { adminEmail } = getRaffleConfig();
  if (!adminEmail) return { delivered: false, error: "No admin email is configured." };

  try {
    await sendTrackedResendEmail({
      to: adminEmail,
      subject: `Raffle winner drawn: ${input.winner.username ?? input.winner.email}`,
      html: buildOwnerReportHtml(input),
    });
    return { delivered: true };
  } catch (error) {
    return { delivered: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Polls the provider for the real outcome of the winner's email and records it.
 *
 * Resend's `last_event` is mapped onto the storage statuses. `opened` and
 * `clicked` are treated as delivered, since either proves the message arrived.
 */
export async function refreshDeliveryStatus(drawId: string): Promise<{
  status: RaffleDeliveryStatus;
  providerEvent: ResendDeliveryStatus;
  checked: boolean;
}> {
  const service = requireService();
  const draw = await getDraw(drawId);
  if (!draw) throw new Error(`No raffle draw with id ${drawId}.`);

  if (!draw.winner_email_id) {
    return { status: draw.winner_delivery_status, providerEvent: "not_sent", checked: false };
  }

  const provider = await getResendEmailStatus(draw.winner_email_id);
  if (!provider) {
    // The provider is unreachable or does not know the id. Do NOT touch the
    // recorded status: an unknown answer must not overwrite a known one.
    return { status: draw.winner_delivery_status, providerEvent: "unknown", checked: false };
  }

  const mapped: RaffleDeliveryStatus = (() => {
    switch (provider.lastEvent) {
      case "delivered":
      case "opened":
      case "clicked":
        return "delivered";
      case "bounced":
      case "complained":
      case "failed":
        return provider.lastEvent;
      case "queued":
      case "sent":
      case "accepted":
      case "delivery_delayed":
        return "accepted";
      default:
        return "unknown";
    }
  })();

  if (mapped === "unknown") {
    return { status: draw.winner_delivery_status, providerEvent: provider.lastEvent, checked: false };
  }

  const { error } = await service.rpc("raffle_record_delivery", {
    p_draw_id: drawId,
    p_status: mapped,
    p_detail: provider.lastEvent,
  });
  if (error) throw new Error(`Could not record the delivery status: ${error.message}`);

  const updated = await getDraw(drawId);
  return {
    status: updated?.winner_delivery_status ?? mapped,
    providerEvent: provider.lastEvent,
    checked: true,
  };
}

/** Promotes the runner-up if the winner's response window has closed. */
export async function promoteRunnerUp(drawId: string): Promise<{ promoted: boolean; userId: string | null }> {
  const service = requireService();
  const { data, error } = await service.rpc("raffle_promote_runner_up", { p_draw_id: drawId });
  if (error) throw new Error(`Could not promote the runner-up: ${error.message}`);
  const row = (data as Array<{ promoted: boolean; promoted_user_id: string | null }> | null)?.[0];
  return { promoted: row?.promoted ?? false, userId: row?.promoted_user_id ?? null };
}

/**
 * Re-sends the winner's email, e.g. after a bounce.
 *
 * The address is the one snapshotted at draw time, not whatever the account
 * currently has, so this always reaches the same person the terms named.
 */
export async function resendWinnerEmail(drawId: string): Promise<{ email: string; emailId: string | null; sent: boolean; error?: string }> {
  const service = requireService();
  const draw = await getDraw(drawId);
  if (!draw) throw new Error(`No raffle draw with id ${drawId}.`);
  if (!draw.winner_email) throw new Error("This draw has no winner email on file to send to.");

  const pool = await getPool(drawId);
  const username = pool.find((row) => row.user_id === draw.winner_user_id)?.username ?? null;

  const outcome = await emailWinner(draw, username);
  // Re-read so the caller sees the newly recorded id rather than the stale one.
  const updated = await getDraw(drawId);
  return {
    email: draw.winner_email,
    emailId: updated?.winner_email_id ?? outcome.emailId,
    sent: outcome.sent,
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}

/** Records that the winner replied and chose a prize. */
export async function recordClaim(
  drawId: string,
  prizeChoice: "console" | "gift_card",
): Promise<void> {
  const service = requireService();
  const { error } = await service.rpc("raffle_claim", {
    p_draw_id: drawId,
    p_prize_choice: prizeChoice,
  });
  if (error) throw new Error(`Could not record the claim: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

const shell = (content: string) => `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#1e1f22;color:#dbdee1;padding:24px;max-width:640px">
${content}
<p style="margin:28px 0 0;color:#72767d;font-size:12px">
  This is an automated message from Disband. We will never ask you for your password.
</p>
</div>`;

const heading = (text: string) =>
  `<h2 style="margin:0 0 4px;color:#fff;font-size:20px">${escapeHtml(text)}</h2>`;

const muted = (text: string) =>
  `<p style="margin:0 0 20px;color:#949ba4;font-size:13px">${escapeHtml(text)}</p>`;

const panel = (rows: Array<[string, string]>) => `
  <div style="background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px">
    ${rows
      .map(
        ([label, value]) =>
          `<p style="margin:0 0 6px;color:#b5bac1;font-size:13px"><strong>${escapeHtml(label)}</strong><br/><span style="color:#fff">${escapeHtml(value)}</span></p>`,
      )
      .join("")}
  </div>`;

export function buildWinnerEmailHtml(input: { username: string | null; deadline: string }): string {
  const deadlineLabel = new Date(input.deadline).toUTCString();
  return shell(`
  ${heading("You won the PlayStation 5 giveaway")}
  ${muted(`Drawn ${new Date().toUTCString()}`)}
  <p style="margin:0 0 16px;color:#dbdee1;font-size:15px;line-height:1.6">
    ${input.username ? `${escapeHtml(input.username)}, you` : "You"} just won a
    <strong>PlayStation 5</strong> — or a <strong>$600 gift card</strong>, your choice.
    No purchase was necessary to enter.
  </p>
  ${panel([
    ["You won", "PlayStation 5 or $600 gift card"],
    ["Reply by", deadlineLabel],
    ["Where to reply", "Reply to this email and contact @polar on Disband"],
  ])}
  <p style="margin:0 0 12px;color:#dbdee1;font-size:14px;line-height:1.6">
    To claim, reply to this email within 7 days and either:
  </p>
  <ul style="margin:0 0 16px;padding-left:20px;color:#dbdee1;font-size:14px;line-height:1.7">
    <li>Ask for the <strong>$600 gift card</strong>, sent to this same address, or</li>
    <li>Send the <strong>shipping name and address</strong> for the console</li>
  </ul>
  <p style="margin:0;color:#949ba4;font-size:13px;line-height:1.6">
    If we do not hear back by ${escapeHtml(deadlineLabel)} a runner-up is drawn instead.
  </p>`);
}

export function buildOwnerReportHtml(input: {
  draw: RaffleDraw;
  winner: { username: string | null; email: string; entries: number };
  runnerUp: { username: string | null; email: string; entries: number } | null;
  pool: RaffleStanding[];
  winnerEmail?: WinnerEmailOutcome;
}): string {
  const totalTickets = input.pool.reduce((sum, row) => sum + row.entries, 0);
  const totalReferralEntries = input.pool.reduce((sum, row) => sum + row.referral_entries, 0);
  const totalReviewEntries = input.pool.reduce((sum, row) => sum + row.review_entries, 0);
  const top = input.pool.slice(0, 10);

  // When the winner's own email could not go out, that is the one thing on
  // this page that needs a human, so it leads.
  const alert =
    input.winnerEmail && !input.winnerEmail.sent
      ? `
  <div style="background:#3a2323;border-radius:8px;padding:14px;margin-bottom:16px;border-left:3px solid #f23f43">
    <p style="margin:0 0 6px;color:#fff;font-size:14px"><strong>The winner was NOT emailed.</strong></p>
    <p style="margin:0 0 8px;color:#f0b4b4;font-size:13px;line-height:1.6">${escapeHtml(input.winnerEmail.error ?? "unknown reason")}</p>
    <p style="margin:0;color:#f0b4b4;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
      POST /api/admin/raffle {"action":"resend"}
    </p>
  </div>`
      : input.winnerEmail?.error
        ? `
  <div style="background:#3a3323;border-radius:8px;padding:14px;margin-bottom:16px;border-left:3px solid #faa61a">
    <p style="margin:0 0 6px;color:#fff;font-size:14px"><strong>The winner's email was sent, but:</strong></p>
    <p style="margin:0;color:#f0d9a8;font-size:13px;line-height:1.6">${escapeHtml(input.winnerEmail.error)}</p>
  </div>`
        : "";

  const rows = top
    .map(
      (row, index) => `
    <tr>
      <td style="padding:6px 10px 6px 0;color:#72767d;font-size:12px">${index + 1}</td>
      <td style="padding:6px 10px 6px 0;color:#fff;font-size:13px">${escapeHtml(row.username ?? row.user_id)}</td>
      <td style="padding:6px 10px 6px 0;color:#b5bac1;font-size:13px">${row.entries}</td>
      <td style="padding:6px 10px 6px 0;color:#72767d;font-size:12px">${row.review_entries} review / ${row.referral_entries} referral</td>
    </tr>`,
    )
    .join("");

  return shell(`
  ${heading("PlayStation 5 giveaway: winner drawn")}
  ${muted(new Date().toUTCString())}
  ${alert}
  ${panel([
    ["Winner", `${input.winner.username ?? "(no username)"} — ${input.winner.email}`],
    ["Winning entries", `${input.winner.entries}`],
    ["Runner-up held", input.runnerUp ? `${input.runnerUp.username ?? "(no username)"} — ${input.runnerUp.email} (${input.runnerUp.entries})` : "none — single entrant"],
    ["Reply deadline", input.draw.response_deadline ? new Date(input.draw.response_deadline).toUTCString() : "unknown"],
    ["Pool", `${input.pool.length} entrants, ${totalTickets} tickets`],
    ["Split", `${totalReviewEntries} review entries, ${totalReferralEntries} referral entries`],
  ])}
  <p style="margin:0 0 8px;color:#b5bac1;font-size:13px">
    <strong>Is the winner's email delivered?</strong> Accepted by the mail provider is not
    delivery — it can still bounce. Check the real status any time:
  </p>
  <p style="margin:0 0 16px;color:#949ba4;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6">
    pnpm raffle:draw -- --job=upkeep
  </p>
  <p style="margin:0 0 8px;color:#b5bac1;font-size:13px"><strong>Top entrants</strong></p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
    ${rows}
  </table>
  <p style="margin:0;color:#72767d;font-size:12px;line-height:1.6">
    Entries: 1 per fresh 5-star review, plus 1 for every 2 verified referrals, stacking without limit.
    Drawn at random weighted by entries. A runner-up is held in reserve and promoted if the winner
    does not reply within 7 days.
  </p>`);
}
