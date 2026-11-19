"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/platform";
import {
  detectClientPlatform,
  detectMacArchAsync,
  fetchLatestReleaseFromGitHub,
  inferVersionFromAssets,
  pickAssetForPlatform,
  releasePageUrl,
  type MacArch,
} from "@/lib/github-releases";
import { isNewerVersion, parseSemverTag, semverToString } from "@/lib/version";

/**
 * Desktop updates, while Disband is open.
 *
 * Disband checks for an update before it opens (the startup window in
 * src-tauri/src/splash.rs) and installs it there, so a fresh launch is
 * always current. This catches the ones that come out while it's running:
 * a bar across the top, "New update detected, please restart your Disband
 * client", with a Restart button that installs it and relaunches.
 *
 * The update downloads quietly in the background as soon as it's found, and
 * the bar only appears once it's ready, so all it ever asks is Restart (which
 * then just installs and relaunches, in a second or two).
 *
 * It can't be dismissed or snoozed. It never restarts on its own either: the
 * restart is yours to time, so a call or a half-written message isn't cut
 * off. Quitting and reopening installs it too.
 *
 * A failed check is retried every couple of minutes. It used to fall back to
 * a "Download" button (the installer from GitHub) on the first failure, which
 * is what showed whenever a release was up on GitHub a few minutes before its
 * update manifest; that fallback is now only for an update this build truly
 * can't install, or a check that keeps failing for a long while.
 */

/** How often a running window looks for a new release. */
const RECHECK_MS = 20 * 60 * 1000;
/** Coming back to the window checks again, at most this often. */
const FOCUS_RECHECK_MS = 5 * 60 * 1000;
/** Soon after opening: the startup window gives up after 10 seconds, and a
 *  release published while it was checking should still be caught. */
const FIRST_CHECK_DELAY_MS = 4 * 1000;
/** After a failed check or download, try again this soon. */
const RETRY_MS = 2 * 60 * 1000;
/** Failed checks in a row before offering the installer instead. */
const FAILURES_BEFORE_MANUAL = 8;

type Phase = "idle" | "ready" | "downloading" | "installing" | "failed" | "manual";

