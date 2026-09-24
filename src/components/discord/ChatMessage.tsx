"use client";

import { Fragment, type ReactNode } from "react";
import { AttachmentGrid } from "@/components/discord/AttachmentGrid";
import { readAttachments } from "@/lib/message-attachments";
import {
  formatMessageTime, displayName, extractInviteCodes, normalizeMessageContent,
  mentionsEveryone, mentionsUsername,
} from "@/lib/utils";
import { extractGiftCodes } from "@/lib/gifts";
import { renderMarkdown } from "@/lib/markdown";
import {
  CustomEmojiImg,
  isSingleCustomEmoji,
  splitCustomEmojiSegments,
} from "@/lib/custom-emoji";
import { extractPreviewUrls } from "@/lib/link-preview";
import { areLinkPreviewsEnabled } from "@/lib/user-settings";
import { isEmojiOnlyMessage, emojiOnlySizeClass } from "@/lib/emoji";
import { getUsernameStyle } from "@/lib/profileColor";
import { summarizeReactions, type ReactionSummary } from "@/lib/messages";
import { Avatar } from "@/components/ui/Avatar";
import { BotTag } from "@/components/ui/BotTag";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { ServerInviteCard } from "./ServerInviteCard";
import { GiftCard } from "@/components/gift/GiftCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { MessageAttachment } from "./MessageAttachment";
import { AttachmentUploadCard } from "./AttachmentUploadCard";
import { MessageReactions } from "./MessageReactions";
import { MessageActionBar } from "./MessageActionBar";
import { Twemoji } from "@/components/ui/Twemoji";
import type { Profile } from "@/lib/supabase/types";
import type { MessageReaction, ReplyPreview } from "@/lib/messages";
import type { ChannelLite } from "@/lib/markdown";

export interface ChatMessageData {
  id: string;
  display_id?: number;
  author_id: string | null;
  content: string;
  attachment_url?: string | null;
  attachments?: import("@/lib/message-attachments").StoredAttachment[] | null;
  attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  reply_to_id?: string | null;
  reply_to?: ReplyPreview | null;
  edited_at?: string | null;
  created_at: string;
  mentions?: string[];
  author?: Profile;
  sending?: boolean;
  uploadProgress?: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
  showHeader: boolean;
  compact: boolean;
  currentUserId?: string | null;

