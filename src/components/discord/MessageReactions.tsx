"use client";

import { useMemo, useState } from "react";
import { type ReactionSummary } from "@/lib/messages";
import { twemojiUrl } from "@/components/ui/Twemoji";
import { searchEmojis } from "@/lib/emoji-shortcodes";
import { EMOJI_CATEGORIES } from "@/lib/emoji";

interface MessageReactionsProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  onOpenPicker?: () => void;
}

function EmojiImg({ emoji, size = "1.1em" }: { emoji: string; size?: string }) {
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

export function MessageReactions({ reactions, onToggle, onOpenPicker }: MessageReactionsProps) {
  if (reactions.length === 0 && !onOpenPicker) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            r.reacted
              ? "border-brand/50 bg-brand/20 text-text-normal"
              : "border-divider bg-bg-secondary text-text-muted hover:border-brand/30 hover:bg-interactive-hover"
          }`}
          title={r.count === 1 ? "1 reaction" : `${r.count} reactions`}
        >
          <EmojiImg emoji={r.emoji} />
          <span className="font-semibold tabular-nums">{r.count}</span>
        </button>
      ))}
      {onOpenPicker && (
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-divider bg-bg-secondary text-sm text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          aria-label="Add reaction"
        >
          +
        </button>
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
