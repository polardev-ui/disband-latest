export type DownloadPlatform = "macos" | "windows" | "linux" | "unknown";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  platform: DownloadPlatform;
  label: string;
}

export interface GitHubRelease {
  tag: string;
  name: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

const PLATFORM_PATTERNS: { platform: DownloadPlatform; test: RegExp; label: string }[] = [
  { platform: "macos", test: /\.dmg$/i, label: "macOS" },
  { platform: "windows", test: /\.(exe|msi)$/i, label: "Windows" },
  { platform: "linux", test: /\.(deb|AppImage|rpm)$/i, label: "Linux" },
];

export function detectClientPlatform(): DownloadPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "";
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return "macos";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
  return "unknown";
}

export function classifyAsset(name: string, downloadUrl: string): ReleaseAsset | null {
  for (const { platform, test, label } of PLATFORM_PATTERNS) {
    if (test.test(name)) {
      return { name, url: downloadUrl, size: 0, platform, label };
    }
  }
  return null;
}

export function pickAssetForPlatform(assets: ReleaseAsset[], platform: DownloadPlatform): ReleaseAsset | null {
  const matches = assets.filter((a) => a.platform === platform);
  if (matches.length === 0) return null;
  if (platform === "macos" && typeof navigator !== "undefined") {
    const arm = matches.find((a) => /aarch64|arm64/i.test(a.name));
    if (arm && /arm/i.test(navigator.userAgent)) return arm;
    const intel = matches.find((a) => /x64|x86_64|intel/i.test(a.name));
    return intel ?? arm ?? matches[0];
  }
  return matches[0];
}

export function parseGitHubRelease(json: {
  tag_name: string;
  name: string;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}): GitHubRelease {
  const assets: ReleaseAsset[] = [];
  for (const asset of json.assets ?? []) {
    const classified = classifyAsset(asset.name, asset.browser_download_url);
    if (classified) {
      classified.size = asset.size;
      assets.push(classified);
    }
  }
  return {
    tag: json.tag_name,
    name: json.name,
    publishedAt: json.published_at,
    assets,
  };
}

/** Client-side fetch for static export (Tauri) where `/api/releases` is unavailable. */
export async function fetchLatestReleaseFromGitHub(): Promise<{
  release: GitHubRelease | null;
  assets: ReleaseAsset[];
}> {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "wsgpolar/disband";
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) {
    return { release: null, assets: [] };
  }
  if (!res.ok) {
    throw new Error("Could not load releases.");
  }
  const json = await res.json();
  const release = parseGitHubRelease(json);
  return { release, assets: release.assets };
}
