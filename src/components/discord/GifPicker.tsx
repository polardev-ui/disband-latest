"use client";

import { SolidGifIcon } from "@/components/icons/SolidIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
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
        title={fav.title ?? "Favourite GIF"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fav.url}
          alt={fav.title ?? "Favourite GIF"}
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
  const [preview, setPreview] = useState("Find a GIF for the moment");
  useOverlayDismiss(() => setOpen(false), open);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 320 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

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

  const load = useCallback(async (q: string) => {
    // Guard against out-of-order responses: a slow trending fetch must not
    // overwrite newer search results (or vice versa).
    const id = ++reqRef.current;
    lastQueryRef.current = q;
    setLoading(true);
    setError(null);
    try {
      const res = await searchGifs(q);
      if (reqRef.current === id) setGifs(res);
    } catch {
      if (reqRef.current === id) setError("Could not load GIFs");
    } finally {
      if (reqRef.current === id) setLoading(false);
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

  // Trending loads the moment the picker opens — previously the first fetch
  // waited out the 350ms debounce, so the panel always opened empty.
  useEffect(() => {
    if (!open) return;
    lastQueryRef.current = null;
    void load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    if (lastQueryRef.current === query) return;
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
            role="dialog" aria-label="GIF picker"
            className="menu-pop fixed z-[100] flex h-[420px] flex-col overflow-hidden rounded-[4px] bg-bg-secondary shadow-[var(--elevation-high)]"
            style={{
              left: panelPos.left,
              bottom: panelPos.bottom,
              width: panelPos.width,
              maxHeight: `calc(100dvh - ${panelPos.bottom + 8}px)`,
            }}
          >
            <div className="relative z-[1] flex shrink-0 items-center gap-2 p-3 shadow-[var(--elevation-low)]">
              {tab === "search" ? (
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus aria-label="Search GIFs" placeholder="Search KLIPY for GIFs"
                  className="h-8 min-w-0 flex-1 rounded-[3px] border border-transparent bg-bg-tertiary px-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
                />
              ) : (
                <p className="min-w-0 flex-1 px-1 text-sm font-semibold text-text-normal">
                  Favourites
                </p>
              )}
              <button
                type="button"
                aria-label={tab === "favorites" ? "Back to search" : "View favourite GIFs"}
                title={tab === "favorites" ? "Back to search" : "Favourites"}
                onClick={() => setTab((t) => (t === "favorites" ? "search" : "favorites"))}
                className={`rounded p-1.5 transition-colors hover:bg-interactive-hover ${
                  tab === "favorites" ? "text-yellow-400" : "text-text-muted hover:text-text-normal"
                }`}
              >
                <IconStar size={17} className={tab === "favorites" ? "fill-yellow-400" : ""} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close GIF picker" className="rounded p-1 text-text-muted hover:text-text-normal">
                <IconClose size={16} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1">
            <nav aria-label="GIF categories" className="channel-scroll flex w-[88px] shrink-0 flex-col gap-1 overflow-y-auto bg-bg-tertiary p-2">
              {["Trending", "Favourites", "Happy", "Thanks", "Celebrate", "Hello"].map(c => <button key={c} type="button" aria-pressed={c === "Favourites" ? tab === "favorites" : tab === "search" && query === (c === "Trending" ? "" : c)} onClick={() => {setTab(c === "Favourites" ? "favorites" : "search"); if(c !== "Favourites") setQuery(c === "Trending" ? "" : c);}} className="rounded-[3px] px-1 py-2 text-left text-[12px] font-medium text-interactive-normal hover:bg-interactive-hover hover:text-white aria-pressed:bg-interactive-selected aria-pressed:text-white">{c}</button>)}
            </nav>
            <div className="channel-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-2" onMouseOver={e => {const title = (e.target as HTMLElement).closest("button[title]")?.getAttribute("title"); if(title) setPreview(title);}} onFocus={e => {const title = (e.target as HTMLElement).closest("button[title]")?.getAttribute("title"); if(title) setPreview(title);}}>
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
              {loading && gifs.length === 0 && !error && (
                <div className="grid grid-cols-2 gap-1" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded bg-bg-accent" />
                  ))}
                </div>
              )}
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
            </div>
            <footer className="flex h-12 shrink-0 items-center justify-between gap-2 bg-bg-secondary-alt px-3 text-[12px] text-header-secondary"><span className="truncate">{preview}</span><span className="shrink-0 font-bold">KLIPY</span></footer>
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
        className={`mt-[6px] flex h-8 w-10 items-center justify-center transition-colors hover:text-interactive-active disabled:cursor-not-allowed disabled:opacity-40 ${
          open ? "text-interactive-active" : "text-interactive-normal"
        }`}
      >
        <SolidGifIcon size={24} />
      </button>
      {panel}
    </div>
  );
}
