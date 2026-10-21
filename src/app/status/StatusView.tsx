"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  INCIDENT_KIND_LABEL,
  INCIDENT_STATUS_LABEL,
  TONE_DOT,
  TONE_LABEL,
  TONE_TEXT,
  dayTone,
  dayUptime,
  formatDateTime,
  formatDay,
  formatRelative,
  isIncidentActive,
  last90Days,
  monitorTone,
  overallStatus,
  type IncidentStatus,
  type StatusIncident,
  type StatusLatencyPoint,
  type StatusMonitor,
  type StatusSnapshot,
  type StatusTone,
} from "@/lib/status";

const BANNER: Record<StatusTone, string> = {
  operational: "border-[#23a55a] bg-[#23a55a]/[0.07]",
  degraded: "border-[#f0b232] bg-[#f0b232]/[0.07]",
  outage: "border-[#f23f43] bg-[#f23f43]/[0.07]",
  maintenance: "border-[#5865f2] bg-[#5865f2]/[0.07]",
  unknown: "border-[#80848e] bg-white/[0.03]",
};

const STATUS_PILL: Record<IncidentStatus, string> = {
  investigating: "bg-[#f23f43]/15 text-[#ff8f91]",
  identified: "bg-[#f0b232]/15 text-[#f6c95f]",
  monitoring: "bg-[#5865f2]/20 text-[#b4baff]",
  resolved: "bg-[#23a55a]/15 text-[#6bdc96]",
  scheduled: "bg-[#5865f2]/20 text-[#b4baff]",
  in_progress: "bg-[#f0b232]/15 text-[#f6c95f]",
  completed: "bg-[#23a55a]/15 text-[#6bdc96]",
  published: "bg-white/[0.06] text-text-normal",
};

