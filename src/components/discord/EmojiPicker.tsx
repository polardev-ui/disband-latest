"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMOJI_CATEGORIES } from "@/lib/emoji";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 320 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

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
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-text-muted transition-all duration-150 hover:bg-interactive-hover hover:text-text-normal"
      >
        😀
      </button>

      {mounted && open
        && createPortal(
          <div
            id="emoji-picker-panel"
            className="fixed z-[120] max-h-80 overflow-hidden rounded-lg border border-divider bg-bg-secondary shadow-2xl"
            style={{ left: panelPos.left, bottom: panelPos.bottom, width: panelPos.width }}
          >
            <div className="max-h-80 overflow-y-auto p-2">
              {EMOJI_CATEGORIES.map((cat) => (
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
                        className="flex h-9 w-9 items-center justify-center rounded text-xl hover:bg-interactive-hover"
                        title={emoji}
                      >
                        {emoji}
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