  currentUserName?: string | null;
  authorColor?: string | null;
  reactions?: MessageReaction[];
  onAuthorClick?: (profile: Profile) => void;
  onAuthorContextMenu?: (profile: Profile, e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleReaction?: (emoji: string) => void;
  onReplyClick?: (messageId: string) => void;
  onJumpToReply?: (messageId: string) => void;
  onDoubleClick?: () => void;
  onReply?: (reply: ReplyPreview) => void;
  onOpenReactionPicker?: () => void;
  onForward?: () => void;
  highlight?: boolean;
  onContentResize?: () => void;
  channels?: ChannelLite[];
  onChannelClick?: (channelId: string) => void;

  customEmoji?: Record<string, string>;
}

function renderCustomEmojiMarkdown(
  text: string,
  members: Profile[],
  onMentionClick: ((profile: Profile) => void) | undefined,
  channels: ChannelLite[] | undefined,
  onChannelClick: ((channelId: string) => void) | undefined,
  customEmoji: Record<string, string> | undefined,
): ReactNode[] {
  const segs = splitCustomEmojiSegments(text, customEmoji);
  if (segs.length <= 1 || !segs.some((s) => s.kind === "emoji")) {
    return renderMarkdown(text, members, onMentionClick, channels, onChannelClick);
  }
  const out: ReactNode[] = [];
  segs.forEach((s, i) => {
    if (s.kind === "emoji") {
      out.push(<CustomEmojiImg key={`e-${i}`} name={s.name} url={s.url} />);
    } else {
      out.push(
        <Fragment key={`t-${i}`}>
          {renderMarkdown(s.text, members, onMentionClick, channels, onChannelClick)}
        </Fragment>,
      );
    }
  });
  return out;
}

function MessageBody({  content,
  members,
  compact,
  onContentResize,
  sending,
  onMentionClick,
  channels,
  onChannelClick,
  customEmoji,
}: {
  content: string;
  members: Profile[];
  compact?: boolean;
  onContentResize?: () => void;
  sending?: boolean;
  onMentionClick?: (profile: Profile) => void;
  channels?: ChannelLite[];
  onChannelClick?: (channelId: string) => void;
  customEmoji?: Record<string, string>;
}) {
  const codes = extractInviteCodes(content);
  const giftCodes = extractGiftCodes(content);
  const previewUrls = areLinkPreviewsEnabled() ? extractPreviewUrls(content) : [];
  const textOnly = content
    .replace(/(?:https?:\/\/[^\s]+)?\/server\/[a-zA-Z0-9]{7}\b/g, "")
    .replace(/(?:https?:\/\/[^\s]+)?\/gift\/[a-zA-Z0-9]{10}\b/g, "")
    .trim();
  const emojiOnly = isEmojiOnlyMessage(textOnly);
  const singleCustom = isSingleCustomEmoji(textOnly, customEmoji);
  const emojiSizeClass = emojiOnly ? emojiOnlySizeClass(textOnly) : "";
  const normalClass = compact ? "text-[15px] leading-[1.25rem]" : "text-[15px] leading-[1.375rem]";

  return (
    <>
      {textOnly && (
        <div
          className={`break-words ${sending ? "text-text-muted" : "text-text-normal"} ${
            emojiOnly ? emojiSizeClass || normalClass : normalClass
          }`}
        >
          {singleCustom ? (
            <CustomEmojiImg name={singleCustom.name} url={singleCustom.url} size="3em" />
          ) : emojiOnly ? (
            <Twemoji>{textOnly}</Twemoji>
          ) : (
            <Twemoji>{renderCustomEmojiMarkdown(textOnly, members, onMentionClick, channels, onChannelClick, customEmoji)}</Twemoji>
          )}
        </div>
      )}
      {codes.map((code) => (
        <ServerInviteCard key={code} code={code} onLoad={onContentResize} />
      ))}
      {giftCodes.map((code) => (
        <GiftCard key={code} code={code} onLoad={onContentResize} />
      ))}
      {previewUrls.map((url) => (
        <LinkPreviewCard key={url} url={url} onLoad={onContentResize} />
      ))}
    </>
  );
}

function ReplyQuote({
  reply,
  onJump,
}: {
  reply: ReplyPreview;
  onJump?: (id: string) => void;
}) {
  const label = reply.author ? displayName(reply.author as Profile) : "Unknown";

  // The target may be outside the loaded window (paginated away) or deleted.
  // buildReplyPreviews synthesizes a `deleted` placeholder in that case so
  // the reply doesn't silently lose its quote — show an honest fallback.
  if (reply.deleted) {
    return (
      <div
        className="mb-1 flex max-w-full items-center gap-2 rounded border-l-2 border-divider bg-interactive-hover/40 px-2 py-1"
        aria-label="Original message unavailable"
      >
        <span className="truncate text-xs italic text-text-muted">Original message unavailable</span>
      </div>
    );
  }

  const preview =
    normalizeMessageContent(reply.content)
    || (reply.attachment_type === "file" ? "Attachment" : reply.attachment_type ?? "Attachment");

  return (
    <button
      type="button"
      onClick={() => onJump?.(reply.id)}
      className="mb-1 flex max-w-full items-stretch gap-2 rounded border-l-2 border-brand/60 bg-interactive-hover/40 px-2 py-1 text-left hover:bg-interactive-hover/60"
    >
      <span className="shrink-0 text-xs font-semibold text-brand">{label}</span>
      <span className="truncate text-xs text-text-muted">{preview}</span>
    </button>
  );
}

const COMPACT_INDENT = "pl-[72px]";

export function ChatMessage({
  message,
  showHeader,
  compact,
  currentUserId,
  currentUserName,
  authorColor,
  reactions = [],
  onAuthorClick,
  onAuthorContextMenu,
  onContextMenu,
  onToggleReaction,
  onJumpToReply,
  onDoubleClick,
  onReply,
  onOpenReactionPicker,
  onForward,
  highlight,
  members = [],
  onContentResize,
  channels,
  onChannelClick,
  customEmoji,
}: ChatMessageProps & { members?: Profile[] }) {
  const author = message.author;
  const isOwn = message.author_id === currentUserId;
  const isSystem = !message.author_id;
  const nameStyle = authorColor
    ? { color: authorColor }
    : author
      ? getUsernameStyle(author)
      : undefined;
  const canOpenProfile = author && onAuthorClick;
  const body = normalizeMessageContent(message.content);
  const reactionSummaries: ReactionSummary[] = summarizeReactions(reactions, message.id, currentUserId);

  function openAuthor() {
    if (author && onAuthorClick) onAuthorClick(author);
  }

  // Right-clicking the author opens moderation for that member. It must not
  // fall through to the row handler, which opens the *message* menu.
  function authorContextMenu(e: React.MouseEvent) {
    if (!author || !onAuthorContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onAuthorContextMenu(author, e);
  }

  // Uploading sends render the labelled UploadCard (with its own proper
  // progressbar) only while progress is live. The separate thin bar below
  // used to duplicate it, and a progress value stuck at exactly 100 would
  // never swap to the finished attachment: < 100 guarantees the swap.
  const multi = readAttachments(message);
  const attachment = message.attachment_url && message.uploadProgress !== undefined && message.uploadProgress < 100 ? (
    <AttachmentUploadCard
      name={message.attachment_name || "File"}
      size={message.attachment_size}
      type={message.attachment_type}
      progress={message.uploadProgress}
      localUrl={message.attachment_url}
    />
  ) : multi.length > 1 ? (
    // Several files on one message: the mosaic, rather than a stack of cards.
    <AttachmentGrid attachments={multi} />
  ) : message.attachment_url ? (
    <MessageAttachment
      url={message.attachment_url}
      type={message.attachment_type}
      name={message.attachment_name}
      size={message.attachment_size}
      onLoad={onContentResize}
      author={author}
      authorColor={authorColor}
      isOwn={isOwn}
      createdAt={message.created_at}
      currentUserId={currentUserId}
    />
  ) : null;

  const replyBlock = message.reply_to ? (
    <ReplyQuote reply={message.reply_to} onJump={onJumpToReply} />
  ) : null;

  const reactionBlock = onToggleReaction ? (
    <MessageReactions reactions={reactionSummaries} onToggle={onToggleReaction} />
  ) : null;

  const editedTag = message.edited_at ? (
    <span className="text-[10px] text-text-muted">(edited)</span>
  ) : null;

  const highlightClass = highlight ? "bg-brand/10 ring-1 ring-brand/30" : "";

  const mentionedYou = !!(
    (currentUserId && message.mentions?.includes(currentUserId))
    || mentionsEveryone(body)
    || mentionsUsername(body, currentUserName)
  );
  const repliedToYou = !!(
    currentUserId
    && message.reply_to?.author_id === currentUserId
    && message.author_id !== currentUserId
  );
  const pingedYou = mentionedYou || repliedToYou;
  const rowBgClass = pingedYou
    ? "bg-[var(--ping-bg)] hover:bg-[var(--ping-bg-hover)] shadow-[inset_3px_0_0_0_var(--ping-bar)]"
    : "hover:bg-interactive-hover/30";

  if (isSystem) {
    const sysText = normalizeMessageContent(message.content);
    if (!sysText) return null;
    return (
      <article id={`msg-${message.id}`} className="my-2 px-4">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="h-px flex-1 bg-divider" />
          <p className="shrink-0 text-center text-[13px] italic leading-snug">{sysText}</p>
          <span className="h-px flex-1 bg-divider" />
        </div>
      </article>
    );
  }

  if (compact) {
    return (
      <article
        id={`msg-${message.id}`}
        className={`group relative ${COMPACT_INDENT} pr-4 py-0 ${rowBgClass} ${highlightClass} ${message.sending ? "msg-enter" : ""}`}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <MessageActionBar
          message={message}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
          onForward={onForward}
          onMoreActions={onContextMenu}
        />
        <time className="pointer-events-none absolute left-1 top-1/2 w-14 -translate-y-1/2 text-right text-[10px] text-text-muted opacity-0 group-hover:opacity-100">
          {formatMessageTime(message.created_at).split(" at ").pop()}
        </time>
        {message.sending && (
          <span className="mr-1 inline-flex items-center">
            <svg className="h-3 w-3 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </span>
        )}
        {replyBlock}
        {body && (
          <div className="min-w-0">
            <MessageBody content={body} members={members} compact onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} />
            {editedTag}
          </div>
        )}
        {attachment}
        {reactionBlock}
      </article>
    );
  }

  return (
    <article
      id={`msg-${message.id}`}
      className={`group mt-[18px] flex items-start gap-4 px-4 ${rowBgClass} ${highlightClass} ${message.sending ? "msg-enter" : ""}`}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {showHeader ? (
        canOpenProfile ? (
          <button
            type="button"
            onClick={openAuthor}
            onContextMenu={authorContextMenu}
            className="mt-0.5 shrink-0 self-start rounded-full focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <Avatar profile={author} size="md" />
          </button>
        ) : (
          <Avatar profile={author ?? { display_name: "?" }} size="md" className="mt-0.5 shrink-0 self-start" />
        )
      ) : null}

      <div className="relative min-w-0 flex-1 pt-0.5">
        <MessageActionBar
          message={message}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
          onForward={onForward}
          onMoreActions={onContextMenu}
        />
        {showHeader && (
          <header className="mb-0.5 flex items-baseline gap-2 leading-none">
            {canOpenProfile ? (
              <button
                type="button"
                onClick={openAuthor}
                onContextMenu={authorContextMenu}
                className="text-[15px] font-medium hover:underline focus:outline-none"
                style={nameStyle}
              >
                {displayName(author)}
              </button>
            ) : (
              <span className="text-[15px] font-medium" style={nameStyle}>
                {displayName(author ?? {})}
              </span>
            )}
            {isOwn && <span className="rounded bg-brand/30 px-1 text-[10px] font-semibold text-brand">You</span>}
            <BotTag profile={author} size="sm" />
            {author && <PlatformBadge userId={author.id} />}
            <time className="text-xs text-text-muted">{formatMessageTime(message.created_at)}</time>
            {message.sending && (
              <svg className="h-3 w-3 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {editedTag}
          </header>
        )}
        {replyBlock}
        {body && <MessageBody content={body} members={members} onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} />}
        {attachment}
        {reactionBlock}
      </div>
    </article>
  );
}

export function shouldGroupMessages(
  prev: ChatMessageData | undefined,
  msg: ChatMessageData,
  currentUserId?: string | null,
  currentUserName?: string | null,
): boolean {
  if (!prev || !prev.author_id || !msg.author_id) return false;
  if (prev.author_id !== msg.author_id) return false;
  if (msg.reply_to_id) return false;
  // Grouped rows hide the header (avatar, name, full timestamp), so anything
  // that changes how the row reads starts a new group instead.
  if (new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString()) return false;
  if (msg.edited_at) return false;
  if (currentUserId && messagePingsUser(msg, currentUserId, currentUserName)) return false;
  const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap >= 0 && gap <= 7 * 60 * 1000;
}

function messagePingsUser(
  msg: ChatMessageData,
  currentUserId: string,
  currentUserName?: string | null,
): boolean {
  const body = normalizeMessageContent(msg.content);
  return !!(
    msg.mentions?.includes(currentUserId)
    || mentionsEveryone(body)
    || mentionsUsername(body, currentUserName)
    || (msg.reply_to?.author_id === currentUserId && msg.author_id !== currentUserId)
  );
}

export function buildReplyPreviews<T extends ChatMessageData>(messages: T[]): T[] {
  const map = new Map(messages.map((m) => [m.id, m]));
  return messages.map((m) => {
    if (!m.reply_to_id) return m;
    const target = map.get(m.reply_to_id);
    if (!target) {
      // Target outside the loaded window (paginated or trimmed away) or
      // deleted: synthesize a placeholder so the reply keeps its quote.
      // Callers that already resolved a richer preview keep it.
      if (m.reply_to) return m;
      return {
        ...m,
        reply_to: {
          id: m.reply_to_id,
          author_id: null,
          content: "",
          attachment_type: null,
          deleted: true,
        },
      };
    }
    return {
      ...m,
      reply_to: {
        id: target.id,
        author_id: target.author_id,
        content: target.content,
        attachment_type: target.attachment_type,
        author: target.author
          ? { id: target.author.id, username: target.author.username, display_name: target.author.display_name }
          : undefined,
      },
    };
  });
}
