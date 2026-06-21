"use client";

import { formatMessageTime, displayName, extractInviteCodes, normalizeMessageContent } from "@/lib/utils";
import { getUsernameStyle } from "@/lib/profileColor";
import { Avatar } from "@/components/ui/Avatar";
import { ServerInviteCard } from "./ServerInviteCard";
import { MessageAttachment } from "./MessageAttachment";
import type { Profile } from "@/lib/supabase/types";

export interface ChatMessageData {
  id: string;
  author_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: "image" | "video" | "gif" | null;
  created_at: string;
  author?: Profile;
}

interface ChatMessageProps {
  message: ChatMessageData;
  showHeader: boolean;
  compact: boolean;
  currentUserId?: string | null;
  authorColor?: string | null;
  onAuthorClick?: (profile: Profile) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function renderContent(content: string, members: Profile[] = []) {
  const parts = content.split(/(@[a-zA-Z0-9_]{2,32}|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
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
    return part;
  });
}

function MessageBody({ content, members }: { content: string; members: Profile[] }) {
  const codes = extractInviteCodes(content);
  const textOnly = content.replace(/(?:https?:\/\/[^\s]+)?\/server\/[a-zA-Z0-9]{7}\b/g, "").trim();

  return (
    <>
      {textOnly && (
        <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.375rem] text-text-normal">
          {renderContent(textOnly, members)}
        </span>
      )}
      {codes.map((code) => (
        <ServerInviteCard key={code} code={code} />
      ))}
    </>
  );
}

/** px-4 + avatar(40) + gap(16) = 72px content indent for compact rows */
const COMPACT_INDENT = "pl-[72px]";

export function ChatMessage({
  message,
  showHeader,
  compact,
  currentUserId,
  authorColor,
  onAuthorClick,
  onContextMenu,
  members = [],
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

  function openAuthor() {
    if (author && onAuthorClick) onAuthorClick(author);
  }

  if (compact) {
    return (
      <article
        className={`group relative ${COMPACT_INDENT} pr-4 py-[1px] hover:bg-interactive-hover/30`}
        onContextMenu={onContextMenu}
      >
        <time className="pointer-events-none absolute left-1 top-1/2 w-14 -translate-y-1/2 text-right text-[10px] text-text-muted opacity-0 group-hover:opacity-100">
          {formatMessageTime(message.created_at).split(" at ").pop()}
        </time>
        {body && <MessageBody content={body} members={members} />}
        {message.attachment_url && (
          <MessageAttachment url={message.attachment_url} type={message.attachment_type} />
        )}
      </article>
    );
  }

  return (
    <article
      className="message-enter group mt-[17px] flex items-start gap-4 px-4 first:mt-0 hover:bg-interactive-hover/30"
      onContextMenu={onContextMenu}
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
            <time className="text-xs text-text-muted">{formatMessageTime(message.created_at)}</time>
          </header>
        )}
        {body && <MessageBody content={body} members={members} />}
        {message.attachment_url && (
          <MessageAttachment url={message.attachment_url} type={message.attachment_type} />
        )}
      </div>
    </article>
  );
}

export function shouldGroupMessages(prev: ChatMessageData | undefined, msg: ChatMessageData): boolean {
  if (!prev || prev.author_id !== msg.author_id) return false;
  const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap <= 7 * 60 * 1000;
}
