"use client";

import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/marketing/PlatformIcon";
import {
  detectClientPlatform,
  detectMacArchAsync,
  fetchLatestReleaseFromGitHub,
  GITHUB_RELEASES_URL,
  pickAssetForPlatform,
  type GitHubRelease,
  type MacArch,
  type ReleaseAsset,
} from "@/lib/github-releases";

async function loadReleases(): Promise<{
  release: GitHubRelease | null;
  assets: ReleaseAsset[];
}> {
  try {
    const res = await fetch("/api/releases");
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

function platformIconKey(platform: ReturnType<typeof detectClientPlatform>): "macos" | "windows" | "linux" {
  if (platform === "windows") return "windows";
  if (platform === "linux") return "linux";
  return "macos";
}

export function DownloadSection() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [showAll, setShowAll] = useState(false);
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

  return (
    <section id="download" className="marketing-fade-up relative px-6 py-20">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#2b2d31]/80 p-8 text-center shadow-2xl backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Download Disband</h2>
        <p className="mt-3 text-[#b5bac1]">
          Native apps for macOS, Windows, and Linux — or use Disband in your desktop browser.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[#949ba4]">
          <span className="inline-flex items-center gap-2 text-sm">
            <PlatformIcon platform="macos" />
            macOS
          </span>
          <span className="inline-flex items-center gap-2 text-sm">
            <PlatformIcon platform="windows" />
            Windows
          </span>
          <span className="inline-flex items-center gap-2 text-sm">
            <PlatformIcon platform="linux" />
            Linux
          </span>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-[#949ba4]">Loading releases…</p>
        ) : recommended ? (
          <div className="mt-8">
            <a
              href={recommended.url}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.02]"
            >
              <PlatformIcon platform={platformIconKey(recommended.platform)} />
              Download for {recommended.label}
            </a>
            <p className="mt-3 font-mono text-xs text-[#949ba4]">{recommended.name}</p>
            {release && (
              <p className="mt-1 text-xs text-[#72767d]">Version {release.tag}</p>
            )}
            {platform === "macos" && (
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-[#72767d]">
                First launch blocked by macOS? Right-click the app and choose Open, or run{" "}
                <code className="text-[#949ba4]">xattr -cr /Applications/Disband.app</code> in Terminal.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-[#949ba4]">
              Desktop builds are published on GitHub Releases. Check back soon or browse all downloads below.
            </p>
            <a
              href={GITHUB_RELEASES_URL}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1e1f22] px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-brand/40 hover:bg-[#313338]"
            >
              View downloads on GitHub
            </a>
          </div>
        )}

        {assets.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-medium text-[#00a8fc] hover:underline"
            >
              {showAll ? "Hide downloads" : "More downloads"}
            </button>
          </div>
        )}

        {showAll && assets.length > 0 && (
          <ul className="mt-6 space-y-2 text-left">
            {assets.map((asset) => (
              <li key={asset.url}>
                <a
                  href={asset.url}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1e1f22] px-4 py-3 transition-colors hover:border-brand/40 hover:bg-[#313338]"
                >
                  <span className="flex items-center gap-3">
                    <PlatformIcon platform={platformIconKey(asset.platform)} />
                    <span>
                      <span className="block text-sm font-medium text-white">{asset.label}</span>
                      <span className="font-mono text-xs text-[#949ba4]">{asset.name}</span>
                    </span>
                  </span>
                  <span className="text-xs text-brand">Download</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
