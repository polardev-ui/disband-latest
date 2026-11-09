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
    if (ready && session && !mfaRequired) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/app");
    }
  }, [ready, session, mfaRequired, router]);

  if (ready && session && !mfaRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-secondary text-text-muted">
        Redirecting…
      </div>
    );
  }

  if (ready && session && mfaRequired) {
    return (
      <div className="relative min-h-screen bg-bg-secondary">
        <MfaChallengeScreen />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-bg-secondary">
      {!isTauri() && (
        <Link
          href="/home"
          className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full bg-black/20 px-3.5 py-1.5 text-[13px] font-semibold text-white/85 ring-1 ring-white/15 transition-colors hover:bg-black/30 hover:text-white"
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
