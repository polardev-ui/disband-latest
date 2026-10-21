"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";
import { apiFetch } from "@/lib/api";
import {
  INCIDENT_KIND_LABEL,
  INCIDENT_STATUS_LABEL,
  formatDateTime,
  type IncidentImpact,
  type IncidentKind,
  type IncidentStatus,
  type StatusIncident,
} from "@/lib/status";

interface Monitor {
  id: string;
  name: string;
  url: string;
  method: string;
  expected_status: number;
  keyword: string | null;
  timeout_ms: number;
  headers: Record<string, string>;
  group_name: string;
  position: number;
  enabled: boolean;
  public: boolean;
  created_at: string;
  updated_at: string;
}

type ApiError = { error?: string };

const INPUT =
  "h-9 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc]";
const LABEL = "mb-1.5 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-text-secondary";
const BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50";
const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:pointer-events-none disabled:opacity-50";
const BUTTON_DANGER = "text-[13px] font-medium text-status-dnd hover:underline disabled:opacity-50";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Leave data null; the status code below produces the message.
  }
  if (!res.ok) {
    const message = (data as ApiError | null)?.error ?? `Request failed (${res.status}).`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return data as T;
}

function MonitorItem({
  monitor,
  onChanged,
  onDeleted,
  onError,
}: {
  monitor: Monitor;
  onChanged: (monitor: Monitor) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(monitor.name);
  const [url, setUrl] = useState(monitor.url);
  const [group, setGroup] = useState(monitor.group_name);
  const [expected, setExpected] = useState(String(monitor.expected_status));
  const [keyword, setKeyword] = useState(monitor.keyword ?? "");
  const [timeout, setTimeoutMs] = useState(String(monitor.timeout_ms));
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    onError("");
    try {
      const data = await request<{ monitor: Monitor }>(`/api/status-admin/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onChanged(data.monitor);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save the monitor.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the monitor “${monitor.name}”? Its check history is removed too.`)) return;
    setSaving(true);
    onError("");
    try {
      const res = await apiFetch(`/api/status-admin/monitors/${monitor.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the monitor.");
      onDeleted(monitor.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not delete the monitor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group border-b border-white/[0.05] last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${monitor.enabled ? "bg-[#23a55a]" : "bg-[#80848e]"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-header-primary">{monitor.name}</p>
          <p className="truncate text-[12px] text-text-muted">{monitor.url}</p>
        </div>
        <span className="hidden shrink-0 text-[11px] uppercase tracking-[0.03em] text-text-muted sm:block">
          {monitor.group_name} · {monitor.enabled ? "On" : "Off"}
        </span>
        <span className="text-[12px] text-text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="border-t border-white/[0.05] px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={LABEL}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          </label>
          <label>
            <span className={LABEL}>Group</span>
            <input value={group} onChange={(e) => setGroup(e.target.value)} className={INPUT} />
          </label>
          <label className="sm:col-span-2">
            <span className={LABEL}>URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={INPUT} />
          </label>
          <label>
            <span className={LABEL}>Expected status</span>
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              inputMode="numeric"
              className={INPUT}
            />
          </label>
          <label>
            <span className={LABEL}>Timeout (ms)</span>
            <input
              value={timeout}
              onChange={(e) => setTimeoutMs(e.target.value)}
              inputMode="numeric"
              className={INPUT}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={LABEL}>Keyword (optional)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='For example: "status":"ok"'
              className={INPUT}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-text-normal">
            <input
              type="checkbox"
              checked={monitor.enabled}
              onChange={(e) => void save({ enabled: e.target.checked })}
              className="h-4 w-4 accent-[#5865f2]"
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-[13px] text-text-normal">
            <input
              type="checkbox"
              checked={monitor.public}
              onChange={(e) => void save({ public: e.target.checked })}
              className="h-4 w-4 accent-[#5865f2]"
            />
            Show on the public page
          </label>
          <button
            type="button"
            onClick={() => void save({ name, url, group_name: group, expected_status: Number(expected), keyword, timeout_ms: Number(timeout) })}
            disabled={saving}
            className={`${BUTTON} ml-auto`}
          >
            {saving ? "Saving…" : "Save monitor"}
          </button>
          <button type="button" onClick={() => void remove()} disabled={saving} className={BUTTON_DANGER}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function IncidentItem({
  incident,
  monitorNames,
  onChanged,
  onDeleted,
  onError,
}: {
  incident: StatusIncident;
  monitorNames: Map<string, string>;
  onChanged: (incident: StatusIncident) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const defaultStatus: IncidentStatus =
    incident.status === "resolved" || incident.status === "completed"
      ? "monitoring"
      : incident.kind === "incident"
        ? "identified"
        : "in_progress";
  const [status, setStatus] = useState<IncidentStatus>(defaultStatus);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function postUpdate(nextStatus: IncidentStatus, text: string) {
    if (!text.trim()) {
      onError("Write an update before posting it.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      const data = await request<{ update: StatusIncident["updates"][number] }>(
        `/api/status-admin/incidents/${incident.id}/updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, body: text }),
        },
      );
      onChanged({
        ...incident,
        status: nextStatus,
        resolved_at: nextStatus === "resolved" || nextStatus === "completed" ? new Date().toISOString() : null,
        updates: [...incident.updates, data.update],
      });
      setBody("");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not post the update.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${incident.title}”? The timeline goes with it.`)) return;
    setBusy(true);
    onError("");
    try {
      const res = await apiFetch(`/api/status-admin/incidents/${incident.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the incident.");
      onDeleted(incident.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not delete the incident.");
    } finally {
      setBusy(false);
    }
  }

  const affected = incident.monitor_ids.map((id) => monitorNames.get(id)).filter(Boolean);
  const active = !incident.resolved_at && incident.status !== "resolved" && incident.status !== "completed";

  return (
    <details className="group border-b border-white/[0.05] last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-[#f0b232]" : "bg-[#23a55a]"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium text-header-primary">{incident.title}</p>
            <span className="rounded-[3px] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-text-muted">
              {INCIDENT_STATUS_LABEL[incident.status]}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {INCIDENT_KIND_LABEL[incident.kind]} · {formatDateTime(incident.created_at)}
            {affected.length ? ` · ${affected.join(", ")}` : ""}
          </p>
        </div>
        <span className="text-[12px] text-text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="border-t border-white/[0.05] px-4 py-4">
        <div className="mb-4 space-y-2">
          {incident.updates.map((update) => (
            <div key={update.id} className="rounded-[4px] bg-bg-tertiary px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-text-muted">
                {INCIDENT_STATUS_LABEL[update.status]} · {formatDateTime(update.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-text-normal">{update.body}</p>
            </div>
          ))}
          {incident.updates.length === 0 && <p className="text-[13px] text-text-muted">No updates yet.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <label>
            <span className={LABEL}>Update status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={INPUT}>
              {(["investigating", "identified", "monitoring", "resolved", "scheduled", "in_progress", "completed", "published"] as IncidentStatus[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {INCIDENT_STATUS_LABEL[value]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            <span className={LABEL}>Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="What changed?"
              className="w-full resize-y rounded-[3px] border border-transparent bg-bg-tertiary px-3 py-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc]"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void postUpdate(status, body)} disabled={busy} className={BUTTON}>
            {busy ? "Posting…" : "Post update"}
          </button>
          {active && incident.kind === "incident" && (
            <button
              type="button"
              onClick={() => void postUpdate("resolved", "Resolved.")}
              disabled={busy}
              className={BUTTON_SECONDARY}
            >
              Resolve
            </button>
          )}
          <button type="button" onClick={() => void remove()} disabled={busy} className={`${BUTTON_DANGER} ml-auto`}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

export default function StatusAdminPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [group, setGroup] = useState("Disband");
  const [creatingMonitor, setCreatingMonitor] = useState(false);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<IncidentKind>("incident");
  const [impact, setImpact] = useState<IncidentImpact>("minor");
  const [monitorIds, setMonitorIds] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduledUntil, setScheduledUntil] = useState("");
  const [body, setBody] = useState("");
  const [creatingIncident, setCreatingIncident] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(null);
    try {
      const [monitorData, incidentData] = await Promise.all([
        request<{ monitors: Monitor[] }>("/api/status-admin/monitors"),
        request<{ incidents: StatusIncident[] }>("/api/status-admin/incidents"),
      ]);
      setMonitors(monitorData.monitors);
      setIncidents(incidentData.incidents);
    } catch (cause) {
      const status = (cause as Error & { status?: number }).status;
      if (status === 401 || status === 403) setDenied(cause instanceof Error ? cause.message : "Access denied.");
      else setError(cause instanceof Error ? cause.message : "Could not load the status admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monitorNames = useMemo(() => new Map(monitors.map((m) => [m.id, m.name])), [monitors]);

  async function createMonitor() {
    setCreatingMonitor(true);
    setError("");
    try {
      const data = await request<{ monitor: Monitor }>("/api/status-admin/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, group_name: group }),
      });
      setMonitors((prev) => [...prev, data.monitor]);
      setName("");
      setUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the monitor.");
    } finally {
      setCreatingMonitor(false);
    }
  }

  async function createIncident() {
    setCreatingIncident(true);
    setError("");
    try {
      const data = await request<{ incident: StatusIncident }>("/api/status-admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind,
          impact,
          monitor_ids: monitorIds,
          scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          scheduled_until: scheduledUntil ? new Date(scheduledUntil).toISOString() : null,
          body,
        }),
      });
      const created = await request<{ incidents: StatusIncident[] }>("/api/status-admin/incidents");
      setIncidents(created.incidents);
      setTitle("");
      setBody("");
      setMonitorIds([]);
      setScheduledFor("");
      setScheduledUntil("");
      void data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post the incident.");
    } finally {
      setCreatingIncident(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-tertiary text-text-normal">
      <MarketingNav />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Status admin</h1>
            <p className="mt-1.5 text-[14px] text-text-muted">
              Monitors, incidents, maintenance and announcements for the public status page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/status" className="text-[13px] text-[#00a8fc] hover:underline">
              View public page
            </Link>
            <button type="button" onClick={() => void load()} disabled={loading} className={BUTTON_SECONDARY}>
              {loading ? "Loading…" : "Reload"}
            </button>
          </div>
        </div>

        {denied ? (
          <div className="mt-8 rounded-lg bg-[#2b2d31] px-5 py-6">
            <p className="text-[15px] font-semibold text-header-primary">Platform owner only</p>
            <p className="mt-1 text-[14px] text-text-muted">{denied}</p>
          </div>
        ) : loading ? (
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[#2b2d31]" />
            ))}
          </div>
        ) : (
          <>
            {error && (
              <p className="mt-4 rounded-[4px] border border-[#f23f43]/25 bg-[#f23f43]/[0.06] px-3 py-2 text-[13px] text-[#ff8f91]">
                {error}
              </p>
            )}

            <section className="mt-8">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Monitors</h2>
              <div className="rounded-lg bg-[#2b2d31]">
                {monitors.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-text-muted">No monitors yet.</p>
                ) : (
                  monitors.map((monitor) => (
                    <MonitorItem
                      key={`${monitor.id}:${monitor.updated_at}`}
                      monitor={monitor}
                      onChanged={(next) => setMonitors((prev) => prev.map((m) => (m.id === next.id ? next : m)))}
                      onDeleted={(id) => setMonitors((prev) => prev.filter((m) => m.id !== id))}
                      onError={setError}
                    />
                  ))
                )}
              </div>

              <div className="mt-4 rounded-lg bg-[#2b2d31] p-4">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Add a monitor</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className={LABEL}>Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voice gateway" className={INPUT} />
                  </label>
                  <label>
                    <span className={LABEL}>Group</span>
                    <input value={group} onChange={(e) => setGroup(e.target.value)} className={INPUT} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={LABEL}>URL</span>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/health"
                      className={INPUT}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void createMonitor()}
                  disabled={creatingMonitor || !name.trim() || !url.trim()}
                  className={`${BUTTON} mt-3`}
                >
                  {creatingMonitor ? "Adding…" : "Add monitor"}
                </button>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Incidents</h2>
              <div className="rounded-lg bg-[#2b2d31]">
                {incidents.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-text-muted">No incidents, maintenance or announcements.</p>
                ) : (
                  incidents.map((incident) => (
                    <IncidentItem
                      key={`${incident.id}:${incident.status}:${incident.updates.length}`}
                      incident={incident}
                      monitorNames={monitorNames}
                      onChanged={(next) => setIncidents((prev) => prev.map((i) => (i.id === next.id ? next : i)))}
                      onDeleted={(id) => setIncidents((prev) => prev.filter((i) => i.id !== id))}
                      onError={setError}
                    />
                  ))
                )}
              </div>

              <div className="mt-4 rounded-lg bg-[#2b2d31] p-4">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Post an update</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={LABEL}>Title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Messages are delayed" className={INPUT} />
                  </label>
                  <label>
                    <span className={LABEL}>Kind</span>
                    <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)} className={INPUT}>
                      <option value="incident">Incident</option>
                      <option value="maintenance">Scheduled maintenance</option>
                      <option value="announcement">Announcement</option>
                    </select>
                  </label>
                  <label>
                    <span className={LABEL}>Impact</span>
                    <select value={impact} onChange={(e) => setImpact(e.target.value as IncidentImpact)} className={INPUT}>
                      <option value="none">None</option>
                      <option value="minor">Minor</option>
                      <option value="major">Major</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  {kind === "maintenance" && (
                    <>
                      <label>
                        <span className={LABEL}>Starts</span>
                        <input
                          type="datetime-local"
                          value={scheduledFor}
                          onChange={(e) => setScheduledFor(e.target.value)}
                          className={INPUT}
                        />
                      </label>
                      <label>
                        <span className={LABEL}>Ends</span>
                        <input
                          type="datetime-local"
                          value={scheduledUntil}
                          onChange={(e) => setScheduledUntil(e.target.value)}
                          className={INPUT}
                        />
                      </label>
                    </>
                  )}
                  <label className="sm:col-span-2">
                    <span className={LABEL}>Affected services</span>
                    <div className="flex flex-wrap gap-2 rounded-[3px] bg-bg-tertiary px-3 py-2">
                      {monitors.map((monitor) => (
                        <label key={monitor.id} className="flex items-center gap-1.5 text-[13px] text-text-normal">
                          <input
                            type="checkbox"
                            checked={monitorIds.includes(monitor.id)}
                            onChange={(e) =>
                              setMonitorIds((prev) =>
                                e.target.checked ? [...prev, monitor.id] : prev.filter((id) => id !== monitor.id),
                              )
                            }
                            className="h-3.5 w-3.5 accent-[#5865f2]"
                          />
                          {monitor.name}
                        </label>
                      ))}
                      {monitors.length === 0 && <span className="text-[13px] text-text-muted">No monitors configured.</span>}
                    </div>
                  </label>
                  <label className="sm:col-span-2">
                    <span className={LABEL}>First update</span>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={3}
                      placeholder="What is happening, and what are you doing about it?"
                      className="w-full resize-y rounded-[3px] border border-transparent bg-bg-tertiary px-3 py-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc]"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void createIncident()}
                  disabled={creatingIncident || !title.trim()}
                  className={`${BUTTON} mt-3`}
                >
                  {creatingIncident ? "Posting…" : "Post"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
