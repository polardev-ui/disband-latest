"use client";

import { useEffect } from "react";
import { isTauri } from "@/lib/platform";

export default function DevelopersApplicationsPage() {
  useEffect(() => {
    // This page is the canonical home for bot management. When reached
    // directly it stays put; the in-app "Bots" button opens it in a new tab.
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-normal">
      <header className="border-b border-divider px-6 py-4">
        <h1 className="text-2xl font-bold">Disband Developers</h1>
        <p className="text-sm text-text-muted">Applications · Bots · OAuth</p>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border border-divider bg-bg-secondary p-6">
          <h2 className="text-lg font-semibold">Your Applications</h2>
          <p className="mt-2 text-sm text-text-muted">
            Manage your Disband bots: profile pictures, banners, bios, scopes,
            invite links, tokens, and more. Open the Disband app and go to
            Settings → Bots to create and manage bots, or use the in-app
            button which opens this portal.
          </p>
          <div className="mt-4 flex gap-3">
            <a
              href="/app"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open Disband
            </a>
            <a
              href="https://docs.disband.dev/bots"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold hover:bg-interactive-hover"
            >
              Bot docs
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
