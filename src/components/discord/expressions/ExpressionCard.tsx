"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconStar } from "@/components/icons";
import { twemojiUrl } from "@/components/ui/Twemoji";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePresence } from "@/hooks/usePresence";
import { getEmoji, useExpressions } from "@/lib/expressions";
import { shortcodeFor } from "@/lib/emoji-shortcodes";
import { fetchGuildTagSpace, type GuildTagSpace } from "@/lib/guild-tags";
import { handleTopmostEscape, pushEscapeHandler } from "@/lib/overlay";
import { safeImageUrl } from "@/lib/safe-url";
import { toggleFavouriteSticker, useStickerPrefs, type Sticker } from "@/lib/stickers";
import { StickerArt } from "../stickers/StickerArt";

/*
 The card that opens when you click an emoji or a sticker in a message, like
 Discord's: the emoji large with its name and where it can be used, and for a
 space's emoji or sticker, which space it is from (icon, name, how many are
 online, whether it's discoverable). It pops in from the emoji and shrinks
 back out when closed.
*/

export type CardContent =
  | { kind: "unicode"; emoji: string }
  | { kind: "custom"; name: string; url: string; serverId: string | null }
  | { kind: "sticker"; sticker: Sticker; packName: string | null; serverId: string | null };

interface CardState {
  key: number;
  rect: { left: number; top: number; right: number; bottom: number };
  content: CardContent;
}

let card: CardState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openExpressionCard(anchor: Element, content: CardContent) {
  const r = anchor.getBoundingClientRect();
  // A second click on the same thing closes it.
  if (card && JSON.stringify(card.content) === JSON.stringify(content)) {
    closeExpressionCard();
    return;
  }
  card = { key: ++seq, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, content };
  emit();
}

export function closeExpressionCard() {
  if (!card) return;
  card = null;
  emit();
}

/**
 * Click handler for message text: opens the card for a clicked emoji.
 * Ignores clicks that end a text selection.
 */
export function handleEmojiClick(e: React.MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target || target.tagName !== "IMG") return;
  if (window.getSelection()?.toString()) return;
  if (target.classList.contains("custom-emoji")) {
    const name = target.dataset.emojiName ?? target.getAttribute("alt")?.replace(/:/g, "") ?? "";
    const id = target.dataset.emojiId;
    const known = id ? getEmoji(id) : null;
    openExpressionCard(target, {
      kind: "custom",
      name,
      url: target.getAttribute("src") ?? "",
      serverId: known?.serverId ?? target.dataset.emojiServer ?? null,
    });
  } else if (target.classList.contains("twemoji")) {
    const emoji = target.getAttribute("alt");
    if (emoji) openExpressionCard(target, { kind: "unicode", emoji });
  }
}

const WIDTH = 340;

/** Mounted once per chat view; draws whichever card is open. */
export function ExpressionCardHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => card,
    () => null,
  );
  const { mounted, exiting } = usePresence(!!current, 160);
  const last = useRef<CardState | null>(null);
  if (current) last.current = current;
  const shown = current ?? last.current;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!current) return;
    const release = pushEscapeHandler(closeExpressionCard);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t)) return;
      // The click that opens another card handles itself.
      if (t?.closest?.("img.custom-emoji, img.twemoji, [data-sticker-message]")) return;
      closeExpressionCard();
    };
    const onKey = (e: KeyboardEvent) => handleTopmostEscape(e);
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      closeExpressionCard();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeExpressionCard);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      release();
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeExpressionCard);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [current]);

  if (!mounted || !shown || typeof document === "undefined") return null;

  // Beside the emoji, flipped left or above when it would run off screen.
  const { rect } = shown;
  const width = Math.min(WIDTH, window.innerWidth - 16);
  let left = rect.right + 10;
  if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 10);
  const top = Math.max(8, Math.min(rect.top - 8, window.innerHeight - 260));
  const origin = left > rect.left ? "left top" : "right top";

  return createPortal(
    <div
      ref={ref}
      key={shown.key}
      role="dialog"
      aria-label={shown.content.kind === "sticker" ? shown.content.sticker.name : "Emoji"}
      className={`menu-pop${exiting ? " pop-out" : ""} fixed z-[96] overflow-hidden rounded-xl border border-border-subtle bg-bg-floating shadow-[var(--elevation-high)]`}
      style={{ left, top, width, transformOrigin: origin }}
    >
      <CardBody content={shown.content} />
    </div>,
    document.body,
  );
}

