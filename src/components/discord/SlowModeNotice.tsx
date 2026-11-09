"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { IconGauge } from "@/components/icons";

function formatWindow(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return seconds % 60 === 0 ? `${seconds / 60}m` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The line above the composer in a slow-mode channel: how long the gap is,
 * and — after your own message — how long until you can send the next one.
 * The database enforces the gap (migration 0239); this only explains it.
 */
export function SlowModeNotice({
  seconds,
  exempt,
  lastOwnMessageAt,
}: {
  seconds: number;
  exempt: boolean;
  lastOwnMessageAt: string | null;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const readyAt = lastOwnMessageAt ? new Date(lastOwnMessageAt).getTime() + seconds * 1000 : 0;
  const waiting = !exempt && readyAt > now;

  useEffect(() => {
    setNow(Date.now());
    if (exempt || readyAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const t2 = Date.now();
      setNow(t2);
      if (t2 >= readyAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exempt, readyAt]);

  const remaining = Math.max(0, Math.ceil((readyAt - now) / 1000));

  return (
    <div className="mx-4 mb-1.5 flex items-center gap-2 text-[12px] font-medium text-text-muted" role="status">
      <IconGauge size={14} className={waiting ? "text-status-idle" : undefined} />
      {exempt ? (
        <span>{t("Slow mode is on ({window}). You're exempt.", { window: formatWindow(seconds) })}</span>
      ) : waiting ? (
        <span className="text-text-normal">{t("Slow mode: you can send another message in {time}.", { time: formatWindow(remaining) })}</span>
      ) : (
        <span>{t("Slow mode is on: one message every {window}.", { window: formatWindow(seconds) })}</span>
      )}
    </div>
  );
}
