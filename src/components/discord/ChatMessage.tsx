"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";
import { AttachmentGrid } from "@/components/discord/AttachmentGrid";
import { readAttachments } from "@/lib/message-attachments";
import {
  formatMessageTime, displayName, extractInviteCodes, normalizeMessageContent,
  mentionsEveryone, mentionsUsername,
} from "@/lib/utils";
import { extractGiftCodes } from "@/lib/gifts";
import { renderMarkdown } from "@/lib/markdown";
import { embedColorHex, type Embed } from "@/lib/embeds";
import { safeImageUrl } from "@/lib/safe-url";
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
import { summarizeReactions, toReplyAuthor, type ReactionSummary } from "@/lib/messages";
import { useProfiles } from "@/lib/profile-store";
import { Avatar } from "@/components/ui/Avatar";
import { IconVerified } from "@/components/icons";
import { BotTag } from "@/components/ui/BotTag";
import { GuildTag } from "@/components/ui/GuildTag";
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
import type { Profile, ServerRole } from "@/lib/supabase/types";
import type { MessageReaction, ReplyPreview } from "@/lib/messages";
import type { ChannelLite } from "@/lib/markdown";

export interface ChatMessageData {
  id: string;
  display_id?: number;
  author_id: string | null;
  content: string;
  attachment_url?: string | null;
  attachments?: import("@/lib/message-attachments").StoredAttachment[] | null;
  attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | "activity" | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  reply_to_id?: string | null;
  reply_to?: ReplyPreview | null;
  embeds?: Embed[] | null;
  webhook?: import("@/lib/embeds").MessageWebhookInfo | null;
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
  onOpenActivity?: (activityId: string) => void;
  highlight?: boolean;
  onContentResize?: () => void;
  channels?: ChannelLite[];
  onChannelClick?: (channelId: string) => void;
  roles?: ServerRole[];

  customEmoji?: Record<string, string>;
}

function renderCustomEmojiMarkdown(
  text: string,
  members: Profile[],
  onMentionClick: ((profile: Profile) => void) | undefined,
  channels: ChannelLite[] | undefined,
  onChannelClick: ((channelId: string) => void) | undefined,
  customEmoji: Record<string, string> | undefined,
  roles: ServerRole[] | undefined,
): ReactNode[] {
  const segs = splitCustomEmojiSegments(text, customEmoji);
  if (segs.length <= 1 || !segs.some((s) => s.kind === "emoji")) {
    return renderMarkdown(text, members, onMentionClick, channels, onChannelClick, roles);
  }
  const out: ReactNode[] = [];
  segs.forEach((s, i) => {
    if (s.kind === "emoji") {
      out.push(<CustomEmojiImg key={`e-${i}`} name={s.name} url={s.url} />);
    } else {
      out.push(
        <Fragment key={`t-${i}`}>
          {renderMarkdown(s.text, members, onMentionClick, channels, onChannelClick, roles)}
        </Fragment>,
      );
    }
  });
  return out;
}

