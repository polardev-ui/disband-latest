"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconPlus } from "@/components/icons";
import { displayName, getMentionQuery, normalizeMessageContent } from "@/lib/utils";
import { inferAttachmentType } from "@/lib/media/uploadMedia";
import { formatFileSize, type AttachmentType, type MessageSendOptions, type ReplyPreview } from "@/lib/messages";
import type { Profile, ServerRole } from "@/lib/supabase/types";
import { GifPicker } from "./GifPicker";

export interface PendingAttachment {
  id: string;
  url: string;
  type: AttachmentType;
  key?: string;
  previewUrl: string;
  name: string;
  size: number;
}

interface ChatInputProps {
  placeholder: string;
  members?: Profile[];
  roles?: ServerRole[];
  replyTo?: ReplyPreview | null;
  onClearReply?: () => void;
  editingMessageId?: string | null;
  editingContent?: string;
  onCancelEdit?: () => void;
  onSend: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  onTypingActivity?: () => void;
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
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [cursor, setCursor] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { upload, isUploading } = useMediaUpload();

  useEffect(() => {
    if (editingMessageId && editingContent != null) {
      setText(editingContent);
      setPending([]);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingMessageId, editingContent]);

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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      const result = await upload(file);
      if (!result) {
        setError((prev) => prev ?? "Upload failed. Try a smaller file or different format.");
        continue;
      }
      const type = inferAttachmentType(file);
      const previewUrl = type === "file" ? "" : result.url;
      setPending((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          url: result.url,
          type,
          key: result.key,
          previewUrl,
          name: file.name,
          size: file.size,
        },
      ]);
    }
  }, [upload]);

  function removePending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

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

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const content = normalizeMessageContent(text);
    if (!content && pending.length === 0 && !editingMessageId) return;

    setError(null);
    const attachments = [...pending];
    const replyToId = editingMessageId ? undefined : replyTo?.id;
    setPending([]);
    setText("");
    onClearReply?.();
    onCancelEdit?.();

    if (attachments.length === 0) {
      const err = await onSend(content, { replyToId });
      if (err) {
        setError(err);
        setText(content);
      }
      return;
    }

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const err = await onSend(i === 0 ? content : "", {
        attachment: {
          url: att.url,
          type: att.type,
          key: att.key,
          name: att.name,
          size: att.size,
        },
        replyToId: i === 0 ? replyToId : undefined,
      });
      if (err) {
        setError(err);
        setPending(attachments.slice(i));
        if (i === 0) setText(content);
        return;
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
    void addFiles(files);
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
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
        className={`relative rounded-lg bg-bg-accent transition-all duration-150 ease-in-out ${dragOver ? "ring-2 ring-brand" : ""} ${replyTo || editingMessageId ? "rounded-t-none" : ""}`}
      >
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-divider px-3 py-2">
            {pending.map((att) => (
              <div key={att.id} className="group relative">
                {att.type === "video" ? (
                  <video src={att.previewUrl} className="h-20 w-20 rounded object-cover" />
                ) : att.type === "file" ? (
                  <div className="flex h-20 w-36 flex-col justify-center rounded border border-divider bg-bg-secondary px-2">
                    <p className="truncate text-xs font-medium">{att.name}</p>
                    <p className="text-[10px] text-text-muted">{formatFileSize(att.size)}</p>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={att.previewUrl} alt="" className="h-20 w-20 rounded object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removePending(att.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-dnd text-white opacity-90 hover:opacity-100"
                  aria-label="Remove attachment"
                >
                  <IconClose size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            aria-label="Upload file"
            disabled={isUploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all duration-150 hover:text-text-normal disabled:opacity-50"
          >
            {isUploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            ) : (
              <IconPlus size={22} />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart);
              setMentionIdx(0);
              if (e.target.value.trim()) onTypingActivity?.();
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
            onClick={(e) => setCursor(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={editingMessageId ? "Edit your message…" : placeholder}
            disabled={isUploading}
            rows={1}
            className="max-h-40 min-h-0 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[15px] leading-5 text-text-normal placeholder:text-text-muted focus:outline-none"
          />
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
