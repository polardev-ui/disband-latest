"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useRef, useState } from "react";
import { mapAuthError } from "@/lib/authErrors";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export function ResendConfirmation({
  defaultEmail = "",

  lockEmail = false,
  embedded = false,
}: {
  defaultEmail?: string;
  lockEmail?: boolean;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const address = (lockEmail ? defaultEmail : email).trim();

  async function send() {
    if (!address || sending.current) return;

    sending.current = true;
    setState("sending");
    setError(null);

    try {
      const { error: sendError } = await getSupabaseClient().auth.resend({
        type: "signup",
        email: address,
      });

      if (sendError) {
        const reason = sendError.message.toLowerCase();

        const revealsAccount =
          reason.includes("not found")
          || reason.includes("no user")
          || reason.includes("already been confirmed")
          || reason.includes("already confirmed");

        if (!revealsAccount) {

          setError(mapAuthError(sendError.message));
          setState("idle");
          return;
        }
      }

      setState("sent");
    } catch {
      setError("Couldn't send the confirmation email. Please try again.");
      setState("idle");
    } finally {
      sending.current = false;
    }
  }

  if (state === "sent") {
    return (
      <p
        role="status"
        className="rounded-md border border-status-online/30 bg-status-online/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-online"
      >
        {t("If that address needs confirming, a new link is on its way to")}{" "}
        <span className="font-medium">{address}</span>. It is good for 24 hours —
        check your spam folder if it does not arrive.
      </p>
    );
  }

  // The login screen already owns a form. A nested form's submit bubbles to
  // login, which clears its error and unmounts this control during the resend.
  const Container = embedded ? "div" : "form";
  return (
    <Container onSubmit={embedded ? undefined : (e) => {
      e.preventDefault();
      e.stopPropagation();
      void send();
    }} className="space-y-2 text-left">
      {!lockEmail && (
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase text-text-muted">{t("Email")}</span>
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
        type={embedded ? "button" : "submit"}
        onClick={embedded ? () => void send() : undefined}
        disabled={state === "sending" || !address}
        className="w-full rounded-md border border-divider bg-bg-accent py-2.5 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "sending" ? <LoadingDots size={6} className="mx-auto" /> : t("Send a new confirmation email")}
      </button>

      {error && <p role="alert" className="text-[13px] text-status-dnd">{error}</p>}
    </Container>
  );
}
