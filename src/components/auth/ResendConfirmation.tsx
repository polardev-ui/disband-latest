"use client";

import { useState } from "react";
import { mapAuthError } from "@/lib/authErrors";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Sends a fresh confirmation email.
 *
 * A confirmation link expires, and until now nothing in the app could issue
 * another one: signing in answered "email not confirmed" and stopped there,
 * and an expired link landed on a page whose only button was "back to log in".
 * An account created a day too early was therefore permanently unreachable by
 * its owner — the address was taken, so they could not sign up again either.
 *
 * Supabase reveals nothing about whether an address exists here, and neither
 * does this: the same wording comes back either way, so it cannot be used to
 * test which addresses have accounts.
 */
export function ResendConfirmation({
  defaultEmail = "",
  /** Hide the field when the address is already known and not in question. */
  lockEmail = false,
}: {
  defaultEmail?: string;
  lockEmail?: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || state === "sending") return;

    setState("sending");
    setError(null);

    const { error: sendError } = await getSupabaseClient().auth.resend({
      type: "signup",
      email: address,
    });

    if (sendError) {
      const reason = sendError.message.toLowerCase();

      // "No such user" and "already confirmed" are answers about the address,
      // and reporting either turns this box into a way to test which addresses
      // have accounts. Both get the same neutral reply as a real send.
      const revealsAccount =
        reason.includes("not found")
        || reason.includes("no user")
        || reason.includes("already been confirmed")
        || reason.includes("already confirmed");

      if (!revealsAccount) {
        // A rate limit is worth naming: the mail is already on its way, and
        // "try again" would be exactly the wrong advice.
        setError(mapAuthError(sendError.message));
        setState("idle");
        return;
      }
    }

    setState("sent");
  }

  if (state === "sent") {
    return (
      <p
        role="status"
        className="rounded-md border border-status-online/30 bg-status-online/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-online"
      >
        If that address needs confirming, a new link is on its way to{" "}
        <span className="font-medium">{email.trim()}</span>. It is good for 24 hours —
        check your spam folder if it does not arrive.
      </p>
    );
  }

  return (
    <form onSubmit={send} className="space-y-2 text-left">
      {!lockEmail && (
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={state === "sending" || !email.trim()}
        className="w-full rounded-md border border-divider bg-bg-accent py-2.5 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send a new confirmation email"}
      </button>

      {error && <p className="text-[13px] text-status-dnd">{error}</p>}
    </form>
  );
}
