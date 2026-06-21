"use client";

import { AppProvider, useApp } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { DiscordApp } from "@/components/discord/DiscordApp";

function AppShell() {
  const { ready, session } = useApp();
  if (!ready) {
    return <div className="flex h-screen items-center justify-center bg-bg-tertiary text-text-muted">Loading...</div>;
  }
  if (!session) return <AuthScreen />;
  return <DiscordApp />;
}

export function DisbandRoot() {
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
