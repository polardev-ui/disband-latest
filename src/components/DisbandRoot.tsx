"use client";

import { AppProvider, useApp } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { SkinProvider } from "@/components/theme/SkinProvider";
import { SkinLapsedNotice } from "@/components/theme/SkinLapsedNotice";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaChallengeScreen } from "@/components/auth/MfaChallengeScreen";
import { PlatformBanScreen } from "@/components/auth/PlatformBanScreen";
import { DiscordApp } from "@/components/discord/DiscordApp";
import { VoiceSessionProvider } from "@/contexts/VoiceSessionContext";
import { DesktopUpdateOverlay } from "@/components/desktop/DesktopUpdateOverlay";
import { MobileAppPromo } from "@/components/mobile/MobileAppPromo";
import { MaintenanceNotice } from "@/components/maintenance/MaintenanceNotice";
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

/** Binds the skin to whoever is signed in. */
function SkinBoundary({ children }: { children: React.ReactNode }) {
  const { session } = useApp();
  return (
    <SkinProvider userId={session?.user?.id ?? null}>
      {children}
      <SkinLapsedNotice />
    </SkinProvider>
  );
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
      {/* Above the app, so being in a voice channel survives navigating to
          another one — the connection is no longer tied to the view. */}
      <VoiceSessionProvider>
        <DiscordApp />
      </VoiceSessionProvider>
    </>
  );
}

export function DisbandRoot() {
  return (
    <ThemeProvider>
      <AppProvider>
        {/* Inside AppProvider because a skin belongs to an account, and above
            the shell because it has to be applied whether or not settings is
            open. */}
        <SkinBoundary>
        <ContextMenuProvider>
          <DesktopUpdateOverlay />
          {/* A sheet over the app, not a redirect: the page underneath keeps
              working, so a password reset or an email confirmation is never
              interrupted by an App Store pitch. */}
          <MobileAppPromo />
          {/* Above the shell so it reaches the login screen too, not only
              people who are already signed in. */}
          <div className="flex h-screen flex-col">
            <MaintenanceNotice />
            <div className="min-h-0 flex-1">
              <AppShell />
            </div>
          </div>
          <AddAccountOverlay />
        </ContextMenuProvider>
        </SkinBoundary>
      </AppProvider>
    </ThemeProvider>
  );
}
