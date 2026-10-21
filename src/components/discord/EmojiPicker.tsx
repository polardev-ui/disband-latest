"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
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
  const [category, setCategory] = useState("Smileys");
  const [preview, setPreview] = useState<{label: string; emoji?: string; url?: string} | null>(null);
  useOverlayDismiss(() => setOpen(false), open);
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
    const width = Math.min(432, window.innerWidth - 16);
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
        className="group/emoji mt-[6px] flex h-8 w-10 items-center justify-center"
      >
        {/* The classic emoji button: a grey face that colours in and grows. */}
        <span
          aria-hidden
          className={`flex leading-none transition-[filter,transform] duration-100 ${
            open ? "scale-[1.14] grayscale-0" : "grayscale group-hover/emoji:scale-[1.14] group-hover/emoji:grayscale-0"
          }`}
        >
          <EmojiImg emoji="🙂" size="22px" />
        </span>
      </button>

      {mounted && open
        && createPortal(
          <div
            id="emoji-picker-panel"
            role="dialog" aria-label="Emoji picker"
            className="menu-pop fixed z-[100] flex h-[420px] flex-col overflow-hidden rounded-[4px] bg-bg-secondary shadow-[var(--elevation-high)]"
            style={{ left: panelPos.left, bottom: panelPos.bottom, width: panelPos.width, maxHeight: `calc(100dvh - ${panelPos.bottom + 8}px)` }}
          >
            <div className="shrink-0 p-3 shadow-[var(--elevation-low)]">
              <input autoFocus aria-label="Search emoji" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find the perfect emoji"
                className="h-8 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]" />
            </div>
            <div className="flex min-h-0 flex-1">
              <nav aria-label="Emoji categories" className="channel-scroll flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-bg-tertiary py-2">
                {customEmoji.length > 0 && <button type="button" aria-label="Space Emoji" aria-pressed={!q && category === "Space Emoji"} onClick={() => {setSearch("");setCategory("Space Emoji");}} className="h-9 w-9 shrink-0 rounded-[4px] text-interactive-normal hover:bg-interactive-hover">#</button>}
                {EMOJI_CATEGORIES.map((cat) => <button key={cat.name} type="button" aria-label={cat.name} aria-pressed={!q && category === cat.name} onClick={() => {setSearch("");setCategory(cat.name);}} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] ${!q && category === cat.name ? "bg-interactive-selected" : "grayscale hover:bg-interactive-hover hover:grayscale-0"}`}><EmojiImg emoji={cat.emojis[0]} /></button>)}
              </nav>
              <div className="channel-scroll min-w-0 flex-1 overflow-y-auto p-2">
                <h3 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">{q ? "Search Results" : category}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-0.5">
                  {(q ? customEmoji.filter(e => e.name.toLowerCase().includes(q)) : category === "Space Emoji" ? customEmoji : []).map(e => <button key={e.id} type="button" aria-label={`:${e.name}:`} onMouseEnter={() => setPreview({label:`:${e.name}:`,url:e.url})} onFocus={() => setPreview({label:`:${e.name}:`,url:e.url})} onClick={() => {onSelect(`:${e.name}:`);setOpen(false);}} className="flex h-9 items-center justify-center rounded-[4px] hover:bg-interactive-selected"><img src={safeImageUrl(e.url) ?? ""} alt={e.name} className="h-7 w-7 object-contain" /></button>)}
                  {(q ? searched.map(m => ({emoji:m.emoji,label:`:${m.shortcode}:`})) : (EMOJI_CATEGORIES.find(c => c.name === category)?.emojis ?? []).map(emoji => ({emoji,label:emoji}))).map((item,i) => <button key={`${item.label}-${i}`} type="button" aria-label={item.label} onMouseEnter={() => setPreview(item)} onFocus={() => setPreview(item)} onClick={() => {onSelect(item.emoji);setOpen(false);}} className="flex h-9 items-center justify-center rounded-[4px] hover:bg-interactive-selected"><EmojiImg emoji={item.emoji} size="28px" /></button>)}
                </div>
                {q && searched.length === 0 && !customEmoji.some(e => e.name.toLowerCase().includes(q)) && <p className="py-8 text-center text-[14px] text-text-muted">No emoji found.</p>}
              </div>
            </div>
            <footer className="flex h-14 shrink-0 items-center gap-3 bg-bg-secondary-alt px-4 text-[14px] text-header-secondary">
              {preview?.emoji ? <EmojiImg emoji={preview.emoji} size="32px" /> : preview?.url ? <img src={safeImageUrl(preview.url) ?? ""} alt="" className="h-8 w-8 object-contain" /> : <EmojiImg emoji="🙂" size="32px" />}
              <span className="truncate">{preview?.label ?? "Pick an emoji"}</span>
            </footer>
          </div>,
          document.body,
        )}
    </div>
  );
}
