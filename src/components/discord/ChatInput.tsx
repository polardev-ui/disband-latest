"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import type { UploadEntry } from "@/hooks/useMediaUpload";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconPlus } from "@/components/icons";
import { displayName, getMentionQuery, getEmojiQuery, getCompletedEmojiToken, normalizeMessageContent } from "@/lib/utils";
import { formatFileSize, type ReplyPreview } from "@/lib/messages";
import { lookupShortcode, searchEmojis, type EmojiMatch } from "@/lib/emoji-shortcodes";
import type { Profile, ServerRole } from "@/lib/supabase/types";
import { GifPicker } from "./GifPicker";
import { EmojiPicker, EmojiImg } from "./EmojiPicker";
import { PollCreateModal } from "./PollCreateModal";

interface ChatInputProps {
  placeholder: string;
  members?: Profile[];
  roles?: ServerRole[];
  replyTo?: ReplyPreview | null;
  onClearReply?: () => void;
  editingMessageId?: string | null;
  editingContent?: string;
  onCancelEdit?: () => void;
  onSend: (content: string, options?: { attachment?: { url: string; type: "gif" | "poll" }; replyToId?: string | null; pendingFile?: File; maxUploadBytes?: number }) => Promise<string | null>;
  onTypingActivity?: () => void;
  maxUploadBytes?: number;
  serverId?: string | null;
  /** When false, the "+" button only uploads files (polls are disabled). */
  allowPolls?: boolean;
  /** Incrementing value that triggers a focus of the composer textarea. */
  focusSignal?: number;
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
  allowPolls = false,
  focusSignal,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [emojiIdx, setEmojiIdx] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const { entries, add, remove, clear } = useMediaUpload();

  useEffect(() => {
    if (editingMessageId && editingContent != null) {
      setText(editingContent);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingMessageId, editingContent]);

  useEffect(() => {
    if (!focusSignal || focusSignal <= 0) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
      || active instanceof HTMLSelectElement
      || (active instanceof HTMLElement && active.isContentEditable)
    ) {
      return;
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [focusSignal]);

  /**
   * Type anywhere to start typing in the composer, like Discord.
   *
   * Focus happens synchronously inside the keydown handler and the event is
   * left to run, so the character that triggered it lands in the composer
   * instead of being swallowed. Deferring to state or rAF would lose it.
   *
   * Bails out whenever the keystroke plausibly belongs to something else: an
   * open dialog, another text field, a shortcut chord, or a bare navigation
   * key.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;

      // Printable characters only — a lone Tab, Escape or arrow key must not
      // yank focus into the composer.
      if (e.key.length !== 1) return;

      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (target?.closest("[role='dialog']")) return;

      const el = textareaRef.current;
      if (!el || el === document.activeElement || el.disabled) return;

      // Is anything covering the composer? Most modals here are plain fixed
      // overlays without a dialog role, so asking the document what is actually
      // on top at the composer's position catches all of them — including ones
      // added later — rather than relying on each modal to mark itself.
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const topmost = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      if (topmost !== el && !el.contains(topmost)) return;

      el.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!onTypingActivity || !text.trim()) return;
    onTypingActivity();
    const id = window.setInterval(() => onTypingActivity(), 2000);
    return () => window.clearInterval(id);
  }, [text, onTypingActivity]);

  const mentionCtx = getMentionQuery(text, cursor);
  const showMentions = !!mentionCtx;

  const emojiCtx = getEmojiQuery(text, cursor);
  const showEmoji = !!emojiCtx && !showMentions;

  const emojiItems = useMemo((): EmojiMatch[] => {
    if (!emojiCtx) return [];
    return searchEmojis(emojiCtx.query);
  }, [emojiCtx]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (plusMenuRef.current?.contains(e.target as Node)) return;
      setPlusMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [plusMenuOpen]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 84)}px`;
  }, [text, editingMessageId]);

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

  function insertEmojiFromPicker(item: EmojiMatch) {
    if (!emojiCtx || !textareaRef.current) return;
    const before = text.slice(0, emojiCtx.start);
    const after = text.slice(textareaRef.current.selectionStart);
    const spacer = after && !after.startsWith(" ") ? " " : "";
    const next = `${before}${item.emoji}${spacer}${after}`;
    setText(next);
    setEmojiIdx(0);
    requestAnimationFrame(() => {
      const pos = before.length + item.emoji.length + spacer.length;
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
    if (showEmoji && emojiItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setEmojiIdx((i) => (i + 1) % emojiItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setEmojiIdx((i) => (i - 1 + emojiItems.length) % emojiItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertEmojiFromPicker(emojiItems[emojiIdx] ?? emojiItems[0]);
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

      {showEmoji && emojiItems.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border border-divider bg-bg-secondary py-1 shadow-xl">
          <p className="px-3 py-1 text-[11px] font-bold uppercase text-text-muted">Emoji</p>
          {emojiItems.map((item, i) => (
            <button
              key={`e-${item.shortcode}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertEmojiFromPicker(item); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-interactive-hover ${
                emojiIdx === i ? "bg-interactive-selected" : ""
              }`}
            >
              <EmojiImg emoji={item.emoji} />
              <span className="truncate font-medium">:{item.shortcode}:</span>
              <span className="ml-auto shrink-0 text-xs text-text-muted">{item.emoji}</span>
            </button>
          ))}
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
          <div ref={plusMenuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="Upload file"
              aria-expanded={plusMenuOpen}
              onClick={() => {
                if (allowPolls) setPlusMenuOpen((v) => !v);
                else fileRef.current?.click();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all duration-150 hover:text-text-normal"
            >
              <IconPlus size={22} />
            </button>
            {allowPolls && plusMenuOpen && (
              <div className="absolute bottom-full left-0 z-20 mb-1 w-48 overflow-hidden rounded-lg border border-divider bg-bg-secondary py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => { setPlusMenuOpen(false); fileRef.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-interactive-hover"
                >
                  Upload Files
                </button>
                <button
                  type="button"
                  onClick={() => { setPlusMenuOpen(false); setPollOpen(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-interactive-hover"
                >
                  Create a poll
                </button>
              </div>
            )}
          </div>
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
              const next = e.target.value;
              const selStart = e.target.selectionStart;
              const token = getCompletedEmojiToken(next, selStart);
              if (token) {
                const emoji = lookupShortcode(token.code);
                if (emoji) {
                  const replaced = next.slice(0, token.start) + emoji + next.slice(selStart);
                  const pos = token.start + emoji.length;
                  setText(replaced);
                  setCursor(pos);
                  setMentionIdx(0);
                  setEmojiIdx(0);
                  requestAnimationFrame(() => {
                    textareaRef.current?.setSelectionRange(pos, pos);
                  });
                  onTypingActivity?.();
                  return;
                }
              }
              setText(next);
              setCursor(selStart);
              setMentionIdx(0);
              setEmojiIdx(0);
              onTypingActivity?.();
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
            onClick={(e) => setCursor(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={editingMessageId ? "Edit your message…" : placeholder}
            rows={1}
            className="max-h-[84px] min-h-0 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[15px] leading-5 text-text-normal placeholder:text-text-muted focus:outline-none"
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

      <PollCreateModal
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreated={(pollId) => {
          setPollOpen(false);
          void onSend("", { attachment: { url: pollId, type: "poll" } }).then((err) => {
            if (err) setError(err);
          });
        }}
      />
    </div>
  );
}
