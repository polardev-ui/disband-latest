"use client";

/*
 Saved messages (everyone) and message reminders (Disband Lite and Aero).

 - ReminderDialog: pick when a saved message should come back (quick
   presets or a date and time). The database checks the plan again and
   delivers the reminder to the inbox when it's due.
 - SavedPanel: the header popover listing saved messages, newest first, with
   their live content, a jump to each, reminder status, and remove.
*/

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  findSaved,
  reminderPresets,
  resolveSavedMessages,
  saveMessage,
  setReminder,
  unsaveMessage,
  useSavedMessages,
  type ResolvedSaved,
  type SavedContext,
} from "@/lib/saved-messages";
import { ClassicModal, ClassicLabel, classicBtn, classicInput } from "@/components/ui/ClassicModal";
import { Avatar } from "@/components/ui/Avatar";
import { displayName, formatMessageTime } from "@/lib/utils";
import { IconAlarm, IconBookmark, IconClose } from "@/components/icons";

export interface ReminderTarget {
  context: SavedContext;
  messageId: string;
  containerId: string;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderDialog({ target, onClose }: { target: ReminderTarget | null; onClose: () => void }) {
  const { user } = useApp();
  const { t } = useI18n();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = target ? findSaved(target.context, target.messageId) : undefined;
  const pending = existing?.remind_at && !existing.reminded_at ? existing.remind_at : null;

  useEffect(() => {
    if (!target) return;
    setCustom(toLocalInput(new Date(Date.now() + 60 * 60_000)));
    setError(null);
  }, [target]);

  const apply = async (at: Date | null) => {
    if (!target || !user?.id || busy) return;
    if (at && at.getTime() <= Date.now()) {
      setError(t("Pick a time in the future."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err = existing
        ? await setReminder(user.id, existing.id, at ? at.toISOString() : null)
        : at
          ? await saveMessage(user.id, { ...target, remindAt: at.toISOString() })
          : null;
      if (err) setError(err);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClassicModal
      open={!!target}
      onClose={onClose}
      title={t("Remind me about this message")}
      subtitle={
        pending
          ? t("Currently set for {time}.", { time: formatMessageTime(pending) })
          : t("It comes back to your inbox at the time you pick, and is kept in Saved.")
      }
      centered={false}
      footer={
        <>
          {pending && (
            <button type="button" onClick={() => void apply(null)} disabled={busy} className={`${classicBtn.grey} ${classicBtn.md} mr-auto`}>
              {t("Cancel reminder")}
            </button>
          )}
          <button type="button" onClick={onClose} className={`${classicBtn.grey} ${classicBtn.md}`}>
            {t("Close")}
          </button>
        </>
      }
    >
      <div className="grid gap-1.5">
        {reminderPresets().map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={busy}
            onClick={() => void apply(preset.at)}
            className="flex h-11 items-center justify-between rounded-lg border border-border-subtle bg-bg-secondary-alt px-3.5 text-left text-[14px] font-medium text-header-primary transition-colors hover:border-border-strong hover:bg-interactive-hover disabled:opacity-50"
          >
            <span>{t(preset.label)}</span>
            <span className="text-[12px] text-text-muted">
              {preset.at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          </button>
        ))}
      </div>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const at = new Date(custom);
          if (Number.isNaN(at.getTime())) {
            setError(t("Pick a date and time."));
            return;
          }
          void apply(at);
        }}
      >
        <ClassicLabel htmlFor="reminder-custom">{t("Or pick a time")}</ClassicLabel>
        <div className="flex gap-2">
          <input
            id="reminder-custom"
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => setCustom(e.target.value)}
            className={classicInput}
          />
          <button type="submit" disabled={busy || !custom} className={`${classicBtn.brand} ${classicBtn.md} shrink-0`}>
            {t("Set")}
          </button>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-[13px] text-status-dnd">{error}</p>}
    </ClassicModal>
  );
}

