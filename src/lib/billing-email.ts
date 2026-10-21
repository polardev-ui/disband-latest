import type { SupabaseClient } from "@supabase/supabase-js";
import { sendResendEmail } from "./resend";
import { PUBLIC_ENV } from "./public-env";

interface PaymentFailedEmailInput {
  invoiceId: string;
  userId: string;
  email: string;
  amountDue?: number | null;
  currency?: string | null;
  hostedInvoiceUrl?: string | null;
  subscriptionStatus?: string | null;
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

/**
 * Email a member whose subscription renewal was declined.
 *
 * De-duplication lives in `billing_notification_log`: Stripe retries failed
 * webhook deliveries, and a retry must not send a second copy. The row is
 * removed if Resend rejects the send so a later retry can try again.
 */
export async function sendPaymentFailedEmail(
  service: SupabaseClient,
  input: PaymentFailedEmailInput,
): Promise<"sent" | "duplicate"> {
  const { error: logError } = await service.from("billing_notification_log").insert({
    invoice_id: input.invoiceId,
    user_id: input.userId,
    email: input.email,
    kind: "invoice.payment_failed",
    status: "sending",
  });

  if (logError) {
    if (logError.code === "23505") return "duplicate";
    throw new Error(`Could not record payment-failure email: ${logError.message}`);
  }

  const settingsUrl = `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}/app?settings=subscriptions`;
  const amount = formatAmount(input.amountDue, input.currency);
  const ended = input.subscriptionStatus === "canceled" || input.subscriptionStatus === "incomplete_expired";
  const consequence = ended
    ? "The subscription has ended, but the invoice is still open. If you want to keep your plan, update your card and resubscribe."
    : "Your subscription is still active for now, but it may be paused if the card isn't updated.";
  const invoiceLink = input.hostedInvoiceUrl
    ? `<p style="margin:16px 0 0"><a href="${input.hostedInvoiceUrl}" style="color:#5865f2">View the invoice</a></p>`
    : "";

  try {
    await sendResendEmail({
      to: input.email,
      subject: "Action needed: your Disband payment failed",
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px">
          <h2 style="margin:0 0 12px">Your payment didn't go through</h2>
          <p style="margin:0 0 12px">
            We couldn't charge the payment method on file for your Disband
            subscription${amount ? ` (${amount})` : ""}. ${consequence}
          </p>
          <p style="margin:0 0 20px">
            Open Disband and choose <b>Manage billing</b> in
            Settings → Subscription to update your card. Stripe handles the
            payment details; Disband never sees or stores your card number.
          </p>
          <p style="margin:0 0 8px">
            <a href="${settingsUrl}" style="display:inline-block;background:#5865f2;color:#fff;text-decoration:none;padding:11px 18px;border-radius:4px;font-weight:600">
              Update payment method
            </a>
          </p>
          ${invoiceLink}
          <p style="margin:24px 0 0;color:#666;font-size:13px">
            If you've already replaced the card, you can ignore this email.
            Payments are retried automatically for a short period.
          </p>
        </div>`,
    });
  } catch (error) {
    await service.from("billing_notification_log").delete().eq("invoice_id", input.invoiceId);
    throw error;
  }

  await service
    .from("billing_notification_log")
    .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
    .eq("invoice_id", input.invoiceId);

  return "sent";
}
