"use client";

/**
 * Welcome messages (migration 0243): Tether greets each new member in a
 * channel, with a message the space writes. Markdown works, and the
 * placeholders below are filled in when someone joins.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { renderMarkdown } from "@/lib/markdown";
import { FieldLabel, InlineError, SettingsSection, SettingRow, Toggle, btn, settingsInputClass } from "./ui";
import { BUSY_BUTTON, BusyLabel } from "@/components/ui/LoadingDots";
import type { SectionProps } from "./types";
import { useI18n } from "@/contexts/I18nContext";

const PLACEHOLDERS: { token: string; what: string }[] = [
  { token: "$user", what: "Mentions them (they get pinged)" },
  { token: "$username", what: "Their username, no ping" },
  { token: "$displayname", what: "Their display name" },
  { token: "$server", what: "This space's name" },
  { token: "$membercount", what: "Members now, them included" },
  { token: "$ordinal", what: "The same as 42nd" },
  { token: "$owner", what: "The owner's username" },
  { token: "$date", what: "Today's date" },
];

const DEFAULT_MESSAGE = "**Welcome to $server, $user!** You're our $ordinal member.";

export function WelcomeSection({ server, isOwner }: SectionProps) {
  const { t } = useI18n();
  const { serverPermissions, channels } = useApp();
  const canEdit = isOwner || !!serverPermissions.manage_server;
  const s = server as typeof server & {
    welcome_enabled?: boolean;
    welcome_channel_id?: string | null;
    welcome_message?: string | null;
  };

  const [enabled, setEnabled] = useState(!!s.welcome_enabled);
  const [channelId, setChannelId] = useState<string>(s.welcome_channel_id ?? "");
  const [message, setMessage] = useState(s.welcome_message ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // The settings may arrive after the space loads; take the latest once.
  useEffect(() => {
    let cancelled = false;
    void getSupabaseClient()
      .from("servers")
      .select("welcome_enabled, welcome_channel_id, welcome_message")
      .eq("id", server.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setEnabled(!!data.welcome_enabled);
        setChannelId(data.welcome_channel_id ?? "");
        setMessage(data.welcome_message ?? "");
      });
    return () => { cancelled = true; };
  }, [server.id]);

  const textChannels = useMemo(
    () => channels.filter((c) => c.server_id === server.id && c.type === "text"),
    [channels, server.id],
  );
  const fallback = textChannels.find((c) => ["welcome", "welcomes", "welcome-chat"].includes(c.name.toLowerCase()));

  // Filled in as if you had just joined, from the server's own renderer.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void getSupabaseClient()
        .rpc("preview_welcome_message", { p_server_id: server.id, p_message: message || DEFAULT_MESSAGE })
        .then(({ data, error: err }) => setPreview(err ? null : (data as string)));
    }, 300);
    return () => window.clearTimeout(id);
  }, [message, server.id]);

  const insert = (token: string) => {
    const el = areaRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    if (next.length > 1000) return;
    setMessage(next);
    setSaved(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await getSupabaseClient().rpc("set_welcome_settings", {
      p_server_id: server.id,
      p_enabled: enabled,
      p_channel_id: channelId || null,
      p_message: message.trim() || null,
    });
    setSaving(false);
    if (err) setError(err.message);
    else setSaved(true);
  };

  const noChannel = enabled && !channelId && !fallback;

  return (
    <div className="space-y-2">
      <SettingsSection title={t("Welcome messages")} description={t("Tether greets each new member in a channel you choose.")}>
        <SettingRow label={t("Send a welcome message")} description={t("Bots joining are not greeted.")}>
          <Toggle checked={enabled} onChange={(v) => { setEnabled(v); setSaved(false); }} label={t("Send a welcome message")} disabled={!canEdit} />
        </SettingRow>

        <div className="space-y-4 px-5 py-4">
          <div>
            <FieldLabel htmlFor="welcome-channel">{t("Channel")}</FieldLabel>
            <select
              id="welcome-channel"
              value={channelId}
              disabled={!canEdit}
              onChange={(e) => { setChannelId(e.target.value); setSaved(false); }}
              className={settingsInputClass}
            >
              <option value="">{fallback ? t("#{name} (automatic)", { name: fallback.name }) : t("A channel called #welcome")}</option>
              {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            {noChannel && (
              <p className="mt-1.5 text-[12px] text-status-idle">{t("There's no #welcome channel yet. Pick one, or nobody will be greeted.")}</p>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="welcome-message" aside={<span className="tabular-nums">{message.length}/1000</span>}>{t("Message")}</FieldLabel>
            <textarea
              id="welcome-message"
              ref={areaRef}
              rows={4}
              maxLength={1000}
              disabled={!canEdit}
              value={message}
              placeholder={DEFAULT_MESSAGE}
              onChange={(e) => { setMessage(e.target.value); setSaved(false); }}
              className={`${settingsInputClass} h-auto resize-y py-2.5 leading-5`}
            />
            <p className="mt-1.5 text-[12px] text-text-muted">{t("Markdown works: **bold**, *italics*, __underline__, ~~strike~~. Leave it empty for the default.")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  disabled={!canEdit}
                  title={t(p.what)}
                  onClick={() => insert(p.token)}
                  className="h-7 rounded-full border border-border-subtle bg-bg-secondary px-2.5 font-mono text-[12px] text-text-normal transition-colors hover:border-brand hover:text-header-primary disabled:opacity-50"
                >
                  {p.token}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>{t("Preview")}</FieldLabel>
            <div className="flex gap-3 rounded-xl border border-border-subtle bg-bg-primary p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://api.joshclark.xyz/v1/images/tether.png" alt="" className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-header-primary">
                  Tether
                  <span className="rounded bg-brand px-1 py-px text-[10px] font-bold uppercase text-white">{t("Bot")}</span>
                </p>
                <div className="break-words text-[15px] leading-[22px] text-text-normal">
                  {preview ? renderMarkdown(preview) : <span className="text-text-muted">…</span>}
                </div>
              </div>
            </div>
          </div>

          <InlineError>{error}</InlineError>
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-[13px] text-status-online">{t("Saved")}</span>}
            <button
              type="button"
              disabled={!canEdit || saving}
              onClick={() => void save()}
              className={`${btn.primary} ${saving ? BUSY_BUTTON : ""}`}
            >
              <BusyLabel busy={saving}>{t("Save changes")}</BusyLabel>
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
