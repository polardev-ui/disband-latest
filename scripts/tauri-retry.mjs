#!/usr/bin/env node
// `pnpm tauri …` with one retry on macOS. Used as tauri-action's tauriScript.
//
// GitHub's macOS runners intermittently fail bundle_dmg.sh (hdiutil "resource
// busy" / Finder AppleScript timeouts) on a build that is otherwise fine. The
// second attempt reuses the compiled binary, so it only re-runs bundling.

import { spawnSync } from "node:child_process";

const args = ["tauri", ...process.argv.slice(2)];
const attempts = process.platform === "darwin" ? 2 : 1;

for (let attempt = 1; attempt <= attempts; attempt++) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status === 0) process.exit(0);
  if (attempt < attempts) {
    console.warn(`\n[tauri-retry] attempt ${attempt} failed (exit ${result.status}); retrying once…\n`);
    // A half-built image or a stale mount from the failed run blocks hdiutil.
    spawnSync("bash", ["-c", "hdiutil info | awk '/\\/Volumes\\/Disband/ {print $1}' | xargs -I{} hdiutil detach -force {} || true; rm -f src-tauri/target/*/release/bundle/dmg/rw.*.dmg"], { stdio: "inherit" });
  } else {
    process.exit(result.status ?? 1);
  }
}
