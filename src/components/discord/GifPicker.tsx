"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gifPreviewUrl, gifUrl, giphyDisplayUrl, searchGifs, type GiphyImage } from "@/lib/giphy";
import { IconClose, IconStar } from "@/components/icons";
import { useGifFavorites } from "@/hooks/useGifFavorites";

interface GifPickerProps {
  onSelect: (url: string) => void;
}

function GifThumb({ gif, onSelect, isFavorite, onToggleFavorite }: {
  gif: GiphyImage;
  onSelect: (url: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const preview = gifPreviewUrl(gif);
  const full = gifUrl(gif);
  if (!preview || !full) return null;

  const src = giphyDisplayUrl(preview);

  return (
    <div className="group relative overflow-hidden rounded hover:ring-2 hover:ring-brand">
      <button
        type="button"
        onClick={() => { onSelect(full); }}
        className="block w-full"
        title={gif.title}
      >
        <video
          src={src ?? ""}
          autoPlay
          loop
          muted
          playsInline
          className="h-24 w-full object-cover"
        />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <IconStar size={14} className={isFavorite ? "text-yellow-400" : "text-white"} />
      </button>
    </div>
  );
}

export function GifPicker({ onSelect }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 320 });
  const [showFavorites, setShowFavorites] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { favorites, isFavorite, toggleFavorite } = useGifFavorites();

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

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    setShowFavorites(false);
    try {
      if (!q.trim()) {
        setShowFavorites(true);
        setGifs([]);
      } else {
        setGifs(await searchGifs(q));
      }
    } catch {
      setError("Could not load GIFs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (document.getElementById("gif-picker-panel")?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function handleSelect(url: string) {
    onSelect(url);
    setOpen(false);
  }

  const panel =
    open && mounted
      ? createPortal(
          <div
            id="gif-picker-panel"
            className="fixed z-[100] flex max-h-[min(20rem,50vh)] flex-col overflow-hidden rounded-lg border border-divider bg-bg-secondary shadow-2xl"
            style={{
              left: panelPos.left,
              bottom: panelPos.bottom,
              width: panelPos.width,
            }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-divider p-2">
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {loading && <p className="py-4 text-center text-sm text-text-muted">Loading…</p>}
              {error && <p className="py-4 text-center text-sm text-status-dnd">{error}</p>}
              {showFavorites && favorites.length === 0 && !loading && (
                <p className="py-4 text-center text-sm text-text-muted">No favorites yet. Tap the star on any GIF to save it.</p>
              )}
              {showFavorites && favorites.length > 0 && (
                <>
                  <p className="mb-1 text-[11px] font-bold uppercase text-text-muted">Favorites</p>
                  <div className="mb-3 grid grid-cols-2 gap-1">
                    {favorites.map((fav) => (
                      <div key={fav.id} className="group relative overflow-hidden rounded hover:ring-2 hover:ring-brand">
                        <button
                          type="button"
                          onClick={() => handleSelect(fav.url)}
                          className="block w-full"
                        >
                          <video
                            src={giphyDisplayUrl(fav.previewUrl)}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-24 w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite({ id: fav.id, title: fav.title, url: fav.url, previewUrl: fav.previewUrl });
                          }}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
                          title="Remove from favorites"
                        >
                          <IconStar size={14} className="text-yellow-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!loading && !error && !showFavorites && gifs.length === 0 && query.trim() && (
                <p className="py-4 text-center text-sm text-text-muted">No GIFs found</p>
              )}
              {!loading && !error && !showFavorites && (
                <div className="grid grid-cols-2 gap-1">
                  {gifs.map((gif) => (
                    <GifThumb
                      key={gif.id}
                      gif={gif}
                      onSelect={handleSelect}
                      isFavorite={isFavorite(gif.id)}
                      onToggleFavorite={() => {
                        const pUrl = gifPreviewUrl(gif);
                        const fUrl = gifUrl(gif);
                        toggleFavorite({ id: gif.id, title: gif.title, url: fUrl ?? undefined, previewUrl: pUrl ?? undefined });
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label="Send GIF"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) requestAnimationFrame(updatePanelPos);
            return next;
          });
        }}
        className="flex h-8 items-center rounded px-2 text-xs font-bold uppercase tracking-wide text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
      >
        GIF
      </button>
      {panel}
    </div>
  );
}
