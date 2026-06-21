"use client";

import { useEffect, useRef } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { IconHash } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface ChatCanvasProps {
  channelName: string;
  messages: ChatMessageData[];
  members: Profile[];
  currentUserId?: string | null;
  onSend: (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => Promise<string | null>;
  onMessageContext: (message: ChatMessageData, x: number, y: number) => void;
}

export function ChatCanvas({
  channelName,
  messages,
  members,
  currentUserId,
  onSend,
  onMessageContext,
}: ChatCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <IconHash size={24} className="text-text-muted" />
        <h1 className="text-[15px] font-semibold">{channelName}</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        <div className="mb-4 flex items-center px-4">
          <div className="h-px flex-1 bg-divider" />
          <span className="mx-4 text-xs font-semibold text-text-muted">Welcome to #{channelName}</span>
          <div className="h-px flex-1 bg-divider" />
        </div>

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showHeader = !prev || prev.author_id !== msg.author_id;
          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              index={i}
              showHeader={showHeader}
              currentUserId={currentUserId}
              members={members}
              onContextMenu={(e) => {
                e.preventDefault();
                onMessageContext(msg, e.clientX, e.clientY);
              }}
            />
          );
        })}
      </div>

      <ChatInput
        placeholder={`Message #${channelName}`}
        onSend={onSend}
        mentionHint={`Tip: use @username to mention someone (${members.filter((m) => m.username).length} members)`}
      />
    </main>
  );
}
