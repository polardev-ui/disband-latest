#!/usr/bin/env node
/**
 * Send the mobile launch email to everyone on the waitlist (Resend + Supabase).
 *
 * Usage:
 *   APP_STORE_URL=https://apps.apple.com/app/idXXXX \
 *   WEB_APP_URL=https://your-live-web-app.example \
 *   node scripts/send-mobile-launch.mjs
 *
 * Dry run (no sends):
 *   node scripts/send-mobile-launch.mjs --dry-run
 *
 * Requires in .env.local or environment:
 *   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *   RESEND_API_KEY, RESEND_FROM_EMAIL (verified sender)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

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

const env = { ...loadEnvLocal(), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const resendKey = env.RESEND_API_KEY;
const fromEmail = env.RESEND_FROM_EMAIL;
const appStoreUrl = env.APP_STORE_URL;
const webAppUrl = env.WEB_APP_URL;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!resendKey && !dryRun) {
  console.error("Missing RESEND_API_KEY");
  process.exit(1);
}
if (!fromEmail && !dryRun) {
  console.error("Missing RESEND_FROM_EMAIL");
  process.exit(1);
}
if (!appStoreUrl) {
  console.error("Set APP_STORE_URL to your App Store link before sending.");
  process.exit(1);
}
if (!webAppUrl) {
  console.error("Set WEB_APP_URL to the live web app URL before sending.");
  process.exit(1);
}
for (const [name, value] of [["APP_STORE_URL", appStoreUrl], ["WEB_APP_URL", webAppUrl]]) {
  try {
    if (new URL(value).protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    console.error(`${name} must be a valid HTTPS URL.`);
    process.exit(1);
  }
}

const templatePath = join(root, "supabase", "templates", "mobile-launch.html");
let html = readFileSync(templatePath, "utf8");
html = html.replaceAll("{{APP_STORE_URL}}", appStoreUrl).replaceAll("{{WEB_APP_URL}}", webAppUrl);

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await supabase
  .from("mobile_waitlist")
  .select("id, email")
  .is("notified_at", null)
  .order("created_at", { ascending: true });

if (error) {
  console.error("Supabase query failed:", error.message);
  process.exit(1);
}

if (!rows?.length) {
  console.log("No pending waitlist emails.");
  process.exit(0);
}

console.log(`${dryRun ? "[dry-run] " : ""}Sending to ${rows.length} subscriber(s)…`);

const subject = "Disband is ready — download on the App Store";

let processed = 0;
let failed = 0;
for (const row of rows) {
  processed += 1;
  console.log(`  → recipient ${processed}/${rows.length}`);

  if (!dryRun) {
    let res;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `mobile-launch/${row.id}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [row.email],
          subject,
          html,
        }),
      });
    } catch {
      console.error("    send failed (network error)");
      failed++;
      continue;
    }

    if (!res.ok) {
      console.error(`    send failed (HTTP ${res.status})`);
      failed++;
      continue;
    }
    const { error: markError } = await supabase
      .from("mobile_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("notified_at", null);
    if (markError) {
      console.error(`    sent, but status update failed (${markError.code ?? "database error"})`);
      failed++;
    }
  }
}

console.log(dryRun ? "Dry run complete." : `Launch email run complete; ${failed} failure(s).`);
if (failed) process.exitCode = 1;
