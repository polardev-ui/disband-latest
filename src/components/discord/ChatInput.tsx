"use client";

import { useRef, useState } from "react";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { IconPlus } from "@/components/icons";

interface ChatInputProps {
  placeholder: string;
  onSend: (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => Promise<string | null>;
  mentionHint?: string;
}

export function ChatInput({ placeholder, onSend, mentionHint }: ChatInputProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useMediaUpload();

  async function handleFile(file: File) {
    const result = await upload(file);
    if (!result) return;
    const type = file.type.startsWith("video/") ? "video" : "image";
    const err = await onSend("", { url: result.url, type, key: result.key });
    if (err) setError(err);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const err = await onSend(trimmed);
    if (err) setError(err);
    else setText("");
  }

  return (
    <div className="px-4 pb-6 pt-2">
      <form
        onSubmit={submit}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`relative rounded-lg bg-bg-accent transition-all duration-150 ease-in-out ${dragOver ? "ring-2 ring-brand" : ""}`}
      >
        <div className="flex items-end gap-2 px-4 py-2.5">
          <button
            type="button"
            aria-label="Upload file"
            disabled={isUploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-all duration-150 hover:text-text-normal disabled:opacity-50"
          >
            {isUploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            ) : (
              <IconPlus size={24} />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={isUploading}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-normal placeholder:text-text-muted focus:outline-none"
          />
        </div>
        {mentionHint && !error && <p className="px-4 pb-2 text-[11px] text-text-muted">{mentionHint}</p>}
        {error && <p className="px-4 pb-2 text-xs text-status-dnd">{error}</p>}
      </form>
    </div>
  );
}
