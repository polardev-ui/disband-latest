"use client";

import { formatMessageTime, displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

export interface ChatMessageData {
  id: string;
  author_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: "image" | "video" | null;
  created_at: string;
  author?: Profile;
}

interface ChatMessageProps {
  message: ChatMessageData;
  index: number;
  showHeader: boolean;
  currentUserId?: string | null;
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

export function ChatMessage({
  message,
  index,
  showHeader,
  currentUserId,
  onContextMenu,
  members = [],
}: ChatMessageProps & { members?: Profile[] }) {
  const author = message.author;
  const isOwn = message.author_id === currentUserId;

  return (
    <article
      className="message-enter group flex gap-4 px-4 py-0.5 hover:bg-interactive-hover/30"
      style={{ animationDelay: `${index * 60}ms` }}
      onContextMenu={onContextMenu}
    >
      {showHeader ? (
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: author?.accent_color ?? "#5865f2" }}
        >
          {author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            displayName(author ?? {}).charAt(0).toUpperCase()
          )}
        </div>
      ) : (
        <div className="w-10 shrink-0">
          <time className="invisible text-[11px] text-text-muted group-hover:visible">
            {formatMessageTime(message.created_at).split(" at ").pop()}
          </time>
        </div>
      )}

      <div className="min-w-0 flex-1 pb-1">
        {showHeader && (
          <header className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium hover:underline" style={{ color: author?.accent_color ?? undefined }}>
              {displayName(author ?? {})}
            </span>
            {isOwn && <span className="rounded bg-brand/30 px-1 text-[10px] font-semibold text-brand">You</span>}
            <time className="text-xs text-text-muted">{formatMessageTime(message.created_at)}</time>
          </header>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.375] text-text-normal">
            {renderContent(message.content, members)}
          </p>
        )}
        {message.attachment_url && (
          <div className="mt-1 max-w-md">
            {message.attachment_type === "video" ? (
              <video src={message.attachment_url} controls className="max-h-80 max-w-full rounded-lg border border-black/20" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={message.attachment_url} alt="Attachment" className="max-h-80 max-w-full rounded-lg border border-black/20 object-contain" />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
