"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gifPreviewUrl, gifUrl, searchGifs, type GiphyImage } from "@/lib/giphy";
import { IconClose } from "@/components/icons";

interface GifPickerProps {
  onSelect: (url: string) => void;
}

export function GifPicker({ onSelect }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setGifs(await searchGifs(q || "funny"));
    } catch {
      setError("Could not load GIFs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(query);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Send GIF"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center rounded px-2 text-xs font-bold uppercase tracking-wide text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
      >
        GIF
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 flex w-80 flex-col overflow-hidden rounded-lg border border-divider bg-bg-secondary shadow-2xl">
          <div className="flex items-center gap-2 border-b border-divider p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs"
              className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1.5 text-sm text-text-normal outline-none focus:ring-1 focus:ring-brand"
            />
            <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-normal">
              <IconClose size={16} />
            </button>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto p-2">
            {loading && <p className="col-span-2 py-4 text-center text-sm text-text-muted">Loading…</p>}
            {error && <p className="col-span-2 py-4 text-center text-sm text-status-dnd">{error}</p>}
            {!loading && !error && gifs.length === 0 && (
              <p className="col-span-2 py-4 text-center text-sm text-text-muted">No GIFs found</p>
            )}
            {!loading && !error && gifs.map((gif) => {
              const preview = gifPreviewUrl(gif);
              const full = gifUrl(gif);
              if (!preview || !full) return null;
              return (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => {
                    onSelect(full);
                    setOpen(false);
                  }}
                  className="overflow-hidden rounded hover:ring-2 hover:ring-brand"
                  title={gif.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt={gif.title ?? "GIF"} className="h-24 w-full object-cover" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
