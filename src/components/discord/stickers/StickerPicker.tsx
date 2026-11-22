"use client";

import { Clock } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconChevron, IconClose, IconLink, IconSearch, IconStar } from "@/components/icons";
import { SolidStickerIcon } from "@/components/icons/SolidIcons";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { useApp } from "@/contexts/AppContext";
import { spaceStickers, useExpressions } from "@/lib/expressions";
import { safeImageUrl } from "@/lib/safe-url";
import { useI18n } from "@/contexts/I18nContext";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { OVERLAY_Z } from "@/lib/overlay";
import {
  findPack,
  findSticker,
  fromSpaceSticker,
  packIcon,
  recordStickerUse,
  searchStickers,
  stickerImageLink,
  toggleFavouriteSticker,
  useStickerPacks,
  useStickerPrefs,
  type Sticker,
  type StickerPack,
} from "@/lib/stickers";
import { StickerArt } from "./StickerArt";

/*
 The composer's sticker picker, laid out like Discord's: search along the
 top, a rail on the left with Favourites, Recently used and one icon per pack
 (click to jump, or just scroll), the stickers in a four-column grid, and the
 hovered sticker named in the footer. Hovering a sticker plays it; clicking
 sends it; right-clicking offers Favourite, Copy Sticker ID and Copy Sticker
 Image Link.
*/

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  disabled?: boolean;
}

interface Section {
  key: string;
  kind: "favourites" | "recent" | "pack";
  title: string;
  pack: StickerPack | null;
  stickers: Sticker[];
}

/** Renders nothing until there are stickers to offer (today: only on the dev server). */
export function StickerPicker(props: StickerPickerProps) {
  const { packs: localPacks } = useStickerPacks();
  const { servers } = useApp();
  const ids = useMemo(() => servers.map((s) => s.id), [servers]);
  const version = useExpressions(ids);
  // One pack per space you're in that has stickers, in your space list's order.
  const packs = useMemo<StickerPack[]>(() => {
    const spacePacks: StickerPack[] = servers
      .map((server) => ({ server, stickers: spaceStickers(server.id) }))
      .filter((x) => x.stickers.length > 0)
      .map(({ server, stickers }) => ({
        id: `space:${server.id}`,
        name: server.name,
        description: null,
        icon: null,
        serverId: server.id,
        iconUrl: server.icon_url,
        stickers: stickers.map(fromSpaceSticker),
      }));
    return [...spacePacks, ...localPacks];
    // `version` changes whenever space stickers load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, localPacks, version]);
  if (packs.length === 0) return null;
  return <StickerPickerButton {...props} packs={packs} />;
}

/** How many stickers draw at first, and how many more each time you near the end. */
const PAGE = 32;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No clipboard access (an insecure origin, say): nothing more to do.
  }
}

