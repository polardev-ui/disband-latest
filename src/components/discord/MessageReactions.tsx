"use client";

import { QUICK_REACTIONS, type ReactionSummary } from "@/lib/messages";
import { twemojiUrl } from "@/components/ui/Twemoji";

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
  x,
  y,
  onSelect,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={onClose} />
      <div
        className="fixed z-50 flex gap-1 rounded-lg border border-divider bg-bg-secondary p-2 shadow-xl"
        style={{ left: Math.min(x, window.innerWidth - 280), top: Math.min(y, window.innerHeight - 56) }}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onSelect(emoji); onClose(); }}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-interactive-hover"
          >
            <EmojiImg emoji={emoji} />
          </button>
        ))}
      </div>
    </>
  );
}
