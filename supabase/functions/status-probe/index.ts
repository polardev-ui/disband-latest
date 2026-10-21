// Supabase Edge Function: status-probe
//
// Probes every enabled status monitor, records the latency and result, keeps
// the daily roll-up (a database trigger), opens an automatic incident after
// three failures in a row, and resolves it when the service recovers.
//
// Scheduled by pg_cron in migration 0137 every minute. The job presents the
// status_probe_key from Vault; this function checks it in SQL, so the secret
// is never returned by the API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Monitor {
  id: string;
  name: string;
  url: string;
  method: string;
  expected_status: number;
  keyword: string | null;
  timeout_ms: number;
  headers: Record<string, string> | null;
}

interface ProbeResult {
  monitor: Monitor;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function authorised(req: Request): Promise<boolean> {
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented) return false;
  const envKey = Deno.env.get("STATUS_PROBE_KEY");
  if (envKey && presented === envKey) return true;
  const { data } = await supabase.rpc("status_probe_check_key", { p_key: presented });
  return data === true;
}

async function probe(monitor: Monitor): Promise<ProbeResult> {
  const started = Date.now();
  let ok = false;
  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(monitor.timeout_ms || 10_000, 30_000));
    try {
      const response = await fetch(monitor.url, {
        method: monitor.method === "HEAD" ? "HEAD" : "GET",
        headers: monitor.headers ?? {},
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
      });
      statusCode = response.status;
      ok = response.status === monitor.expected_status;
      if (ok && monitor.keyword) {
        const body = await response.text();
        if (!body.includes(monitor.keyword)) {
          ok = false;
          error = `Expected response to contain “${monitor.keyword}”`;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    error = /abort/i.test(message) ? "Timed out" : message.slice(0, 500);
  }

  const latencyMs = Math.max(0, Date.now() - started);
  const checkedAt = new Date().toISOString();
  if (!ok && !error) error = `Expected HTTP ${monitor.expected_status}, got ${statusCode ?? "no response"}`;

  return { monitor, ok, statusCode, latencyMs, error, checkedAt };
}

async function record(result: ProbeResult) {
  const { error } = await supabase.from("status_checks").insert({
    monitor_id: result.monitor.id,
    checked_at: result.checkedAt,
    ok: result.ok,
    status_code: result.statusCode,
    latency_ms: result.latencyMs,
    error: result.error,
  });
  if (error) console.error("[status-probe] insert check", result.monitor.name, error.message);
}

async function reconcileIncident(result: ProbeResult) {
  const { monitor } = result;

  const [{ data: recent }, { data: open }] = await Promise.all([
    supabase
      .from("status_checks")
      .select("ok, checked_at")
      .eq("monitor_id", monitor.id)
      .order("checked_at", { ascending: false })
      .limit(3),
    supabase
      .from("status_incidents")
      .select("id, created_at")
      .eq("auto", true)
      .is("resolved_at", null)
      .contains("monitor_ids", [monitor.id])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const failedThree = (recent ?? []).length === 3 && (recent ?? []).every((row) => row.ok === false);

  if (failedThree && !open) {
    const now = new Date().toISOString();
    const { data: incident, error } = await supabase
      .from("status_incidents")
      .insert({
        title: `${monitor.name} is down`,
        kind: "incident",
        impact: "major",
        status: "investigating",
        monitor_ids: [monitor.id],
        auto: true,
      })
      .select("id")
      .single();
    if (error || !incident) {
      console.error("[status-probe] open incident", error?.message);
      return { opened: false, resolved: false };
    }
    await supabase.from("status_incident_updates").insert({
      incident_id: incident.id,
      status: "investigating",
      body: `Automated checks failed three times in a row.${result.error ? ` Last error: ${result.error}` : ""}`,
    });
    return { opened: true, resolved: false };
  }

  if (result.ok && open) {
    const resolvedAt = new Date().toISOString();
    const minutes = Math.max(1, Math.round((Date.parse(resolvedAt) - Date.parse(open.created_at)) / 60_000));
    await supabase
      .from("status_incidents")
      .update({ status: "resolved", resolved_at: resolvedAt })
      .eq("id", open.id);
    await supabase.from("status_incident_updates").insert({
      incident_id: open.id,
      status: "resolved",
      body: `Recovered after ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
    return { opened: false, resolved: true };
  }

  return { opened: false, resolved: false };
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method not allowed" }, 405);
  if (!(await authorised(req))) return json({ error: "unauthorized" }, 401);

  const started = Date.now();
  const { data: rows, error } = await supabase
    .from("status_monitors")
    .select("id, name, url, method, expected_status, keyword, timeout_ms, headers")
    .eq("enabled", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("[status-probe] monitors", error.message);
    return json({ ok: false, error: "could not load monitors" }, 500);
  }

  const monitors = (rows ?? []) as Monitor[];
  // Each probe has its own timeout. Run in parallel so one slow endpoint does
  // not eat the whole invocation budget before the others are checked.
  const results = await Promise.all(monitors.map(probe));
  await Promise.all(results.map(record));

  const outcomes = { opened: 0, resolved: 0 };
  for (const result of results) {
    const outcome = await reconcileIncident(result);
    if (outcome.opened) outcomes.opened += 1;
    if (outcome.resolved) outcomes.resolved += 1;
  }

  // Keep the raw checks for 90 days; the daily roll-up drives the public bar.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("status_checks").delete().lt("checked_at", cutoff);
  const dailyCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await supabase.from("status_daily").delete().lt("day", dailyCutoff);

  return json({
    ok: true,
    checked: results.length,
    up: results.filter((r) => r.ok).length,
    down: results.filter((r) => !r.ok).length,
    opened: outcomes.opened,
    resolved: outcomes.resolved,
    durationMs: Date.now() - started,
  });
});
