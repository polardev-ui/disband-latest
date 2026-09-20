"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Notice {
  active: boolean;
  title: string;
  message: string;
  starts_at: string | null;
  ends_at: string | null;
  dismiss_after_seconds: number;
  revision: number;
}

const DISMISSED_KEY = "disband:maintenance-dismissed";

function dismissedRevision(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function MaintenanceNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data } = await getSupabaseClient()
        .from("maintenance_notice")
        .select("active, title, message, starts_at, ends_at, dismiss_after_seconds, revision")
        .maybeSingle();
      if (!alive) return;

      const row = data as Notice | null;
      if (!row?.active || row.revision <= dismissedRevision()) {
        setNotice(null);
        return;
      }
      setNotice(row);
      setSecondsLeft(Math.max(0, row.dismiss_after_seconds));
    }

    void load();

    const channel = getSupabaseClient()
      .channel("maintenance-notice")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "maintenance_notice" },
        () => void load())
      .subscribe();

    const poll = window.setInterval(() => void load(), 120_000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      void getSupabaseClient().removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  if (!notice) return null;

  function dismiss() {
    if (secondsLeft > 0 || !notice) return;
    try {
      localStorage.setItem(DISMISSED_KEY, String(notice.revision));
    } catch {

    }
    setNotice(null);
  }

  const locked = secondsLeft > 0;

  return (
    <div
      role="status"
      className="relative z-[60] flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#f0b232]/30 bg-[#f0b232]/12 px-4 py-2.5"
    >
      <span className="shrink-0 text-[#f0b232]" aria-hidden>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>

      <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-text-normal">
        <strong className="font-semibold">{notice.title}</strong>
        {" — "}
        {notice.message}
        {notice.starts_at && (
          <span className="text-text-muted">
            {" "}
            {formatWindow(notice.starts_at, notice.ends_at)}
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={dismiss}
        disabled={locked}
        aria-live="polite"
        className={`shrink-0 rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
          locked
            ? "cursor-not-allowed bg-text-normal/5 text-text-muted"
            : "bg-text-normal/10 text-text-normal hover:bg-text-normal/20"
        }`}
      >
        {locked ? `Dismiss in ${secondsLeft}` : "Dismiss"}
      </button>
    </div>
  );
}

function formatWindow(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";

  const day = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const from = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (!endsAt) return `Starting ${day} at ${from}.`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `Starting ${day} at ${from}.`;

  const to = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${from}–${to}.`;
}