export function SavedPanel({ onClose, onJump }: { onClose: () => void; onJump: (link: string, at: string | null) => void }) {
  const { user, servers } = useApp();
  const { t } = useI18n();
  const saved = useSavedMessages(user?.id);
  const [resolved, setResolved] = useState<ResolvedSaved[] | null>(null);
  const [filter, setFilter] = useState<"all" | "reminders">("all");

  useEffect(() => {
    if (!saved.loaded) return;
    let alive = true;
    void resolveSavedMessages(saved.items)
      .then((rows) => {
        if (alive) setResolved(rows);
      })
      .catch(() => {
        if (alive) setResolved([]);
      });
    return () => {
      alive = false;
    };
  }, [saved.loaded, saved.items]);

  const rows = (resolved ?? []).filter((r) => filter === "all" || (r.saved.remind_at && !r.saved.reminded_at));

  return (
    <div className="flex max-h-[520px] flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-secondary-alt px-4 py-3">
        <IconBookmark size={20} className="text-header-primary" />
        <h3 className="flex-1 text-[18px] font-semibold text-header-primary">{t("Saved")}</h3>
        <div className="flex rounded-lg border border-border-subtle p-0.5">
          {(["all", "reminders"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${filter === f ? "bg-interactive-selected text-interactive-active" : "text-text-muted hover:text-text-normal"}`}
            >
              {f === "all" ? t("All") : t("Reminders")}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="flex h-7 w-7 items-center justify-center rounded-md text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active">
          <IconClose size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {saved.unavailable ? (
          <p className="px-3 py-8 text-center text-[14px] text-text-muted">{t("Saved messages aren't available right now.")}</p>
        ) : resolved === null ? (
          <div className="space-y-2 p-1" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton-glimmer h-16 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-header-primary">{filter === "all" ? t("Nothing saved yet") : t("No reminders set")}</p>
            <p className="mt-1 text-[13px] text-text-muted">{t("Right-click a message and choose Save message to keep it here.")}</p>
          </div>
        ) : (
          rows.map((r) => {
            const server = r.serverId ? servers.find((s) => s.id === r.serverId) : null;
            const pending = r.saved.remind_at && !r.saved.reminded_at;
            return (
              <div key={r.saved.id} className="group relative mb-1 rounded-lg border border-transparent px-3 py-2.5 hover:border-border-subtle hover:bg-bg-secondary-alt">
                <div className="flex items-center gap-2 text-[12px] text-text-muted">
                  <span className="truncate font-semibold">{server ? `${server.name} · ` : ""}{r.where}</span>
                  {pending && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-px font-semibold text-brand">
                      <IconAlarm size={12} /> {formatMessageTime(r.saved.remind_at!)}
                    </span>
                  )}
                </div>
                {r.message ? (
                  <button
                    type="button"
                    onClick={() => onJump(r.link, r.message!.created_at)}
                    className="mt-1.5 flex w-full items-start gap-2.5 text-left"
                  >
                    <Avatar profile={r.message.author ?? { display_name: "?" }} size="sm" className="!h-7 !w-7 shrink-0 !text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[14px] font-semibold text-header-primary">{r.message.author ? displayName(r.message.author) : t("Unknown")}</span>
                        <span className="shrink-0 text-[11px] text-text-muted">{formatMessageTime(r.message.created_at)}</span>
                      </span>
                      <span className="line-clamp-3 break-words text-[14px] leading-5 text-text-normal">
                        {r.message.content || (r.message.hasAttachment ? t("Attachment") : "")}
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="mt-1.5 text-[14px] italic text-text-muted">{t("This message was deleted or is no longer available.")}</p>
                )}
                <button
                  type="button"
                  onClick={() => user?.id && void unsaveMessage(user.id, r.saved.id)}
                  aria-label={t("Remove from saved")}
                  title={t("Remove from saved")}
                  className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active group-hover:flex"
                >
                  <IconClose size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
