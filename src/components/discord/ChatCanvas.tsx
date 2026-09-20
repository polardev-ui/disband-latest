"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import { ChatMessage, shouldGroupMessages, buildReplyPreviews, type ChatMessageData } from "./ChatMessage";
import { MessageSkeleton } from "./MessageSkeleton";
import { ChatInput } from "./ChatInput";
import { ReactionPicker } from "./MessageReactions";
import { IconHash, IconShield } from "@/components/icons";
import { useTypingPresence } from "@/hooks/useTypingPresence";
import { TypingIndicator } from "./TypingIndicator";
import type { MessageSendOptions, MessageContext, MessageReaction, ReplyPreview } from "@/lib/messages";
import type { ChannelLite } from "@/lib/markdown";
import {
  findNewMessagesDividerId,
  markChatReadNow,
  setReadCursor,
  type ReadCursorScope,
} from "@/lib/read-cursors";
import {
  clearUnreadJump,
  isSeekingUnreadJump,
} from "@/lib/notification-jump";
import type { Profile, ServerRole } from "@/lib/supabase/types";

function NewMessagesDivider() {
  return (
    <div
      className="divider-in relative my-3 flex items-center px-4"
      role="separator"
      aria-label="New messages"
    >
      <div className="h-px flex-1 bg-status-dnd" />
      <span className="ml-2 shrink-0 rounded bg-status-dnd px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        New
      </span>
    </div>
  );
}

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

  reactionsEnabled?: boolean;
  getAuthorColor?: (authorId: string) => string | null | undefined;
  headerExtra?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  callPanel?: React.ReactNode;
  channelIcon?: React.ReactNode;

  introText?: string;

  placeholder?: string;

  composerLockedReason?: string | null;
  typingScope?: { kind: "channel" | "dm" | "group"; id: string; serverId?: string } | null;

  channels?: ChannelLite[];

  customEmoji?: Record<string, string>;

  onChannelClick?: (channelId: string) => void;
  readCursorScope?: ReadCursorScope | null;
  onSend: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  onEdit?: (messageId: string, content: string) => Promise<string | null>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onForward?: (message: ChatMessageData) => void;
  onMessageContext: (message: ChatMessageData, x: number, y: number) => void;
  onAuthorClick?: (profile: Profile) => void;
  onAuthorContextMenu?: (profile: Profile, e: React.MouseEvent) => void;
  onLoadMore?: () => void | Promise<void>;
  hasMore?: boolean;
  maxUploadBytes?: number;

  loading?: boolean;
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
    reactionsEnabled = true,
    getAuthorColor,
    headerExtra,
    headerTrailing,
    callPanel,
    channelIcon,
    introText,
    placeholder,
    composerLockedReason,
    typingScope = null,
    readCursorScope = null,
    channels,
    customEmoji,
    onChannelClick,
    onSend,
    onEdit,
    onToggleReaction,
    onForward,
    onMessageContext,
    onAuthorClick,
    onAuthorContextMenu,
    onLoadMore,
    hasMore,
    maxUploadBytes,
    loading = false,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(0);
  const scrollRestoreRef = useRef<number | null>(null);
  // Holds the user's position while async content (images, link previews)
  // settles after older messages load, so the view doesn't jump around.
  const topAnchorRef = useRef<{ dist: number; until: number } | null>(null);
  // Own-send intent: a user's own message must always come into view, even
  // if they were reading slightly scrolled up (where the follow gate below
  // would otherwise hold their position).
  const followOnceRef = useRef(false);
  const tickingRef = useRef(false);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [newMessagesDividerId, setNewMessagesDividerId] = useState<string | null>(null);
  const [composerFocus, setComposerFocus] = useState(0);
  const readScopeRef = useRef<ReadCursorScope | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const typingSelf = useMemo(
    () => (currentUserId && currentUserName ? { id: currentUserId, name: currentUserName } : null),
    [currentUserId, currentUserName],
  );
  const { typers, notifyTyping } = useTypingPresence(typingScope, typingSelf);
  const handleTypingActivity = useCallback(() => {
    notifyTyping();
  }, [notifyTyping]);

  useImperativeHandle(ref, () => ({
    setReplyTo,
    setEditing,
    openReactionPicker: (messageId, x, y) => setPicker({ messageId, x, y }),
  }));

  const enriched = useMemo(() => buildReplyPreviews(messages), [messages]);

  // Distance (px) from the bottom within which content growth (new messages,
  // image/preview loads) follows the user down. Beyond this the user is
  // considered to be reading and their position is held instead of yanked.
  const NEAR_BOTTOM_PX = 40;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto", force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!force && el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX) return;
    stickToBottomRef.current = true;
    programmaticScrollRef.current = Date.now();
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const requestLoadMore = useCallback(async () => {
    if (!hasMore || !onLoadMore || loadingMoreRef.current) return;
    const el = scrollRef.current;
    if (el) scrollRestoreRef.current = el.scrollHeight - el.scrollTop;
    loadingMoreRef.current = true;
    try {
      await onLoadMore();
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, onLoadMore]);

  useEffect(() => {
    stickToBottomRef.current = true;
    prevFirstIdRef.current = null;
    prevMessageCountRef.current = 0;
    scrollRestoreRef.current = null;
  }, [channelName, messageContext, typingScope?.id, readCursorScope?.kind, readCursorScope?.id]);

  useEffect(() => {
    setComposerFocus((c) => c + 1);
  }, [channelName, messageContext, typingScope?.id, readCursorScope?.kind, readCursorScope?.id]);

  useEffect(() => {
    const prevScope = readScopeRef.current;
    const nextScope = readCursorScope ?? null;

    if (
      prevScope
      && (!nextScope || prevScope.kind !== nextScope.kind || prevScope.id !== nextScope.id)
      && messagesRef.current.length > 0
    ) {
      setReadCursor(prevScope, messagesRef.current);
    }

    readScopeRef.current = nextScope;
    setNewMessagesDividerId(null);
  }, [readCursorScope?.kind, readCursorScope?.id]);

  // Recomputed on every message change with no once-per-scope lock: the
  // stored read cursor can advance while the scope is active (e.g. new
  // arrivals after a read), which previously left a stale divider behind.
  // Recomputing is a no-op visually when the cursor hasn't moved, since the
  // divider is keyed by message id.
  useEffect(() => {
    if (!readCursorScope || messages.length === 0) return;
    setNewMessagesDividerId(findNewMessagesDividerId(messages, readCursorScope));
  }, [messages, readCursorScope]);

  useEffect(() => {
    return () => {
      const scope = readScopeRef.current;
      if (scope && messagesRef.current.length > 0) {
        setReadCursor(scope, messagesRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Collapsed to one handling per frame: during momentum scrolling near
    // the top the raw event fires dozens of times per second and used to
    // re-evaluate (and re-fire) load-more on every one.
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        tickingRef.current = false;
        if (Date.now() - programmaticScrollRef.current < 250) return;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        // The user took over: cancel any top-anchoring from a paginate.
        topAnchorRef.current = null;
        if (el.scrollTop < 96) void requestLoadMore();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [requestLoadMore]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const firstId = messages[0]?.id ?? null;
    const count = messages.length;
    const prevFirst = prevFirstIdRef.current;
    const prevCount = prevMessageCountRef.current;
    const loadedOlder =
      count > prevCount && prevFirst !== null && firstId !== prevFirst;
    prevFirstIdRef.current = firstId;
    prevMessageCountRef.current = count;

    if (scrollRestoreRef.current !== null) {
      const dist = scrollRestoreRef.current;
      el.scrollTop = el.scrollHeight - dist;
      // Keep holding this position briefly: images and link previews inside
      // the newly loaded messages resolve async and grow the content, which
      // would otherwise jump the view on every load. Any manual scroll
      // cancels the anchor (see the scroll handler).
      topAnchorRef.current = { dist, until: Date.now() + 1500 };
      programmaticScrollRef.current = Date.now();
      scrollRestoreRef.current = null;
      return;
    }

    if (loadedOlder) return;
    // First population always lands at the bottom. Appends follow only when
    // the user is near the bottom or just sent the message themselves;
    // edits and reaction-only updates never steal the scroll.
    const firstLoad = prevCount === 0 && count > 0;
    const appended = count > prevCount;
    scrollToBottom("auto", firstLoad || (appended && followOnceRef.current));
    followOnceRef.current = false;
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    const target = contentRef.current;
    if (!el || !target) return;
    const ro = new ResizeObserver(() => {
      const anchor = topAnchorRef.current;
      if (anchor && Date.now() < anchor.until) {
        el.scrollTop = el.scrollHeight - anchor.dist;
        programmaticScrollRef.current = Date.now();
        return;
      }
      topAnchorRef.current = null;
      scrollToBottom();
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // Notification-click seek: land on the first unread message (where the
  // ping sits), paging back until its row is loaded. Runs only for the
  // scope the notification targeted; anything else ignores it.
  useEffect(() => {
    if (!readCursorScope || loading || messages.length === 0) return;
    if (!isSeekingUnreadJump(readCursorScope.kind, readCursorScope.id)) return;
    const dividerId = findNewMessagesDividerId(messages, readCursorScope);
    if (!dividerId) {
      clearUnreadJump();
      return;
    }
    if (document.getElementById(`msg-${dividerId}`)) {
      jumpToMessage(dividerId);
      clearUnreadJump();
      return;
    }
    if (hasMore && onLoadMore && !loadingMoreRef.current) {
      void requestLoadMore();
    }
  });

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
    stickToBottomRef.current = true;
    followOnceRef.current = true;
    // A failed own send must not erase the "New" divider for everyone else's
    // messages: only clear once the send actually lands.
    const err = await onSend(content, options);
    if (!err) {
      setNewMessagesDividerId(null);
      if (readCursorScope) markChatReadNow(readCursorScope);
    }
    return err;
  }

  return (
    <main className="view-enter flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        {channelIcon ?? <IconHash size={24} className="text-text-muted" />}
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{channelName}</h1>
        {headerExtra}
        {headerTrailing}
      </header>

      {callPanel && <div className="shrink-0">{callPanel}</div>}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
        <div ref={contentRef}>
          {loading && messages.length === 0 ? (
            <MessageSkeleton />
          ) : (
            <>
              {hasMore && onLoadMore && (
                <div className="mb-4 flex justify-center px-4">
                  <button
                    type="button"
                    onClick={() => void requestLoadMore()}
                    className="rounded-full bg-bg-accent px-4 py-1.5 text-xs font-medium text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                  >
                    Load earlier messages
                  </button>
                </div>
              )}

              {/* Welcome banner only at true history start: while older
                  messages can still load, this sits mid-history. */}
              {!hasMore && (
              <div className="mb-4 flex items-center px-4">
                <div className="h-px flex-1 bg-divider" />
                <span className="mx-4 text-xs font-semibold text-text-muted">
                  {introText ?? `Welcome to #${channelName}`}
                </span>
                <div className="h-px flex-1 bg-divider" />
              </div>
              )}

              {enriched.map((msg, i) => {
            const prev = enriched[i - 1];
            const grouped = shouldGroupMessages(prev, msg, currentUserId, currentUserName);
            const showHeader = !grouped;
            const msgReactions = reactions.filter(
              (r) => r.context_type === messageContext && r.message_id === msg.id,
            );
            return (
              <div key={msg.id}>
                {newMessagesDividerId === msg.id && <NewMessagesDivider />}
                <ChatMessage
                  message={msg}
                  showHeader={showHeader}
                  compact={grouped}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  authorColor={msg.author_id ? getAuthorColor?.(msg.author_id) : null}
                  reactions={msgReactions}
                  onAuthorClick={onAuthorClick}
                  onAuthorContextMenu={onAuthorContextMenu}
                  members={members}
                  channels={channels}
                  customEmoji={customEmoji}
                  onChannelClick={onChannelClick}
                  highlight={highlightId === msg.id}
                  onJumpToReply={jumpToMessage}
                  onToggleReaction={
                    onToggleReaction && reactionsEnabled ? (emoji) => onToggleReaction(msg.id, emoji) : undefined
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onMessageContext(msg, e.clientX, e.clientY);
                  }}
                  onReply={
                    onToggleReaction && reactionsEnabled
                      ? (reply: ReplyPreview) => {
                          setReplyTo(reply);
                        }
                      : undefined
                  }
                  onOpenReactionPicker={
                    onToggleReaction && reactionsEnabled
                      ? () => setPicker({ messageId: msg.id, x: 0, y: 0 })
                      : undefined
                  }
                  onForward={onForward ? () => onForward(msg) : undefined}
                  onDoubleClick={
                    onToggleReaction && reactionsEnabled
                      ? () => onToggleReaction(msg.id, "👍")
                      : undefined
                  }
                  onContentResize={() => scrollToBottom()}
                />
              </div>
            );
          })}
            </>
          )}
        </div>
      </div>

      <ReactionPicker
        open={!!picker}
        onSelect={(emoji) => picker && onToggleReaction?.(picker.messageId, emoji)}
        onClose={() => setPicker(null)}
      />

      <div className="shrink-0">
        <TypingIndicator
          typers={typers}
          members={members}
          groupContext={messageContext === "channel" || messageContext === "group"}
        />
        {composerLockedReason ? (
          <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-divider bg-bg-secondary px-4 py-3">
            <IconShield size={15} className="shrink-0 text-text-muted" />
            <p className="text-[14px] text-text-muted">{composerLockedReason}</p>
          </div>
        ) : (
        <ChatInput
          placeholder={placeholder ?? `Message #${channelName}`}
          members={members}
          roles={roles}
          channels={channels}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          editingMessageId={editing?.id ?? null}
          editingContent={editing?.content}
          onCancelEdit={() => setEditing(null)}
          onSend={handleSend}
          onTypingActivity={handleTypingActivity}
          maxUploadBytes={maxUploadBytes}
          serverId={typingScope?.serverId}
          allowPolls={messageContext === "channel" || messageContext === "group"}
          focusSignal={composerFocus}
        />
        )}
      </div>
    </main>
  );
});
