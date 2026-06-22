/**
 * Next.js static export for Tauri cannot include server-only routes (API handlers,
 * middleware). Temporarily move them aside, run `next build`, then restore for local dev.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const stashRoot = "src/.web-only-stash";
const moves = [
  ["src/app/api", `${stashRoot}/app-api`],
  ["middleware.ts", `${stashRoot}/middleware.ts`],
];

function stashWebOnlyRoutes() {
  mkdirSync(stashRoot, { recursive: true });
  for (const [from, to] of moves) {
    if (existsSync(from)) {
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
    }
  }
}

function restoreWebOnlyRoutes() {
  for (const [from, to] of moves) {
    if (existsSync(to)) {
      mkdirSync(dirname(from), { recursive: true });
      renameSync(to, from);
    }
  }
}

stashWebOnlyRoutes();

const result = spawnSync("pnpm", ["exec", "next", "build"], {
  env: { ...process.env, TAURI_BUILD: "1" },
  stdio: "inherit",
});

restoreWebOnlyRoutes();
process.exit(result.status ?? 1);
