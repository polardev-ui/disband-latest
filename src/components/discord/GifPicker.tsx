"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gifThumb, gifUrl, searchGifs, type GiphyImage } from "@/lib/giphy";
import { IconClose, IconStar } from "@/components/icons";
import { useGifFavorites, type FavGif } from "@/hooks/useGifFavorites";
import { FavStarButton } from "./GifFavStar";

interface GifPickerProps {
  onSelect: (url: string) => void;
  disabled?: boolean;
}

function GifThumb({ gif, isFav, onSelect, onToggleFav }: {
  gif: GiphyImage;
  isFav: boolean;
  onSelect: (url: string) => void;
  onToggleFav: (url: string, title: string | null) => void;
}) {
  const thumb = gifThumb(gif);
  const full = gifUrl(gif);
  const [hover, setHover] = useState(false);
  if (!thumb || !full) return null;

  return (
    <div
      className="relative overflow-hidden rounded hover:ring-2 hover:ring-brand"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => { onSelect(full); }}
        className="block w-full"
        title={gif.title}
      >
        {thumb.isVideo ? (
          <video
            src={thumb.src}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline=""
            className="h-24 w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb.src}
            alt={gif.title ?? "GIF"}
            loading="lazy"
            className="h-24 w-full object-cover"
          />
        )}
      </button>
      {(hover || isFav) && (
        <FavStarButton
          active={isFav}
          onToggle={() => onToggleFav(full, gif.title ?? null)}
        />
      )}
    </div>
  );
}

function FavThumb({ fav, onSelect, onRemove }: {
  fav: FavGif;
  onSelect: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded hover:ring-2 hover:ring-brand">
      <button
        type="button"
        onClick={() => { onSelect(fav.url); }}
        className="block w-full"
        title={fav.title ?? "Favorite GIF"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fav.url}
          alt={fav.title ?? "Favorite GIF"}
          loading="lazy"
          className="h-24 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </button>
      <FavStarButton active onToggle={() => onRemove(fav.url)} />
    </div>
  );
}

export function GifPicker({ onSelect, disabled }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 320 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setGifs(await searchGifs(q));
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

  // One shared favorites list (see useGifFavorites): starring here lights the
  // star on every GIF already sitting in chat, and vice versa.
  const { favorites, loaded: favsLoaded, isFav, toggle, refresh } = useGifFavorites();

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

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
              {tab === "search" ? (
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search KLIPY"
                  className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1.5 text-sm text-text-normal outline-none focus:ring-1 focus:ring-brand"
                />
              ) : (
                <p className="min-w-0 flex-1 px-1 text-sm font-semibold text-text-normal">
                  Favorited
                </p>
              )}
              <button
                type="button"
                aria-label={tab === "favorites" ? "Back to search" : "View favorited GIFs"}
                title={tab === "favorites" ? "Back to search" : "Favorited"}
                onClick={() => setTab((t) => (t === "favorites" ? "search" : "favorites"))}
                className={`rounded p-1.5 transition-colors hover:bg-interactive-hover ${
                  tab === "favorites" ? "text-yellow-400" : "text-text-muted hover:text-text-normal"
                }`}
              >
                <IconStar size={17} className={tab === "favorites" ? "fill-yellow-400" : ""} />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-text-muted hover:text-text-normal">
                <IconClose size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {tab === "favorites" ? (
                !favsLoaded && favorites.length === 0 ? (
                  <p className="py-4 text-center text-sm text-text-muted">Loading…</p>
                ) : favorites.length === 0 ? (
                  <p className="py-4 text-center text-sm text-text-muted">
                    Nothing starred yet — hover any GIF and tap the star.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {favorites.map((fav) => (
                      <FavThumb
                        key={fav.url}
                        fav={fav}
                        onSelect={handleSelect}
                        onRemove={(url) => void toggle(url, null, false)}
                      />
                    ))}
                  </div>
                )
              ) : (
              <>
              {loading && <p className="py-4 text-center text-sm text-text-muted">Loading…</p>}
              {error && <p className="py-4 text-center text-sm text-status-dnd">{error}</p>}
              {!loading && !error && gifs.length === 0 && query.trim() && (
                <p className="py-4 text-center text-sm text-text-muted">No GIFs found</p>
              )}
              {!loading && !error && gifs.length > 0 && (
                <div className="grid grid-cols-2 gap-1">
                  {gifs.map((gif) => {
                    const full = gifUrl(gif);
                    return (
                      <GifThumb
                        key={gif.id}
                        gif={gif}
                        isFav={!!full && isFav(full)}
                        onSelect={handleSelect}
                        onToggleFav={(url, title) => void toggle(url, title, !isFav(url))}
                      />
                    );
                  })}
                </div>
              )}
              </>
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
        disabled={disabled}
        title={disabled ? "Finish editing before sending a GIF" : "Send GIF"}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) requestAnimationFrame(updatePanelPos);
            return next;
          });
        }}
        className="flex h-8 items-center rounded px-2 text-xs font-bold uppercase tracking-wide text-text-muted transition-all hover:bg-interactive-hover hover:text-text-normal active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        GIF
      </button>
      {panel}
    </div>
  );
}
