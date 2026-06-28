"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import type { UploadEntry } from "@/hooks/useMediaUpload";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconPlus } from "@/components/icons";
import { displayName, getMentionQuery, normalizeMessageContent } from "@/lib/utils";
import { formatFileSize, type ReplyPreview } from "@/lib/messages";
import type { Profile, ServerRole } from "@/lib/supabase/types";
import { GifPicker } from "./GifPicker";
import { EmojiPicker } from "./EmojiPicker";

interface ChatInputProps {
  placeholder: string;
  members?: Profile[];
  roles?: ServerRole[];
  replyTo?: ReplyPreview | null;
  onClearReply?: () => void;
  editingMessageId?: string | null;
  editingContent?: string;
  onCancelEdit?: () => void;
  onSend: (content: string, options?: { attachment?: { url: string; type: "gif" }; replyToId?: string | null; pendingFile?: File; maxUploadBytes?: number }) => Promise<string | null>;
  onTypingActivity?: () => void;
  maxUploadBytes?: number;
  serverId?: string | null;
}

interface MentionItem {
  id: string;
  kind: "member" | "role";
  label: string;
  sublabel?: string;
  insert: string;
  color?: string;
  profile?: Profile;
}

function PreviewThumb({ entry, onRemove }: { entry: UploadEntry; onRemove: (id: string) => void }) {
  const type = entry.file.type.startsWith("video/") ? "video" : entry.file.type.startsWith("image/") ? "image" : "file";

  return (
    <div className="group relative">
      {type === "video" ? (
        <video src={entry.localUrl} className="h-20 w-20 rounded object-cover" />
      ) : type === "file" ? (
        <div className="flex h-20 w-36 flex-col justify-center rounded border border-divider bg-bg-secondary px-2">
          <p className="truncate text-xs font-medium">{entry.file.name}</p>
          <p className="text-[10px] text-text-muted">{formatFileSize(entry.file.size)}</p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.localUrl} alt="" className="h-20 w-20 rounded object-cover" />
      )}
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-dnd text-white opacity-90 hover:opacity-100"
        aria-label="Remove attachment"
      >
        <IconClose size={12} />
      </button>
    </div>
  );
}

