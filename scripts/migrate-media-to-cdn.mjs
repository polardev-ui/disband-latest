#!/usr/bin/env node
/**
 * Move every stored image from api.wsgpolar.me to cdn.disband.dev.
 *
 * Runs in two separable phases so a half-finished copy can never leave the
 * app pointing at files that are not there yet:
 *
 *   --copy     read every media URL out of the database and have the Worker
 *              pull each object into R2. Changes nothing in the database, so
 *              it is safe to run repeatedly and safe to run while the old
 *              host is still live.
 *   --rewrite  swap the hostname on every row. Only do this once --copy has
 *              finished cleanly.
 *   --verify   check that each new URL actually returns the bytes.
 *
 * The objects never pass through this machine: the Worker fetches them
 * directly, so a thousand images is a thousand small requests rather than a
 * gigabyte through a laptop.
 *
 * Usage:
 *   node scripts/migrate-media-to-cdn.mjs --copy
 *   node scripts/migrate-media-to-cdn.mjs --verify
 *   node scripts/migrate-media-to-cdn.mjs --rewrite
 *   node scripts/migrate-media-to-cdn.mjs --rewrite --undo    (roll back)
 *
 * Needs in the environment (.env.local is read automatically):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MIGRATION_SECRET
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OLD_HOST = "https://api.wsgpolar.me";
const NEW_HOST = "https://cdn.disband.dev";
const CONCURRENCY = 8;

/** Every column that can hold one of these URLs, and the table's primary key. */
const COLUMNS = [
  ["profiles", "id", "avatar_url"],
  ["profiles", "id", "banner_url"],
  ["servers", "id", "icon_url"],
  ["servers", "id", "banner_url"],
  ["messages", "id", "attachment_url"],
  ["dm_messages", "id", "attachment_url"],
  ["group_messages", "id", "attachment_url"],
  ["notes", "id", "attachment_url"],
  ["custom_emoji", "id", "url"],
  ["bots", "id", "avatar_url"],
  ["group_chats", "id", "icon_url"],
  ["media_posts", "id", "asset_url"],
];

function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIGRATION_SECRET = process.env.MIGRATION_SECRET;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const args = new Set(process.argv.slice(2));
const MODE = args.has("--copy") ? "copy"
  : args.has("--rewrite") ? "rewrite"
  : args.has("--verify") ? "verify"
  : null;
const UNDO = args.has("--undo");

if (!MODE) {
  console.error("Pass one of --copy, --verify or --rewrite.");
  process.exit(1);
}

/** Every distinct old URL currently referenced anywhere. */
async function collectUrls() {
  const urls = new Set();
  for (const [table, , column] of COLUMNS) {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await db
        .from(table)
        .select(column)
        .like(column, `${OLD_HOST}%`)
        .range(from, from + page - 1);
      if (error) {
        console.warn(`  ! ${table}.${column}: ${error.message}`);
        break;
      }
      for (const row of data ?? []) {
        const v = row[column];
        if (typeof v === "string" && v.startsWith(OLD_HOST)) urls.add(v);
      }
      if (!data || data.length < page) break;
      from += page;
    }
  }
  return [...urls];
}

/** `https://api.wsgpolar.me/v1/images/abc.png` -> `abc.png` */
function keyFor(url) {
  const m = url.match(/\/v1\/images\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function pool(items, worker) {
  let i = 0;
  let done = 0;
  const results = [];
  async function run() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`\r  ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  process.stdout.write("\n");
  return results;
}

async function copy() {
  if (!MIGRATION_SECRET) {
    console.error("MIGRATION_SECRET is required for --copy.");
    process.exit(1);
  }
  const urls = await collectUrls();
  console.log(`Copying ${urls.length} objects into R2…`);

  const failures = [];
  const results = await pool(urls, async (url) => {
    const key = keyFor(url);
    if (!key) return { url, ok: false, why: "unrecognised URL shape" };
    try {
      const res = await fetch(`${NEW_HOST}/v1/admin/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-migration-secret": MIGRATION_SECRET,
        },
        body: JSON.stringify({ sourceUrl: url, key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { url, ok: false, why: body.error ?? `HTTP ${res.status}` };
      return { url, ok: true, skipped: body.skipped === true };
    } catch (err) {
      return { url, ok: false, why: err.message };
    }
  });

  for (const r of results) if (!r.ok) failures.push(r);
  const skipped = results.filter((r) => r.ok && r.skipped).length;
  console.log(`Copied ${results.length - failures.length - skipped}, already there ${skipped}, failed ${failures.length}.`);
  if (failures.length) {
    console.log("\nFailures (safe to re-run; copies already made are skipped):");
    for (const f of failures.slice(0, 40)) console.log(`  ${f.url} — ${f.why}`);
    if (failures.length > 40) console.log(`  …and ${failures.length - 40} more`);
    process.exitCode = 1;
  }
}

async function verify() {
  const urls = await collectUrls();
  console.log(`Checking ${urls.length} objects on ${NEW_HOST}…`);
  const bad = [];
  await pool(urls, async (url) => {
    const target = url.replace(OLD_HOST, NEW_HOST);
    try {
      const res = await fetch(target, { method: "HEAD" });
      if (!res.ok) bad.push(`${target} — HTTP ${res.status}`);
    } catch (err) {
      bad.push(`${target} — ${err.message}`);
    }
  });
  if (bad.length === 0) {
    console.log("Every object is served from the new host. Safe to --rewrite.");
  } else {
    console.log(`${bad.length} missing — run --copy again before rewriting:`);
    for (const b of bad.slice(0, 40)) console.log(`  ${b}`);
    process.exitCode = 1;
  }
}

async function rewrite() {
  const from = UNDO ? NEW_HOST : OLD_HOST;
  const to = UNDO ? OLD_HOST : NEW_HOST;
  console.log(`Rewriting ${from} -> ${to}`);

  for (const [table, pk, column] of COLUMNS) {
    let changed = 0;
    let start = 0;
    const page = 500;
    for (;;) {
      const { data, error } = await db
        .from(table)
        .select(`${pk}, ${column}`)
        .like(column, `${from}%`)
        .range(start, start + page - 1);
      if (error) { console.warn(`  ! ${table}.${column}: ${error.message}`); break; }
      if (!data || data.length === 0) break;

      for (const row of data) {
        const next = row[column].replace(from, to);
        const { error: upErr } = await db
          .from(table).update({ [column]: next }).eq(pk, row[pk]);
        if (upErr) console.warn(`  ! ${table}.${row[pk]}: ${upErr.message}`);
        else changed++;
      }
      // Rows just updated no longer match the filter, so the window stays at 0.
      if (data.length < page) break;
    }
    if (changed) console.log(`  ${table}.${column}: ${changed}`);
  }
  console.log("Done.");
}

if (MODE === "copy") await copy();
else if (MODE === "verify") await verify();
else await rewrite();
