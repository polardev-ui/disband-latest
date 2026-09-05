"use client";

import { AppProvider, useApp } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaChallengeScreen } from "@/components/auth/MfaChallengeScreen";
import { PlatformBanScreen } from "@/components/auth/PlatformBanScreen";
import { DiscordApp } from "@/components/discord/DiscordApp";
import { DesktopUpdateOverlay } from "@/components/desktop/DesktopUpdateOverlay";
import { MobileAppPromo } from "@/components/mobile/MobileAppPromo";
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

/** The login form over the running app, for adding a second account. */
function AddAccountOverlay() {
  const { session, addingAccount, cancelAddAccount } = useApp();
  if (!session || !addingAccount) return null;
  return <AuthScreen overlay onClose={cancelAddAccount} />;
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
  return (
    <ThemeProvider>
      <AppProvider>
        <ContextMenuProvider>
          <DesktopUpdateOverlay />
          {/* A sheet over the app, not a redirect: the page underneath keeps
              working, so a password reset or an email confirmation is never
              interrupted by an App Store pitch. */}
          <MobileAppPromo />
          <AppShell />
          <AddAccountOverlay />
        </ContextMenuProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
