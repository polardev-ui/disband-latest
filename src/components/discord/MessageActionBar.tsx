"use client";

import { useMemo } from "react";
import type { ChatMessageData } from "./ChatMessage";
import type { ReplyPreview } from "@/lib/messages";

const QUICK_EMOJIS = ["\u{1f44d}", "\u{2764}\u{fe0f}", "\u{1f602}", "\u{1f62e}", "\u{1f622}"];

interface MessageActionBarProps {
  message: ChatMessageData;
  currentUserId?: string | null;
  onReply?: (reply: ReplyPreview) => void;
  onForward?: () => void;
  onEdit?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onOpenReactionPicker?: () => void;
  onMoreActions?: (e: React.MouseEvent) => void;
}

export function MessageActionBar({
  message,
  currentUserId,
  onReply,
  onForward,
  onEdit,
  onToggleReaction,
  onOpenReactionPicker,
  onMoreActions,
}: MessageActionBarProps) {
  const replyPreview: ReplyPreview | null = useMemo(() => {
    if (!message.id) return null;
    return {
      id: message.id,
      author_id: message.author_id,
      content: message.content,
      attachment_type: message.attachment_type,
      author: message.author
        ? { id: message.author.id, username: message.author.username, display_name: message.author.display_name }
        : undefined,
    };
  }, [message]);

  const isOwn = message.author_id === currentUserId;

  return (
    <div
      className="absolute -top-4 right-3.5 z-10 flex items-center rounded-[4px] border border-bg-tertiary bg-bg-primary opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:[&>:not(:last-child)]:hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggleReaction?.(emoji)}
          className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-base leading-none transition-colors hover:bg-interactive-hover"
          title={emoji}
        >
          {emoji}
        </button>
      ))}

      <div className="h-6 w-px bg-divider/70" />

      <button
        type="button"
        onClick={onOpenReactionPicker}
        className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        title="Add Reaction"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onReply?.(replyPreview!)}
        className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        title="Reply"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </button>

      {isOwn ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          title="Edit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={onForward}
          className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          title="Forward"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onMoreActions}
        className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        title="More"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
    </div>
  );
}
