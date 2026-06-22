/**
 * Sync the app version across package.json, tauri.conf.json, and Cargo.toml.
 * Usage: node scripts/set-version.mjs 0.1.2
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.replace(/^v/i, "");
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("Usage: node scripts/set-version.mjs <semver> (e.g. 0.1.2)");
  process.exit(1);
}

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const tauriPath = "src-tauri/tauri.conf.json";
const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = version;
writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
writeFileSync(
  cargoPath,
  cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
);

console.log(`Set version to ${version}`);
