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
import { UpdateToast } from "@/components/desktop/UpdateToast";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { SelfXssWarning } from "@/components/SelfXssWarning";
import { MobileAppPromo } from "@/components/mobile/MobileAppPromo";
import { AgePrompt } from "@/components/AgePrompt";
import { CookieConsent } from "@/components/CookieConsent";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useEffect, useRef } from "react";
import { alertDialog } from "@/lib/dialogs";

function InviteBootstrap() {
  const { ready, session, joinServerByInvite, joinServerById } = useApp();
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || !session || handled.current) return;
    const m = window.location.pathname.match(/\/server\/([a-zA-Z0-9-]{3,36})\/?$/);
    if (!m) return;
    handled.current = true;
    const code = m[1];
    window.history.replaceState({}, "", "/app");
    // Invites come as 7-character codes, custom codes (3–24 letters, digits
    // and hyphens) and the 32-character codes handed out in October, so any
    // code is tried as an invite first. Only seven-character ones used to be,
    // and every other link opened the app and did nothing. A pasted Space ID
    // (32 hex characters, or a UUID) is tried after that, and only joins a
    // space that is discoverable.
    void (async () => {
      const inviteErr = await joinServerByInvite(code);
      if (!inviteErr) return;
      const compact = code.replace(/-/g, "");
      if (/^[a-fA-F0-9]{32}$/.test(compact)) {
        const id = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
        const idErr = await joinServerById(id);
        if (!idErr) return;
      }
      void alertDialog(inviteErr, "Couldn't join that space");
    })();
  }, [ready, session, joinServerByInvite, joinServerById]);

  return null;
}

function AddAccountOverlay() {
  const { session, addingAccount, cancelAddAccount } = useApp();
  if (!session || !addingAccount) return null;
  return <AuthScreen overlay onClose={cancelAddAccount} />;
}

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

  if (!hydrated) return <LoadingScreen />;

  return (
    <>
      <InviteBootstrap />
      {}
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
        {}
        <SkinBoundary>
        <ContextMenuProvider>
          <UpdateToast />
          <SelfXssWarning />
          {}
          <MobileAppPromo />
          {}
          <div className="flex h-screen flex-col">
            <DesktopShell />
            <AgePrompt />
            <div className="min-h-0 flex-1">
              <AppShell />
            </div>
          </div>
          <AddAccountOverlay />
          <CookieConsent />
        </ContextMenuProvider>
        </SkinBoundary>
      </AppProvider>
    </ThemeProvider>
  );
}
