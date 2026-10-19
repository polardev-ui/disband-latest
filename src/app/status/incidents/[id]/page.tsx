import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";
import { getStatusIncident, getStatusSnapshot } from "@/lib/status-data";
import {
  INCIDENT_KIND_LABEL,
  INCIDENT_STATUS_LABEL,
  formatDateTime,
  type IncidentStatus,
} from "@/lib/status";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Incident · Disband Status",
  description: "Incident timeline and updates from Disband.",
  robots: { index: false, follow: true },
};

const PILL: Record<IncidentStatus, string> = {
  investigating: "bg-[#f23f43]/15 text-[#ff8f91]",
  identified: "bg-[#f0b232]/15 text-[#f6c95f]",
  monitoring: "bg-[#5865f2]/20 text-[#b4baff]",
  resolved: "bg-[#23a55a]/15 text-[#6bdc96]",
  scheduled: "bg-[#5865f2]/20 text-[#b4baff]",
  in_progress: "bg-[#f0b232]/15 text-[#f6c95f]",
  completed: "bg-[#23a55a]/15 text-[#6bdc96]",
  published: "bg-white/[0.06] text-text-normal",
};

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [incident, snapshot] = await Promise.all([getStatusIncident(id), getStatusSnapshot()]);
  if (!incident) notFound();

  const monitors = snapshot.monitors.filter((m) => incident.monitor_ids.includes(m.id));

  return (
    <div className="min-h-screen bg-bg-tertiary text-text-normal">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        <Link href="/status" className="text-[13px] text-[#00a8fc] hover:underline">
          ← Back to status
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={`rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold ${PILL[incident.status]}`}>
            {INCIDENT_STATUS_LABEL[incident.status]}
          </span>
          <span className="text-[11px] uppercase tracking-[0.03em] text-text-muted">
            {INCIDENT_KIND_LABEL[incident.kind]}
          </span>
          {incident.auto && <span className="text-[11px] text-text-muted">Automated</span>}
        </div>

        <h1 className="mt-2 text-3xl font-bold leading-tight text-white">{incident.title}</h1>
        <p className="mt-2 text-[13px] text-text-muted">
          Opened {formatDateTime(incident.created_at)}
          {incident.resolved_at ? ` · Resolved ${formatDateTime(incident.resolved_at)}` : ""}
        </p>

        <div className="mt-6 rounded-lg bg-[#2b2d31] p-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Affected services</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {monitors.length > 0 ? (
              monitors.map((monitor) => (
                <span key={monitor.id} className="rounded-[4px] bg-white/[0.05] px-2 py-1 text-[13px] text-text-normal">
                  {monitor.name}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-text-muted">All services</span>
            )}
          </div>
          {incident.scheduled_for && (
            <p className="mt-3 text-[13px] text-text-muted">
              Scheduled for {formatDateTime(incident.scheduled_for)}
              {incident.scheduled_until ? ` – ${formatDateTime(incident.scheduled_until)}` : ""}
            </p>
          )}
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.03em] text-text-muted">Timeline</h2>
          <ol className="rounded-lg bg-[#2b2d31] px-4 py-2">
            {incident.updates.length === 0 ? (
              <li className="py-3 text-[13px] text-text-muted">No updates have been posted yet.</li>
            ) : (
              incident.updates.map((update, index) => (
                <li key={update.id} className="relative flex gap-3 py-3">
                  <span className="relative flex w-3 shrink-0 justify-center">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-[#5865f2]" />
                    {index < incident.updates.length - 1 && (
                      <span aria-hidden className="absolute bottom-[-12px] top-3 w-px bg-white/[0.08]" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-header-primary">
                      {INCIDENT_STATUS_LABEL[update.status]}
                      <span className="ml-2 font-normal text-text-muted">{formatDateTime(update.created_at)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-5 text-text-normal">
                      {update.body}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ol>
        </section>

        <p className="mt-8 text-[13px] text-text-muted">
          Need help?{" "}
          <Link href="/bug-report" className="text-[#00a8fc] hover:underline">
            Report a bug
          </Link>
          .
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
