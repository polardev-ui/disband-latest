// Supabase Edge Function: content-sentinel
//
// Sweeps every user-content surface on Disband for illegal material, removes
// what it finds, holds the account that put it there, preserves the evidence,
// and emails a summary. Scheduled by pg_cron every 5 hours (migration 0090);
// can also be invoked by hand for a one-off pass.
//
//   POST /content-sentinel
//   Authorization: Bearer <SENTINEL_KEY>
//   { "mode": "sweep" | "text" | "media", "limit": 250,
//     "dryRun": false, "full": false, "offset": 0, "maxRows": 8000 }
//
// `full` ignores the incremental cursor and re-reads every row — use it for
// the first pass over existing content, and after changing the rules.
//
// Required secrets (`supabase secrets set …`):
//   SENTINEL_KEY          shared secret; every request must present it
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (provided by the platform)
//   RESEND_API_KEY        to send the report
// Optional:
//   SAFETY_REPORT_TO      default beluga7133@gmail.com
//   SAFETY_REPORT_FROM    default safety@disband.dev
//   MODERATION_PROVIDER   "sightengine" | "hive" | "none" (default none)
//   SIGHTENGINE_USER, SIGHTENGINE_SECRET
//   HIVE_API_KEY
//   CDN_ADMIN_URL, CDN_ADMIN_SECRET   to move objects into quarantine
//   SUSPEND_ON_GORE       "false" to remove gore without holding the account
//
// WITHOUT a moderation provider this still does real work: it hashes every
// file and blocks anything matching `banned_media_hashes`, and it runs the
// text rules. It cannot recognise *new* imagery — that needs a classifier.
// See docs/CONTENT_SAFETY.md.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scanText } from "./rules.ts";

const REPORT_TO = Deno.env.get("SAFETY_REPORT_TO") ?? "beluga7133@gmail.com";
const REPORT_FROM = Deno.env.get("SAFETY_REPORT_FROM") ?? "Disband Safety <safety@disband.dev>";
const PROVIDER = (Deno.env.get("MODERATION_PROVIDER") ?? "none").toLowerCase();
const SUSPEND_ON_GORE = (Deno.env.get("SUSPEND_ON_GORE") ?? "true") !== "false";

// Files past this are hashed from a partial read only; fetching a 500 MB video
// into an edge function would blow the memory ceiling.
const MAX_FULL_HASH_BYTES = 24 * 1024 * 1024;
const DEFAULT_MEDIA_BATCH = 250;
// PostgREST caps a response at its own max-rows (1000 by default). The loop
// advances by however many rows actually came back rather than by the page
// size it asked for — assuming the two were equal stopped the first sweep
// after 1000 of 75,000 rows.
const DEFAULT_TEXT_BATCH = 1000;

interface Verdict {
  category: "csam" | "gore" | "bestiality" | "adult" | "clean";
  score: number;
  action: "block" | "review" | "none";
  raw?: unknown;
}

