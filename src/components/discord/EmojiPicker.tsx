"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMOJI_CATEGORIES } from "@/lib/emoji";
import { searchEmojis } from "@/lib/emoji-shortcodes";
import { twemojiUrl } from "@/components/ui/Twemoji";
import { safeImageUrl } from "@/lib/safe-url";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  serverId?: string | null;
}

export function EmojiImg({ emoji, size = "1.4em" }: { emoji: string; size?: string }) {
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={emoji}
      className="twemoji"
      draggable={false}
      loading="lazy"
      style={{ height: size, width: size }}
    />
  );
}

export function EmojiPicker({ onSelect, serverId }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 320 });
  const [customEmoji, setCustomEmoji] = useState<{ id: number; name: string; url: string }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const q = search.trim().toLowerCase();
  const searched = useMemo(() => (q ? searchEmojis(q, 100) : []), [q]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    if (!serverId) { setCustomEmoji([]); return; }
    import("@/lib/supabase/client").then((mod) => {
      mod.getSupabaseClient()
        .from("custom_emoji")
        .select("id, name, url")
        .eq("server_id", serverId)
        .order("name")
        .then(({ data }) => setCustomEmoji(data ?? []));
    });
  }, [serverId]);

  const updatePanelPos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = 320;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPanelPos({
      left,
      bottom: window.innerHeight - rect.top + 8,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    const onResize = () => updatePanelPos();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (document.getElementById("emoji-picker-panel")?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label="Insert emoji"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 hover:bg-interactive-hover hover:text-text-normal"
      >
        <EmojiImg emoji="😀" />
      </button>

      {mounted && open
        && createPortal(
          <div
            id="emoji-picker-panel"
            className="fixed z-[120] max-h-80 overflow-hidden rounded-lg border border-divider bg-bg-secondary shadow-2xl"
            style={{ left: panelPos.left, bottom: panelPos.bottom, width: panelPos.width }}
          >
            <div className="max-h-80 overflow-y-auto p-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emoji…"
                className="mb-2 w-full rounded-md border border-black/20 bg-bg-accent px-2.5 py-1.5 text-sm text-text-normal placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              {q && (
                <div className="mb-2">
                  <p className="mb-1 px-1 text-[11px] font-bold uppercase text-text-muted">Results</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {searched.map((m) => (
                      <button
                        key={`s-${m.shortcode}`}
                        type="button"
                        onClick={() => {
                          onSelect(m.emoji);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded hover:bg-interactive-hover"
                        title={`:${m.shortcode}:`}
                      >
                        <EmojiImg emoji={m.emoji} />
                      </button>
                    ))}
                  </div>
                  {searched.length === 0 && (
                    <p className="px-1 py-2 text-center text-xs text-text-muted">No emoji found</p>
                  )}
                </div>
              )}
              {!q && customEmoji.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 px-1 text-[11px] font-bold uppercase text-text-muted">Server Emoji</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {customEmoji.map((e) => (
                      <button
                        key={`custom-${e.id}`}
                        type="button"
                        onClick={() => {
                          onSelect(`:${e.name}:`);
                          setOpen(false);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded hover:bg-interactive-hover"
                        title={`:${e.name}:`}
                      >
                        <img src={safeImageUrl(e.url) ?? ""} alt={e.name} className="h-5 w-5 object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!q && EMOJI_CATEGORIES.map((cat) => (
                <div key={cat.name} className="mb-2">
                  <p className="mb-1 px-1 text-[11px] font-bold uppercase text-text-muted">{cat.name}</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {cat.emojis.map((emoji) => (
                      <button
                        key={`${cat.name}-${emoji}`}
                        type="button"
                        onClick={() => {
                          onSelect(emoji);
                          setOpen(false);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded hover:bg-interactive-hover"
                        title={emoji}
                      >
                        <EmojiImg emoji={emoji} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
