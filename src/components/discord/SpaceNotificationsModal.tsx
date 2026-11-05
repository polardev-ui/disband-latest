"use client";

import { useEffect, useRef, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { IconClose } from "@/components/icons";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Server } from "@/lib/supabase/types";
import { useI18n } from "@/contexts/I18nContext";

type Level = "mentions" | "nothing";

interface Settings {
  level: Level;
  suppress_everyone: boolean;
  muted_until: string | null;
}

const DEFAULTS: Settings = { level: "mentions", suppress_everyone: false, muted_until: null };
/** "Until I turn it back on". */
const FOREVER = "9999-12-31T00:00:00Z";

const MUTE_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "For 15 minutes", minutes: 15 },
  { label: "For 1 hour", minutes: 60 },
  { label: "For 8 hours", minutes: 8 * 60 },
  { label: "For 24 hours", minutes: 24 * 60 },
  { label: "Until I turn it back on", minutes: null },
];

function isMuted(s: Settings): boolean {
  return !!s.muted_until && new Date(s.muted_until).getTime() > Date.now();
}

/**
 * Per-space notification settings (migration 0230). The server enforces them,
 * so a muted space stays quiet on every device, not just this one.
 */
export function SpaceNotificationsModal({ server, onClose }: { server: Server | null; onClose: () => void }) {
  const { t } = useI18n();
  const open = !!server;
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);
  const lastRef = useRef<Server | null>(null);
  if (server) lastRef.current = server;
  const shown = server ?? lastRef.current;

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    setLoaded(false);
    setError(null);
    void getSupabaseClient()
      .from("server_notification_settings")
      .select("level, suppress_everyone, muted_until")
      .eq("server_id", server.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setSettings(data ? (data as Settings) : DEFAULTS);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [server]);

  const save = async (next: Settings) => {
    if (!shown) return;
    const previous = settings;
    setSettings(next);
    setError(null);
    const { error: err } = await getSupabaseClient().rpc("set_server_notification_settings", {
      p_server_id: shown.id,
      p_level: next.level,
      p_suppress_everyone: next.suppress_everyone,
      p_muted_until: next.muted_until,
    });
    if (err) {
      setSettings(previous);
      setError(t("Couldn’t save that. Try again."));
    }
  };

  if (!mounted || !shown) return null;
  const muted = isMuted(settings);
  const mutedForever = muted && settings.muted_until?.startsWith("9999");

  const radio = (value: Level, title: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 hover:bg-bg-modifier-hover">
      <input
        type="radio"
        name="space-notify-level"
        className="mt-1 accent-[var(--brand-500,#5865f2)]"
        checked={settings.level === value}
        disabled={!loaded}
        onChange={() => void save({ ...settings, level: value })}
      />
      <span>
        <span className="block text-[15px] font-medium text-text-normal">{title}</span>
        <span className="block text-[13px] text-text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-overlay-scrim overlay-fade${exiting ? " overlay-fade-out" : ""} p-4`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Notification settings for {name}", { name: shown.name })}
        className={`modal-pop${exiting ? " modal-pop-out" : ""} flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-bg-secondary shadow-[var(--elevation-high)]`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{t("Notification settings")}</h2>
            <p className="truncate text-[13px] text-text-muted">{shown.name}</p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose} className="text-interactive-normal hover:text-interactive-active">
            <IconClose size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
          <section>
            <p className="mb-2 text-[12px] font-bold uppercase text-header-secondary">{t("Mute space")}</p>
            {muted ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-bg-tertiary px-3 py-2.5">
                <span className="text-[14px] text-text-normal">
                  {mutedForever
                    ? t("Muted until you turn it back on")
                    : t("Muted until {time}", {
                        time: new Date(settings.muted_until!).toLocaleString(undefined, {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        }),
                      })}
                </span>
                <button
                  type="button"
                  onClick={() => void save({ ...settings, muted_until: null })}
                  className="rounded bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-560"
                >
                  {t("Unmute")}
                </button>
              </div>
            ) : (
              <select
                aria-label={t("Mute space")}
                disabled={!loaded}
                value=""
                onChange={(e) => {
                  const opt = MUTE_OPTIONS[Number(e.target.value)];
                  if (!opt) return;
                  const until = opt.minutes == null ? FOREVER : new Date(Date.now() + opt.minutes * 60_000).toISOString();
                  void save({ ...settings, muted_until: until });
                }}
                className="w-full rounded-md bg-bg-tertiary px-3 py-2.5 text-[14px] text-text-normal"
              >
                <option value="" disabled>
                  {t("Mute this space…")}
                </option>
                {MUTE_OPTIONS.map((o, i) => (
                  <option key={o.label} value={i}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1.5 text-[12px] text-text-muted">
              {t("A muted space sends no notifications and shows no unread dots.")}
            </p>
          </section>

          <section className={muted ? "pointer-events-none opacity-50" : undefined}>
            <p className="mb-1 text-[12px] font-bold uppercase text-header-secondary">{t("Notify me about")}</p>
            {radio("mentions", t("Only @mentions"), t("Pings for you, your roles and @everyone."))}
            {radio("nothing", t("Nothing"), t("No notifications from this space."))}
          </section>

          <section className={muted || settings.level === "nothing" ? "pointer-events-none opacity-50" : undefined}>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-bg-modifier-hover">
              <span>
                <span className="block text-[15px] font-medium text-text-normal">{t("Suppress @everyone")}</span>
                <span className="block text-[13px] text-text-muted">{t("Ignore @everyone pings in this space.")}</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-500,#5865f2)]"
                checked={settings.suppress_everyone}
                disabled={!loaded}
                onChange={(e) => void save({ ...settings, suppress_everyone: e.target.checked })}
              />
            </label>
          </section>

          {error ? <p className="text-[13px] text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