Deno.serve(async (req) => {
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mode = (body.mode as string) ?? "sweep";
  const dryRun = body.dryRun === true;
  const mediaLimit = Number(body.limit ?? DEFAULT_MEDIA_BATCH);
  const full = body.full === true;
  // A backfill over every historical row is more than one invocation's CPU
  // budget, so it is driven in chunks: each call scans `maxRows` starting at
  // `offset` and reports `nextOffset`. The scheduled incremental pass is only
  // the rows that changed, so it never needs this.
  const offset = Number(body.offset ?? 0);
  const maxRows = Number(body.maxRows ?? 8000);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Two ways in, both constant-time to the caller: the operator secret set on
  // this function, or the key Postgres generated for itself and keeps in
  // Vault (what the 5-hourly job presents). The Vault one is checked by a
  // function that compares and returns a boolean — it never hands the secret
  // back, so the schedule's credential exists nowhere outside the database.
  const envKey = Deno.env.get("SENTINEL_KEY");
  let authorised = !!envKey && presented === envKey;
  if (!authorised) {
    const { data: ok } = await supabase.rpc("sentinel_check_key", { p_key: presented });
    authorised = ok === true;
  }
  if (!authorised) return json({ error: "unauthorized" }, 401);

  const { data: run } = await supabase
    .from("safety_runs").insert({}).select("id, started_at").single();
  const runId = run?.id as string | undefined;

  const totals = { media: 0, text: 0, flags: 0, actions: 0, held: 0 };
  let nextOffset: number | null = null;
  const findings: Finding[] = [];
  let failure: string | null = null;

  try {
    if (mode === "sweep" || mode === "text") {
      const t = await sweepText(supabase, dryRun, findings, full, offset, maxRows);
      totals.text += t.scanned; totals.flags += t.flags;
      totals.actions += t.actions; totals.held += t.held;
      nextOffset = t.nextOffset;
    }
    if (mode === "sweep" || mode === "media") {
      const m = await sweepMedia(supabase, mediaLimit, dryRun, findings);
      totals.media += m.scanned; totals.flags += m.flags;
      totals.actions += m.actions; totals.held += m.held;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error("[sentinel] run failed", failure);
  }

  let reportSent: string | null = null;
  try {
    reportSent = await sendReport(totals, findings, failure, dryRun);
  } catch (error) {
    console.error("[sentinel] report failed", error);
  }

  if (runId) {
    await supabase.from("safety_runs").update({
      finished_at: new Date().toISOString(),
      media_scanned: totals.media,
      text_scanned: totals.text,
      flags_opened: totals.flags,
      actions_taken: totals.actions,
      accounts_held: totals.held,
      status: failure ? "error" : "ok",
      error: failure,
      report_sent_at: reportSent,
    }).eq("id", runId);
  }

  return json({ ok: !failure, runId, ...totals, nextOffset, error: failure });
});

/* --------------------------------------------------------------- text pass */

interface Finding {
  kind: "text" | "media";
  category: string;
  rule: string;
  where: string;
  owner: string | null;
  action: string;
  detail?: string;
}

async function sweepText(
  supabase: SupabaseClient,
  dryRun: boolean,
  findings: Finding[],
  full = false,
  offset = 0,
  maxRows = 8000,
) {
  // Only what changed since the last good run, with a 15 minute overlap so a
  // row written mid-sweep can't slip between two passes. No previous run
  // means a full pass.
  const { data: previous } = await supabase
    .from("safety_runs")
    .select("started_at")
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1).maybeSingle();

  const since = full ? null : previous?.started_at
    ? new Date(new Date(previous.started_at).getTime() - 15 * 60_000).toISOString()
    : null;

  let scanned = 0, flags = 0, actions = 0, held = 0;
  let from = offset;

  for (;;) {
    let query = supabase
      .from("safety_text_refs")
      .select("src_table, src_column, src_id, owner_id, body, changed_at")
      .range(from, from + DEFAULT_TEXT_BATCH - 1);
    if (since) query = query.gte("changed_at", since);

    const { data: rows, error } = await query;
    if (error) throw new Error(`text query: ${error.message}`);
    if (!rows?.length) break;
    scanned += rows.length;

    for (const row of rows) {
      const hits = scanText(row.body as string);
      if (!hits.length) continue;
      const top = hits[0];

      const { error: flagError } = await supabase.from("content_flags").upsert({
        src_table: row.src_table,
        src_column: row.src_column,
        src_id: row.src_id,
        owner_id: row.owner_id,
        category: top.rule.category,
        severity: top.rule.severity,
        rule_id: top.rule.id,
        excerpt: top.excerpt,
      }, { onConflict: "src_table,src_column,src_id,rule_id", ignoreDuplicates: true });
      if (!flagError) flags++;

      if (top.rule.severity !== "block") continue;

      if (dryRun) {
        findings.push({
          kind: "text", category: top.rule.category, rule: top.rule.id,
          where: `${row.src_table}.${row.src_column}#${row.src_id}`,
          owner: row.owner_id, action: "would redact",
        });
        continue;
      }

      const { data: result, error: actionError } = await supabase.rpc("sentinel_redact_text", {
        p_table: row.src_table,
        p_column: row.src_column,
        p_id: row.src_id,
        p_category: top.rule.category,
        p_reason: `rule ${top.rule.id}`,
        p_suspend: top.rule.suspend,
      });
      if (actionError) { console.error("[sentinel] redact failed", actionError.message); continue; }
      actions++;
      if ((result as { account_held?: boolean })?.account_held) held++;
      findings.push({
        kind: "text", category: top.rule.category, rule: top.rule.id,
        where: `${row.src_table}.${row.src_column}#${row.src_id}`,
        owner: row.owner_id,
        action: top.rule.suspend ? "redacted + account held" : "redacted",
      });
    }

    from += rows.length;
    if (scanned >= maxRows) return { scanned, flags, actions, held, nextOffset: from };
  }

  return { scanned, flags, actions, held, nextOffset: null };
}

