"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { IconHash } from "@/components/icons";
import { InlineError, SettingsSection, enterStyle } from "./ui";
import type { SectionProps } from "./types";
import { useI18n } from "@/contexts/I18nContext";

interface Insights {
  members: number;
  joins_7d: number;
  joins_30d: number;
  messages_7d: number;
  messages_30d: number;
  active_7d: number;
  active_30d: number;
  daily: { day: string; messages: number; joins: number }[];
  top_channels: { id: string; name: string; messages: number }[];
}

const fmt = (n: number) => n.toLocaleString("en-GB");

/** How the space is doing, in aggregate (server_insights, migration 0281). */
export function InsightsSection({ server }: SectionProps) {
  const { t } = useI18n();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    void getSupabaseClient()
      .rpc("server_insights", { p_server_id: server.id })
      .then(({ data: rows, error: err }) => {
        if (!live) return;
        if (err) setError(err.message);
        else setData(rows as Insights);
      });
    return () => {
      live = false;
    };
  }, [server.id]);

  if (error) return <InlineError>{error}</InlineError>;
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <LoadingDots size={8} />
      </div>
    );
  }

  const tiles = [
    { label: t("Members"), value: data.members, sub: t("{n} joined this month", { n: fmt(data.joins_30d) }) },
    { label: t("New members"), value: data.joins_7d, sub: t("in the last 7 days") },
    { label: t("Messages"), value: data.messages_7d, sub: t("{n} in the last 30 days", { n: fmt(data.messages_30d) }) },
    { label: t("Active members"), value: data.active_7d, sub: t("posted this week · {n} this month", { n: fmt(data.active_30d) }) },
  ];
  const peak = Math.max(1, ...data.daily.map((d) => d.messages));
  const topPeak = Math.max(1, ...data.top_channels.map((c) => c.messages));

  return (
    <div className="pb-10">
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <div key={tile.label} className="view-enter rounded-xl border border-border-subtle bg-surface-raised px-4 py-3.5" style={enterStyle(i)}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.02em] text-text-muted">{tile.label}</p>
            <p className="mt-1 text-[26px] font-semibold leading-8 tabular-nums text-header-primary">{fmt(tile.value)}</p>
            <p className="mt-0.5 text-[12px] leading-4 text-text-muted">{tile.sub}</p>
          </div>
        ))}
      </div>

      <SettingsSection title={t("Messages per day")} description={t("The last 14 days. New members are shown underneath each day.")}>
        <div className="px-5 pb-4 pt-5">
          <div className="flex h-36 items-end gap-1.5">
            {data.daily.map((d) => {
              const date = new Date(`${d.day}T12:00:00`);
              const label = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
              return (
                <div key={d.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${label}: ${fmt(d.messages)} messages, ${fmt(d.joins)} joined`}>
                  <span
                    className="block w-full rounded-t-[4px] bg-brand/80 transition-colors group-hover:bg-brand"
                    style={{ height: `${Math.max(d.messages ? 4 : 1, (d.messages / peak) * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {data.daily.map((d) => (
              <span key={d.day} className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-text-muted">
                {d.joins > 0 ? `+${d.joins}` : "·"}
              </span>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-text-muted">
            <span>{new Date(`${data.daily[0]?.day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <span>{t("Today")}</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("Busiest channels")} description={t("By messages in the last 7 days.")}>
        {data.top_channels.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-text-muted">{t("No messages this week yet.")}</p>
        ) : (
          <ul className="px-5 py-3">
            {data.top_channels.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-1.5">
                <IconHash size={16} className="shrink-0 text-text-muted" />
                <span className="w-40 min-w-0 truncate text-[14px] text-text-normal">{c.name}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(c.messages / topPeak) * 100}%` }} />
                </span>
                <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-text-muted">{fmt(c.messages)}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
