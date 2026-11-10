"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { IconClose, IconForum, IconHash, IconMegaphone, IconSpeaker, IconStage } from "@/components/icons";
import type { ChannelCategory } from "@/lib/supabase/types";
import { useI18n } from "@/contexts/I18nContext";

export type NewChannelKind = "text" | "announcement" | "forum" | "voice" | "stage";

interface CreateChannelModalProps {
  /** Open with this category preselected (null = no category); undefined closes. */
  target: { categoryId: string | null } | null;
  categories: ChannelCategory[];
  onClose: () => void;
  /** Resolves to an error message, or null on success. */
  onCreate: (name: string, kind: NewChannelKind, categoryId: string | null) => Promise<string | null>;
}

const KINDS: { kind: NewChannelKind; title: string; hint: string; icon: (size: number) => ReactNode }[] = [
  { kind: "text", title: "Text", hint: "Send messages, images, GIFs, polls and files", icon: (s) => <IconHash size={s} /> },
  { kind: "announcement", title: "Announcement", hint: "Important updates only moderators can post", icon: (s) => <IconMegaphone size={s} /> },
  { kind: "forum", title: "Forum", hint: "Organised posts with titles and tags, each with its own replies", icon: (s) => <IconForum size={s} /> },
  { kind: "voice", title: "Voice", hint: "Hang out together with voice, video and screen share", icon: (s) => <IconSpeaker size={s} /> },
  { kind: "stage", title: "Stage", hint: "Host events with speakers and an audience", icon: (s) => <IconStage size={s} /> },
];

const PLACEHOLDER: Record<NewChannelKind, string> = {
  text: "new-channel",
  announcement: "announcements",
  forum: "help-desk",
  voice: "Lounge",
  stage: "Town hall",
};

/**
 * Create a channel: pick what kind it is from the described options, name it
 * with a live preview of how it will look in the list, and choose where it
 * goes. Replaces the tiny inline box in the channel list.
 */
export function CreateChannelModal({ target, categories, onClose, onCreate }: CreateChannelModalProps) {
  const { t } = useI18n();
  const open = target !== null;
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  const [kind, setKind] = useState<NewChannelKind>("text");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setKind("text");
    setName("");
    setCategoryId(target.categoryId);
    setError(null);
    setBusy(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [target]);

  if (!mounted) return null;

  const trimmed = name.trim().slice(0, 100);
  const sorted = [...categories].sort((a, b) => a.position - b.position);
  const current = KINDS.find((k) => k.kind === kind)!;

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const err = await onCreate(trimmed, kind, categoryId);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-overlay-scrim overlay-fade${exiting ? " overlay-fade-out" : ""} p-4`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Create Channel")}
        className={`modal-pop${exiting ? " modal-pop-out" : ""} flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-secondary shadow-[var(--elevation-high)]`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-header-primary">{t("Create Channel")}</h2>
            <p className="truncate text-[13px] text-text-muted">
              {categoryId
                ? t("in {name}", { name: sorted.find((c) => c.id === categoryId)?.name ?? "" })
                : t("Not in a category")}
            </p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose} className="text-interactive-normal hover:text-interactive-active">
            <IconClose size={22} />
          </button>
        </div>

        <form
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="mb-2 mt-3 text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Channel type")}</p>
          <div role="radiogroup" aria-label={t("Channel type")} className="space-y-2">
            {KINDS.map((k) => {
              const selected = k.kind === kind;
              return (
                <button
                  key={k.kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setKind(k.kind)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selected ? "bg-interactive-selected ring-1 ring-brand/60" : "bg-bg-tertiary hover:bg-interactive-hover"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-brand/20 text-brand" : "bg-bg-secondary text-interactive-normal"}`}>
                    {k.icon(20)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-text-normal">{t(k.title)}</span>
                    <span className="block text-[13px] leading-snug text-text-muted">{t(k.hint)}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand" : "border-interactive-normal"}`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </span>
                </button>
              );
            })}
          </div>

          <label htmlFor="new-channel-name" className="mb-2 mt-5 block text-[12px] font-bold uppercase tracking-wide text-header-secondary">
            {t("Channel name")}
          </label>
          <div className="flex items-center gap-2 rounded-md bg-bg-tertiary px-3 focus-within:ring-2 focus-within:ring-brand">
            <span className="shrink-0 text-text-muted">{current.icon(18)}</span>
            <input
              id="new-channel-name"
              ref={inputRef}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(PLACEHOLDER[kind])}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-text-normal outline-none placeholder:text-text-muted"
            />
          </div>

          {sorted.length > 0 && (
            <>
              <label htmlFor="new-channel-category" className="mb-2 mt-5 block text-[12px] font-bold uppercase tracking-wide text-header-secondary">
                {t("Category")}
              </label>
              <select
                id="new-channel-category"
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(e.target.value || null)}
                className="w-full rounded-md bg-bg-tertiary px-3 py-2.5 text-[15px] text-text-normal outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">{t("No category")}</option>
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Preview")}</p>
          <div className="flex h-9 items-center gap-1.5 rounded-lg bg-bg-tertiary px-2 text-[16px] font-medium text-interactive-active">
            <span className="shrink-0 text-interactive-active/70">{current.icon(20)}</span>
            <span className="truncate">{trimmed || t(PLACEHOLDER[kind])}</span>
          </div>

          {error ? <p role="alert" className="mt-3 text-[13px] text-red-400">{error}</p> : null}
        </form>

        <div className="flex items-center justify-end gap-3 bg-bg-tertiary/60 px-5 py-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-[14px] font-medium text-text-normal hover:underline">
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!trimmed || busy}
            className="rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <LoadingDots size={6} className="mx-auto" /> : t("Create Channel")}
          </button>
        </div>
      </div>
    </div>
  );
}
