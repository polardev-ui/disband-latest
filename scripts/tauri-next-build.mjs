/**
 * Next.js static export for Tauri cannot include server-only routes (API handlers,
 * middleware). Temporarily move them aside, run `next build`, then restore for local dev.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const stashRoot = "src/.web-only-stash";
const moves = [
  ["src/app/api", `${stashRoot}/app-api`],
  ["middleware.ts", `${stashRoot}/middleware.ts`],
];

function moveAside(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    rmSync(to, { recursive: true, force: true });
  }
  try {
    renameSync(from, to);
  } catch {
    // Windows can fail to rename non-empty directories across paths.
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

function stashWebOnlyRoutes() {
  mkdirSync(stashRoot, { recursive: true });
  for (const [from, to] of moves) {
    moveAside(from, to);
  }
}

function restoreWebOnlyRoutes() {
  for (const [from, to] of moves) {
    moveAside(to, from);
  }
}

stashWebOnlyRoutes();

const result = spawnSync("pnpm", ["exec", "next", "build"], {
  env: { ...process.env, TAURI_BUILD: "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});

restoreWebOnlyRoutes();
process.exit(result.status ?? 1);