function CardBody({ content }: { content: CardContent }) {
  const { t } = useI18n();
  const { servers } = useApp();
  const prefs = useStickerPrefs();
  useExpressions();
  const serverId = content.kind === "unicode" ? null : content.serverId;
  const member = !!serverId && servers.some((s) => s.id === serverId);

  let visual: React.ReactNode;
  let title: string;
  let body: string;
  if (content.kind === "unicode") {
    const code = shortcodeFor(content.emoji);
    // eslint-disable-next-line @next/next/no-img-element
    visual = <img src={twemojiUrl(content.emoji)} alt={content.emoji} className="h-12 w-12" draggable={false} />;
    title = code ? `:${code}:` : content.emoji;
    body = t("A default emoji. You can use this emoji everywhere on Disband.");
  } else if (content.kind === "custom") {
    const src = safeImageUrl(content.url);
    // eslint-disable-next-line @next/next/no-img-element
    visual = src ? <img src={src} alt="" className="h-12 w-12 object-contain" draggable={false} /> : null;
    title = `:${content.name}:`;
    body = member
      ? t("This emoji is from one of your spaces. Type its name in the chat bar to use it.")
      : serverId
        ? t("This emoji is from a space you're not in.")
        : t("A custom emoji.");
  } else {
    visual = <StickerArt sticker={content.sticker} size={72} playing />;
    title = content.sticker.name;
    body = content.packName
      ? t("A sticker from the {pack} pack.", { pack: content.packName })
      : member
        ? t("This sticker is from one of your spaces. Send it from the sticker picker.")
        : t("This sticker is from a space you're not in.");
  }

  const sticker = content.kind === "sticker" ? content.sticker : null;
  const favourite = !!sticker && prefs.favourites.includes(sticker.id);

  return (
    <>
      <div className="flex items-center gap-3.5 p-4">
        <div className="flex shrink-0 items-center justify-center">{visual}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-header-primary">{title}</p>
          <p className="mt-0.5 text-[14px] leading-snug text-header-secondary">{body}</p>
        </div>
        {sticker && (
          <button
            type="button"
            aria-label={favourite ? t("Unfavourite Sticker") : t("Favourite Sticker")}
            title={favourite ? t("Unfavourite Sticker") : t("Favourite Sticker")}
            aria-pressed={favourite}
            onClick={() => toggleFavouriteSticker(sticker.id)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg transition-colors hover:bg-interactive-hover ${
              favourite ? "text-status-idle [&_svg]:fill-current" : "text-interactive-normal hover:text-interactive-active"
            }`}
          >
            <IconStar size={18} />
          </button>
        )}
      </div>
      {serverId && <SpaceFooter serverId={serverId} label={content.kind === "sticker" ? t("This sticker is from") : t("This emoji is from")} />}
    </>
  );
}

const spaceCache = new Map<string, GuildTagSpace | null>();

function SpaceFooter({ serverId, label }: { serverId: string; label: string }) {
  const { t } = useI18n();
  const { servers } = useApp();
  const mine = servers.find((s) => s.id === serverId) ?? null;
  const [space, setSpace] = useState<GuildTagSpace | null | undefined>(() => spaceCache.get(serverId));

  useEffect(() => {
    if (spaceCache.has(serverId)) return;
    let live = true;
    void fetchGuildTagSpace(serverId).then(({ space: s }) => {
      spaceCache.set(serverId, s);
      if (live) setSpace(s);
    });
    return () => {
      live = false;
    };
  }, [serverId]);

  const info = space && !space.private ? space : null;
  const name = info?.name ?? mine?.name ?? null;
  const icon = safeImageUrl(info?.icon_url ?? mine?.icon_url ?? null);
  const isPrivate = space?.private === true && !mine;

  return (
    <div className="border-t border-border-subtle bg-bg-secondary-alt px-4 pb-4 pt-3">
      <p className="mb-2 text-[13px] font-medium text-header-secondary">{label}</p>
      {isPrivate ? (
        <p className="text-[14px] text-text-muted">{t("A private space.")}</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-tertiary text-[14px] font-semibold text-header-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {icon ? <img src={icon} alt="" className="h-full w-full object-cover" /> : (name ?? "?").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-header-primary">{name ?? t("Loading…")}</p>
            {info && (
              <p className="flex items-center gap-1.5 text-[13px] text-text-muted">
                <span className="h-2 w-2 rounded-full bg-status-online" aria-hidden />
                {t("{count} Online", { count: info.online_count.toLocaleString() })}
                {info.discoverable && (
                  <>
                    <span aria-hidden>·</span>
                    {t("Discoverable Space")}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
