"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  forwardRef,
} from "react";
import { ChatMessage, shouldGroupMessages, buildReplyPreviews, type ChatMessageData } from "./ChatMessage";
import { MessageSkeleton } from "./MessageSkeleton";
import { ChatInput } from "./ChatInput";
import { ReactionPicker } from "./MessageReactions";
import { IconHash, IconShield } from "@/components/icons";
import { useTypingPresence } from "@/hooks/useTypingPresence";
import { TypingIndicator } from "./TypingIndicator";
import { useApp } from "@/contexts/AppContext";
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
  seekingTimestamp,
} from "@/lib/notification-jump";
import type { Profile, ServerRole } from "@/lib/supabase/types";

function NewMessagesDivider({ animate = true }: { animate?: boolean }) {
  return (
    <div
      className={`${animate ? "divider-in " : ""}relative mx-4 mb-2 mt-6 flex h-0 items-center border-t border-status-dnd`}
      role="separator"
      aria-label="New messages"
    >
      <span className="absolute -top-[9px] right-0 rounded-[8px] rounded-l-none bg-status-dnd py-px pl-1 pr-1.5 text-[10px] font-bold uppercase leading-[13px] text-white before:absolute before:-left-[5px] before:top-0 before:h-full before:w-[6px] before:bg-status-dnd before:[clip-path:polygon(100%_0,100%_100%,0_50%)]">
        New
      </span>
    </div>
  );
}

/** The "@" that heads a direct message. */
function AtIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10c1.466 0 2.888-.322 4.229-.957l-.858-1.807A7.9 7.9 0 0 1 12 20c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8v1c0 .692-.313 2-1.5 2-1.396 0-1.494-1.819-1.5-2V8h-2v.025A4.954 4.954 0 0 0 12 7c-2.757 0-5 2.243-5 5s2.243 5 5 5c1.45 0 2.748-.631 3.662-1.621.588.796 1.501 1.621 2.838 1.621 2.273 0 3.5-2.061 3.5-4v-1c0-5.514-4.486-10-10-10Zm0 13c-1.654 0-3-1.346-3-3s1.346-3 3-3 3 1.346 3 3-1.346 3-3 3Z" />
    </svg>
  );
}

/** The date rule between days, centred text on a hairline. */
function DayDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="relative mx-4 mb-0.5 mt-6 flex h-0 items-center justify-center border-t border-divider">
      <span className="bg-bg-primary px-1 text-[12px] font-semibold leading-[13px] text-text-muted">{label}</span>
    </div>
  );
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export interface ChatCanvasHandle {
  setReplyTo: (reply: ReplyPreview | null) => void;
  setEditing: (edit: { id: string; content: string } | null) => void;
  openReactionPicker: (messageId: string, x: number, y: number) => void;
  jumpToMessage: (messageId: string) => void;
  highlightMessage: (messageId: string | null) => void;
}

/** Shared empty list so reaction-less rows keep a stable reference. */
const EMPTY_REACTIONS: MessageReaction[] = [];

