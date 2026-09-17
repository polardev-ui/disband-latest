#!/usr/bin/env node

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
const fromEmail = env.RESEND_FROM_EMAIL ?? "Disband <onboarding@resend.dev>";
const appStoreUrl = env.APP_STORE_URL;
const webAppUrl = env.WEB_APP_URL ?? "https:E_URL to your App Store link before sending.");
  process.exit(1);
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

for (const row of rows) {
  console.log(`  → ${row.email}`);

  if (!dryRun) {
    const res = await fetch("https:Run ? "Dry run complete." : "Launch emails sent.");