/* -------------------------------------------------------------- media pass */

async function sweepMedia(
  supabase: SupabaseClient,
  limit: number,
  dryRun: boolean,
  findings: Finding[],
) {
  // Everything referenced anywhere that we have not settled yet. `media_assets`
  // remembers verdicts, so each file is fetched once no matter how many
  // messages point at it.
  const { data: seen } = await supabase
    .from("media_assets")
    .select("url, scan_state, scanned_at");

  // Settled files are never re-fetched. A file left "pending" (hashed, but no
  // classifier was configured to judge it) is retried, but not before 24h —
  // otherwise every run would re-download the same first N files and the rest
  // of the library would never be reached.
  const retryBefore = Date.now() - 24 * 60 * 60_000;
  const done = new Set<string>();
  for (const row of seen ?? []) {
    const state = row.scan_state as string;
    if (state === "clean" || state === "blocked" || state === "skipped") {
      done.add(row.url as string);
    } else if (row.scanned_at && new Date(row.scanned_at as string).getTime() > retryBefore) {
      done.add(row.url as string);
    }
  }

  const { data: refs, error } = await supabase
    .from("safety_media_refs")
    .select("url, owner_id, src_table, src_id");
  if (error) throw new Error(`media query: ${error.message}`);

  const queue = new Map<string, { owner: string | null; where: string }>();
  for (const ref of refs ?? []) {
    const url = ref.url as string;
    if (done.has(url) || queue.has(url)) continue;
    queue.set(url, { owner: ref.owner_id as string | null, where: `${ref.src_table}#${ref.src_id}` });
    if (queue.size >= limit) break;
  }

  let scanned = 0, flags = 0, actions = 0, held = 0;

  for (const [url, meta] of queue) {
    scanned++;
    try {
      const fetched = await fetchForHash(url);
      if (!fetched) {
        await mark(supabase, url, meta.owner, "skipped", null, null, null);
        continue;
      }

      // 1. Known material: settled without any classifier.
      const { data: banned } = await supabase
        .from("banned_media_hashes")
        .select("sha256, category")
        .eq("sha256", fetched.sha256)
        .maybeSingle();

      let verdict: Verdict | null = banned
        ? { category: (banned.category as Verdict["category"]) ?? "csam", score: 1, action: "block" }
        : null;

      // 2. Otherwise ask the classifier, if one is configured.
      if (!verdict && PROVIDER !== "none") {
        verdict = await classify(url);
      }

      if (!verdict || verdict.action === "none") {
        await mark(supabase, url, meta.owner, verdict ? "clean" : "pending",
                   fetched.sha256, fetched.bytes, verdict);
        continue;
      }

      if (verdict.action === "review") {
        await mark(supabase, url, meta.owner, "flagged", fetched.sha256, fetched.bytes, verdict);
        await supabase.from("content_flags").upsert({
          src_table: "media", src_column: "url", src_id: url, owner_id: meta.owner,
          category: verdict.category, severity: "review",
          rule_id: `${PROVIDER}.${verdict.category}`,
          excerpt: `score ${verdict.score.toFixed(2)}`,
        }, { onConflict: "src_table,src_column,src_id,rule_id", ignoreDuplicates: true });
        flags++;
        continue;
      }

      if (dryRun) {
        findings.push({
          kind: "media", category: verdict.category, rule: banned ? "hash-denylist" : PROVIDER,
          where: meta.where, owner: meta.owner, action: "would quarantine",
          detail: fetched.sha256.slice(0, 16),
        });
        continue;
      }

      // 3. Preserve first, then remove. Losing the bytes before the copy would
      //    destroy evidence we are legally required to keep.
      const quarantineKey = await preserve(url, fetched.sha256);

      const suspend = verdict.category === "gore" ? SUSPEND_ON_GORE : true;
      const { data: result, error: actionError } = await supabase.rpc("sentinel_quarantine_media", {
        p_url: url,
        p_category: verdict.category,
        p_reason: banned ? "known hash" : `${PROVIDER} ${verdict.category} ${verdict.score.toFixed(2)}`,
        p_sha256: fetched.sha256,
        p_quarantine_key: quarantineKey,
        p_suspend: suspend,
      });
      if (actionError) { console.error("[sentinel] quarantine failed", actionError.message); continue; }

      actions++;
      held += Number((result as { accounts_held?: number })?.accounts_held ?? 0);
      findings.push({
        kind: "media", category: verdict.category,
        rule: banned ? "hash-denylist" : `${PROVIDER} ${verdict.score.toFixed(2)}`,
        where: meta.where, owner: meta.owner,
        action: suspend ? "quarantined + account held" : "quarantined",
        detail: fetched.sha256.slice(0, 16),
      });
    } catch (error) {
      console.error("[sentinel] media error", url, error);
      await supabase.from("media_assets").upsert({
        url, owner_id: meta.owner, scan_state: "error", scanned_at: new Date().toISOString(),
      }, { onConflict: "url" });
    }
  }

  return { scanned, flags, actions, held };
}

