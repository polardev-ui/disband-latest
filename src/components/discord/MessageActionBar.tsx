"use client";

import { useI18n } from "@/contexts/I18nContext";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ChatMessageData } from "./ChatMessage";
import { toReplyAuthor, type ReplyPreview } from "@/lib/messages";
import { useMessageQuickActions } from "./message-quick-actions";
import { IconBookmark, IconEdit, IconForward, IconPin, IconPinOff, IconTrash } from "@/components/icons";

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
  const { t } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [rowHovered, setRowHovered] = useState(false);
  const [shift, setShift] = useState(false);
  const quickActions = useMessageQuickActions();

  // Hovering anywhere on the message counts, not just the bar: the bar sits
  // inside the message row (the nearest .group).
  useEffect(() => {
    const row = barRef.current?.parentElement?.closest(".group") ?? barRef.current?.parentElement;
    if (!row) return;
    const enter = () => setRowHovered(true);
    const leave = () => setRowHovered(false);
    row.addEventListener("mouseenter", enter);
    row.addEventListener("mouseleave", leave);
    return () => {
      row.removeEventListener("mouseenter", enter);
      row.removeEventListener("mouseleave", leave);
    };
  }, []);

  // Holding Shift over a message shows its quick actions in the bar, as in
  // Discord. Only the hovered message listens for the key.
  useEffect(() => {
    if (!rowHovered) {
      setShift(false);
      return;
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShift(e.type === "keydown");
    };
    // Shift may already be down when the pointer arrives.
    const move = (e: MouseEvent) => setShift(e.shiftKey);
    const reset = () => setShift(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("mousemove", move);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("blur", reset);
    };
  }, [rowHovered]);

  const expanded = shift && rowHovered && !!quickActions;
  const extra = useMemo(() => {
    if (!expanded || !quickActions) return null;
    const items = quickActions(message);
    const pick = (id: string) => items.find((i) => i.id === id && !i.disabled && i.onClick);
    return { copyId: pick("copy-id"), save: pick("save"), pin: pick("pin"), del: pick("delete") };
  }, [expanded, quickActions, message]);

  const replyPreview: ReplyPreview | null = useMemo(() => {
    if (!message.id) return null;
    return {
      id: message.id,
      author_id: message.author_id,
      content: message.content,
      attachment_type: message.attachment_type,
      author: toReplyAuthor(message.author),
    };
  }, [message]);

  const isOwn = message.author_id === currentUserId;

  // Touch-only devices can't hover, so they always get the "more" button.
  // That rule keys on any-hover, not hover: touchscreen laptops and tablets
  // with a mouse report hover:none for their primary input, which put a
  // stray ⋮ box beside every message for people who can hover just fine.
  return (
    <div
      className="absolute -top-4 right-3.5 z-10 flex items-center overflow-hidden rounded-lg border border-border-subtle bg-bg-floating opacity-0 shadow-[var(--elevation-high)] group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(any-hover:none)]:opacity-100 [@media(any-hover:none)]:[&>:not(:last-child)]:hidden"
      ref={barRef}
      onClick={(e) => e.stopPropagation()}
    >
      {extra && (
        <>
          {extra.copyId && (
            <QuickButton title={t("Copy Message ID")} onClick={extra.copyId.onClick!}>
              <span className="rounded-[4px] border-[1.5px] border-current px-[2px] text-[9px] font-extrabold leading-[12px]">ID</span>
            </QuickButton>
          )}
          {extra.save && (
            <QuickButton title={extra.save.label} onClick={extra.save.onClick!}>
              <IconBookmark size={16} />
            </QuickButton>
          )}
          {extra.pin && (
            <QuickButton title={extra.pin.label} onClick={extra.pin.onClick!}>
              {/^unpin/i.test(extra.pin.label) ? <IconPinOff size={16} /> : <IconPin size={16} />}
            </QuickButton>
          )}
          <div className="h-6 w-px bg-divider/70" />
        </>
      )}
      {!extra && QUICK_EMOJIS.map((emoji) => (
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

      {!extra && <div className="h-6 w-px bg-divider/70" />}

      <button
        type="button"
        onClick={onOpenReactionPicker}
        className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        title={t("Add Reaction")}
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
        title={t("Reply")}
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
          title={t("Edit")}
        >
          <IconEdit size={17} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onForward}
          className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
          title={t("Forward")}
        >
          <IconForward size={17} strokeWidth={2} />
        </button>
      )}

      {extra?.del ? (
        // Shift-delete skips the menu, as in Discord.
        <QuickButton title={extra.del.label} onClick={extra.del.onClick!} danger>
          <IconTrash size={16} />
        </QuickButton>
      ) : (
      <button
        type="button"
        onClick={onMoreActions}
        className="flex h-8 w-8 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 items-center justify-center text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        title={t("More")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      )}
    </div>
  );
}

function QuickButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center transition-colors hover:bg-interactive-hover ${
        danger ? "text-status-dnd hover:text-status-dnd" : "text-interactive-normal hover:text-interactive-active"
      }`}
    >
      {children}
    </button>
  );
}
