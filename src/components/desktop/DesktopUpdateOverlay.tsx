"use client";

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";
import { GITHUB_RELEASES_URL, fetchLatestReleaseFromGitHub } from "@/lib/github-releases";
import { isNewerVersion } from "@/lib/version";

export function DesktopUpdateOverlay() {
  const [update, setUpdate] = useState<{ current: string; latest: string } | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const current = await getVersion();
        const { release } = await fetchLatestReleaseFromGitHub();
        if (cancelled || !release?.tag) return;
        const latest = release.tag.replace(/^v/i, "");
        if (isNewerVersion(latest, current)) {
          setUpdate({ current, latest: release.tag });
        }
      } catch {
        // Ignore network/API failures — app remains usable offline.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const downloadUrl = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg-tertiary px-6 text-center">
      <div className="max-w-md rounded-2xl border border-divider bg-bg-secondary p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-wider text-brand">Update available</p>
        <h1 className="mt-3 text-2xl font-bold text-text-normal">A new version of Disband is ready</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          You&apos;re on <span className="font-medium text-text-normal">v{update.current}</span>.
          {" "}Version <span className="font-medium text-text-normal">{update.latest}</span> is available.
          Download the latest build from the website to get new features and fixes.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Download update
          </a>
          <a
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-interactive-hover px-5 py-2.5 text-sm font-semibold text-text-normal hover:bg-interactive-selected"
          >
            View on GitHub
          </a>
        </div>
        <p className="mt-4 text-xs text-text-muted">
          Desktop updates are installed manually — quit Disband, install the new version, then reopen the app.
        </p>
      </div>
    </div>
  );
}
