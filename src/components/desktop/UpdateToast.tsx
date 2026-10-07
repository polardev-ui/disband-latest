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
 * Desktop auto-update.
 *
 * Checks once on launch and again every few hours. When something is
 * available it says so, counts down, then downloads and installs it and
 * relaunches — the user does not have to go and find a download page, which
 * is what they had to do before, because there was no updater at all.
 *
 * The countdown is a grace period, not decoration. A relaunch mid-sentence or
 * mid-call is worse than a slightly stale build, so "Not now" is always there
 * and a call in progress postpones the whole thing.
 */

const COUNTDOWN_SECONDS = 3;
/** Re-check occasionally for a long-running window. */
const RECHECK_MS = 6 * 60 * 60 * 1000;
/**
 * "Not now"/"Later" snoozes the offer within the session — it is not a
 * permanent per-version skip. A refresh (or the next recheck) offers the
 * same version again, which is what "later" means; a skipped-forever flag
 * is how updates silently never happened.
 */
const SNOOZE_MS = 6 * 60 * 60 * 1000;

type Phase = "idle" | "offering" | "downloading" | "installing" | "failed" | "manual";

interface PendingUpdate {
  version: string;
  downloadAndInstall: (cb?: (event: { event: string; data?: unknown }) => void) => Promise<void>;
}

export function UpdateToast() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [percent, setPercent] = useState<number | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState<string | null>(null);
  const update = useRef<PendingUpdate | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const snoozedUntil = useRef(0);
  const announcedVersion = useRef<string | null>(null);
  // Defined first: install()'s failure path falls back to it.
  const offerManualDownload = useCallback(async (): Promise<boolean> => {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const current = await getVersion();
      const { release } = await fetchLatestReleaseFromGitHub();
      if (!release?.tag) return false;

      const parsed = parseSemverTag(release.tag);
      const latest =
        (parsed ? semverToString(parsed) : null) ?? inferVersionFromAssets(release.assets);
      if (!latest || !isNewerVersion(latest, current)) return false;

      if (Date.now() < snoozedUntil.current) return false;

      const platform = detectClientPlatform();
      const arch: MacArch = platform === "macos" ? await detectMacArchAsync() : "unknown";
      const asset = pickAssetForPlatform(release.assets, platform, arch);

      setVersion(latest);
      setManualUrl(asset?.url ?? releasePageUrl(release.tag));
      setManualLabel(asset?.label ?? null);
      if (announcedVersion.current !== latest) {
        announcedVersion.current = latest;
        void import("@/lib/call-sounds").then((m) => {
          try {
            m.playUpdateReady();
          } catch {
            // Silence must never block the update.
          }
        }).catch(() => undefined);
      }
      setPhase("manual");
      return true;
    } catch {
      // Offline, rate-limited, no releases. Nothing worth interrupting for.
      return false;
    }
  }, []);

  const install = useCallback(async () => {
    const pending = update.current;
    if (!pending) return;
    if (timer.current) clearInterval(timer.current);

    try {
      setPhase("downloading");
      let downloaded = 0;
      let total = 0;
      await pending.downloadAndInstall((event) => {
        // The plugin reports bytes, not a percentage.
        if (event.event === "Started") {
          total = Number((event.data as { contentLength?: number })?.contentLength ?? 0);
        } else if (event.event === "Progress") {
          downloaded += Number((event.data as { chunkLength?: number })?.chunkLength ?? 0);
          if (total > 0) setPercent(Math.min(100, Math.round((downloaded / total) * 100)));
        } else if (event.event === "Finished") {
          setPercent(100);
        }
      });
      setPhase("installing");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      // A failed update must never block the app. Most often this is a
      // signature the installed build cannot verify (e.g. an updater key
      // rotation) — in that case no retry will ever succeed, so offer the
      // one-click manual download instead of a dead end. Only if even that
      // cannot be resolved do we show the failure state.
      const manual = await offerManualDownload();
      if (!manual) setPhase("failed");
    }
  }, [offerManualDownload]);

  const startCountdown = useCallback((chimeVersion: string | null) => {
    setPhase("offering");
    setSeconds(COUNTDOWN_SECONDS);
    if (announcedVersion.current !== chimeVersion) {
      announcedVersion.current = chimeVersion;
      void import("@/lib/call-sounds").then((m) => {
        try {
          m.playUpdateReady();
        } catch {
          // Silence must never block the update.
        }
      }).catch(() => undefined);
    }
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds((n) => {
        if (n <= 1) {
          if (timer.current) clearInterval(timer.current);
          void install();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }, [install]);

  const check = useCallback(async () => {
    if (!isTauri()) return;
    if (Date.now() < snoozedUntil.current) return;
    try {
      const { check: checkForUpdate } = await import("@tauri-apps/plugin-updater");
      const found = await checkForUpdate();
      if (!found) return;

      update.current = found as unknown as PendingUpdate;
      setVersion(found.version);
      startCountdown(found.version);
    } catch {
      // The plugin refused — almost always because no signing key is
      // configured yet, so it cannot verify a manifest and correctly declines
      // to trust one. Fall back to telling the user a release exists rather
      // than going silent, but as a dismissible toast: the version this
      // replaced was a FULL-SCREEN WALL that blocked the whole app until you
      // quit, downloaded and reinstalled by hand.
      await offerManualDownload();
    }
  }, [startCountdown, offerManualDownload]);

  useEffect(() => {
    if (!isTauri()) return;
    void check();
    const id = setInterval(() => { void check(); }, RECHECK_MS);
    return () => {
      clearInterval(id);
      if (timer.current) clearInterval(timer.current);
    };
  }, [check]);

  const postpone = () => {
    if (timer.current) clearInterval(timer.current);
    // Snooze, don't skip: the same version is offered again after the
    // snooze lapses (or on next launch, which starts a fresh session).
    snoozedUntil.current = Date.now() + SNOOZE_MS;
    setPhase("idle");
  };

  if (phase === "idle" || !isTauri()) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[200] w-[320px] rounded-xl border border-divider bg-bg-secondary p-4 shadow-2xl"
    >
      {phase === "offering" && (
        <>
          <p className="text-[15px] font-semibold text-text-normal">
            Disband {version} is ready
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Updating in {seconds}s. Disband will restart itself.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="flex-1 rounded-md bg-brand py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-light"
            >
              Update now
            </button>
            <button
              type="button"
              onClick={postpone}
              className="rounded-md border border-divider px-3 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Not now
            </button>
          </div>
        </>
      )}

      {(phase === "downloading" || phase === "installing") && (
        <>
          <p className="text-[15px] font-semibold text-text-normal">
            {phase === "installing" ? "Restarting…" : `Downloading ${version}`}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-accent">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${percent ?? 8}%` }}
            />
          </div>
        </>
      )}

      {phase === "manual" && (
        <>
          <p className="text-[15px] font-semibold text-text-normal">
            Disband {version} is available
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            This one installs by hand — grab it below and you&apos;ll be back
            on automatic updates afterwards.
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={manualUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-md bg-brand py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-brand-light"
            >
              {manualLabel ? `Download for ${manualLabel}` : "Download"}
            </a>
            <button
              type="button"
              onClick={postpone}
              className="rounded-md border border-divider px-3 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              Later
            </button>
          </div>
        </>
      )}

      {phase === "failed" && (
        <>
          <p className="text-[15px] font-semibold text-text-normal">Update failed</p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Disband will try again next time you open it.
          </p>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="mt-3 w-full rounded-md border border-divider py-2 text-[13px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