function EmbedCard({
  embed,
  members,
  onMentionClick,
  channels,
  onChannelClick,
  onContentResize,
  roles,
}: {
  embed: Embed;
  members: Profile[];
  onMentionClick?: (profile: Profile) => void;
  channels?: ChannelLite[];
  onChannelClick?: (channelId: string) => void;
  onContentResize?: () => void;
  roles?: ServerRole[];
}) {
  const authorIcon = safeImageUrl(embed.author?.icon_url);
  const thumbnail = safeImageUrl(embed.thumbnail?.url);
  const image = safeImageUrl(embed.image?.url);
  const footerIcon = safeImageUrl(embed.footer?.icon_url);
  const stamp =
    embed.timestamp && !Number.isNaN(Date.parse(embed.timestamp))
      ? new Date(embed.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : null;
  const fieldMarkdown = (text: string) =>
    renderMarkdown(text, members, onMentionClick, channels, onChannelClick, roles);

  return (
    <div
      className="flex max-w-[520px] overflow-hidden rounded-[4px] border-l-4 bg-bg-secondary px-4 pb-4 pl-3 pt-2"
      style={{ borderLeftColor: embedColorHex(embed.color) ?? "#1e1f22" }}
    >
      <div className="min-w-0 flex-1">
        {embed.author && (
          <div className="mb-1 flex items-center gap-2">
            {authorIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={authorIcon} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            )}
            {embed.author.url ? (
              <a
                href={embed.author.url}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-[14px] font-semibold text-header-primary hover:underline"
              >
                {embed.author.name}
              </a>
            ) : (
              <span className="truncate text-[14px] font-semibold text-header-primary">{embed.author.name}</span>
            )}
          </div>
        )}

        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            {embed.title && (
              <p className="text-[16px] font-semibold leading-[22px] text-header-primary">
                {embed.url ? (
                  <a
                    href={embed.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#00a8fc] hover:underline"
                  >
                    {embed.title}
                  </a>
                ) : (
                  embed.title
                )}
              </p>
            )}
            {embed.description && (
              <div className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[18px] text-text-normal">
                {fieldMarkdown(embed.description)}
              </div>
            )}
            {embed.fields && embed.fields.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {embed.fields.map((field, i) => (
                  <div
                    key={`${field.name}-${i}`}
                    className="min-w-0"
                    style={{ flex: field.inline ? "1 1 30%" : "1 1 100%" }}
                  >
                    <p className="text-[14px] font-semibold leading-[18px] text-header-primary">{field.name}</p>
                    <div className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-[18px] text-text-normal">
                      {fieldMarkdown(field.value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                loading="lazy"
                onLoad={onContentResize}
                className="mt-3 max-h-[300px] w-full rounded-[4px] object-contain"
              />
            )}
          </div>
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              onLoad={onContentResize}
              className="h-20 w-20 shrink-0 rounded-[4px] object-cover"
            />
          )}
        </div>

        {(embed.footer || stamp) && (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] leading-[16px] text-text-muted">
            {footerIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={footerIcon} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            )}
            {embed.footer && <span className="min-w-0 break-words">{embed.footer.text}</span>}
            {embed.footer && stamp && <span aria-hidden>•</span>}
            {stamp && <span className="shrink-0">{stamp}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageEmbeds({
  embeds,
  members,
  onMentionClick,
  channels,
  onChannelClick,
  onContentResize,
  roles,
}: {
  embeds?: Embed[] | null;
  members: Profile[];
  onMentionClick?: (profile: Profile) => void;
  channels?: ChannelLite[];
  onChannelClick?: (channelId: string) => void;
  onContentResize?: () => void;
  roles?: ServerRole[];
}) {
  if (!embeds?.length) return null;
  return (
    <div className="mt-1 space-y-1">
      {embeds.map((embed, i) => (
        <EmbedCard
          key={i}
          embed={embed}
          members={members}
          onMentionClick={onMentionClick}
          channels={channels}
          onChannelClick={onChannelClick}
          onContentResize={onContentResize}
          roles={roles}
        />
      ))}
    </div>
  );
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
  roles,
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
  roles?: ServerRole[];
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
            <Twemoji>{renderCustomEmojiMarkdown(textOnly, members, onMentionClick, channels, onChannelClick, customEmoji, roles)}</Twemoji>
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

  // The target may be outside the loaded window. Until its preview arrives,
  // keep the quote's footprint without claiming the message was deleted — a
  // real delete nulls reply_to_id in the database.
  if (reply.pending) {
    return (
      <div className="relative mb-0.5 flex h-[22px] max-w-full items-center gap-1 text-[14px]" aria-label="Loading original message">
        {spine}
        <span className="h-4 w-4 shrink-0 rounded-full bg-button-secondary" />
        <span className="truncate italic text-text-muted">Original message</span>
      </div>
    );
  }

  // Only set when a target lookup finished without returning a row; the
  // ordinary outside-the-window case renders the fetched quote instead.
  if (reply.deleted) {
    return (
      <div className="relative mb-0.5 flex h-[22px] max-w-full items-center gap-1 text-[14px]" aria-label="Original message unavailable">
        {spine}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-button-secondary text-[9px] text-text-muted">!</span>
        <span className="truncate italic text-text-muted">Original message unavailable</span>
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
      <Avatar profile={reply.author ?? { display_name: label }} size="sm" className="!h-4 !w-4 shrink-0 !text-[8px]" />
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
  onOpenActivity,
  highlight,
  members = [],
  onContentResize,
  channels,
  onChannelClick,
  customEmoji,
  roles,
}: ChatMessageProps & { members?: Profile[] }) {
  const author = message.author;
  const webhook = message.webhook ?? null;
  // Webhooks post as a backing bot profile. Show the webhook's own name and
  // avatar instead, but keep the profile's other fields for colour/fallbacks.
  const shownAuthor: Profile | undefined =
    webhook && author
      ? { ...author, display_name: webhook.name, avatar_url: webhook.avatar_url ?? author.avatar_url }
      : webhook
        ? ({
            id: message.author_id ?? "webhook",
            username: webhook.name,
            display_name: webhook.name,
            avatar_url: webhook.avatar_url,
          } as Profile)
        : author;
  const isOwn = message.author_id === currentUserId;
  const isSystem = !message.author_id;
  const nameStyle = webhook
    ? undefined
    : authorColor
      ? { color: authorColor }
      : author
        ? getUsernameStyle(author)
        : undefined;
  const canOpenProfile = !!shownAuthor && !!onAuthorClick && !webhook;
  const body = normalizeMessageContent(message.content);
  const reactionSummaries: ReactionSummary[] = summarizeReactions(reactions, message.id, currentUserId);

  // A mention must stay a mention even when the mentioned person is outside
  // the member window the chat happens to have loaded (large spaces only keep
  // a page of the roster) or has just had a role removed. The message carries
  // the resolved user ids, so load those profiles and merge them into the
  // render list for this row.
  const mentionedProfiles = useProfiles(message.mentions ?? []);
  const renderMembers = useMemo(() => {
    if (mentionedProfiles.size === 0) return members;
    const known = new Set(members.map((m) => m.id));
    const extra = [...mentionedProfiles.values()].filter((p) => !known.has(p.id));
    return extra.length ? [...members, ...extra] : members;
  }, [members, mentionedProfiles]);

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
      author={shownAuthor}
      authorColor={authorColor}
      isOwn={isOwn}
      createdAt={message.created_at}
      onLoad={onContentResize}
    />
  ) : message.attachment_url ? (
    <MessageAttachment
      url={message.attachment_url}
      type={message.attachment_type}
      name={message.attachment_name}
      size={message.attachment_size}
      onLoad={onContentResize}
      author={shownAuthor}
      authorColor={authorColor}
      isOwn={isOwn}
      createdAt={message.created_at}
      currentUserId={currentUserId}
      onOpenActivity={onOpenActivity}
    />
  ) : null;

  const replyBlock = message.reply_to ? (
    <ReplyQuote reply={message.reply_to} onJump={onJumpToReply} />
  ) : null;

  const embedBlock = (
    <MessageEmbeds
      embeds={message.embeds}
      members={renderMembers}
      onMentionClick={onAuthorClick}
      channels={channels}
      onChannelClick={onChannelClick}
      onContentResize={onContentResize}
      roles={roles}
    />
  );

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
                <MessageBody content={embedBody} members={renderMembers} onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} roles={roles} />
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
            <MessageBody content={body} members={renderMembers} compact onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} roles={roles} />
            {editedTag}
          </div>
        )}
        {embedBlock}
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
          aria-label={`Open ${displayName(shownAuthor ?? {})}'s profile`}
          className={`absolute left-4 ${avatarTop} mt-0.5 rounded-full transition-transform active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        >
          <Avatar profile={shownAuthor ?? { display_name: "?" }} size="md" />
        </button>
      ) : (
        <Avatar profile={shownAuthor ?? { display_name: "?" }} size="md" className={`absolute left-4 ${avatarTop} mt-0.5`} />
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
            {displayName(shownAuthor ?? {})}
          </button>
        ) : (
          <span className="text-[16px] font-medium leading-[22px] text-header-primary" style={nameStyle}>
            {displayName(shownAuthor ?? {})}
          </span>
        )}
        {author && !webhook && <GuildTag userId={author.id} size="sm" />}
        {authorRoleIcon && (
          <RoleIcon icon={authorRoleIcon} name={authorRoleName ?? undefined} size={20} className="ml-0.5" />
        )}
        <BotTag profile={shownAuthor} size="sm" />
        {author && !webhook && <PlatformBadge userId={author.id} />}
        <time className="ml-1 select-none text-[12px] font-medium leading-[22px] text-text-muted" dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
          {formatMessageTime(message.created_at)}
        </time>
      </h3>
      {body && (
        <div className="min-w-0 text-[16px] leading-[22px] text-text-normal">
          <MessageBody content={body} members={renderMembers} onContentResize={onContentResize} sending={message.sending} onMentionClick={onAuthorClick} channels={channels} onChannelClick={onChannelClick} customEmoji={customEmoji} roles={roles} />
          {editedTag}
        </div>
      )}
      {embedBlock}
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
  if (!!prev.webhook !== !!msg.webhook) return false;
  if (
    prev.webhook
    && msg.webhook
    && (prev.webhook.id !== msg.webhook.id
      || prev.webhook.name !== msg.webhook.name
      || prev.webhook.avatar_url !== msg.webhook.avatar_url)
  ) {
    return false;
  }
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
    && !!a.pending === !!b.pending
    && (a.author?.id ?? null) === (b.author?.id ?? null)
    && (a.author?.username ?? null) === (b.author?.username ?? null)
    && (a.author?.display_name ?? null) === (b.author?.display_name ?? null)
    && (a.author?.avatar_url ?? null) === (b.author?.avatar_url ?? null)
    && (a.author?.avatar_crop ?? null) === (b.author?.avatar_crop ?? null)
    && (a.author?.accent_color ?? null) === (b.author?.accent_color ?? null)
    && (a.author?.accent_color_2 ?? null) === (b.author?.accent_color_2 ?? null)
    && (a.author?.equipped_ring_effect ?? null) === (b.author?.equipped_ring_effect ?? null)
  );
}

export function buildReplyPreviews<T extends ChatMessageData>(
  messages: T[],
  resolved?: ReadonlyMap<string, ReplyPreview>,
): T[] {
  const map = new Map(messages.map((m) => [m.id, m]));
  return messages.map((m) => {
    if (!m.reply_to_id) return m;
    // A row in the loaded window is the freshest source (it reflects edits).
    // Otherwise use the preview fetched for a target that sits in older,
    // paginated-away history.
    const target = map.get(m.reply_to_id) ?? resolved?.get(m.reply_to_id);
    if (!target) {
      // The preview fetch is still in flight. Keep the quote's footprint but
      // don't call it deleted: reply_to_id is only non-null while the target
      // exists.
      if (m.reply_to) return m;
      return {
        ...m,
        reply_to: {
          id: m.reply_to_id,
          author_id: null,
          content: "",
          attachment_type: null,
          pending: true,
        },
      };
    }
    const next: ReplyPreview = {
      id: target.id,
      author_id: target.author_id,
      content: target.content,
      attachment_type: target.attachment_type,
      author: toReplyAuthor(target.author),
    };
    // Preserve object identity when the resolved quote hasn't changed so the
    // memoized row doesn't re-render when an unrelated message arrives: a new
    // message then repaints only its own row instead of every reply in view.
    if (replyPreviewEqual(m.reply_to, next)) return m;
    return { ...m, reply_to: next };
  });
}