interface MessageRowProps {
  message: ChatMessageData;
  grouped: boolean;
  /** Set on the first message of a new calendar day. */
  dayBreak?: string | null;
  showDivider: boolean;
  dividerAnimate: boolean;
  highlight: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  authorColor?: string | null;
  authorRoleIcon?: string | null;
  authorRoleName?: string | null;
  reactions: MessageReaction[];
  members: Profile[];
  channels?: ChannelLite[];
  customEmoji?: Record<string, string>;
  canReact: boolean;
  canForward: boolean;
  onAuthorClick?: (profile: Profile) => void;
  onAuthorContextMenu?: (profile: Profile, e: React.MouseEvent) => void;
  onChannelClick?: (channelId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onMessageContext: (message: ChatMessageData, x: number, y: number) => void;
  onForward: (message: ChatMessageData) => void;
  onReply: (reply: ReplyPreview) => void;
  onEdit: (edit: { id: string; content: string } | null) => void;
  onOpenReactionPicker: (messageId: string) => void;
  onJumpToReply: (messageId: string) => void;
  onContentResize: () => void;
}

/**
 * One chat row, memoized and self-contained. The parent passes only stable
 * callbacks and referentially stable data, so when the canvas re-renders for
 * reasons that don't concern this row (context fan-out, other messages
 * arriving, presence, notifications) the row is skipped entirely. The per-row
 * closures that bind `message.id` are created here instead of in the parent's
 * map, which is what lets the memo actually hold.
 */
const MessageRow = memo(function MessageRow({
  message,
  grouped,
  dayBreak,
  showDivider,
  dividerAnimate,
  highlight,
  currentUserId,
  currentUserName,
  authorColor,
  authorRoleIcon,
  authorRoleName,
  reactions,
  members,
  channels,
  customEmoji,
  canReact,
  canForward,
  onAuthorClick,
  onAuthorContextMenu,
  onChannelClick,
  onToggleReaction,
  onMessageContext,
  onForward,
  onReply,
  onEdit,
  onOpenReactionPicker,
  onJumpToReply,
  onContentResize,
}: MessageRowProps) {
  // Deterministic long-press for touch: iOS long-presses selectable text
  // into a selection loupe instead of firing contextmenu, so rely on a
  // timer rather than the native event. Links, media and buttons keep
  // native behavior; anything else held still for 550ms opens the message
  // menu at the touch point.
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const cancelTouchTimer = () => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
    touchOrigin.current = null;
  };
  return (
    <div
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("a,img,video,button")) return;
        const touch = e.touches[0];
        touchOrigin.current = { x: touch.clientX, y: touch.clientY };
        touchTimer.current = setTimeout(() => {
          touchTimer.current = null;
          touchOrigin.current = null;
          onMessageContext(message, touch.clientX, touch.clientY);
        }, 550);
      }}
      onTouchMove={(e) => {
        const origin = touchOrigin.current;
        if (!origin) return;
        const touch = e.touches[0];
        if (!touch || Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > 12) {
          cancelTouchTimer();
        }
      }}
      onTouchEnd={cancelTouchTimer}
      onTouchCancel={cancelTouchTimer}
    >
      {showDivider && <NewMessagesDivider animate={dividerAnimate} />}
      <ChatMessage
        message={message}
        showHeader={!grouped}
        compact={grouped}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        authorColor={authorColor}
        authorRoleIcon={authorRoleIcon}
        authorRoleName={authorRoleName}
        reactions={reactions}
        onAuthorClick={onAuthorClick}
        onAuthorContextMenu={onAuthorContextMenu}
        members={members}
        channels={channels}
        customEmoji={customEmoji}
        onChannelClick={onChannelClick}
        highlight={highlight}
        onJumpToReply={onJumpToReply}
        onToggleReaction={canReact ? (emoji) => onToggleReaction(message.id, emoji) : undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          onMessageContext(message, e.clientX, e.clientY);
        }}
        onReply={canReact ? onReply : undefined}
        onOpenReactionPicker={canReact ? () => onOpenReactionPicker(message.id) : undefined}
        onForward={canForward ? () => onForward(message) : undefined}
        onEdit={currentUserId === message.author_id ? () => {
          onEdit({ id: message.id, content: message.content });
          onReply({ id: message.id, author_id: message.author_id, content: message.content, attachment_type: message.attachment_type, author: message.author ? { id: message.author.id, username: message.author.username, display_name: message.author.display_name } : undefined } as any);
          setTimeout(() => {
            const composer = document.querySelector('textarea[placeholder*="Message"], textarea[placeholder*="Note"]') as HTMLTextAreaElement | null;
            composer?.focus();
          }, 10);
        } : undefined}
        onDoubleClick={canReact ? () => onToggleReaction(message.id, "👍") : undefined}
        onContentResize={onContentResize}
      />
    </div>
  );
});

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
  /** The author's icon-bearing role, if any (role icons). */
  getAuthorIconRole?: (authorId: string) => { icon?: string | null; name: string } | null | undefined;
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
  highlightMessageId?: string | null;
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
    getAuthorIconRole,
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
    highlightMessageId = null,
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
  // Opening a channel scrolls to the bottom once, but avatars, images, link
  // previews and embeds resolve afterwards and grow the content underneath
  // that position. While this is set, growth re-pins to the bottom instead of
  // leaving the view stranded part-way up. Any deliberate move away from the
  // bottom — a scroll, a jump to a message, paginating older history — clears
  // it, so it only ever covers the settling-in period.
  const pinToBottomRef = useRef(false);
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
  useEffect(() => {
    if (highlightMessageId) {
      setHighlightId(highlightMessageId);
      const t = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightMessageId]);
  const [picker, setPicker] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [newMessagesDividerId, setNewMessagesDividerId] = useState<string | null>(null);
  const [composerFocus, setComposerFocus] = useState(0);
  const readScopeRef = useRef<ReadCursorScope | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Latest-parent-handler ref. DiscordApp passes several inline arrows
  // (`onToggleReaction={(id, emoji) => ...}`), which get a new identity on every
  // parent render and would defeat row memoization. Reading them through a ref
  // lets us expose one stable callback for the lifetime of the canvas.
  const handlersRef = useRef({
    onToggleReaction,
    onMessageContext,
    onForward,
    onAuthorClick,
    onAuthorContextMenu,
    onChannelClick,
  });
  handlersRef.current = {
    onToggleReaction,
    onMessageContext,
    onForward,
    onAuthorClick,
    onAuthorContextMenu,
    onChannelClick,
  };

  const typingSelf = useMemo(
    () => (currentUserId && currentUserName ? { id: currentUserId, name: currentUserName } : null),
    [currentUserId, currentUserName],
  );
  const { typers, notifyTyping } = useTypingPresence(typingScope, typingSelf);
  const handleTypingActivity = useCallback(() => {
    notifyTyping();
  }, [notifyTyping]);

  const { tetherProfile } = useApp();
  // Tether is a mentionable entity but never a real server member: append its
  // profile to the render list so "@tether" tokenizes as a blue mention chip
  // in message bodies. Notes aren't a Tether surface, so leave those alone.
  const renderMembers = useMemo(() => {
    if (!tetherProfile || messageContext === "notes" || members.some((m) => m.id === tetherProfile.id)) {
      return members;
    }
    return [...members, tetherProfile];
  }, [members, tetherProfile, messageContext]);

  useImperativeHandle(ref, () => ({
    setReplyTo,
    setEditing,
    openReactionPicker: (messageId, x, y) => setPicker({ messageId, x, y }),
    jumpToMessage,
    highlightMessage: (messageId) => setHighlightId(messageId),
  }));

  const enriched = useMemo(() => buildReplyPreviews(messages), [messages]);

  // Grouping decides whether a row shows its author header. It depends only on
  // the enriched list and the viewer, but it used to run per row on every
  // render — each call parsing two dates via toDateString(). Precompute the
  // whole list once so unrelated re-renders (presence, notifications, typing)
  // don't redo O(rows) date parsing.
  const groupedFlags = useMemo(() => {
    const flags = new Array<boolean>(enriched.length);
    for (let i = 0; i < enriched.length; i += 1) {
      flags[i] = shouldGroupMessages(enriched[i - 1], enriched[i], currentUserId, currentUserName);
    }
    return flags;
  }, [enriched, currentUserId, currentUserName]);

  // A date rule above the first message of each calendar day.
  const dayBreaks = useMemo(() => {
    const out = new Array<string | null>(enriched.length);
    let prev = "";
    for (let i = 0; i < enriched.length; i += 1) {
      const d = new Date(enriched[i].created_at).toDateString();
      out[i] = d !== prev ? dayLabel(enriched[i].created_at) : null;
      prev = d;
    }
    return out;
  }, [enriched]);

  // Per-message reaction lookup. The old code ran `reactions.filter(...)`
  // per row (O(rows × reactions)) on every render; one grouped pass is O(n).
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, typeof reactions>();
    for (const r of reactions) {
      if (r.context_type !== messageContext) continue;
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions, messageContext]);

  const canReact = !!(onToggleReaction && reactionsEnabled);

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

  // Stable handler surface handed to every row. See handlersRef above.
  const handleToggleReaction = useCallback((messageId: string, emoji: string) => {
    handlersRef.current.onToggleReaction?.(messageId, emoji);
  }, []);
  const handleMessageContext = useCallback((message: ChatMessageData, x: number, y: number) => {
    handlersRef.current.onMessageContext(message, x, y);
  }, []);
  const handleForward = useCallback((message: ChatMessageData) => {
    handlersRef.current.onForward?.(message);
  }, []);
  const handleAuthorClick = useCallback((profile: Profile) => {
    handlersRef.current.onAuthorClick?.(profile);
  }, []);
  const handleAuthorContextMenu = useCallback((profile: Profile, e: React.MouseEvent) => {
    handlersRef.current.onAuthorContextMenu?.(profile, e);
  }, []);
  const handleChannelClick = useCallback((channelId: string) => {
    handlersRef.current.onChannelClick?.(channelId);
  }, []);
  const handleReply = useCallback((reply: ReplyPreview) => {
    setReplyTo(reply);
  }, []);
  const handleOpenReactionPicker = useCallback((messageId: string) => {
    setPicker({ messageId, x: 0, y: 0 });
  }, []);
  const handleContentResize = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Scoped to this canvas's own scroll container: the old global
  // getElementById + scrollIntoView scrolled the whole page and missed when
  // the chat scrolled inside a nested container. Falls back to centering in
  // the viewport only if the row somehow isn't inside our scroller.
  const jumpToMessage = useCallback((messageId: string) => {
    const scroller = scrollRef.current;
    const node = scroller?.querySelector(`#msg-${CSS.escape(messageId)}`)
      ?? document.getElementById(`msg-${messageId}`);
    if (!node || !(node instanceof HTMLElement)) return;
    programmaticScrollRef.current = Date.now();
    pinToBottomRef.current = false;
    if (scroller && scroller.contains(node)) {
      // offsetTop is relative to the offsetParent chain, not the scroller:
      // walk up accumulating so intermediate positioned rows don't skew it.
      let top = 0;
      let el: HTMLElement | null = node;
      while (el && el !== scroller) {
        top += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      top += node.clientHeight / 2 - scroller.clientHeight / 2;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(null), 2000);
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
    pinToBottomRef.current = false;
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
        // The user took over: cancel any top-anchoring from a paginate, and
        // stop re-pinning to the bottom as late content loads.
        topAnchorRef.current = null;
        pinToBottomRef.current = false;
        if (el.scrollTop < 96) void requestLoadMore();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [requestLoadMore]);

  // Mobile keyboards resize the visual viewport without scrolling the chat
  // container, which used to strand the view mid-history when the keyboard
  // opened. While the user is pinned to the bottom, follow the resize so
  // the newest messages stay in view.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => {
      if (stickToBottomRef.current) scrollToBottom("auto", true);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

  // Fallback for engines where the visual-viewport resize fires late or not
  // at all (notably iOS): when the composer takes focus while pinned to the
  // bottom, the keyboard is opening — follow it down on the next frame.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "TEXTAREA" && stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("auto", true));
      }
    };
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, [scrollToBottom]);

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
      pinToBottomRef.current = false;
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
    if (firstLoad) pinToBottomRef.current = true;
    scrollToBottom("auto", firstLoad || followOnceRef.current || (appended && stickToBottomRef.current));
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
      // Still settling after opening the channel: follow the growth all the
      // way down. Unforced, scrollToBottom gives up once the content has
      // grown more than NEAR_BOTTOM_PX, which is why a channel with images
      // used to land just short of the end.
      scrollToBottom("auto", pinToBottomRef.current);
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // Notification-click seek: land on the ping itself when we know its
  // timestamp (first message at/after it), else the first unread divider.
  // Pages back until the target row is loaded. Runs only for the scope the
  // notification targeted; anything else ignores it.
  useEffect(() => {
    if (!readCursorScope || loading || messages.length === 0) return;
    if (!isSeekingUnreadJump(readCursorScope.kind, readCursorScope.id)) return;
    const at = seekingTimestamp();
    let targetId: string | null = null;
    if (at) {
      const newest = messages[messages.length - 1];
      if (newest && newest.created_at < at) {
        // Target is newer than everything loaded (clock skew, or it just
        // arrived): the newest message is the closest row. Never page
        // backwards for a target that sits ahead of the window.
        targetId = newest.id;
      } else {
        const hit = messages.find((m) => m.created_at >= at);
        if (hit) {
          targetId = hit.id;
        } else if (hasMore && onLoadMore && !loadingMoreRef.current) {
          // Everything loaded so far is newer than the ping: keep paging back.
          void requestLoadMore();
          return;
        } else {
          // Ping is older than all history: the oldest loaded message is
          // the closest we can get.
          targetId = messages[0]?.id ?? null;
        }
      }
    } else {
      targetId = findNewMessagesDividerId(messages, readCursorScope);
      if (!targetId) {
        clearUnreadJump();
        return;
      }
    }
    if (!targetId) {
      clearUnreadJump();
      return;
    }
    if (document.getElementById(`msg-${targetId}`)) {
      jumpToMessage(targetId);
      clearUnreadJump();
      return;
    }
    if (hasMore && onLoadMore && !loadingMoreRef.current) {
      void requestLoadMore();
    }
  });

  // Scoped to this canvas's own scroll container: the old global
  // getElementById + scrollIntoView scrolled the whole page and missed when
  // the chat scrolled inside a nested container. Falls back to centering in
  // the viewport only if the row somehow isn't inside our scroller.
  async function handleSend(content: string, options?: MessageSendOptions) {
    if (editing && onEdit) {
      const err = await onEdit(editing.id, content);
      if (!err) {
        setEditing(null);
        setReplyTo(null);
      }
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
      <header className="relative z-[2] flex h-12 shrink-0 items-center gap-2 px-4 shadow-[var(--elevation-low)]">
        <span className="flex shrink-0 items-center text-channels-default [&_svg]:h-6 [&_svg]:w-6">
          {channelIcon ?? (messageContext === "dm" ? <AtIcon /> : <IconHash size={24} />)}
        </span>
        <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-5 text-header-primary">{channelName}</h1>
        {headerExtra}
        {headerTrailing}
      </header>

      {callPanel && <div className="shrink-0">{callPanel}</div>}

      <div ref={scrollRef} data-selectable className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pb-6 pt-4">
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

              {/* The channel intro, only at the true start of history. */}
              {!hasMore && (
                <div className="mx-4 mb-2 mt-4 flex flex-col items-start">
                  <span className="mb-2 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-button-secondary text-white [&_svg]:h-10 [&_svg]:w-10">
                    {messageContext === "channel" ? <IconHash size={42} /> : (channelIcon ?? <IconHash size={42} />)}
                  </span>
                  <h3 className="my-2 text-[32px] font-bold leading-10 text-header-primary">
                    {messageContext === "channel" ? `Welcome to #${channelName}!` : channelName}
                  </h3>
                  <p className="text-[16px] leading-5 text-header-secondary">
                    {introText ?? (messageContext === "channel"
                      ? `This is the start of the #${channelName} channel.`
                      : messageContext === "dm"
                        ? `This is the beginning of your direct message history with ${channelName}.`
                        : `Welcome to the beginning of ${channelName}.`)}
                  </p>
                </div>
              )}

              {enriched.map((msg, i) => {
                const grouped = groupedFlags[i];
                const msgReactions = reactionsByMessageId.get(msg.id) ?? EMPTY_REACTIONS;
                return (
                  <MessageRow
                    key={msg.id}
                    message={msg}
                    grouped={grouped && !dayBreaks[i]}
                    dayBreak={dayBreaks[i]}
                    showDivider={newMessagesDividerId === msg.id}
                    dividerAnimate={!(currentUserId && msg.author_id === currentUserId)}
                    highlight={highlightId === msg.id}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    authorColor={msg.author_id ? getAuthorColor?.(msg.author_id) : null}
                    authorRoleIcon={msg.author_id ? getAuthorIconRole?.(msg.author_id)?.icon ?? null : null}
                    authorRoleName={msg.author_id ? getAuthorIconRole?.(msg.author_id)?.name ?? null : null}
                    reactions={msgReactions}
                    members={renderMembers}
                    channels={channels}
                    customEmoji={customEmoji}
                    canReact={canReact}
                    canForward={!!onForward}
                    onAuthorClick={onAuthorClick ? handleAuthorClick : undefined}
                    onAuthorContextMenu={onAuthorContextMenu ? handleAuthorContextMenu : undefined}
                    onChannelClick={onChannelClick ? handleChannelClick : undefined}
                    onToggleReaction={handleToggleReaction}
                    onMessageContext={handleMessageContext}
                    onForward={handleForward}
                    onReply={handleReply}
                    onEdit={setEditing}
                    onOpenReactionPicker={handleOpenReactionPicker}
                    onJumpToReply={jumpToMessage}
                    onContentResize={handleContentResize}
                  />
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
          members={renderMembers}
          groupContext={messageContext === "channel" || messageContext === "group"}
        />
        {composerLockedReason ? (
          <div className="mx-4 mb-6 flex min-h-[44px] items-center gap-2 rounded-lg bg-bg-composer px-4 py-2">
            <IconShield size={15} className="shrink-0 text-text-muted" />
            <p className="text-[14px] text-text-muted">{composerLockedReason}</p>
          </div>
        ) : (
        <ChatInput
          placeholder={placeholder ?? (messageContext === "dm" ? `Message @${channelName}` : messageContext === "channel" ? `Message #${channelName}` : `Message ${channelName}`)}
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
          tetherEnabled={messageContext !== "notes"}
          allowGifts={messageContext !== "notes"}
        />
        )}
      </div>
    </main>
  );
});
