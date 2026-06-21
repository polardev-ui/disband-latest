"use client";

import { useEffect, useState } from "react";
import {
  detectClientPlatform,
  pickAssetForPlatform,
  type GitHubRelease,
  type ReleaseAsset,
} from "@/lib/github-releases";

export function DownloadSection() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState(detectClientPlatform());

  useEffect(() => {
    setPlatform(detectClientPlatform());
    void fetch("/api/releases")
      .then((r) => r.json())
      .then((data: { release: GitHubRelease | null; assets: ReleaseAsset[] }) => {
        setRelease(data.release);
        setAssets(data.assets ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const recommended = pickAssetForPlatform(assets, platform);

  return (
    <section id="download" className="marketing-fade-up relative px-6 py-20">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#2b2d31]/80 p-8 text-center shadow-2xl backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Download Disband</h2>
        <p className="mt-3 text-[#b5bac1]">
          Native apps for macOS, Windows, and Linux — or use Disband in your desktop browser.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-[#949ba4]">Loading releases…</p>
        ) : recommended ? (
          <div className="mt-8">
            <a
              href={recommended.url}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.02]"
            >
              Download for {recommended.label}
            </a>
            <p className="mt-3 font-mono text-xs text-[#949ba4]">{recommended.name}</p>
            {release && (
              <p className="mt-1 text-xs text-[#72767d]">Version {release.tag}</p>
            )}
          </div>
        ) : (
          <p className="mt-8 text-sm text-[#949ba4]">
            Desktop builds are published on GitHub Releases. Check back soon or browse all downloads below.
          </p>
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
                  <span>
                    <span className="block text-sm font-medium text-white">{asset.label}</span>
                    <span className="font-mono text-xs text-[#949ba4]">{asset.name}</span>
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
