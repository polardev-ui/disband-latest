
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const stashRoot = "src/.web-only-stash";
const moves = [
  ["src/app/api", `${stashRoot}/app-api`],

  ["src/middleware.ts", `${stashRoot}/middleware.ts`],

  ["src/app/bot-invite", `${stashRoot}/app-bot-invite`],

  ["src/app/gift", `${stashRoot}/app-gift`],

  ["src/app/referral", `${stashRoot}/app-referral`],
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