export function ChatInput({
  placeholder,
  members = [],
  roles = [],
  replyTo,
  onClearReply,
  editingMessageId,
  editingContent,
  onCancelEdit,
  onSend,
  onTypingActivity,
  maxUploadBytes = 50 * 1024 * 1024,
  serverId,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [cursor, setCursor] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { entries, add, remove, clear } = useMediaUpload();

  useEffect(() => {
    if (editingMessageId && editingContent != null) {
      setText(editingContent);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingMessageId, editingContent]);

  useEffect(() => {
    if (!onTypingActivity || !text.trim()) return;
    onTypingActivity();
    const id = window.setInterval(() => onTypingActivity(), 2000);
    return () => window.clearInterval(id);
  }, [text, onTypingActivity]);

  const mentionCtx = getMentionQuery(text, cursor);
  const showMentions = !!mentionCtx;

  const mentionItems = useMemo((): MentionItem[] => {
    if (!mentionCtx) return [];
    const q = mentionCtx.query.toLowerCase();
    const memberItems: MentionItem[] = members
      .filter((m) => m.username && (q === "" || m.username!.toLowerCase().startsWith(q) || displayName(m).toLowerCase().includes(q)))
      .map((m) => ({
        id: m.id,
        kind: "member" as const,
        label: displayName(m),
        sublabel: m.username ? `@${m.username}` : undefined,
        insert: `@${m.username}`,
        profile: m,
      }));
    const roleItems: MentionItem[] = roles
      .filter((r) => q === "" || r.name.toLowerCase().includes(q))
      .map((r) => ({
        id: r.id,
        kind: "role" as const,
        label: r.name,
        sublabel: "Role",
        insert: `@${r.name.replace(/\s+/g, "-").toLowerCase()}`,
        color: r.color,
      }));
    return [...memberItems, ...roleItems].slice(0, 8);
  }, [mentionCtx, members, roles]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      add(file);
    }
  }, [add]);

  const removeFile = useCallback((id: string) => {
    remove(id);
  }, [remove]);

  function insertMention(item: MentionItem) {
    if (!mentionCtx || !textareaRef.current) return;
    const before = text.slice(0, mentionCtx.start);
    const after = text.slice(textareaRef.current.selectionStart);
    const next = `${before}${item.insert} ${after}`;
    setText(next);
    setMentionIdx(0);
    requestAnimationFrame(() => {
      const pos = before.length + item.insert.length + 1;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    });
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
      onTypingActivity?.();
    });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (editingMessageId) {
      const content = normalizeMessageContent(text);
      if (!content) return;
      setError(null);
      const err = await onSend(content, { replyToId: undefined });
      if (err) {
        setError(err);
        return;
      }
      onCancelEdit?.();
      return;
    }

    const content = normalizeMessageContent(text);
    if (!content && entries.length === 0) return;

    setError(null);
    const replyToId = replyTo?.id;
    const pendingEntries = [...entries];

    setText("");
    onClearReply?.();
    clear();

    for (let i = 0; i < pendingEntries.length; i++) {
      const entry = pendingEntries[i];
      const err = await onSend(i === 0 ? content : "", {
        pendingFile: entry.file,
        maxUploadBytes,
        replyToId: i === 0 ? replyToId : undefined,
      });
      if (err) {
        setError(err);
        if (i === 0) setText(content);
        return;
      }
    }

    if (pendingEntries.length === 0 && content) {
      const err = await onSend(content, { replyToId });
      if (err) {
        setError(err);
        setText(content);
      }
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (files.length === 0) return;
    e.preventDefault();
    void handleFiles(files);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (replyTo) {
        e.preventDefault();
        onClearReply?.();
        return;
      }
      if (editingMessageId) {
        e.preventDefault();
        onCancelEdit?.();
        setText("");
        return;
      }
    }
    if (showMentions && mentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionItems[mentionIdx] ?? mentionItems[0]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="relative shrink-0 px-4 pb-6">
      {showMentions && mentionItems.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border border-divider bg-bg-secondary py-1 shadow-xl">
          {(() => {
            let idx = 0;
            const membersList = mentionItems.filter((m) => m.kind === "member");
            const rolesList = mentionItems.filter((m) => m.kind === "role");
            return (
              <>
                {membersList.length > 0 && (
                  <p className="px-3 py-1 text-[11px] font-bold uppercase text-text-muted">Members</p>
                )}
                {membersList.map((item) => {
                  const myIdx = idx++;
                  return (
                    <button
                      key={`m-${item.id}`}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-interactive-hover ${
                        mentionIdx === myIdx ? "bg-interactive-selected" : ""
                      }`}
                    >
                      {item.profile && <Avatar profile={item.profile} size="sm" />}
                      <span className="truncate font-medium">{item.label}</span>
                      {item.sublabel && <span className="ml-auto truncate text-xs text-text-muted">{item.sublabel}</span>}
                    </button>
                  );
                })}
                {rolesList.length > 0 && (
                  <p className="mt-1 px-3 py-1 text-[11px] font-bold uppercase text-text-muted">Roles</p>
                )}
                {rolesList.map((item) => {
                  const myIdx = idx++;
                  return (
                    <button
                      key={`r-${item.id}`}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-interactive-hover ${
                        mentionIdx === myIdx ? "bg-interactive-selected" : ""
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color ?? "#949ba4" }} />
                      <span className="truncate font-medium" style={{ color: item.color ?? undefined }}>{item.label}</span>
                      <span className="ml-auto text-xs text-text-muted">{item.sublabel}</span>
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {(replyTo || editingMessageId) && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg border border-b-0 border-divider bg-bg-secondary px-3 py-2 text-sm">
          <div className="min-w-0 flex-1 border-l-2 border-brand pl-2">
            <p className="text-xs font-semibold text-brand">
              {editingMessageId ? "Editing message" : `Replying to ${replyTo?.author ? displayName(replyTo.author as Profile) : "message"}`}
            </p>
            {!editingMessageId && replyTo && (
              <p className="truncate text-xs text-text-muted">
                {normalizeMessageContent(replyTo.content) || replyTo.attachment_type || "Attachment"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onClearReply?.(); onCancelEdit?.(); setText(""); }}
            className="shrink-0 text-text-muted hover:text-text-normal"
            aria-label="Cancel"
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      <form
        onSubmit={submit}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={`relative rounded-lg bg-bg-accent transition-all duration-150 ease-in-out ${dragOver ? "ring-2 ring-brand" : ""} ${replyTo || editingMessageId ? "rounded-t-none" : ""}`}
      >
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-divider px-3 py-2">
            {entries.map((entry) => (
              <PreviewThumb key={entry.id} entry={entry} onRemove={removeFile} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            aria-label="Upload file"
            onClick={() => fileRef.current?.click()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all duration-150 hover:text-text-normal"
          >
            <IconPlus size={22} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ""; }}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart);
              setMentionIdx(0);
              onTypingActivity?.();
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
            onClick={(e) => setCursor(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={editingMessageId ? "Edit your message…" : placeholder}
            rows={1}
            className="max-h-40 min-h-0 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[15px] leading-5 text-text-normal placeholder:text-text-muted focus:outline-none"
          />
          <EmojiPicker onSelect={insertEmoji} serverId={serverId} />
          <GifPicker
            onSelect={(url) => {
              void onSend("", { attachment: { url, type: "gif" }, replyToId: replyTo?.id });
              onClearReply?.();
            }}
          />
        </div>
        {error && <p className="px-4 pb-2 text-xs text-status-dnd">{error}</p>}
      </form>
    </div>
  );
}
