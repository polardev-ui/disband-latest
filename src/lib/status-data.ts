import "server-only";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";
import type { StatusIncident, StatusSnapshot } from "@/lib/status";

const EMPTY: StatusSnapshot = { generated_at: new Date().toISOString(), monitors: [], incidents: [] };

function client() {
  return createClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Synthetic incidents start with this, so the page knows not to link them. */
export const LIVE_INCIDENT_PREFIX = "live-";

/** Checks run every minute; this long without one means they stopped. */
const STALE_AFTER_MS = 4 * 60_000;

function liveIncident(id: string, title: string, impact: StatusIncident["impact"], body: string, since: string): StatusIncident {
  return {
    id: `${LIVE_INCIDENT_PREFIX}${id}`,
    title,
    kind: "incident",
    impact,
    status: "investigating",
    monitor_ids: [],
    auto: true,
    scheduled_for: null,
    scheduled_until: null,
    created_at: since,
    resolved_at: null,
    updates: [{ id: 0, status: "investigating", body, created_at: since }],
  };
}

/*
 The page is read live, not only from what the probe recorded. The probe is
 started by pg_cron and writes to the same database, so when the database is
 down nothing gets recorded and the page used to carry on saying everything
 was fine. If the snapshot can't be read, that is itself the outage; if the
 newest check is stale, the checks have stopped, which almost always means
 the same.
*/
export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  const now = new Date().toISOString();
  try {
    const result = await Promise.race([
      client().rpc("status_public_snapshot"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6_000)),
    ]);
    const { data, error } = result;
    if (error || !data || typeof data !== "object") throw new Error(error?.message ?? "empty snapshot");
    const snapshot = data as StatusSnapshot;

    const newest = Math.max(0, ...snapshot.monitors.map((m) => (m.last_checked_at ? Date.parse(m.last_checked_at) : 0)));
    if (newest > 0 && Date.now() - newest > STALE_AFTER_MS) {
      const since = new Date(newest).toISOString();
      snapshot.incidents = [
        liveIncident(
          "checks-stalled",
          "Some parts of Disband may not be working",
          "minor",
          "Our automatic checks have stopped reporting. This usually means the database is struggling. We're looking into it.",
          since,
        ),
        ...snapshot.incidents,
      ];
    }
    return snapshot;
  } catch {
    return {
      generated_at: now,
      monitors: [],
      incidents: [
        liveIncident(
          "database",
          "Disband isn't loading",
          "critical",
          "Our database isn't responding, so messages, spaces and sign-in won't load. This was detected automatically and the page will update by itself when it's back.",
          now,
        ),
      ],
    };
  }
}

export async function getStatusIncident(id: string): Promise<StatusIncident | null> {
  try {
    const { data, error } = await client().rpc("status_public_incident", { p_id: id });
    if (error || !data || typeof data !== "object") return null;
    return data as StatusIncident;
  } catch {
    return null;
  }
}
