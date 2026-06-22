"use client";

import { formatMessageTime, displayName, extractInviteCodes, normalizeMessageContent } from "@/lib/utils";
import { extractPreviewUrls } from "@/lib/link-preview";
import { areLinkPreviewsEnabled } from "@/lib/user-settings";
import { isEmojiOnlyMessage } from "@/lib/emoji";
import { getUsernameStyle } from "@/lib/profileColor";
import { summarizeReactions, type ReactionSummary, type ReplyPreview } from "@/lib/messages";
import { Avatar } from "@/components/ui/Avatar";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { ServerInviteCard } from "./ServerInviteCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { MessageAttachment } from "./MessageAttachment";
import { MessageReactions } from "./MessageReactions";
import type { Profile } from "@/lib/supabase/types";
import type { MessageReaction } from "@/lib/messages";

export interface ChatMessageData {
  id: string;
  author_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: "image" | "video" | "gif" | "file" | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  reply_to_id?: string | null;
  reply_to?: ReplyPreview | null;
  edited_at?: string | null;
  created_at: string;
  author?: Profile;
}

interface ChatMessageProps {
  message: ChatMessageData;
  showHeader: boolean;
  compact: boolean;
  currentUserId?: string | null;
  authorColor?: string | null;
  reactions?: MessageReaction[];
  onAuthorClick?: (profile: Profile) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleReaction?: (emoji: string) => void;
  onReplyClick?: (messageId: string) => void;
  onJumpToReply?: (messageId: string) => void;
  onDoubleClick?: () => void;
  highlight?: boolean;
  onContentResize?: () => void;
}

function renderContent(content: string, members: Profile[] = []) {
  const parts = content.split(/(@[a-zA-Z0-9_]{2,32}|\*\*[^*]+\*\*|https?:\/\/[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`])/g);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("@")) {
      const uname = part.slice(1);
      const user = members.find((m) => m.username?.toLowerCase() === uname.toLowerCase());
      return (
        <span key={i} className="rounded bg-brand/20 px-0.5 font-medium text-[#dee0fc] hover:bg-brand/40">
          @{user?.username ?? uname}
        </span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-brand hover:underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function MessageBody({
  content,
  members,
  compact,
  onContentResize,
}: {
  content: string;
  members: Profile[];
  compact?: boolean;
  onContentResize?: () => void;
}) {
  const codes = extractInviteCodes(content);
  const previewUrls = areLinkPreviewsEnabled() ? extractPreviewUrls(content) : [];
  const textOnly = content.replace(/(?:https?:\/\/[^\s]+)?\/server\/[a-zA-Z0-9]{7}\b/g, "").trim();
  const emojiOnly = isEmojiOnlyMessage(textOnly);

  return (
    <>
      {textOnly && (
        <span
          className={`whitespace-pre-wrap break-words text-text-normal ${
            emojiOnly
              ? "text-[2.75rem] leading-[3rem]"
              : compact
                ? "text-[15px] leading-[1.25rem]"
                : "text-[15px] leading-[1.375rem]"
          }`}
        >
          {emojiOnly ? textOnly : renderContent(textOnly, members)}
        </span>
      )}
      {codes.map((code) => (
        <ServerInviteCard key={code} code={code} onLoad={onContentResize} />
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
  authorColor,
  reactions = [],
  onAuthorClick,
  onContextMenu,
  onToggleReaction,
  onJumpToReply,
  onDoubleClick,
  highlight,
  members = [],
  onContentResize,
}: ChatMessageProps & { members?: Profile[] }) {
  const author = message.author;
  const isOwn = message.author_id === currentUserId;
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

  const attachment = message.attachment_url ? (
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

  if (compact) {
    return (
      <article
        id={`msg-${message.id}`}
        className={`group relative ${COMPACT_INDENT} pr-4 py-0 hover:bg-interactive-hover/30 ${highlightClass}`}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <time className="pointer-events-none absolute left-1 top-1/2 w-14 -translate-y-1/2 text-right text-[10px] text-text-muted opacity-0 group-hover:opacity-100">
          {formatMessageTime(message.created_at).split(" at ").pop()}
        </time>
        {replyBlock}
        {body && (
          <span className="inline">
            <MessageBody content={body} members={members} compact onContentResize={onContentResize} />
            {editedTag}
          </span>
        )}
        {attachment}
        {reactionBlock}
      </article>
    );
  }

  return (
    <article
      id={`msg-${message.id}`}
      className={`message-enter group mt-[18px] flex items-start gap-4 px-4 hover:bg-interactive-hover/30 ${highlightClass}`}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {showHeader ? (
        canOpenProfile ? (
          <button type="button" onClick={openAuthor} className="mt-0.5 shrink-0 self-start rounded-full focus:outline-none focus:ring-2 focus:ring-brand">
            <Avatar profile={author} size="md" />
          </button>
        ) : (
          <Avatar profile={author ?? { display_name: "?" }} size="md" className="mt-0.5 shrink-0 self-start" />
        )
      ) : null}

      <div className="min-w-0 flex-1 pt-0.5">
        {showHeader && (
          <header className="mb-0.5 flex items-baseline gap-2 leading-none">
            {canOpenProfile ? (
              <button
                type="button"
                onClick={openAuthor}
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
            {author && <PlatformBadge profile={author} />}
            <time className="text-xs text-text-muted">{formatMessageTime(message.created_at)}</time>
            {editedTag}
          </header>
        )}
        {replyBlock}
        {body && <MessageBody content={body} members={members} onContentResize={onContentResize} />}
        {attachment}
        {reactionBlock}
      </div>
    </article>
  );
}

export function shouldGroupMessages(prev: ChatMessageData | undefined, msg: ChatMessageData): boolean {
  if (!prev || prev.author_id !== msg.author_id) return false;
  if (msg.reply_to_id) return false;
  const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap <= 7 * 60 * 1000;
}

export function buildReplyPreviews<T extends ChatMessageData>(messages: T[]): T[] {
  const map = new Map(messages.map((m) => [m.id, m]));
  return messages.map((m) => {
    if (!m.reply_to_id) return m;
    const target = map.get(m.reply_to_id);
    if (!target) return m;
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
