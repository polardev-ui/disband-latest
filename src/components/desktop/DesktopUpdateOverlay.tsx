"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";
import {
  detectClientPlatform,
  detectMacArchAsync,
  fetchLatestReleaseFromGitHub,
  pickAssetForPlatform,
  releasePageUrl,
  type GitHubRelease,
  type MacArch,
  type ReleaseAsset,
} from "@/lib/github-releases";
import { isNewerVersion, parseSemverTag, semverToString } from "@/lib/version";
import { Logo } from "@/components/ui/Logo";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface PendingUpdate {
  current: string;
  latestTag: string;
  latestLabel: string;
  release: GitHubRelease;
  download: ReleaseAsset | null;
}

export function DesktopUpdateOverlay() {
  const [update, setUpdate] = useState<PendingUpdate | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return;

    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const current = await getVersion();
      const { release } = await fetchLatestReleaseFromGitHub();
      if (!release?.tag) return;

      const parsed = parseSemverTag(release.tag);
      if (!parsed) return;

      const latestSemver = semverToString(parsed);
      if (!isNewerVersion(latestSemver, current)) return;

      const platform = detectClientPlatform();
      const macArch: MacArch = platform === "macos" ? await detectMacArchAsync() : "unknown";
      const download = pickAssetForPlatform(release.assets, platform, macArch);

      setUpdate({
        current,
        latestTag: release.tag,
        latestLabel: latestSemver,
        release,
        download,
      });
    } catch {
      // Ignore network/API failures — app remains usable offline.
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;

    void checkForUpdate();

    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const recheck = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [checkForUpdate]);

  if (!update) return null;

  const releaseUrl = releasePageUrl(update.latestTag);
  const downloadHref = update.download?.url ?? releaseUrl;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg-tertiary px-6 text-center">
      <div className="max-w-md rounded-2xl border border-divider bg-bg-secondary p-8 shadow-2xl">
        <div className="mx-auto mb-4 flex justify-center">
          <Logo size={56} className="h-14 w-14" />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-brand">Update available</p>
        <h1 className="mt-3 text-2xl font-bold text-text-normal">A new version of Disband is ready</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          You&apos;re on <span className="font-medium text-text-normal">v{update.current}</span>.
          {" "}Version <span className="font-medium text-text-normal">{update.latestTag}</span> is available.
          {update.download
            ? ` Download the ${update.download.label} installer below.`
            : " Download the latest build from GitHub to get new features and fixes."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {update.download ? `Download for ${update.download.label}` : "Download update"}
          </a>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-interactive-hover px-5 py-2.5 text-sm font-semibold text-text-normal hover:bg-interactive-selected"
          >
            View on GitHub
          </a>
        </div>
        {update.download && (
          <p className="mt-3 font-mono text-xs text-text-muted">{update.download.name}</p>
        )}
        <p className="mt-4 text-xs text-text-muted">
          Desktop updates are installed manually — quit Disband, install the new version, then reopen the app.
        </p>
      </div>
    </div>
  );
}
