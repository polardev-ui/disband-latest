/**
 * Print the next semver for a release (stdout only).
 *
 * Env:
 *   BUMP=patch|minor|major  (default: patch)
 *   GITHUB_REPOSITORY=owner/repo
 *   GITHUB_TOKEN / GH_TOKEN  (optional, avoids API rate limits)
 */
import { readFileSync } from "node:fs";

const bumpType = (process.env.BUMP || "patch").toLowerCase();
const repo = process.env.GITHUB_REPOSITORY || "polardev-ui/disband-latest";

function parseSemver(raw) {
  const m = String(raw).replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function semverToString(s) {
  return `${s.major}.${s.minor}.${s.patch}`;
}

function bumpSemver(s, type) {
  if (type === "major") return { major: s.major + 1, minor: 0, patch: 0 };
  if (type === "minor") return { major: s.major, minor: s.minor + 1, patch: 0 };
  return { major: s.major, minor: s.minor, patch: s.patch + 1 };
}

function maxSemver(a, b) {
  if (a.major !== b.major) return a.major > b.major ? a : b;
  if (a.minor !== b.minor) return a.minor > b.minor ? a : b;
  return a.patch >= b.patch ? a : b;
}

async function fetchReleaseTags() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "disband-release-script",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const tags = new Set();
  let page = 1;
  while (page <= 5) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) break;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      if (row.tag_name) tags.add(row.tag_name);
    }
    if (rows.length < 100) break;
    page++;
  }

  // Also consider git tags (releases may have been deleted while tags remain).
  page = 1;
  while (page <= 5) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/tags?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) break;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      if (row.name?.startsWith("v")) tags.add(row.name);
    }
    if (rows.length < 100) break;
    page++;
  }

  return [...tags];
}

const pkgVersion = parseSemver(JSON.parse(readFileSync("package.json", "utf8")).version);
let latest = pkgVersion;

try {
  const tagNames = await fetchReleaseTags();
  for (const tag of tagNames) {
    const parsed = parseSemver(tag);
    if (parsed) latest = maxSemver(latest ?? parsed, parsed);
  }
} catch {
  // Offline / API failure — fall back to package.json.
}

if (!latest) {
  console.error("Could not determine a base version.");
  process.exit(1);
}

const next = bumpSemver(latest, bumpType);
process.stdout.write(semverToString(next));
