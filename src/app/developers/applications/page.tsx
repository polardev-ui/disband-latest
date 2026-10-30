"use client";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppProvider } from "@/contexts/AppContext";
import { BotsPanel } from "@/components/discord/settings/BotsPanel";

export default function DevelopersApplicationsPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="min-h-screen bg-bg-primary text-text-normal">
          <header className="border-b border-divider px-6 py-4">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Disband Developers</h1>
                <p className="text-sm text-text-muted">Applications · Bots · OAuth2</p>
              </div>
              <a
                href="/app"
                className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold hover:bg-interactive-hover"
              >
                Back to Disband
              </a>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">
            <BotsPanel />
          </main>
        </div>
      </AppProvider>
    </ThemeProvider>
  );
}