function StatusDot({ tone, className = "" }: { tone: StatusTone; className?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[tone]} ${className}`} />;
}

function Sparkline({ points, tone }: { points: StatusLatencyPoint[]; tone: StatusTone }) {
  const values = points.map((point) => point.latency ?? 0);
  if (values.length === 0) return <span className="text-[11px] text-text-muted/70">—</span>;

  const width = 64;
  const height = 20;
  const max = Math.max(...values, 1);
  const step = values.length === 1 ? width : width / (values.length - 1);
  const coords = values.map((value, i) => `${(i * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`);
  const stroke =
    tone === "outage" ? "#f23f43" : tone === "degraded" || tone === "maintenance" ? "#f0b232" : "#23a55a";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Response time over the last 24 hours"
      className="hidden shrink-0 sm:block"
    >
      <title>Response time over the last 24 hours</title>
      {values.length > 1 ? (
        <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ) : (
        <circle cx={width} cy={height - 2 - (values[0] / max) * (height - 4)} r="1.75" fill={stroke} />
      )}
    </svg>
  );
}

function UptimeBar({
  monitor,
  incidents,
}: {
  monitor: StatusMonitor;
  incidents: StatusIncident[];
}) {
  const days = useMemo(() => last90Days(monitor), [monitor]);
  const incidentsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const incident of incidents) {
      if (!incident.monitor_ids.includes(monitor.id)) continue;
      const day = incident.created_at.slice(0, 10);
      const list = map.get(day);
      if (list) list.push(incident.title);
      else map.set(day, [incident.title]);
    }
    return map;
  }, [incidents, monitor.id]);

  return (
    <div className="flex h-7 items-stretch gap-[2px]" aria-label={`90 day uptime for ${monitor.name}`}>
      {days.map((day) => {
        const uptime = dayUptime(day);
        const names = incidentsByDay.get(day.day);
        const title = `${formatDay(day.day, true)} · ${uptime === null ? "No checks" : `${uptime}% uptime`}${
          names?.length ? ` · ${names.join(", ")}` : ""
        }`;
        return (
          <span
            key={day.day}
            title={title}
            className={`min-w-[2px] flex-1 rounded-[1px] ${dayTone(day)}`}
          />
        );
      })}
    </div>
  );
}

function MonitorRow({ monitor, incidents }: { monitor: StatusMonitor; incidents: StatusIncident[] }) {
  const tone = monitorTone(monitor);
  const uptime = monitor.uptime_90;
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.05] px-4 py-3.5 last:border-b-0 md:grid md:grid-cols-[minmax(120px,1fr)_minmax(200px,2.2fr)_66px_92px] md:items-center md:gap-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot tone={tone} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-header-primary">{monitor.name}</p>
          <p className={`mt-0.5 text-[12px] ${TONE_TEXT[tone]}`}>
            {tone === "operational" ? "Operational" : tone === "outage" ? "Not responding" : "No data yet"}
            <span className="text-text-muted/80"> · {formatRelative(monitor.last_checked_at)}</span>
          </p>
        </div>
      </div>

      <UptimeBar monitor={monitor} incidents={incidents} />

      <div className="flex items-center justify-between gap-3 md:block md:text-right">
        <span className="text-[11px] uppercase tracking-[0.02em] text-text-muted md:hidden">90-day uptime</span>
        <span className={`text-[13px] tabular-nums ${uptime === null ? "text-text-muted" : "text-text-normal"}`}>
          {uptime === null ? "—" : `${uptime}%`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <span className="text-[11px] uppercase tracking-[0.02em] text-text-muted md:hidden">Response</span>
        <div className="flex items-center gap-2">
          <Sparkline points={monitor.latency_24h} tone={tone} />
          <span className={`text-[13px] tabular-nums ${tone === "operational" ? "text-text-normal" : "text-text-muted"}`}>
            {monitor.latency_ms === null ? "—" : `${monitor.latency_ms}ms`}
          </span>
        </div>
      </div>
    </div>
  );
}

function IncidentRow({ incident, past = false }: { incident: StatusIncident; past?: boolean }) {
  const latest = incident.updates[incident.updates.length - 1];
  return (
    <Link
      href={`/status/incidents/${incident.id}`}
      className="block border-b border-white/[0.05] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.025]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL[incident.status]}`}>
          {INCIDENT_STATUS_LABEL[incident.status]}
        </span>
        <span className="text-[11px] uppercase tracking-[0.03em] text-text-muted">
          {INCIDENT_KIND_LABEL[incident.kind]}
        </span>
        <span className="ml-auto text-[12px] text-text-muted">{formatDateTime(incident.created_at)}</span>
      </div>
      <p className={`mt-1.5 text-[15px] font-medium ${past ? "text-text-normal" : "text-header-primary"}`}>{incident.title}</p>
      {latest && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-muted">{latest.body}</p>}
      {past && incident.resolved_at && (
        <p className="mt-1 text-[12px] text-[#6bdc96]">Resolved {formatDateTime(incident.resolved_at)}</p>
      )}
    </Link>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-4 text-[13px] text-text-muted">{children}</p>;
}

export function StatusView({ initial }: { initial: StatusSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/status-page", { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      const next = (await res.json()) as StatusSnapshot;
      if (Array.isArray(next.monitors) && Array.isArray(next.incidents)) {
        setSnapshot(next);
        setError(null);
      }
    } catch {
      setError("Couldn't refresh. Showing the last result.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const overall = useMemo(() => overallStatus(snapshot), [snapshot]);
  const groups = useMemo(() => {
    const map = new Map<string, StatusMonitor[]>();
    for (const monitor of snapshot.monitors) {
      const list = map.get(monitor.group_name) ?? [];
      list.push(monitor);
      map.set(monitor.group_name, list);
    }
    return [...map.entries()];
  }, [snapshot.monitors]);

  const activeIncidents = snapshot.incidents.filter((i) => isIncidentActive(i) && i.kind !== "announcement");
  const announcements = snapshot.incidents.filter((i) => i.kind === "announcement");
  const pastIncidents = snapshot.incidents
    .filter((i) => !isIncidentActive(i) && i.kind !== "announcement")
    .slice(0, 10);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Disband Status</h1>
          <p className="mt-1.5 text-[14px] text-text-muted">
            Live checks across the services that power Disband.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-muted">Updated {formatRelative(snapshot.generated_at)}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="h-[34px] rounded-[4px] border border-white/[0.08] bg-[#2b2d31] px-3 text-[13px] font-medium text-text-normal transition-colors hover:border-white/[0.15] hover:bg-[#35373c] disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className={`mt-6 flex items-start gap-3 rounded-lg border-l-4 px-4 py-3.5 ${BANNER[overall.tone]}`} role="status" aria-live="polite">
        <StatusDot tone={overall.tone} className="mt-1.5" />
        <div className="min-w-0">
          <p className={`text-[15px] font-semibold ${TONE_TEXT[overall.tone]}`}>{overall.label}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-text-muted">{overall.detail}</p>
        </div>
        <span className="ml-auto hidden shrink-0 text-[12px] text-text-muted sm:block">{TONE_LABEL[overall.tone]}</span>
      </div>

      {error && (
        <p className="mt-3 rounded-[4px] border border-[#f0b232]/25 bg-[#f0b232]/[0.06] px-3 py-2 text-[13px] text-[#f6c95f]">
          {error}
        </p>
      )}

      {groups.map(([group, monitors]) => (
        <section key={group} className="mt-8">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">{group}</h2>
          <div className="overflow-hidden rounded-lg bg-[#2b2d31]">
            {monitors.map((monitor) => (
              <MonitorRow key={monitor.id} monitor={monitor} incidents={snapshot.incidents} />
            ))}
          </div>
        </section>
      ))}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section>
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">
            Active incidents
          </h2>
          <div className="overflow-hidden rounded-lg bg-[#2b2d31]">
            {activeIncidents.length === 0 ? (
              <EmptyPanel>No active incidents. If something looks wrong, check back shortly.</EmptyPanel>
            ) : (
              activeIncidents.map((incident) => <IncidentRow key={incident.id} incident={incident} />)
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">
            Announcements
          </h2>
          <div className="overflow-hidden rounded-lg bg-[#2b2d31]">
            {announcements.length === 0 ? (
              <EmptyPanel>No announcements right now.</EmptyPanel>
            ) : (
              announcements.slice(0, 4).map((incident) => <IncidentRow key={incident.id} incident={incident} />)
            )}
          </div>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-2 flex items-end justify-between gap-4">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Past incidents</h2>
          <a href="/status/feed.xml" className="text-[12px] text-[#00a8fc] hover:underline">
            Subscribe via RSS
          </a>
        </div>
        <div className="overflow-hidden rounded-lg bg-[#2b2d31]">
          {pastIncidents.length === 0 ? (
            <EmptyPanel>No incidents in the last 90 days.</EmptyPanel>
          ) : (
            pastIncidents.map((incident) => <IncidentRow key={incident.id} incident={incident} past />)
          )}
        </div>
      </section>

      <p className="mt-10 text-center text-[12px] text-text-muted">
        Checks run automatically every minute. Seeing a problem that isn&apos;t listed?{" "}
        <Link href="/bug-report" className="text-[#00a8fc] hover:underline">
          Report a bug
        </Link>
        .
      </p>
    </main>
  );
}
