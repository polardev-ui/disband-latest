"use client";

import { Fragment, memo, type ReactNode } from "react";
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
import { extractPreviewUrls, removeUrlsFromText } from "@/lib/link-preview";
import { areLinkPreviewsEnabled } from "@/lib/user-settings";
import { isEmojiOnlyMessage, emojiOnlySizeClass } from "@/lib/emoji";
import { getUsernameStyle } from "@/lib/profileColor";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { summarizeReactions, type ReactionSummary } from "@/lib/messages";
import { Avatar } from "@/components/ui/Avatar";
import { IconVerified } from "@/components/icons";
import { BotTag } from "@/components/ui/BotTag";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { ServerInviteCard } from "./ServerInviteCard";
import { GiftCard } from "@/components/gift/GiftCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { GifLinkEmbed, LinkedMedia, classifyLinkUrl } from "./LinkMediaEmbed";
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
  /** The author's role icon (Catalyst Level 2), shown after their name. */
  authorRoleIcon?: string | null;
  authorRoleName?: string | null;
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
  onEdit?: () => void;
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
  // A GIF link renders as the GIF itself (see GifLinkEmbed below), so its raw
  // URL leaves the body — otherwise the message prints the same link twice,
  // once as text and once as the image that replaced it. Only GIF links are
  // stripped: image/video links keep their visible URL above the card.
  const gifUrls = previewUrls.filter((u) => classifyLinkUrl(u) === "gif");
  const textOnly = removeUrlsFromText(
    content
      .replace(/(?:https?:\/\/[^\s]+)?\/server\/[a-zA-Z0-9]{7}\b/g, "")
      .replace(/(?:https?:\/\/[^\s]+)?\/gift\/[a-zA-Z0-9]{10}\b/g, ""),
    gifUrls,
  );
  const emojiOnly = isEmojiOnlyMessage(textOnly);
  const singleCustom = isSingleCustomEmoji(textOnly, customEmoji);
  const emojiSizeClass = emojiOnly ? emojiOnlySizeClass(textOnly) : "";
  const normalClass = compact ? "text-[15px] leading-[1.25rem]" : "text-[15px] leading-[1.375rem]";

  return (
    <>
      {textOnly && (
        <div
          data-selectable
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
      {previewUrls.map((url) => {
        const kind = classifyLinkUrl(url);
        if (kind === "gif") {
          return <GifLinkEmbed key={url} url={url} onLoad={onContentResize} />;
        }
        if (kind === "video" || kind === "image") {
          return (
            <div key={url}>
              <LinkPreviewCard url={url} onLoad={onContentResize} />
              <LinkedMedia url={url} kind={kind} onLoad={onContentResize} />
            </div>
          );
        }
        return <LinkPreviewCard key={url} url={url} onLoad={onContentResize} />;
      })}
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
  // The spine curls from the avatar column up into the quoted line.
  const spine = (
    <span aria-hidden className="absolute -left-[38px] top-[9px] h-[13px] w-[33px] rounded-tl-[6px] border-l-2 border-t-2 border-[#4e5058]" />
  );

  // The target may be outside the loaded window or deleted; buildReplyPreviews
  // synthesizes a `deleted` placeholder so the reply keeps an honest quote.
  if (reply.deleted) {
    return (
      <div className="relative mb-0.5 flex h-[22px] max-w-full items-center gap-1 text-[14px]" aria-label="Original message unavailable">
        {spine}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-button-secondary text-[9px] text-text-muted">!</span>
        <span className="truncate italic text-text-muted">Original message was deleted</span>
      </div>
    );
  }

  const preview =
    normalizeMessageContent(reply.content)
    || (reply.attachment_type === "file" ? "Click to see attachment" : "Click to see attachment");

  return (
    <button
      type="button"
      onClick={() => onJump?.(reply.id)}
      className="group/reply relative mb-0.5 flex h-[22px] max-w-full items-center gap-1 text-left text-[14px] leading-[18px]"
    >
      {spine}
      <Avatar profile={(reply.author as Profile) ?? { display_name: label }} size="sm" className="!h-4 !w-4 shrink-0 !text-[8px]" />
      <span className="shrink-0 font-medium text-header-primary opacity-[0.64] group-hover/reply:opacity-100">@{label}</span>
      <span className="truncate text-text-muted group-hover/reply:text-text-normal">{preview.replace(/\s+/g, " ")}</span>
    </button>
  );
}

const COMPACT_INDENT = "pl-[72px]";

function ChatMessageImpl({
  message,
  showHeader,
  compact,
  currentUserId,
  currentUserName,
  authorColor,
  authorRoleIcon,
  authorRoleName,
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
  onEdit,
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
    <AttachmentGrid
      attachments={multi}
      author={author}
      authorColor={authorColor}
      isOwn={isOwn}
      createdAt={message.created_at}
    />
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
    <span className="ml-1 select-none text-[10px] leading-none text-text-muted" title={new Date(message.edited_at).toLocaleString()}>(edited)</span>
  ) : null;

  const highlightClass = highlight ? "!bg-brand/10 shadow-[inset_2px_0_0_0_var(--brand)]" : "";

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
    ? "bg-[var(--ping-bg)] hover:bg-[var(--ping-bg-hover)] shadow-[inset_2px_0_0_0_var(--ping-bar)]"
    : "hover:bg-bg-message-hover";

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

  // Official broadcasts render as an embed card, not a chat bubble: a
  // certified notice should look certified. Keyed on the reserved identity
  // (username + bot flag, which no human account can hold), so this is
  // display logic only — nothing here grants authority.
  const isOfficialNotice = author?.username === "disband" && (author?.is_bot ?? false);
  if (isOfficialNotice) {
    const [rawTitle, ...rest] = message.content.split(/\n\n+/);
    const embedTitle = (rawTitle ?? "").trim();
    const embedBody = rest.join("\n\n").trim();
    return (
      <article
        id={`msg-${message.id}`}
        className={`group relative mx-4 my-2 ${rowBgClass} ${highlightClass} ${message.sending ? "msg-enter" : ""} [@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none]`}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <MessageActionBar
          message={message}
          currentUserId={currentUserId}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
          onForward={onForward}
          onEdit={onEdit}
          onMoreActions={onContextMenu}
        />
        <div className="overflow-hidden rounded-lg border border-brand/30 bg-bg-secondary shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-2 border-b border-divider bg-brand/10 px-4 py-2.5">
            <Avatar profile={author} size="sm" />
            <span className="text-[15px] font-semibold text-text-normal">Disband</span>
            <IconVerified size={15} className="shrink-0 text-sky-400" />
            <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
              Official
            </span>
            <time className="ml-auto shrink-0 text-xs text-text-muted">
              {formatMessageTime(message.created_at).split(" at ").pop()}
            </time>
          </div>
          <div className="px-4 py-3">
            {embedTitle && (
              <p className="text-[16px] font-bold leading-snug text-text-normal">{embedTitle}</p>
            )}
            {embedBody && (
              <div className={embedTitle ? "mt-1" : ""}>
                <MessageBody content={embedBody} members={members} onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} />
              </div>
            )}
          </div>
        </div>
        {attachment}
        {reactionBlock}
      </article>
    );
  }

  if (compact) {
    return (
      <article
        id={`msg-${message.id}`}
        className={`group relative min-h-[22px] py-0.5 pl-[72px] pr-12 ${rowBgClass} ${highlightClass} ${message.sending ? "msg-enter opacity-60" : ""} [@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none]`}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <MessageActionBar
          message={message}
          currentUserId={currentUserId}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
          onForward={onForward}
          onEdit={onEdit}
          onMoreActions={onContextMenu}
        />
        <time className="pointer-events-none absolute left-0 top-[5px] w-[56px] select-none text-right text-[11px] leading-[22px] text-text-muted opacity-0 group-hover:opacity-100">
          {formatMessageTime(message.created_at).split(" at ").pop()}
        </time>
        {replyBlock}
        {body && (
          <div className="min-w-0 text-[16px] leading-[22px] text-text-normal">
            <MessageBody content={body} members={members} compact onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} />
            {editedTag}
          </div>
        )}
        {attachment}
        {reactionBlock}
      </article>
    );
  }

  const avatarTop = replyBlock ? "top-[26px]" : "top-0.5";
  return (
    <article
      id={`msg-${message.id}`}
      className={`group relative mt-[17px] min-h-[44px] py-0.5 pl-[72px] pr-12 ${rowBgClass} ${highlightClass} ${message.sending ? "msg-enter opacity-60" : ""} [@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none]`}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <MessageActionBar
        message={message}
        currentUserId={currentUserId}
        onReply={onReply}
        onToggleReaction={onToggleReaction}
        onOpenReactionPicker={onOpenReactionPicker}
        onForward={onForward}
        onEdit={onEdit}
        onMoreActions={onContextMenu}
      />
      {replyBlock}
      {canOpenProfile ? (
        <button
          type="button"
          onClick={openAuthor}
          onContextMenu={authorContextMenu}
          aria-label={`Open ${displayName(author)}'s profile`}
          className={`absolute left-4 ${avatarTop} mt-0.5 rounded-full transition-transform active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        >
          <Avatar profile={author} size="md" />
        </button>
      ) : (
        <Avatar profile={author ?? { display_name: "?" }} size="md" className={`absolute left-4 ${avatarTop} mt-0.5`} />
      )}

      <h3 className="flex min-h-[22px] flex-wrap items-center gap-x-1 leading-[22px]">
        {canOpenProfile ? (
          <button
            type="button"
            onClick={openAuthor}
            onContextMenu={authorContextMenu}
            className="text-[16px] font-medium leading-[22px] text-header-primary hover:underline focus:outline-none"
            style={nameStyle}
          >
            {displayName(author)}
          </button>
        ) : (
          <span className="text-[16px] font-medium leading-[22px] text-header-primary" style={nameStyle}>
            {displayName(author ?? {})}
          </span>
        )}
        {authorRoleIcon && (
          <RoleIcon icon={authorRoleIcon} name={authorRoleName ?? undefined} size={20} className="ml-0.5" />
        )}
        <BotTag profile={author} size="sm" />
        {author && <PlatformBadge userId={author.id} />}
        <time className="ml-1 select-none text-[12px] font-medium leading-[22px] text-text-muted" dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
          {formatMessageTime(message.created_at)}
        </time>
      </h3>
      {body && (
        <div className="min-w-0 text-[16px] leading-[22px] text-text-normal">
          <MessageBody content={body} members={members} onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} />
          {editedTag}
        </div>
      )}
      {attachment}
      {reactionBlock}
    </article>
  );
}

/**
 * Message rows are memoized: the chat canvas re-renders on every AppContext
 * change (presence, notifications, unread, ...) and on every list update, and
 * without this every mounted row re-ran its markdown/emoji/attachment work.
 * The row only re-renders when its own props actually change.
 */
export const ChatMessage = memo(ChatMessageImpl);

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

function replyPreviewEqual(a: ReplyPreview | null | undefined, b: ReplyPreview | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id
    && a.author_id === b.author_id
    && a.content === b.content
    && a.attachment_type === b.attachment_type
    && !!a.deleted === !!b.deleted
    && (a.author?.id ?? null) === (b.author?.id ?? null)
    && (a.author?.username ?? null) === (b.author?.username ?? null)
    && (a.author?.display_name ?? null) === (b.author?.display_name ?? null)
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
    const next: ReplyPreview = {
      id: target.id,
      author_id: target.author_id,
      content: target.content,
      attachment_type: target.attachment_type,
      author: target.author
        ? { id: target.author.id, username: target.author.username, display_name: target.author.display_name }
        : undefined,
    };
    // Preserve object identity when the resolved quote hasn't changed so the
    // memoized row doesn't re-render when an unrelated message arrives: a new
    // message then repaints only its own row instead of every reply in view.
    if (replyPreviewEqual(m.reply_to, next)) return m;
    return { ...m, reply_to: next };
  });
}