async function mark(
  supabase: SupabaseClient, url: string, owner: string | null,
  state: string, sha256: string | null, bytes: number | null, verdict: Verdict | null,
) {
  await supabase.from("media_assets").upsert({
    url, owner_id: owner, scan_state: state, sha256, bytes,
    provider: verdict ? PROVIDER : null,
    verdict: verdict as unknown as Record<string, unknown> | null,
    scanned_at: new Date().toISOString(),
  }, { onConflict: "url" });
}

async function fetchForHash(url: string): Promise<{ sha256: string; bytes: number } | null> {
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) return null;
  const size = Number(head.headers.get("content-length") ?? 0);
  if (size > MAX_FULL_HASH_BYTES) return null;

  const response = await fetch(url);
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { sha256, bytes: buffer.byteLength };
}

/** Copy the object out of public reach, keeping the bytes. */
async function preserve(url: string, sha256: string): Promise<string | null> {
  const base = Deno.env.get("CDN_ADMIN_URL");
  const secret = Deno.env.get("CDN_ADMIN_SECRET");
  if (!base || !secret) return null;
  const key = url.split("/v1/images/")[1];
  if (!key) return null;

  const response = await fetch(`${base}/v1/admin/quarantine`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
    body: JSON.stringify({ key: decodeURIComponent(key), sha256 }),
  });
  if (!response.ok) {
    console.error("[sentinel] preserve failed", response.status, await response.text());
    return null;
  }
  return (await response.json().catch(() => ({})) as { quarantineKey?: string }).quarantineKey ?? null;
}

/* --------------------------------------------------------------- providers */

async function classify(url: string): Promise<Verdict | null> {
  try {
    if (PROVIDER === "sightengine") return await classifySightengine(url);
    if (PROVIDER === "hive") return await classifyHive(url);
  } catch (error) {
    console.error("[sentinel] classifier error", error);
  }
  return null;
}

// https://sightengine.com/docs — nudity-2.1 carries a minor/child signal and
// gore-2.0 a graphic-violence one.
async function classifySightengine(url: string): Promise<Verdict | null> {
  const user = Deno.env.get("SIGHTENGINE_USER");
  const secret = Deno.env.get("SIGHTENGINE_SECRET");
  if (!user || !secret) return null;

  const endpoint = new URL("https://api.sightengine.com/1.0/check.json");
  endpoint.searchParams.set("models", "nudity-2.1,gore-2.0,offensive");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("api_user", user);
  endpoint.searchParams.set("api_secret", secret);

  const response = await fetch(endpoint);
  const data = await response.json();
  if (data.status !== "success") return null;

  const sexual = Math.max(
    data.nudity?.sexual_activity ?? 0,
    data.nudity?.sexual_display ?? 0,
    data.nudity?.erotica ?? 0,
  );
  const minor = data.nudity?.context?.minor ?? data.minor?.prob ?? 0;
  const gore = data.gore?.prob ?? 0;

  // Sexual content plus a minor signal is the combination that matters.
  if (sexual >= 0.5 && minor >= 0.5) {
    return { category: "csam", score: Math.min(sexual, minor), action: "block", raw: data };
  }
  if (minor >= 0.75 && sexual >= 0.3) {
    return { category: "csam", score: minor, action: "review", raw: data };
  }
  if (gore >= 0.8) return { category: "gore", score: gore, action: "block", raw: data };
  if (gore >= 0.5) return { category: "gore", score: gore, action: "review", raw: data };
  if (sexual >= 0.8) return { category: "adult", score: sexual, action: "review", raw: data };
  return { category: "clean", score: 0, action: "none", raw: data };
}

