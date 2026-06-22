"use client";

import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { Logo } from "@/components/ui/Logo";
import { useApp } from "@/contexts/AppContext";
import { recoverSessionFromUrl } from "@/lib/recover-session-from-url";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";

function ResetPasswordGate() {
  const { ready, session, updatePassword, configured } = useApp();
  const router = useRouter();
  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !ready) return;
    void (async () => {
      const { error } = await recoverSessionFromUrl();
      setLinkError(error);
      setLinkReady(true);
    })();
  }, [configured, ready]);

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary p-6 text-center text-text-muted">
        Supabase is not configured.
      </div>
    );
  }

  if (!ready || !linkReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary text-text-muted">
        Loading…
      </div>
    );
  }

  const canReset = !!session && !linkError;

  return (
    <div className="relative min-h-screen bg-bg-tertiary">
      {!isTauri() && (
        <Link
          href="/login"
          className="absolute left-6 top-6 z-10 flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-text-normal"
        >
          ← Back to log in
        </Link>
      )}
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg bg-bg-secondary p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex justify-center">
              <Logo size={56} className="h-14 w-14" priority />
            </div>
            <h1 className="text-2xl font-bold text-text-normal">Choose a new password</h1>
            <p className="mt-1 text-sm text-text-muted">
              {canReset ? "Enter a new password for your account." : "This reset link is invalid or has expired."}
            </p>
          </div>

          {canReset ? (
            <NewPasswordForm
              submitLabel="Save new password"
              onSubmit={updatePassword}
              onSuccess={() => {
                setTimeout(() => router.replace("/app"), 800);
              }}
            />
          ) : (
            <Link
              href="/login"
              className="block w-full rounded bg-brand py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Back to log in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <ResetPasswordGate />
      </AppProvider>
    </ThemeProvider>
  );
}
