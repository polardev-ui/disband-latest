import { PUBLIC_ENV } from "@/lib/public-env";
import { isNewerVersion, parseSemverTag, semverToString } from "@/lib/version";

export type DownloadPlatform = "macos" | "windows" | "linux" | "unknown";
export type MacArch = "aarch64" | "x64" | "unknown";

/** owner/repo slug for GitHub Releases (not a URL). */
export const GITHUB_REPO_SLUG = PUBLIC_ENV.githubRepo;

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO_SLUG}/releases`;

export function releasePageUrl(tag: string): string {
  return `https://github.com/${GITHUB_REPO_SLUG}/releases/tag/${encodeURIComponent(tag)}`;
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  platform: DownloadPlatform;
  label: string;
  macArch?: MacArch;
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

interface NavigatorUAData {
  getHighEntropyValues(
    hints: string[],
  ): Promise<{ architecture?: string; platform?: string }>;
}

function getNavigatorUAData(): NavigatorUAData | undefined {
  return (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
}

function isArmMacAsset(name: string): boolean {
  return /aarch64|arm64|apple[-_]?silicon/i.test(name);
}

function isIntelMacAsset(name: string): boolean {
  if (isArmMacAsset(name)) return false;
  return /(?:^|[_\-.])x64(?:[_\-.]|$)|x86_64|intel/i.test(name);
}

function macArchFromName(name: string): MacArch | undefined {
  if (isArmMacAsset(name)) return "aarch64";
  if (isIntelMacAsset(name)) return "x64";
  return undefined;
}

function macLabelFromArch(arch: MacArch | undefined): string {
  if (arch === "aarch64") return "macOS (Apple Silicon)";
  if (arch === "x64") return "macOS (Intel)";
  return "macOS";
}

/** Sync Apple Silicon detection — `navigator.platform` is often "MacIntel" on M-series Macs. */
export function detectMacArchSync(): MacArch {
  if (typeof navigator === "undefined") return "unknown";
  if (!/Mac/i.test(navigator.platform) && !/Macintosh/i.test(navigator.userAgent)) {
    return "unknown";
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (ext && gl) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      if (/Apple M\d/i.test(renderer)) return "aarch64";
    }
  } catch {
    // ignore
  }

  return "unknown";
}

/** Preferred async detection via User-Agent Client Hints (Chrome/Edge). */
export async function detectMacArchAsync(): Promise<MacArch> {
  if (typeof navigator === "undefined") return "unknown";

  try {
    const uaData = getNavigatorUAData();
    if (uaData?.getHighEntropyValues) {
      const { architecture, platform } = await uaData.getHighEntropyValues([
        "architecture",
        "platform",
      ]);
      if (platform === "macOS" || /Mac/i.test(navigator.userAgent)) {
        if (architecture === "arm") return "aarch64";
        if (architecture === "x86") return "x64";
      }
    }
  } catch {
    // ignore
  }

  return detectMacArchSync();
}

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
  for (const { platform, test } of PLATFORM_PATTERNS) {
    if (test.test(name)) {
      const macArch = platform === "macos" ? macArchFromName(name) : undefined;
      return {
        name,
        url: downloadUrl,
        size: 0,
        platform,
        macArch,
        label: platform === "macos" ? macLabelFromArch(macArch) : PLATFORM_PATTERNS.find((p) => p.platform === platform)!.label,
      };
    }
  }
  return null;
}

export function pickAssetForPlatform(
  assets: ReleaseAsset[],
  platform: DownloadPlatform,
  macArch: MacArch = "unknown",
): ReleaseAsset | null {
  const matches = assets.filter((a) => a.platform === platform);
  if (matches.length === 0) return null;

  if (platform === "macos") {
    const arm = matches.find((a) => a.macArch === "aarch64" || isArmMacAsset(a.name));
    const intel = matches.find((a) => a.macArch === "x64" || isIntelMacAsset(a.name));

    if (macArch === "aarch64" && arm) return arm;
    if (macArch === "x64" && intel) return intel;

    const syncArch = detectMacArchSync();
    if (syncArch === "aarch64" && arm) return arm;
    if (syncArch === "x64" && intel) return intel;

    return arm ?? intel ?? matches[0];
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

type GitHubReleaseJson = {
  tag_name: string;
  name: string;
  published_at: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
};

function githubFetchHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Disband-Release-Fetcher",
  };
}

/** Pick the newest non-draft, non-prerelease release with a semver tag (ignores tags like `main`). */
export function pickLatestSemverRelease(rows: GitHubReleaseJson[]): GitHubRelease | null {
  let best: { release: GitHubRelease; semver: string } | null = null;

  for (const row of rows) {
    if (row.draft || row.prerelease) continue;
    const parsed = parseSemverTag(row.tag_name);
    if (!parsed) continue;
    const release = parseGitHubRelease(row);
    const semver = semverToString(parsed);
    if (!best || isNewerVersion(semver, best.semver)) {
      best = { release, semver };
    }
  }

  return best?.release ?? null;
}

/** Prefer semver releases; fall back to the newest release that has installable assets. */
export function pickLatestDownloadRelease(rows: GitHubReleaseJson[]): GitHubRelease | null {
  const semver = pickLatestSemverRelease(rows);
  if (semver?.assets.length) return semver;

  let best: { release: GitHubRelease; publishedAt: number } | null = null;
  for (const row of rows) {
    if (row.draft || row.prerelease) continue;
    const release = parseGitHubRelease(row);
    if (!release.assets.length) continue;
    const publishedAt = Date.parse(row.published_at);
    if (!best || publishedAt > best.publishedAt) {
      best = { release, publishedAt };
    }
  }
  return best?.release ?? null;
}

/** Derive a display version from installer filenames when the release tag is not semver. */
export function inferVersionFromAssets(assets: ReleaseAsset[]): string | null {
  for (const asset of assets) {
    const match = asset.name.match(/[_-]v?(\d+\.\d+\.\d+)/i);
    if (match) return match[1];
  }
  return null;
}

async function fetchGitHubReleaseRows(): Promise<GitHubReleaseJson[]> {
  const repo = GITHUB_REPO_SLUG;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: githubFetchHeaders(),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error("Could not load releases.");
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/** Client-side fetch for static export (Tauri) where `/api/releases` is unavailable. */
export async function fetchLatestReleaseFromGitHub(): Promise<{
  release: GitHubRelease | null;
  assets: ReleaseAsset[];
}> {
  const rows = await fetchGitHubReleaseRows();
  const release = pickLatestDownloadRelease(rows);
  return { release, assets: release?.assets ?? [] };
}
