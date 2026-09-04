"use client";

import { useEffect, useMemo, useState } from "react";
import { PlatformIcon } from "@/components/marketing/PlatformIcon";
import {
  detectClientPlatform,
  detectMacArchAsync,
  fetchLatestReleaseFromGitHub,
  GITHUB_RELEASES_URL,
  inferVersionFromAssets,
  pickAssetForPlatform,
  type GitHubRelease,
  type MacArch,
  type ReleaseAsset,
} from "@/lib/github-releases";
import { parseSemverTag } from "@/lib/version";
import { apiFetch } from "@/lib/api";

async function loadReleases(): Promise<{
  release: GitHubRelease | null;
  assets: ReleaseAsset[];
}> {
  try {
    const res = await apiFetch("/api/releases");
    if (res.ok) {
      const data = (await res.json()) as {
        release: GitHubRelease | null;
        assets: ReleaseAsset[];
      };
      if (data.release || (data.assets?.length ?? 0) > 0) {
        return data;
      }
    }
  } catch {
    // Static export (Tauri) has no API routes — fall back to GitHub directly.
  }
  return fetchLatestReleaseFromGitHub();
}

function platformIconKey(platform: ReleaseAsset["platform"]): "macos" | "windows" | "linux" {
  if (platform === "windows") return "windows";
  if (platform === "linux") return "linux";
  return "macos";
}

function displayVersion(release: GitHubRelease | null, assets: ReleaseAsset[]): string | null {
  if (!release) return null;
  if (parseSemverTag(release.tag)) return release.tag;
  return inferVersionFromAssets(assets) ? `v${inferVersionFromAssets(assets)}` : release.tag;
}

/** One button per platform variant (e.g. both macOS DMGs). */
function uniqueDownloadOptions(assets: ReleaseAsset[]): ReleaseAsset[] {
  const seen = new Set<string>();
  const out: ReleaseAsset[] = [];
  for (const asset of assets) {
    const key = `${asset.platform}:${asset.macArch ?? asset.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

const APP_STORE_URL =
  "https://apps.apple.com/us/app/disband/id6783881800";

export function DownloadSection() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState(detectClientPlatform());
  const [macArch, setMacArch] = useState<MacArch>("unknown");

  useEffect(() => {
    setPlatform(detectClientPlatform());
    if (detectClientPlatform() === "macos") {
      void detectMacArchAsync().then(setMacArch);
    }
    void loadReleases()
      .then((data) => {
        setRelease(data.release);
        setAssets(data.assets ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const recommended = pickAssetForPlatform(assets, platform, macArch);
  const downloadOptions = useMemo(() => uniqueDownloadOptions(assets), [assets]);
  const versionLabel = displayVersion(release, assets);

  return (
    <section id="download" className="border-t border-white/[0.06] px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[2rem]">
          Download Disband
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#9aa0a8]">
          Native builds for macOS, Windows, and Linux, or Disband on your iPhone through the App
          Store. Skip the install entirely and use Disband in your browser.
        </p>

        {/* iOS App Store */}
        <div className="mt-10 flex flex-wrap items-start gap-8 rounded-lg border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">
              iOS
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">Get Disband on iPhone</h3>
            <p className="mt-1.5 max-w-lg text-[15px] leading-relaxed text-[#9aa0a8]">
              Chat, voice calls, and communities on the go — the same account you use on desktop,
              synced across every device.
            </p>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
            >
              <PlatformIcon platform="apple" />
              Download on the App Store
            </a>
          </div>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download Disband on the App Store"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/appstore-badge.png"
              alt="Download on the App Store"
              width={150}
              height={50}
              className="h-[50px] w-[150px]"
            />
          </a>
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-[#6e727a]">Loading releases…</p>
        ) : downloadOptions.length > 0 ? (
          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
            {recommended && (
              <div>
                <a
                  href={recommended.url}
                  className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
                >
                  <PlatformIcon platform={platformIconKey(recommended.platform)} />
                  Download for {recommended.label}
                </a>
                {versionLabel && (
                  <p className="mt-3 font-mono text-[11px] tracking-[0.1em] text-[#6e727a]">
                    {versionLabel}
                  </p>
                )}
                {platform === "macos" && (
                  <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-[#6e727a]">
                    First launch blocked by macOS? Right-click the app and choose Open, or run{" "}
                    <code className="text-[#9aa0a8]">xattr -cr /Applications/Disband.app</code> in
                    Terminal.
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">
                All platforms
              </p>
              <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {downloadOptions.map((asset) => (
                  <li key={asset.url}>
                    <a
                      href={asset.url}
                      className="group flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <PlatformIcon platform={platformIconKey(asset.platform)} />
                        <span className="min-w-0">
                          <span className="block text-sm text-white">{asset.label}</span>
                          <span className="block truncate font-mono text-[11px] text-[#6e727a]">
                            {asset.name}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] text-[#6e727a] transition-colors group-hover:text-white">
                        Download
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            <p className="max-w-md text-[15px] leading-relaxed text-[#9aa0a8]">
              Desktop builds are published on GitHub Releases.
            </p>
            <a
              href={GITHUB_RELEASES_URL}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 px-6 py-3 text-[15px] font-medium text-white transition-colors hover:border-white/30 hover:bg-white/[0.04]"
            >
              View downloads on GitHub
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
