"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { ChatMessage, shouldGroupMessages, buildReplyPreviews, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ReactionPicker } from "./MessageReactions";
import { IconHash } from "@/components/icons";
import { formatTypingLabel, useTypingPresence } from "@/hooks/useTypingPresence";
import type { MessageSendOptions, MessageContext, MessageReaction, ReplyPreview } from "@/lib/messages";
import type { Profile, ServerRole } from "@/lib/supabase/types";

export interface ChatCanvasHandle {
  setReplyTo: (reply: ReplyPreview | null) => void;
  setEditing: (edit: { id: string; content: string } | null) => void;
  openReactionPicker: (messageId: string, x: number, y: number) => void;
}

interface ChatCanvasProps {
  channelName: string;
  messages: ChatMessageData[];
  members: Profile[];
  roles?: ServerRole[];
  currentUserId?: string | null;
  currentUserName?: string | null;
  messageContext: MessageContext;
  reactions?: MessageReaction[];
  getAuthorColor?: (authorId: string) => string | null | undefined;
  headerExtra?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  callPanel?: React.ReactNode;
  channelIcon?: React.ReactNode;
  typingScope?: { kind: "channel" | "dm"; id: string } | null;
  onSend: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  onEdit?: (messageId: string, content: string) => Promise<string | null>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onMessageContext: (message: ChatMessageData, x: number, y: number) => void;
  onAuthorClick?: (profile: Profile) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export const ChatCanvas = forwardRef<ChatCanvasHandle, ChatCanvasProps>(function ChatCanvas(
  {
    channelName,
    messages,
    members,
    roles = [],
    currentUserId,
    currentUserName,
    messageContext,
    reactions = [],
    getAuthorColor,
    headerExtra,
    headerTrailing,
    callPanel,
    channelIcon,
    typingScope = null,
    onSend,
    onEdit,
    onToggleReaction,
    onMessageContext,
    onAuthorClick,
    onLoadMore,
    hasMore,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ messageId: string; x: number; y: number } | null>(null);

  const typingSelf =
    currentUserId && currentUserName
      ? { id: currentUserId, name: currentUserName }
      : null;
  const { typers, notifyTyping } = useTypingPresence(typingScope, typingSelf);
  const typingLabel = formatTypingLabel(typers, typingScope?.kind === "channel");

  useImperativeHandle(ref, () => ({
    setReplyTo,
    setEditing,
    openReactionPicker: (messageId, x, y) => setPicker({ messageId, x, y }),
  }));

  const enriched = useMemo(() => buildReplyPreviews(messages), [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const target = contentRef.current;
    if (!target) return;
    const ro = new ResizeObserver(() => scrollToBottom());
    ro.observe(target);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  function jumpToMessage(messageId: string) {
    const node = document.getElementById(`msg-${messageId}`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(messageId);
      setTimeout(() => setHighlightId(null), 2000);
    }
  }

  async function handleSend(content: string, options?: MessageSendOptions) {
    if (editing && onEdit) {
      const err = await onEdit(editing.id, content);
      if (!err) setEditing(null);
      return err;
    }
    return onSend(content, options);
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        {channelIcon ?? <IconHash size={24} className="text-text-muted" />}
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{channelName}</h1>
        <span className="hidden text-xs text-text-muted sm:inline">{messages.length} messages</span>
        {headerExtra}
        {headerTrailing}
      </header>

      {callPanel && <div className="shrink-0">{callPanel}</div>}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
        <div ref={contentRef}>
          {hasMore && onLoadMore && (
            <div className="mb-4 flex justify-center px-4">
              <button
                type="button"
                onClick={onLoadMore}
                className="rounded-full bg-bg-accent px-4 py-1.5 text-xs font-medium text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              >
                Load earlier messages
              </button>
            </div>
          )}

          <div className="mb-4 flex items-center px-4">
            <div className="h-px flex-1 bg-divider" />
            <span className="mx-4 text-xs font-semibold text-text-muted">Welcome to #{channelName}</span>
            <div className="h-px flex-1 bg-divider" />
          </div>

          {enriched.map((msg, i) => {
            const prev = enriched[i - 1];
            const grouped = shouldGroupMessages(prev, msg);
            const showHeader = !grouped;
            const msgReactions = reactions.filter(
              (r) => r.context_type === messageContext && r.message_id === msg.id,
            );
            return (
              <ChatMessage
                key={msg.id}
                message={msg}
                showHeader={showHeader}
                compact={grouped}
                currentUserId={currentUserId}
                authorColor={getAuthorColor?.(msg.author_id)}
                reactions={msgReactions}
                onAuthorClick={onAuthorClick}
                members={members}
                highlight={highlightId === msg.id}
                onJumpToReply={jumpToMessage}
                onToggleReaction={
                  onToggleReaction ? (emoji) => onToggleReaction(msg.id, emoji) : undefined
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMessageContext(msg, e.clientX, e.clientY);
                }}
                onDoubleClick={
                  onToggleReaction
                    ? () => onToggleReaction(msg.id, "👍")
                    : undefined
                }
                onContentResize={scrollToBottom}
              />
            );
          })}
        </div>
      </div>

      <ReactionPicker
        open={!!picker}
        x={picker?.x ?? 0}
        y={picker?.y ?? 0}
        onSelect={(emoji) => picker && onToggleReaction?.(picker.messageId, emoji)}
        onClose={() => setPicker(null)}
      />

      <div className="shrink-0">
        {typingLabel && (
          <p className="truncate px-4 pb-1 text-xs font-medium text-text-muted">{typingLabel}</p>
        )}
        <ChatInput
          placeholder={`Message #${channelName}`}
          members={members}
          roles={roles}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          editingMessageId={editing?.id ?? null}
          editingContent={editing?.content}
          onCancelEdit={() => setEditing(null)}
          onSend={handleSend}
          onTypingActivity={notifyTyping}
        />
      </div>
    </main>
  );
});
