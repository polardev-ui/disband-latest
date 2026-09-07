"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ReactionSummary } from "@/lib/messages";
import { twemojiUrl } from "@/components/ui/Twemoji";
import { searchEmojis } from "@/lib/emoji-shortcodes";
import { EMOJI_CATEGORIES } from "@/lib/emoji";
import { Avatar } from "@/components/ui/Avatar";
import { useProfiles } from "@/lib/profile-store";
import { displayName } from "@/lib/utils";
import { IconClose } from "@/components/icons";

interface MessageReactionsProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  onOpenPicker?: () => void;
}

function EmojiImg({ emoji, size = "1.375em" }: { emoji: string; size?: string }) {
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={emoji}
      className="twemoji"
      draggable={false}
      style={{ height: size, width: size }}
    />
  );
}

/** How many names the hover card lists before it starts counting the rest. */
const NAMES_IN_PREVIEW = 3;

function reactorSentence(names: string[], total: number): string {
  const rest = total - names.length;
  if (names.length === 0) return total === 1 ? "1 person" : `${total} people`;
  if (rest > 0) return `${names.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The card that appears over a reaction on hover.
 *
 * It names a few of the people who reacted, which is the question anyone
 * hovering a reaction is actually asking. It is clickable — and so cannot use
 * the shared Tooltip, which is deliberately pointer-transparent — because the
 * follow-up question is "who else?", and the full list is one click away
 * rather than behind a menu.
 */
function ReactionHoverCard({
  summary, anchor, onOpenList, onEnter, onLeave,
}: {
  summary: ReactionSummary;
  anchor: DOMRect;
  onOpenList: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const preview = summary.userIds.slice(0, NAMES_IN_PREVIEW);
  const profiles = useProfiles(preview);
  const names = preview.map((id) => {
    const p = profiles.get(id);
    return p ? displayName(p) : "Someone";
  });

  return createPortal(
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[200] w-max max-w-xs -translate-x-1/2 -translate-y-full pb-2"
      style={{ left: anchor.left + anchor.width / 2, top: anchor.top }}
    >
      <button
        type="button"
        onClick={onOpenList}
        className="flex w-full items-center gap-2.5 rounded-lg bg-[#111214] px-3 py-2 text-left shadow-xl ring-1 ring-white/10 transition-colors hover:bg-[#1a1b1e]"
      >
        <EmojiImg emoji={summary.emoji} size="1.75em" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-white">
            {reactorSentence(names, summary.count)}
          </span>
          <span className="block text-[11px] text-white/45">
            reacted with {summary.emoji} · click to see everyone
          </span>
        </span>
      </button>
    </div>,
    document.body,
  );
}

/** Everyone who reacted, with a tab per emoji so one dialog answers all of them. */
function ReactionListDialog({
  reactions, initialEmoji, onClose,
}: {
  reactions: ReactionSummary[];
  initialEmoji: string;
  onClose: () => void;
}) {
  const [active, setActive] = useState(initialEmoji);
  const current = reactions.find((r) => r.emoji === active) ?? reactions[0];
  const profiles = useProfiles(current?.userIds ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-label="Reactions"
        className="relative flex max-h-[70vh] w-full max-w-sm overflow-hidden rounded-xl bg-bg-secondary shadow-2xl ring-1 ring-white/10"
      >
        {/* A column of emoji rather than a row: the count sits beside each one,
            and a message with many reactions scrolls instead of wrapping. */}
        <div className="flex w-[104px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-divider p-2">
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => setActive(r.emoji)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                r.emoji === active
                  ? "bg-interactive-selected text-text-normal"
                  : "text-text-muted hover:bg-interactive-hover"
              }`}
            >
              <EmojiImg emoji={r.emoji} size="1.35em" />
              <span className="font-semibold tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <p className="text-sm font-semibold text-text-normal">
              {current.count} {current.count === 1 ? "reaction" : "reactions"}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-text-muted hover:text-text-normal"
            >
              <IconClose size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {current.userIds.map((id) => {
              const p = profiles.get(id);
              return (
                <div key={id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                  {p
                    ? <Avatar profile={p} size="sm" />
                    : <span className="h-8 w-8 shrink-0 rounded-full bg-bg-accent" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text-normal">
                      {p ? displayName(p) : "Unknown user"}
                    </span>
                    {p?.username && (
                      <span className="block truncate text-xs text-text-muted">@{p.username}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MessageReactions({ reactions, onToggle, onOpenPicker }: MessageReactionsProps) {
  const [hovered, setHovered] = useState<{ emoji: string; rect: DOMRect } | null>(null);
  const [listFor, setListFor] = useState<string | null>(null);
  // The card sits above the pill with a gap, so the pointer crosses empty
  // space between the two. A short grace period keeps it open while it does.
  const closeTimer = useRef<number | null>(null);

  const hoveredSummary = useMemo(
    () => (hovered ? reactions.find((r) => r.emoji === hovered.emoji) ?? null : null),
    [hovered, reactions],
  );

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const keepOpen = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    keepOpen();
    closeTimer.current = window.setTimeout(() => setHovered(null), 120);
  };

  if (reactions.length === 0 && !onOpenPicker) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          onMouseEnter={(e) => {
            keepOpen();
            setHovered({ emoji: r.emoji, rect: e.currentTarget.getBoundingClientRect() });
          }}
          onMouseLeave={scheduleClose}
          className={`inline-flex h-[26px] items-center gap-1.5 rounded-lg border px-2 text-[13px] transition-colors ${
            r.reacted
              ? "border-brand/50 bg-brand/20 text-text-normal"
              : "border-divider bg-bg-secondary text-text-muted hover:border-brand/30 hover:bg-interactive-hover"
          }`}
        >
          <EmojiImg emoji={r.emoji} />
          <span className="font-semibold tabular-nums">{r.count}</span>
        </button>
      ))}
      {onOpenPicker && (
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex h-[26px] w-[30px] items-center justify-center rounded-lg border border-divider bg-bg-secondary text-base text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          aria-label="Add reaction"
        >
          +
        </button>
      )}

      {hovered && hoveredSummary && !listFor && (
        <ReactionHoverCard
          summary={hoveredSummary}
          anchor={hovered.rect}
          onEnter={keepOpen}
          onLeave={scheduleClose}
          onOpenList={() => { setListFor(hoveredSummary.emoji); setHovered(null); }}
        />
      )}

      {listFor && (
        <ReactionListDialog
          reactions={reactions}
          initialEmoji={listFor}
          onClose={() => setListFor(null)}
        />
      )}
    </div>
  );
}

export function ReactionPicker({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const searched = useMemo(() => (q ? searchEmojis(q, 60) : []), [q]);

  if (!open) return null;

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-xl border border-divider bg-bg-secondary shadow-2xl sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="border-b border-divider px-4 py-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            autoFocus
            className="w-full rounded bg-bg-primary px-3 py-2 text-sm text-text-normal placeholder:text-text-muted outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          {q ? (
            <div className="grid grid-cols-10 gap-1">
              {searched.map(({ emoji, shortcode }) => (
                <button
                  key={emoji + shortcode}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  title={shortcode}
                  className="flex h-9 w-9 items-center justify-center rounded hover:bg-interactive-hover"
                >
                  <EmojiImg emoji={emoji} size="1.3em" />
                </button>
              ))}
              {searched.length === 0 && (
                <p className="col-span-10 py-8 text-center text-xs text-text-muted">No emoji found</p>
              )}
            </div>
          ) : (
            EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.name} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{cat.name}</p>
                <div className="grid grid-cols-10 gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      title={emoji}
                      className="flex h-9 w-9 items-center justify-center rounded hover:bg-interactive-hover"
                    >
                      <EmojiImg emoji={emoji} size="1.3em" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