function StickerPickerButton({ packs, onSelect, disabled }: StickerPickerProps & { packs: StickerPack[] }) {
  const { t } = useI18n();
  const { openMenu } = useContextMenu();
  const prefs = useStickerPrefs();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [preview, setPreview] = useState<Sticker | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0, width: 480 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(PAGE);
  useOverlayDismiss(() => setOpen(false), open);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) return;
    setSearch("");
    setHovered(null);
    setPreview(null);
    setLimit(PAGE);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const q = search.trim();
  const results = useMemo(() => searchStickers(packs, q), [packs, q]);

  // A new search: the footer names the top result until something is hovered.
  useEffect(() => {
    setPreview(null);
    setLimit(PAGE);
  }, [q]);


  const sections = useMemo<Section[]>(() => {
    const resolve = (ids: string[]) =>
      ids.map((id) => findSticker(packs, id)).filter((s): s is Sticker => !!s);
    const list: Section[] = [];
    const favourites = resolve(prefs.favourites);
    const recent = resolve(prefs.recent);
    if (favourites.length) list.push({ key: "favourites", kind: "favourites", title: "Favourites", pack: null, stickers: favourites });
    if (recent.length) list.push({ key: "recent", kind: "recent", title: "Recently used", pack: null, stickers: recent });
    for (const pack of packs) {
      list.push({ key: `pack:${pack.id}`, kind: "pack", title: pack.name, pack, stickers: pack.stickers });
    }
    return list;
  }, [packs, prefs]);

  // Like message history: the next page of stickers draws as you near the end.
  // Only while there is more to draw, so a short list doesn't re-render forever.
  const total = q ? results.length : sections.reduce((n, sec) => n + (collapsed.has(sec.key) ? 0 : sec.stickers.length), 0);
  const hasMore = limit < total;
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!open || !hasMore || !el || !root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE);
      },
      { root, rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, hasMore, limit]);

  const updatePanelPos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(480, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPanelPos({ left, bottom: window.innerHeight - rect.top + 8, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    setActive(sections[0]?.key ?? null);
    window.addEventListener("resize", updatePanelPos);
    return () => window.removeEventListener("resize", updatePanelPos);
    // Only on opening: the rail then follows the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, updatePanelPos]);

  // Close on a press outside, except inside a menu opened from a sticker.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      if (target.closest("[data-context-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The rail follows whichever section is at the top of the list.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || q) return;
    let current = sections[0]?.key ?? null;
    for (const s of sections) {
      const node = sectionEls.current.get(s.key);
      if (node && node.offsetTop - el.scrollTop <= 24) current = s.key;
    }
    // Scrolled to the end: the last section is the one in view, even if it is
    // too short for its header to reach the top.
    if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      current = sections[sections.length - 1]?.key ?? current;
    }
    setActive(current);
  }, [sections, q]);

  const jumpTo = (key: string) => {
    setActive(key);
    let before = 0;
    for (const s of sections) {
      if (s.key === key) break;
      before += s.stickers.length;
    }
    setLimit((n) => Math.max(n, before + PAGE));
    const scroll = () => {
      const node = sectionEls.current.get(key);
      scrollRef.current?.scrollTo({ top: node ? node.offsetTop : 0, behavior: "smooth" });
    };
    if (q) setSearch("");
    requestAnimationFrame(scroll);
  };

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pick = (sticker: Sticker) => {
    recordStickerUse(sticker.id);
    onSelect(sticker);
    setOpen(false);
  };

  const showMenu = (e: ReactMouseEvent, sticker: Sticker) => {
    e.preventDefault();
    e.stopPropagation();
    const favourite = prefs.favourites.includes(sticker.id);
    openMenu(e.clientX, e.clientY, [
      {
        id: "favourite",
        label: favourite ? "Unfavourite Sticker" : "Favourite Sticker",
        icon: <IconStar size={18} />,
        onClick: () => toggleFavouriteSticker(sticker.id),
      },
      { id: "copy-id", label: "Copy Sticker ID", icon: <IdGlyph />, onClick: () => void copyText(sticker.id) },
      {
        id: "copy-link",
        label: "Copy Sticker Image Link",
        icon: <IconLink size={18} />,
        onClick: () => void copyText(stickerImageLink(sticker)),
      },
    ]);
  };

  const hover = (key: string | null, sticker: Sticker | null) => {
    setHovered(key);
    if (sticker) setPreview(sticker);
  };

  // Arrow keys move between stickers; up from the top row goes back to search.
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 } as Record<string, number>)[e.key];
    if (!step) return;
    const cells = Array.from(scrollRef.current?.querySelectorAll<HTMLButtonElement>("[data-sticker-cell]") ?? []);
    const i = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    if (i + step < 0) {
      searchRef.current?.focus();
      return;
    }
    cells[Math.min(cells.length - 1, i + step)]?.focus();
  };

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      scrollRef.current?.querySelector<HTMLButtonElement>("[data-sticker-cell]")?.focus();
    } else if (e.key === "Enter" && q && results[0]) {
      e.preventDefault();
      pick(results[0]);
    }
  };

  const shown = preview ?? (q ? results[0] : sections[0]?.stickers[0]) ?? null;
  const shownPack = shown ? findPack(packs, shown.packId) : null;
  const shownPackIcon = shownPack ? packIcon(shownPack) : null;

  // Stickers left to draw on this page (see PAGE), shared across sections.
  let remaining = limit;

  const grid = (key: string, stickers: Sticker[]) => (
    <div className="grid grid-cols-4 gap-1 pb-2" style={{ minHeight: stickers.length ? undefined : 0 }}>
      {stickers.map((sticker) => {
        const cellKey = `${key}:${sticker.id}`;
        return (
          <button
            key={cellKey}
            type="button"
            data-sticker-cell
            aria-label={sticker.name}
            title={sticker.name}
            onMouseEnter={() => hover(cellKey, sticker)}
            onMouseLeave={() => hover(null, null)}
            onFocus={() => hover(cellKey, sticker)}
            onBlur={() => hover(null, null)}
            onClick={() => pick(sticker)}
            onContextMenu={(e) => showMenu(e, sticker)}
            className="aspect-square rounded-lg p-1.5 outline-none transition-colors hover:bg-interactive-hover focus-visible:bg-interactive-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <StickerArt sticker={sticker} size="100%" />
          </button>
        );
      })}
    </div>
  );

  const sectionIcon = (s: Section, size: number) => {
    if (s.kind === "favourites") return <IconStar size={size - 2} />;
    if (s.kind === "recent") return <Clock size={size - 2} strokeWidth={1.75} />;
    if (s.pack?.serverId) return <SpaceIcon name={s.pack.name} url={s.pack.iconUrl ?? null} size={size} />;
    const icon = s.pack ? packIcon(s.pack) : null;
    return icon ? <StickerArt sticker={icon} size={size} playing={false} /> : null;
  };

  const panel =
    mounted && open
      ? createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-label={t("Sticker picker")}
            className="menu-pop fixed flex h-[460px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-floating shadow-[var(--elevation-high)]"
            style={{
              // Just under the context menu, so a right-click menu opens on top.
              zIndex: OVERLAY_Z.contextMenu - 1,
              left: panelPos.left,
              bottom: panelPos.bottom,
              width: panelPos.width,
              maxHeight: `calc(100dvh - ${panelPos.bottom + 8}px)`,
            }}
          >
            <div className="shrink-0 border-b border-border-subtle p-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <IconSearch size={16} />
                </span>
                <input
                  ref={searchRef}
                  autoFocus
                  aria-label={t("Search stickers")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder={t("Find the perfect sticker")}
                  className="h-9 w-full rounded-lg border border-border-subtle bg-bg-tertiary pl-9 pr-9 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-brand"
                />
                {search && (
                  <button
                    type="button"
                    aria-label={t("Clear search")}
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-interactive-normal hover:text-interactive-active"
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <nav
                aria-label={t("Sticker packs")}
                className="channel-scroll flex w-12 shrink-0 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden border-r border-border-subtle bg-bg-secondary py-2"
              >
                {sections.map((s) => {
                  const label = s.pack ? s.title : t(s.title);
                  const isActive = !q && active === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-pressed={isActive}
                      onClick={() => jumpTo(s.key)}
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? "bg-interactive-selected text-interactive-active"
                          : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute -left-1.5 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-header-primary transition-[height] duration-150 ${
                          isActive ? "h-5" : "h-0"
                        }`}
                      />
                      {sectionIcon(s, 28)}
                    </button>
                  );
                })}
              </nav>

              <div
                ref={scrollRef}
                data-sticker-scroll
                onScroll={onScroll}
                onKeyDown={onGridKey}
                className="channel-scroll relative min-w-0 flex-1 overflow-y-auto px-2"
              >
                {q ? (
                  results.length > 0 ? (
                    <section aria-label={t("Search results")}>
                      <h3 className="px-1 pb-1.5 pt-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                        {t("Search results")}
                      </h3>
                      {grid("search", results.slice(0, limit))}
                    </section>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-text-muted">
                      <SolidStickerIcon size={40} className="opacity-60" />
                      <p className="text-[14px]">{t("No stickers match “{query}”.", { query: q })}</p>
                    </div>
                  )
                ) : (
                  sections.map((s) => {
                    if (remaining <= 0) return null;
                    const isCollapsed = collapsed.has(s.key);
                    const page = isCollapsed ? [] : s.stickers.slice(0, remaining);
                    remaining -= page.length;
                    const label = s.pack ? s.title : t(s.title);
                    return (
                      <section
                        key={s.key}
                        aria-label={label}
                        ref={(el) => {
                          if (el) sectionEls.current.set(s.key, el);
                          else sectionEls.current.delete(s.key);
                        }}
                      >
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          onClick={() => toggleSection(s.key)}
                          className="sticky top-0 z-[1] flex w-full items-center gap-2 bg-bg-floating px-1 pb-1.5 pt-2.5 text-left text-[14px] font-semibold text-header-secondary hover:text-header-primary"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center">{sectionIcon(s, 20)}</span>
                          <span className="min-w-0 truncate">{label}</span>
                          <span className={`shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>
                            <IconChevron size={16} />
                          </span>
                        </button>
                        {!isCollapsed && grid(s.key, page)}
                      </section>
                    );
                  })
                )}
                <div ref={sentinelRef} aria-hidden className="h-px" />
              </div>
            </div>

            <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-secondary-alt px-3">
              {shown ? (
                <>
                  <StickerArt sticker={shown} size={36} playing={false} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-[14px] font-semibold text-header-primary">{shown.name}</p>
                    {shownPack && (
                      <p className="truncate text-[12px] text-text-muted">{t("from {pack}", { pack: shownPack.name })}</p>
                    )}
                  </div>
                  {shownPack?.serverId ? (
                    <span title={shownPack.name} className="shrink-0">
                      <SpaceIcon name={shownPack.name} url={shownPack.iconUrl ?? null} size={32} />
                    </span>
                  ) : shownPackIcon ? (
                    <span title={shownPack?.name} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary">
                      <StickerArt sticker={shownPackIcon} size={28} playing={false} />
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-[14px] text-header-secondary">{t("Pick a sticker")}</span>
              )}
            </footer>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={t("Send a sticker")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        title={disabled ? t("Finish editing before sending a sticker") : t("Send a sticker")}
        onClick={() => setOpen((v) => !v)}
        className={`mt-[9px] flex h-8 w-10 items-center justify-center transition-colors hover:text-interactive-active disabled:cursor-not-allowed disabled:opacity-40 ${
          open ? "text-interactive-active" : "text-interactive-normal"
        }`}
      >
        <SolidStickerIcon size={24} />
      </button>
      {panel}
    </div>
  );
}

/** "ID" in a filled tag, for the Copy Sticker ID item. */
function IdGlyph(): ReactNode {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <mask id={id}>
        <rect x="2" y="5" width="20" height="14" rx="3" fill="#fff" />
        <text x="12" y="15.6" textAnchor="middle" fontSize="9" fontWeight="800" fontFamily="inherit" fill="#000">
          ID
        </text>
      </mask>
      <rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** A space's icon (or its initials), for the rail and footer. */
function SpaceIcon({ name, url, size }: { name: string; url: string | null; size: number }) {
  const src = safeImageUrl(url);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-tertiary text-[11px] font-semibold text-header-primary"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2)}
    </span>
  );
}
