#!/usr/bin/env node

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

/**
 * Every template the sync owns, so `--verify` covers all of them.
 *
 * It used to check `confirmation` alone. That is the one template whose
 * breakage is loud — nobody can sign up — while the quiet ones cause the
 * worst confusion: a recovery slot holding the confirmation body sends
 * "Confirm your email address" to someone who asked to reset a password, and
 * every layer downstream (Resend's log included) reports a perfectly
 * delivered email. Checking one template could never have caught that.
 */
const TEMPLATES = [
  { key: "confirmation", file: "confirmation.html" },
  { key: "magic_link", file: "magic_link.html" },
  { key: "recovery", file: "recovery.html" },
  { key: "invite", file: "invite.html" },
  { key: "email_change", file: "email_change.html" },
  { key: "reauthentication", file: "reauthentication.html" },
];

function normalize(s) {
  return (s ?? "").replace(/\r\n/g, "\n").trim();
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

  console.log("Project:", projectRef);
  let bad = 0;

  for (const { key, file } of TEMPLATES) {
    const stored = normalize(cfg[`mailer_templates_${key}_content`]);
    const expected = normalize(readTemplate(file));
    const subject = cfg[`mailer_subjects_${key}`];

    let verdict;
    if (!stored) {
      verdict = "❌ EMPTY — GoTrue will send its built-in default";
    } else if (stored.includes(DEFAULT_SNIPPET) && key !== "confirmation") {
      // The tell for a slot holding the wrong body: this sentence belongs to
      // the confirmation mail and nowhere else.
      verdict = "❌ holds the CONFIRMATION body — wrong template in this slot";
    } else if (stored === expected) {
      verdict = "✅ matches the repo";
    } else {
      verdict = "⚠ differs from the repo";
    }

    if (!verdict.startsWith("✅")) bad++;
    console.log(
      `  ${key.padEnd(16)} ${String(stored.length).padStart(6)} chars  ` +
        `subject=${JSON.stringify(subject ?? null)}  ${verdict}`,
    );
  }

  if (bad) {
    console.log(`\n${bad} template(s) need attention. Fix: pnpm sync:auth-emails`);
    console.log("Also check: Authentication → Hooks → a Send Email hook overrides all of these.");
    process.exit(1);
  }
  console.log("\n✅ All six templates match the repo.");
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
