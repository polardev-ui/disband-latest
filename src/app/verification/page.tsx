"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";
import { getSupabaseClient } from "@/lib/supabase/client";
import { recoverSessionFromUrl } from "@/lib/recover-session-from-url";

type Phase = "verifying" | "verified" | "failed";

const APP_STORE_URL = "https://apps.apple.com/app/id6783881800";

/**
 * Where confirmation emails land.
 *
 * Previously the link went straight back to the app root, so a user who
 * confirmed their address saw the ordinary login screen and had no way to tell
 * whether anything had happened. This page does the verification itself — the
 * token arrives as `?token_hash=…&type=signup` and is exchanged here — and then
 * says so plainly.
 */
function Verification() {
  const [phase, setPhase] = useState<Phase>("verifying");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hadToken, setHadToken] = useState(true);

  useEffect(() => {
    void (async () => {
      const url = new URL(window.location.href);
      const carriedToken =
        url.searchParams.has("token_hash")
        || url.searchParams.has("token")
        || url.searchParams.has("code")
        || url.hash.includes("access_token");
      setHadToken(carriedToken);

      // The token is consumed and stripped from the address bar by
      // `recoverSessionFromUrl` — it is a live credential for the duration of
      // one use, and does not belong in history or in a shared screenshot.
      const { error: linkError } = await recoverSessionFromUrl();
      if (linkError) {
        setError(linkError);
        setPhase("failed");
        return;
      }

      const { data } = await getSupabaseClient().auth.getUser();
      if (!data.user) {
        setError(
          carriedToken
            ? "This link could not be verified. It may have already been used, or it may have expired."
            : "This page needs a confirmation link. Open the link in the email we sent you.",
        );
        setPhase("failed");
        return;
      }

      setEmail(data.user.email ?? null);
      setPhase(data.user.email_confirmed_at ? "verified" : "failed");
      if (!data.user.email_confirmed_at) {
        setError("Your email address is still unconfirmed. Try the link in your email again.");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg-tertiary p-6">
      <div className="w-full max-w-sm rounded-xl bg-bg-secondary p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex justify-center">
          <Logo adaptive size={56} className="h-14 w-14" priority />
        </div>

        {phase === "verifying" && (
          <>
            <h1 className="text-xl font-bold text-text-normal">Confirming your email…</h1>
            <p className="mt-2 text-sm text-text-muted">This only takes a moment.</p>
          </>
        )}

        {phase === "verified" && (
          <>
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-online/15 text-2xl text-status-online"
            >
              ✓
            </div>
            <h1 className="text-xl font-bold text-text-normal">Email verified</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {email ? (
                <>
                  <span className="font-medium text-text-normal">{email}</span> is confirmed. Your
                  account is ready.
                </>
              ) : (
                "Your address is confirmed and your account is ready."
              )}
            </p>

            <div className="mt-6 space-y-2">
              <Link
                href="/app"
                className="block w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Continue to Disband
              </Link>
              <a
                href={APP_STORE_URL}
                className="block w-full rounded-lg border border-divider py-2.5 text-sm font-semibold text-text-normal transition-colors hover:bg-bg-accent"
              >
                Open the iOS app
              </a>
            </div>
          </>
        )}

        {phase === "failed" && (
          <>
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-dnd/15 text-2xl text-status-dnd"
            >
              !
            </div>
            <h1 className="text-xl font-bold text-text-normal">
              {hadToken ? "We couldn’t verify that link" : "Nothing to verify"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{error}</p>
            <Link
              href="/login"
              className="mt-6 block w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Back to log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  return (
    <ThemeProvider>
      <Verification />
    </ThemeProvider>
  );
}
