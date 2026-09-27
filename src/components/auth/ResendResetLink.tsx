"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Send it again" for the password-reset screen.
 *
 * The reset screen used to be a dead end: it said a link was on its way and
 * offered nothing but "Back to sign in". When the mail did not arrive — held
 * up, filtered into spam, or refused by the auth server's per-user send
 * limit, none of which the client can see — the only way to try again was to
 * navigate back and retype the address.
 *
 * The cooldown is not cosmetic. The auth server refuses a second recovery
 * mail for the same address inside a short window and answers with an error,
 * so a button that could be mashed would mostly produce failures that look
 * like the feature is broken. Counting the window down locally turns that
 * into an honest "ready in 42s".
 */
const COOLDOWN_SECONDS = 60;

export function ResendResetLink({
  email,
  onResend,
}: {
  email: string;
  /** Returns an error message, or null when the request was accepted. */
  onResend: (email: string) => Promise<string | null>;
}) {
  const [remaining, setRemaining] = useState(COOLDOWN_SECONDS);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setRemaining((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function resend() {
    if (state === "sending" || remaining > 0) return;
    setState("sending");
    setError(null);
    setNote(null);

    const err = await onResend(email);

    if (err) {
      setError(err);
      // A refused send is usually the server's own rate limit. Backing off
      // for the full window is the only thing that makes the next try work.
      setRemaining(COOLDOWN_SECONDS);
    } else {
      setNote(`Sent again to ${email}.`);
      setRemaining(COOLDOWN_SECONDS);
    }
    setState("idle");
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending" || remaining > 0}
        className="w-full rounded-md border border-divider py-2.5 text-[15px] font-medium text-text-normal transition-colors hover:border-text-muted hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-divider disabled:hover:bg-transparent"
      >
        {state === "sending"
          ? "Sending…"
          : remaining > 0
            ? `Send it again in ${remaining}s`
            : "Send it again"}
      </button>

      {note && (
        <p role="status" className="text-[13px] text-status-online">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-status-dnd">
          {error}
        </p>
      )}

      <p className="text-[13px] leading-relaxed text-text-muted">
        Nothing after a couple of minutes? Check your spam folder, and make
        sure <span className="text-text-normal">{email}</span> is the address
        on the account — we can&apos;t say whether an address has one.
      </p>
    </div>
  );
}
