#!/usr/bin/env node
/**
 * Refreshes the disposable-email blocklist.
 *
 * The upstream list gains domains every week, and a blocklist that is only as
 * good as the day it was seeded stops working quietly rather than loudly. Run
 * this whenever it is worth topping up:
 *
 *   node scripts/sync-disposable-domains.mjs
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local when present). Only ever adds rows — a domain removed upstream is
 * left blocked, since nothing good comes of un-blocking one automatically.
 */

import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const BATCH = 1000;

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i < 0 || line.trim().startsWith("#")) continue;
      const key = line.slice(0, i).trim();
      if (!process.env[key]) {
        process.env[key] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
      }
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  return { url, key };
}

async function main() {
  const { url, key } = loadEnv();

  const res = await fetch(SOURCE);
  if (!res.ok) {
    console.error(`Could not fetch the blocklist (HTTP ${res.status}).`);
    process.exit(1);
  }

  const domains = [
    ...new Set(
      (await res.text())
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith("#") && DOMAIN_RE.test(line)),
    ),
  ];
  console.log(`Upstream list: ${domains.length} domains`);

  for (let i = 0; i < domains.length; i += BATCH) {
    const rows = domains.slice(i, i + BATCH).map((domain) => ({ domain }));
    const post = await fetch(`${url}/rest/v1/blocked_email_domains?on_conflict=domain`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!post.ok) {
      console.error(`Batch failed (HTTP ${post.status}): ${(await post.text()).slice(0, 300)}`);
      process.exit(1);
    }
    process.stdout.write(`\r  synced ${Math.min(i + BATCH, domains.length)}/${domains.length}`);
  }

  console.log("\nDone.");
}

main();
