#!/usr/bin/env node
/**
 * Push or verify Disband auth email templates on hosted Supabase.
 *
 * The dashboard preview can look correct while GoTrue still sends the DEFAULT
 * template — this script writes directly to mailer_templates_* via Management API.
 *
 * Usage:
 *   pnpm sync:auth-emails          # push templates
 *   pnpm verify:auth-emails        # show what Supabase actually has stored
 *
 * Requires SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * Project ref from SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const templatesDir = join(root, "supabase", "templates");
const verifyOnly = process.argv.includes("--verify");

const DEFAULT_SNIPPET = "Follow the link below to confirm this email address";

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

const env = loadEnvLocal();
const token = process.env.SUPABASE_ACCESS_TOKEN;
let projectRef = process.env.SUPABASE_PROJECT_REF;

if (!projectRef && env.NEXT_PUBLIC_SUPABASE_URL) {
  const m = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (m) projectRef = m[1];
}

if (!token || !projectRef) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or project ref.");
  console.error("Set SUPABASE_ACCESS_TOKEN and optionally SUPABASE_PROJECT_REF.");
  process.exit(1);
}

const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

function readTemplate(name) {
  return readFileSync(join(templatesDir, name), "utf8").replace(/\r\n/g, "\n").trim();
}

if (verifyOnly) {
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`GET failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  const cfg = await res.json();
  const subject = cfg.mailer_subjects_confirmation;
  const body = cfg.mailer_templates_confirmation_content ?? "";

  console.log("Project:", projectRef);
  console.log("Stored confirmation subject:", JSON.stringify(subject));
  console.log("Stored body length:", body.length, "chars");
  console.log("Body preview:\n", body.slice(0, 400), "\n...");

  if (body.includes(DEFAULT_SNIPPET)) {
    console.log("\n❌ GoTrue is still configured with the DEFAULT confirmation template.");
    console.log("   Dashboard edits may not have saved, or a Send Email hook is overriding templates.");
    console.log("   Fix: pnpm sync:auth-emails");
    console.log("   Also check: Authentication → Hooks → disable Send Email hook if enabled.");
  } else if (body.includes("Welcome to Disband")) {
    console.log("\n✅ Custom Disband template IS stored in auth config.");
    console.log("   If emails still look default, check Authentication → Hooks (Send Email).");
  } else {
    console.log("\n⚠ Custom template stored but doesn't match repo — run pnpm sync:auth-emails to align.");
  }
  process.exit(0);
}

const payload = {
  mailer_subjects_confirmation: "Confirm your Disband account",
  mailer_templates_confirmation_content: readTemplate("confirmation.html"),
  mailer_subjects_magic_link: "Your Disband sign-in link",
  mailer_templates_magic_link_content: readTemplate("magic_link.html"),
  mailer_subjects_recovery: "Reset your Disband password",
  mailer_templates_recovery_content: readTemplate("recovery.html"),
  mailer_subjects_invite: "You're invited to Disband",
  mailer_templates_invite_content: readTemplate("invite.html"),
  mailer_subjects_email_change: "Confirm your new Disband email",
  mailer_templates_email_change_content: readTemplate("email_change.html"),
  mailer_subjects_reauthentication: "{{ .Token }} — your Disband verification code",
  mailer_templates_reauthentication_content: readTemplate("reauthentication.html"),
};

const res = await fetch(apiUrl, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error(`PATCH failed (${res.status}):`, await res.text());
  process.exit(1);
}

console.log("✅ Synced Disband auth email templates to", projectRef);
console.log("   Allowed vars: .ConfirmationURL .Token .TokenHash .SiteURL .Email .Data .RedirectTo");
console.log("   Verify: pnpm verify:auth-emails");
console.log("   Then trigger a new signup — old emails in Resend won't change retroactively.");
