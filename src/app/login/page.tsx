"use client";

import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaChallengeScreen } from "@/components/auth/MfaChallengeScreen";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import Link from "next/link";
import { isTauri } from "@/lib/platform";

function LoginGate() {
  const { ready, session, mfaRequired } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && session && !mfaRequired) router.replace("/app");
  }, [ready, session, mfaRequired, router]);

  if (ready && session && !mfaRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary text-text-muted">
        Redirecting…
      </div>
    );
  }

  if (ready && session && mfaRequired) {
    return (
      <div className="relative min-h-screen bg-bg-tertiary">
        <MfaChallengeScreen />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-bg-tertiary">
      {!isTauri() && (
        <Link
          href="/home"
          className="absolute left-6 top-6 z-10 flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-text-normal"
        >
          ← Back to home
        </Link>
      )}
      <AuthScreen />
    </div>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <LoginGate />
      </AppProvider>
    </ThemeProvider>
  );
}
