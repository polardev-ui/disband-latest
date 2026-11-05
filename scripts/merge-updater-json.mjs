#!/usr/bin/env node
// Builds the release's latest.json (the manifest the in-app updater polls)
// from the signed bundles already attached to the release, and uploads it.
//
// Each build job used to write latest.json itself. The two macOS jobs finish
// within seconds of each other, and the second one to read the manifest
// overwrote the first one's entry, so Apple Silicon (or Intel) Macs were told
// to install by hand. Running once, after every build, removes the race.
//
//   node scripts/merge-updater-json.mjs v2.33.183
//
// Needs the GitHub CLI signed in (GH_TOKEN in CI).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+/.test(tag ?? "")) {
  console.error("usage: merge-updater-json.mjs <tag>");
  process.exit(1);
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
const release = JSON.parse(gh("release", "view", tag, "--json", "assets,body,publishedAt"));
const names = new Set(release.assets.map((a) => a.name));
const repo = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").trim();

// Bundle name pattern -> updater platform keys it serves. The first key of
// each group is the generic one older clients look up.
const RULES = [
  [/^Disband_aarch64\.app\.tar\.gz$/, ["darwin-aarch64", "darwin-aarch64-app"]],
  [/^Disband_x64\.app\.tar\.gz$/, ["darwin-x86_64", "darwin-x86_64-app"]],
  [/_x64_en-US\.msi$/, ["windows-x86_64", "windows-x86_64-msi"]],
  [/_x64-setup\.exe$/, ["windows-x86_64-nsis"]],
  [/_amd64\.AppImage$/, ["linux-x86_64", "linux-x86_64-appimage"]],
  [/_amd64\.deb$/, ["linux-x86_64-deb"]],
  [/\.x86_64\.rpm$/, ["linux-x86_64-rpm"]],
];

const dir = mkdtempSync(join(tmpdir(), "updater-"));
const platforms = {};
for (const [pattern, keys] of RULES) {
  const bundle = [...names].find((n) => pattern.test(n) && names.has(`${n}.sig`));
  if (!bundle) continue;
  gh("release", "download", tag, "-p", `${bundle}.sig`, "-D", dir, "--clobber");
  const signature = readFileSync(join(dir, `${bundle}.sig`), "utf8").trim();
  const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(bundle)}`;
  for (const key of keys) platforms[key] = { signature, url };
}

if (Object.keys(platforms).length === 0) {
  console.error(`No signed bundles on ${tag}; leaving latest.json alone.`);
  process.exit(1);
}

const manifest = {
  version: tag.replace(/^v/, ""),
  notes: release.body ?? "",
  pub_date: release.publishedAt ?? new Date().toISOString(),
  platforms,
};
const out = join(dir, "latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
gh("release", "upload", tag, out, "--clobber");
console.log(`latest.json for ${tag}: ${Object.keys(platforms).sort().join(", ")}`);
