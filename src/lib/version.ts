/** Strip a leading `v` and parse semver-ish segments for comparison. */
export function parseSemverTag(tag: string): { major: number; minor: number; patch: number } | null {
  const m = String(tag)
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function semverToString(parts: { major: number; minor: number; patch: number }): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

export function parseVersionParts(tag: string): number[] | null {
  const semver = parseSemverTag(tag);
  if (!semver) return null;
  return [semver.major, semver.minor, semver.patch];
}

/** True when `latest` is strictly newer than `current` (both must be valid semver). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersionParts(latest);
  const b = parseVersionParts(current);
  if (!a || !b) return false;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