// https://docs.thehive.ai — visual moderation returns per-class scores.
async function classifyHive(url: string): Promise<Verdict | null> {
  const apiKey = Deno.env.get("HIVE_API_KEY");
  if (!apiKey) return null;

  const response = await fetch("https://api.thehive.ai/api/v2/task/sync", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await response.json();
  const classes: Record<string, number> = {};
  for (const output of data?.status?.[0]?.response?.output ?? []) {
    for (const c of output.classes ?? []) classes[c.class] = Math.max(classes[c.class] ?? 0, c.score);
  }

  const csam = Math.max(classes["yes_child_sexual_content"] ?? 0, classes["child_sexual_abuse"] ?? 0);
  const gore = Math.max(classes["very_bloody"] ?? 0, classes["human_corpse"] ?? 0);
  const bestiality = classes["animal_genitalia_and_human"] ?? 0;

  if (csam >= 0.5) return { category: "csam", score: csam, action: "block", raw: classes };
  if (bestiality >= 0.7) return { category: "bestiality", score: bestiality, action: "block", raw: classes };
  if (gore >= 0.8) return { category: "gore", score: gore, action: "block", raw: classes };
  if (csam >= 0.25 || gore >= 0.5) {
    return { category: csam >= 0.25 ? "csam" : "gore", score: Math.max(csam, gore), action: "review", raw: classes };
  }
  return { category: "clean", score: 0, action: "none", raw: classes };
}

/* ------------------------------------------------------------------ report */

async function sendReport(
  totals: { media: number; text: number; flags: number; actions: number; held: number },
  findings: Finding[],
  failure: string | null,
  dryRun: boolean,
): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return null;

  // Quiet runs don't need mail; a failure or any action always does.
  if (!failure && totals.actions === 0 && totals.flags === 0) return null;

  const rows = findings.slice(0, 200).map((f) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(f.kind)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${escape(f.category)}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(f.rule)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${escape(f.where)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${escape(f.owner ?? "—")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escape(f.action)}</td>
    </tr>`).join("");

  const subject = failure
    ? "Disband Safety — sweep FAILED"
    : `Disband Safety — ${totals.actions} action${totals.actions === 1 ? "" : "s"}, ${totals.held} account${totals.held === 1 ? "" : "s"} held`;

  // Ids, hashes and counts only. Never the material itself.
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
      <h2 style="margin:0 0 4px">Disband Safety sweep${dryRun ? " (dry run)" : ""}</h2>
      <p style="color:#666;margin:0 0 16px">${new Date().toUTCString()}</p>
      ${failure ? `<p style="background:#fee;padding:12px;border-radius:8px"><b>Run failed:</b> ${escape(failure)}</p>` : ""}
      <p>
        Media scanned: <b>${totals.media}</b> &middot;
        Text rows scanned: <b>${totals.text}</b> &middot;
        Flags opened: <b>${totals.flags}</b> &middot;
        Enforcement actions: <b>${totals.actions}</b> &middot;
        Accounts held: <b>${totals.held}</b>
      </p>
      ${rows ? `<table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="text-align:left;background:#f5f5f5">
          <th style="padding:6px 10px">Kind</th><th style="padding:6px 10px">Category</th>
          <th style="padding:6px 10px">Rule</th><th style="padding:6px 10px">Where</th>
          <th style="padding:6px 10px">Owner</th><th style="padding:6px 10px">Action</th>
        </tr>${rows}
      </table>` : "<p>No enforcement actions this run.</p>"}
      <p style="margin-top:20px;padding:12px;background:#fff8e1;border-radius:8px;font-size:13px">
        <b>CSAM findings require a CyberTipline report to NCMEC within 24 hours</b>
        (18 U.S.C. § 2258A). Quarantined material is preserved for 90 days and
        must not be deleted before then. This email deliberately contains no
        imagery — only identifiers.
      </p>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REPORT_FROM, to: [REPORT_TO], subject, html }),
  });
  if (!response.ok) {
    console.error("[sentinel] resend", response.status, await response.text());
    return null;
  }
  return new Date().toISOString();
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