interface PendingUpdate {
  version: string;
  download: (cb?: (event: { event: string; data?: unknown }) => void) => Promise<void>;
  install: () => Promise<void>;
  downloadAndInstall: (cb?: (event: { event: string; data?: unknown }) => void) => Promise<void>;
}

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const update = useRef<PendingUpdate | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const lastCheck = useRef(0);
  const announced = useRef<string | null>(null);
  /** The update has been downloaded and only needs installing. */
  const downloaded = useRef(false);
  /** A check or background download is running. */
  const working = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<number | null>(null);

  const show = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const chime = useCallback((v: string | null) => {
    if (!v || announced.current === v) return;
    announced.current = v;
    void import("@/lib/call-sounds")
      .then((m) => {
        try {
          m.playUpdateReady();
        } catch {
          // Silence must never block the update.
        }
      })
      .catch(() => undefined);
  }, []);

  /** A release the updater can't install (it can't verify the manifest):
   *  point at the installer instead. */
  const findManualDownload = useCallback(async (): Promise<boolean> => {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const current = await getVersion();
      const { release } = await fetchLatestReleaseFromGitHub();
      if (!release?.tag) return false;
      const parsed = parseSemverTag(release.tag);
      const latest = (parsed ? semverToString(parsed) : null) ?? inferVersionFromAssets(release.assets);
      if (!latest || !isNewerVersion(latest, current)) return false;

      const platform = detectClientPlatform();
      const arch: MacArch = platform === "macos" ? await detectMacArchAsync() : "unknown";
      const asset = pickAssetForPlatform(release.assets, platform, arch);
      setVersion(latest);
      setManualUrl(asset?.url ?? releasePageUrl(release.tag));
      chime(latest);
      show("manual");
      return true;
    } catch {
      // Offline, rate-limited, no releases: nothing to say.
      return false;
    }
  }, [chime, show]);

  const check = useCallback(async () => {
    if (!isTauri()) return;
    // Once found and ready it stays found; a check or download in progress is left alone.
    if (phaseRef.current !== "idle" || working.current) return;
    working.current = true;
    lastCheck.current = Date.now();
    const retrySoon = () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => void check(), RETRY_MS);
    };
    try {
      const { check: checkForUpdate } = await import("@tauri-apps/plugin-updater");
      let found;
      try {
        found = await checkForUpdate();
      } catch {
        // Offline, GitHub slow, or the release is up before its manifest:
        // try again shortly. Only a long run of failures offers the installer.
        failures.current += 1;
        if (failures.current >= FAILURES_BEFORE_MANUAL) await findManualDownload();
        else retrySoon();
        return;
      }
      failures.current = 0;
      if (!found) return;
      const pending = found as unknown as PendingUpdate;
      update.current = pending;
      setVersion(found.version);
      // Fetch it now, quietly, so Restart only has to install it.
      try {
        await pending.download();
        downloaded.current = true;
      } catch {
        // A dropped download: the next check starts it again.
        update.current = null;
        retrySoon();
        return;
      }
      chime(found.version);
      show("ready");
    } finally {
      working.current = false;
    }
  }, [chime, show, findManualDownload]);

  const restart = useCallback(async () => {
    const pending = update.current;
    if (!pending) return;
    try {
      if (downloaded.current) {
        show("installing");
        await pending.install();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
        return;
      }
      show("downloading");
      setPercent(null);
      let received = 0;
      let total = 0;
      await pending.downloadAndInstall((event) => {
        // The plugin reports bytes, not a percentage.
        if (event.event === "Started") {
          total = Number((event.data as { contentLength?: number })?.contentLength ?? 0);
        } else if (event.event === "Progress") {
          received += Number((event.data as { chunkLength?: number })?.chunkLength ?? 0);
          if (total > 0) setPercent(Math.min(100, Math.round((received / total) * 100)));
        } else if (event.event === "Finished") {
          setPercent(100);
        }
      });
      show("installing");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      // Most often a signature this build can't verify, which no retry
      // fixes: offer the installer instead. Failing that, let them retry.
      const manual = await findManualDownload();
      if (!manual) show("failed");
    }
  }, [show, findManualDownload]);

  useEffect(() => {
    if (!isTauri()) return;
    const first = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void check(), RECHECK_MS);
    const onFocus = () => {
      if (Date.now() - lastCheck.current > FOCUS_RECHECK_MS) void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  if (phase === "idle" || !isTauri()) return null;

  const busy = phase === "downloading" || phase === "installing";
  const message =
    phase === "downloading"
      ? `Downloading Disband ${version ?? ""}${percent !== null ? ` · ${percent}%` : "…"}`
      : phase === "installing"
        ? "Installing the update. Disband will restart in a moment…"
        : phase === "failed"
          ? "The update couldn't be installed."
          : "New update detected, please restart your Disband client";

  return (
    <div role="status" aria-live="polite" className="update-banner">
      {busy && (
        <span
          className="update-banner-progress"
          style={{ width: `${phase === "installing" ? 100 : percent ?? 6}%` }}
          aria-hidden
        />
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span className="update-banner-text">
        {message}
        {phase === "ready" && version && <span className="update-banner-version"> (v{version})</span>}
      </span>
      {phase === "ready" && (
        <button type="button" className="update-banner-button" onClick={() => void restart()}>
          Restart
        </button>
      )}
      {phase === "failed" && (
        <button type="button" className="update-banner-button" onClick={() => void restart()}>
          Try again
        </button>
      )}
      {phase === "manual" && manualUrl && (
        <a className="update-banner-button" href={manualUrl} target="_blank" rel="noopener noreferrer">
          Download
        </a>
      )}
    </div>
  );
}
