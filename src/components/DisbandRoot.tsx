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
import { MaintenanceNotice } from "@/components/maintenance/MaintenanceNotice";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useEffect, useRef } from "react";

function InviteBootstrap() {
  const { ready, session, joinServerByInvite, joinServerById } = useApp();
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || !session || handled.current) return;
    const m = window.location.pathname.match(/\/server\/([a-zA-Z0-9-]{7,36})\/?$/);
    if (!m) return;
    handled.current = true;
    const code = m[1];
    window.history.replaceState({}, "", "/app");
    if (/^[a-zA-Z0-9]{7}$/.test(code)) {
      void joinServerByInvite(code);
      return;
    }
    // A pasted Space ID (32 hex chars, optionally hyphenated as a UUID) is
    // not an invite code, but we can still join when the space is discoverable.
    const compact = code.replace(/-/g, "");
    if (/^[a-fA-F0-9]{32}$/.test(compact)) {
      const id = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
      void joinServerById(id);
    }
  }, [ready, session, joinServerByInvite]);

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
