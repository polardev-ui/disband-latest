"use client";

import { AppProvider, useApp } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { DiscordApp } from "@/components/discord/DiscordApp";
import { MobileGateLoading, useMobileWebGate } from "@/components/mobile/MobileWebGate";
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
    window.history.replaceState({}, "", "/");
    void joinServerByInvite(code);
  }, [ready, session, joinServerByInvite]);

  return null;
}

function AppShell() {
  const { ready, session } = useApp();
  if (!ready) {
    return <div className="flex h-screen items-center justify-center bg-bg-tertiary text-text-muted">Loading...</div>;
  }
  if (!session) return <AuthScreen />;
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
          <AppShell />
        </ContextMenuProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
