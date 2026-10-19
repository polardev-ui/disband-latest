export interface StatusDay {
  day: string;
  checks: number;
  ok: number;
  latency: number | null;
}

export interface StatusLatencyPoint {
  at: string;
  latency: number | null;
}

export interface StatusMonitor {
  id: string;
  name: string;
  group_name: string;
  position: number;
  current_ok: boolean | null;
  status_code: number | null;
  latency_ms: number | null;
  last_checked_at: string | null;
  uptime_90: number | null;
  days: StatusDay[];
  latency_24h: StatusLatencyPoint[];
}

export type IncidentKind = "incident" | "maintenance" | "announcement";
export type IncidentImpact = "none" | "minor" | "major" | "critical";
export type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "published";

export interface StatusIncidentUpdate {
  id: number;
  status: IncidentStatus;
  body: string;
  created_at: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  kind: IncidentKind;
  impact: IncidentImpact;
  status: IncidentStatus;
  monitor_ids: string[];
  auto: boolean;
  scheduled_for: string | null;
  scheduled_until: string | null;
  created_at: string;
  resolved_at: string | null;
  updates: StatusIncidentUpdate[];
}

export interface StatusSnapshot {
  generated_at: string;
  monitors: StatusMonitor[];
  incidents: StatusIncident[];
}

export type StatusTone = "operational" | "degraded" | "outage" | "maintenance" | "unknown";

export const TONE_LABEL: Record<StatusTone, string> = {
  operational: "Operational",
  degraded: "Partially degraded",
  outage: "Major outage",
  maintenance: "Under maintenance",
  unknown: "No data yet",
};

export const TONE_DOT: Record<StatusTone, string> = {
  operational: "bg-[#23a55a]",
  degraded: "bg-[#f0b232]",
  outage: "bg-[#f23f43]",
  maintenance: "bg-[#5865f2]",
  unknown: "bg-[#80848e]",
};

export const TONE_TEXT: Record<StatusTone, string> = {
  operational: "text-[#23a55a]",
  degraded: "text-[#f0b232]",
  outage: "text-[#f23f43]",
  maintenance: "text-[#7289da]",
  unknown: "text-text-muted",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  published: "Published",
};

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  incident: "Incident",
  maintenance: "Scheduled maintenance",
  announcement: "Announcement",
};

export function monitorTone(monitor: StatusMonitor): StatusTone {
  if (monitor.current_ok === true) return "operational";
  if (monitor.current_ok === false) return "outage";
  return "unknown";
}

export function isIncidentActive(incident: StatusIncident): boolean {
  if (incident.kind === "announcement") return incident.status !== "completed";
  return !incident.resolved_at && incident.status !== "resolved" && incident.status !== "completed";
}

export function overallStatus(snapshot: StatusSnapshot): { tone: StatusTone; label: string; detail: string } {
  const active = snapshot.incidents.filter(isIncidentActive);

  const maintenance = active.find((i) => i.kind === "maintenance");
  if (maintenance) {
    return {
      tone: "maintenance",
      label: maintenance.status === "scheduled" ? "Scheduled maintenance" : "Maintenance in progress",
      detail: maintenance.title,
    };
  }

  const serious = active.find((i) => i.kind === "incident" && (i.impact === "critical" || i.impact === "major"));
  if (serious) return { tone: "outage", label: "Major outage", detail: serious.title };

  const minor = active.find((i) => i.kind === "incident" && i.impact === "minor");
  if (minor) return { tone: "degraded", label: "Partially degraded", detail: minor.title };

  const monitored = snapshot.monitors;
  const down = monitored.filter((m) => m.current_ok === false);
  if (down.length > 0) {
    return {
      tone: down.length === monitored.length ? "outage" : "degraded",
      label: down.length === monitored.length ? "Major outage" : "Partially degraded",
      detail:
        down.length === 1
          ? `${down[0].name} is not responding.`
          : `${down.length} services are not responding.`,
    };
  }

  if (monitored.length === 0 || monitored.every((m) => m.current_ok === null)) {
    return {
      tone: "unknown",
      label: "Waiting for the first checks",
      detail: "The probe runs every minute. The first results will appear here shortly.",
    };
  }

  return {
    tone: "operational",
    label: "All systems operational",
    detail: "Everything is responding normally.",
  };
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The most recent 90 calendar days, including days with no checks. */
export function last90Days(monitor: StatusMonitor): StatusDay[] {
  const byDay = new Map(monitor.days.map((d) => [d.day, d]));
  const out: StatusDay[] = [];
  const today = new Date();
  for (let offset = 89; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    const key = dayKey(d);
    out.push(byDay.get(key) ?? { day: key, checks: 0, ok: 0, latency: null });
  }
  return out;
}

export function dayUptime(day: StatusDay): number | null {
  if (day.checks <= 0) return null;
  return Math.round((day.ok / day.checks) * 100);
}

export function dayTone(day: StatusDay): string {
  const uptime = dayUptime(day);
  if (uptime === null) return "bg-white/[0.08]";
  if (uptime >= 99) return "bg-[#23a55a]";
  if (uptime >= 95) return "bg-[#f0b232]";
  return "bg-[#f23f43]";
}

export function formatDay(day: string, long = false): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: long ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "Never checked";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "Unknown";
  if (ms < 10_000) return "Just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} seconds ago`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "Not scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
