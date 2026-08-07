"use client";

import { AppProvider, useApp } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaChallengeScreen } from "@/components/auth/MfaChallengeScreen";
import { PlatformBanScreen } from "@/components/auth/PlatformBanScreen";
import { DiscordApp } from "@/components/discord/DiscordApp";
import { DesktopUpdateOverlay } from "@/components/desktop/DesktopUpdateOverlay";
import { MobileGateLoading, useMobileWebGate } from "@/components/mobile/MobileWebGate";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useEffect, useRef } from "react";

function InviteBootstrap() {
  const { ready, session, joinServerByInvite } = useApp();
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || !session || handled.current) return;
    const m = window.location.pathname.match(/\/server\/([a-zA-Z0-9]{7})\/?$/);
    if (!m) return;
    handled.current = true;
    const code = m[1];
    window.history.replaceState({}, "", "/app");
    void joinServerByInvite(code);
  }, [ready, session, joinServerByInvite]);

  return null;
}

function AppShell() {
  const { ready, session, hydrated, mfaRequired, platformBan } = useApp();

  if (!ready) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (mfaRequired) return <MfaChallengeScreen />;
  if (platformBan?.banned) return <PlatformBanScreen />;

  // `ready` only means the session is known. Hold the splash until the first
  // data load settles too, otherwise the shell paints with a null profile and
  // empty friend/DM/server lists for a few seconds — which reads as the account
  // being wrong rather than merely unloaded.
  if (!hydrated) return <LoadingScreen />;

  return (
    <>
      <InviteBootstrap />
      <DiscordApp />
    </>
  );
}

export function DisbandRoot() {
  const mobileGate = useMobileWebGate();

  if (mobileGate !== "allow") {
    return <MobileGateLoading />;
  }

  return (
    <ThemeProvider>
      <AppProvider>
        <ContextMenuProvider>
          <DesktopUpdateOverlay />
          <AppShell />
        </ContextMenuProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
