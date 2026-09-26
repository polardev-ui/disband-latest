#!/usr/bin/env node

/**
 * Trigger the PlayStation 5 giveaway from the command line.
 *
 * The database cron job in migration 0098 calls /api/cron/raffle on its own on
 * the draw date, so this script is the manual path: the same endpoint, same
 * guarantees, reachable without logging into the panel. Useful for a dry run
 * before December 15, or if the scheduled job did not fire.
 *
 *   node scripts/run-raffle-draw.mjs                  # draw (refused before the draw date)
 *   node scripts/run-raffle-draw.mjs --force          # draw early, deliberately
 *   node scripts/run-raffle-draw.mjs --job=upkeep     # check delivery / promote runner-up
 *
 * Configuration (read from the environment, or from .env.local):
 *   RAFFLE_APP_URL      e.g. https://disband.dev
 *   RAFFLE_CRON_SECRET  must match the app's RAFFLE_CRON_SECRET
 *
 * The draw is once-only: the draw record only leaves `open` a single time, so
 * re-running this after a success reports "already-drawn" instead of drawing
 * again.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = (name) => process.env[name] ?? fileEnv[name];

const job = process.argv.includes("--job=upkeep") ? "upkeep" : "draw";
const force = process.argv.includes("--force");

const appUrl = (env("RAFFLE_APP_URL") ?? "").replace(/\/+$/, "");
const secret = env("RAFFLE_CRON_SECRET");

if (!appUrl || !secret) {
  console.error("Set RAFFLE_APP_URL and RAFFLE_CRON_SECRET (env or .env.local) first.");
  process.exit(1);
}

const response = await fetch(`${appUrl}/api/cron/raffle`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
    ...(force ? { "x-raffle-force": "1" } : {}),
  },
  body: JSON.stringify({ job }),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!response.ok) {
  console.error(`Request failed (${response.status}):`);
  console.error(payload.error ?? text);
  process.exit(1);
}

// The interesting bits, not the whole draw record.
if (payload.skipped) {
  console.log(`Nothing to do: ${payload.skipped}.`);
  if (payload.skipped === "not-drawn-yet") {
    console.log(`Entry window: ${payload.draw?.promo_start} -> ${payload.draw?.promo_end}`);
  }
} else if (job === "draw") {
  console.log("Winner:  ", payload.winner?.username ?? "(no username)", `<${payload.winner?.email}>`);
  console.log("Entries: ", payload.winner?.entries);
  console.log("Runner-up:", payload.runnerUp ? `${payload.runnerUp.username ?? "(no username)"} <${payload.runnerUp.email}>` : "none");
  console.log("Winner emailed:", payload.winnerEmail?.sent ?? false);
  if (payload.winnerEmail?.error) console.log("  !!", payload.winnerEmail.error);
  console.log("Owner's report emailed:", payload.ownerReport?.delivered ?? false);
  if (payload.ownerReport?.error) console.log("  reason:", payload.ownerReport.error);
  console.log("Reply deadline:", payload.draw?.response_deadline);
  console.log("\nCheck it actually arrived:");
  console.log("  pnpm raffle:draw -- --job=upkeep");
  if (payload.winnerEmail && !payload.winnerEmail.sent) {
    console.log("\nThe winner was NOT reached. Send it again with:");
    console.log("  curl -X POST <app>/api/admin/raffle -H 'Authorization: Bearer <token>' \\");
    console.log("       -H 'Content-Type: application/json' \\");
    console.log("       -d '{\"action\":\"resend\",\"password\":\"<owner password>\"}'");
  }
} else {
  console.log("Delivery: ", payload.delivery?.status, `(provider: ${payload.delivery?.providerEvent})`);
  console.log("Promoted runner-up:", payload.promotion?.promoted ?? false);
  if (payload.promotion?.userId) console.log("  new winner:", payload.promotion.userId);
  if (payload.draw?.status) console.log("Draw status:", payload.draw.status);
}
