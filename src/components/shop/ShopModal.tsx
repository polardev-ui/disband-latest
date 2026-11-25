"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { apiFetch } from "@/lib/api";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { IconClose } from "@/components/icons";
import { CartIcon } from "@/components/icons/CartIcon";
import { CosmeticAvatar, CosmeticProfile } from "@/components/shop/CosmeticPreview";
import {
  SHOP_CATEGORIES,
  effectivePriceCents,
  formatPrice,
  itemsIn,
  isShopItemAvailable,
  shopItem,
  type ShopCategory,
  type ShopItem,
} from "@/lib/shop";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface Inventory {
  owned: string[];
  equipped: Record<ShopCategory, string | null>;
}

const EMPTY: Inventory = { owned: [], equipped: { name: null, ring: null, overlay: null } };

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  /** The viewer's own name and avatar, so previews show their own profile. */
  self: { name: string; avatarUrl?: string | null };
  /** Called after a purchase or equip so the app can refresh its profile. */
  onChanged?: () => void;
  initialCategory?: ShopCategory;
  /** "page" fills the main column (opened from the sidebar); "modal" floats. */
  variant?: "modal" | "page";
}

export function ShopModal({ open, onClose, self, onChanged, initialCategory = "ring", variant = "modal" }: ShopModalProps) {
  const page = variant === "page";
  const [tab, setTab] = useState<ShopCategory>("ring");
  // The item on the try-on panel. Picking a card selects it; nothing is
  // bought or worn until you press the button there.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory>(EMPTY);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Gifting: the item being gifted (picker open) and who it is for.
  const [giftItem, setGiftItem] = useState<ShopItem | null>(null);
  const [giftTo, setGiftTo] = useState<Profile | null>(null);
  const [friendQuery, setFriendQuery] = useState("");
  const { friendships, user } = useApp();
  const friends = useMemo(
    () => friendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f.requester_id === user?.id ? f.addressee : f.requester))
      .filter((p): p is Profile => !!p && !p.is_bot)
      .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [friendships, user?.id],
  );
  // Live sale prices keyed by item id. The catalogue carries list prices;
  // sales live in the database (public readable) so a price change never
  // needs a client deploy. Missing entry = no sale.
  const [sales, setSales] = useState<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/shop/equip");
      if (!res.ok) return;
      const data = (await res.json()) as Inventory;
      setInventory({ owned: data.owned ?? [], equipped: { ...EMPTY.equipped, ...data.equipped } });
    } catch {
      // Leave the last known inventory rather than blanking the storefront.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    setError(null);
    setBuying(null);
    setClientSecret(null);
    setGiftItem(null);
    setGiftTo(null);
    setNotice(null);
    // Name effects aren't sold any more; anything asking for them lands on decorations.
    setTab(initialCategory === "name" ? "ring" : initialCategory);
    void (async () => {
      try {
        const { data } = await getSupabaseClient()
          .from("shop_items")
          .select("id,sale_price_cents");
        const next = new Map<string, number>();
        for (const row of (data ?? []) as { id: string; sale_price_cents: number | null }[]) {
          if (row && typeof row.sale_price_cents === "number") next.set(row.id, row.sale_price_cents);
        }
        setSales(next);
      } catch {
        // No sale data: everything renders at list price.
      }
    })();
  }, [open, refresh, initialCategory]);

  useOverlayDismiss(onClose, open && !clientSecret && !page);

  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned]);
  const items = useMemo(
    () =>
      itemsIn(tab)
        .filter((item) => isShopItemAvailable(item) || owned.has(item.id))
        .map((item) => {
          const sale = sales.get(item.id);
          return sale === undefined ? item : { ...item, salePriceCents: sale };
        }),
    [tab, owned, sales],
  );

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  useEffect(() => {
    setSelectedId(null);
  }, [tab]);

  const { mounted, exiting } = usePresence(open);
  if (!mounted) return null;

  const startPurchase = async (item: ShopItem, recipient: Profile | null = null) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    setGiftTo(recipient);
    try {
      const res = await apiFetch("/api/stripe/create-shop-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, recipient_id: recipient?.id }),
      });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      setBuying(item);
      setGiftItem(null);
      setClientSecret(data.clientSecret);
    } catch {
      setError("Could not reach the shop.");
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (item: ShopItem | null, category: ShopCategory) => {
    setBusyId(item?.id ?? `clear-${category}`);
    setError(null);
    try {
      const res = await apiFetch("/api/shop/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item?.id ?? null, category }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not change that.");
        return;
      }
      setInventory((prev) => ({
        ...prev,
        equipped: { ...prev.equipped, [category]: item?.id ?? null },
      }));
      onChanged?.();
    } catch {
      setError("Could not reach the shop.");
    } finally {
      setBusyId(null);
    }
  };

  const finishPurchase = async () => {
    const bought = buying;
    setClientSecret(null);
    setBuying(null);
    if (giftTo) {
      // Theirs, not ours: nothing to wait for in our own inventory.
      setNotice(`Sent! ${displayName(giftTo)} gets ${bought?.name ?? "it"} and a notification as soon as the payment clears.`);
      setGiftTo(null);
      return;
    }
    // The webhook writes the grant, so the row may land a moment after Stripe
    // returns. Poll briefly rather than showing a just-bought item as unowned.
    for (let i = 0; i < 6; i++) {
      await refresh();
      if (bought && (await hasItem(bought.id))) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    onChanged?.();
  };

  const hasItem = async (id: string) => {
    try {
      const res = await apiFetch("/api/shop/equip");
      const data = (await res.json()) as Inventory;
      return (data.owned ?? []).includes(id);
    } catch {
      return false;
    }
  };

  const category = SHOP_CATEGORIES.find((c) => c.id === tab);
  const wornName = inventory.equipped.name ? shopItem(inventory.equipped.name) : null;

  const header = (
    <header className={`flex h-14 shrink-0 items-center gap-3 border-b px-4 ${page ? "border-column-border" : "border-border-subtle"}`}>
      <CartIcon size={20} className="shrink-0 text-interactive-normal" />
      <h2 className="text-[16px] font-semibold text-header-primary">Shop</h2>
      {!clientSecret && !giftItem && (
        <>
          <span aria-hidden className="mx-1 h-6 w-px bg-border-subtle" />
          <nav aria-label="Shop sections" className="flex items-center gap-1">
            {SHOP_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={tab === c.id}
                onClick={() => setTab(c.id)}
                className={`h-8 rounded-md px-2.5 text-[14px] font-medium transition-colors ${
                  tab === c.id
                    ? "bg-interactive-selected text-interactive-active"
                    : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
                }`}
              >
                {c.label}
              </button>
            ))}
          </nav>
        </>
      )}
      {(!page || clientSecret || giftItem) && (
        <button
          type="button"
          aria-label={page ? "Back to the shop" : "Close"}
          onClick={() => {
            if (page && (clientSecret || giftItem)) {
              setClientSecret(null);
              setBuying(null);
              setGiftItem(null);
              setGiftTo(null);
              return;
            }
            onClose();
          }}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        >
          <IconClose size={20} />
        </button>
      )}
    </header>
  );

  const tryOn = selected ? (
    <TryOn
      item={selected}
      self={self}
      equippedRing={inventory.equipped.ring}
      equippedOverlay={inventory.equipped.overlay}
      owned={owned.has(selected.id)}
      equipped={inventory.equipped[selected.category] === selected.id}
      busy={busyId === selected.id || busyId === `clear-${selected.category}`}
      error={error}
      notice={notice}
      onBuy={() => void startPurchase(selected)}
      onGift={isShopItemAvailable(selected) ? () => { setGiftItem(selected); setGiftTo(null); setFriendQuery(""); setError(null); } : undefined}
      onEquip={() => void equip(selected, selected.category)}
      onUnequip={() => void equip(null, selected.category)}
    />
  ) : null;

  const storefront = (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-8 pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-header-primary">{category?.label}</h3>
            <span className="text-[13px] tabular-nums text-text-muted">{items.length} items</span>
          </div>
          <p className="mt-1 text-[14px] text-text-muted">{category?.blurb} Pay once and it&apos;s yours to keep.</p>

          {wornName && (
            <p className="mt-3 text-[13px] text-text-muted">
              Name effects are no longer sold. You&apos;re still wearing {wornName.name}.{" "}
              <button
                type="button"
                disabled={busyId === "clear-name"}
                onClick={() => void equip(null, "name")}
                className="font-medium text-text-link hover:underline disabled:opacity-50"
              >
                Take it off
              </button>
            </p>
          )}

          {/* Narrow windows have no side panel: the try-on sits above the grid. */}
          {selectedId && tryOn && <div className="mt-4 rounded-lg border border-border-subtle bg-bg-secondary md:hidden">{tryOn}</div>}

          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
            {items.map((item) => (
              <ShopCard
                key={item.id}
                item={item}
                self={self}
                selected={selected?.id === item.id}
                owned={owned.has(item.id)}
                equipped={inventory.equipped[item.category] === item.id}
                onSelect={() => setSelectedId(item.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <aside aria-label="Preview" className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border-subtle bg-bg-secondary md:flex">
          {tryOn}
        </aside>
      )}
    </div>
  );

  const body = clientSecret && buying ? (
          <div className="mx-auto w-full max-w-[720px] overflow-y-auto px-5 py-6">
            <p className="text-sm font-semibold text-text-normal">
              {buying.name} · {formatPrice(effectivePriceCents(buying.priceCents, buying.salePriceCents))}
              {giftTo && <span className="font-normal text-text-muted"> · a gift for {displayName(giftTo)}</span>}
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">{buying.description}</p>
            <div className="mt-3">
              <StripeEmbeddedCheckout
                clientSecret={clientSecret}
                onSuccess={() => void finishPurchase()}
                onCancel={() => {
                  setClientSecret(null);
                  setBuying(null);
                  setGiftTo(null);
                }}
              />
            </div>
          </div>
  ) : giftItem ? (
          <div className="mx-auto grid min-h-0 w-full max-w-[880px] flex-1 gap-5 overflow-hidden px-5 pb-5 pt-5 md:grid-cols-[260px_1fr]">
            <aside className="flex flex-col rounded-lg bg-bg-secondary p-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-header-secondary">Gift</p>
              <div className="mt-3"><ShopPreview item={giftItem} self={giftTo ? { name: friendName(giftTo), avatarUrl: giftTo.avatar_url } : self} /></div>
              <p className="mt-3 text-[16px] font-semibold text-header-primary">{giftItem.name}</p>
              <p className="mt-1 text-[13px] leading-[18px] text-text-muted">{giftItem.description}</p>
              <p className="mt-auto pt-4 text-[13px] text-text-muted">
                They get it the moment you&apos;ve paid, with a note that it&apos;s from you.
              </p>
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[16px] font-semibold text-header-primary">Who&apos;s it for?</h3>
                <span className="text-[13px] text-text-muted">{friends.length} {friends.length === 1 ? "friend" : "friends"}</span>
              </div>
              <div className="relative mt-3">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm9.5 3-4.5-4.5" /></svg>
                <input
                  value={friendQuery}
                  onChange={(e) => setFriendQuery(e.target.value)}
                  placeholder="Search friends"
                  autoFocus
                  className="h-10 w-full rounded-[6px] bg-bg-tertiary pl-9 pr-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:ring-2 focus:ring-[#00a8fc]"
                />
              </div>
              {error && <p className="pt-2 text-[13px] text-status-dnd">{error}</p>}
              <ul role="listbox" aria-label="Friends" className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                {(() => {
                  const q = friendQuery.trim().toLowerCase();
                  const shown = friends.filter((f) => !q || `${friendName(f)} ${f.username ?? ""}`.toLowerCase().includes(q));
                  if (friends.length === 0) return <li className="px-2 py-10 text-center text-[14px] text-text-muted">Add some friends to send gifts.</li>;
                  if (shown.length === 0) return <li className="px-2 py-10 text-center text-[14px] text-text-muted">No friends match &ldquo;{friendQuery.trim()}&rdquo;.</li>;
                  return shown.map((f) => {
                    const selected = giftTo?.id === f.id;
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setGiftTo(f)}
                          className={`flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors ${selected ? "bg-brand/20 ring-1 ring-brand" : "hover:bg-interactive-hover"}`}
                        >
                          <Avatar profile={f} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium leading-5 text-header-primary">{friendName(f)}</span>
                            <span className="block truncate text-[12px] leading-4 text-text-muted">@{f.username}</span>
                          </span>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand bg-brand" : "border-interactive-normal/60"}`}>
                            {selected && <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" /></svg>}
                          </span>
                        </button>
                      </li>
                    );
                  });
                })()}
              </ul>
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-divider pt-3">
                <button type="button" onClick={() => { setGiftItem(null); setGiftTo(null); setError(null); }} className="h-[38px] rounded-md px-4 text-[14px] font-medium text-text-normal hover:underline">Back</button>
                <button
                  type="button"
                  disabled={!giftTo || busyId === giftItem.id}
                  onClick={() => giftTo && void startPurchase(giftItem, giftTo)}
                  className="h-[38px] min-w-[160px] rounded-md bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === giftItem.id
                    ? <LoadingDots size={6} className="mx-auto" />
                    : giftTo
                      ? `Gift to ${friendName(giftTo)} · ${formatPrice(effectivePriceCents(giftItem.priceCents, giftItem.salePriceCents))}`
                      : "Pick a friend"}
                </button>
              </div>
            </section>
          </div>
  ) : storefront;

  if (page) {
    return (
      <main aria-label="Disband Shop" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
        {header}
        {body}
      </main>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 bg-overlay-scrim-strong overlay-fade${exiting ? " overlay-fade-out" : ""}`} onClick={clientSecret ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disband Shop"
        className={`classic-modal${exiting ? " classic-modal-out" : ""} relative flex h-[min(85vh,820px)] w-full max-w-[1100px] flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-primary shadow-[var(--elevation-high)]`}
      >
        {header}
        {body}
      </div>
    </div>
  );
}

/** A name that actually shows: display names made of invisible or decorative characters fall back to the username. */
function friendName(p: Profile): string {
  const shown = displayName(p).replace(/[\u200B-\u200F\u2060\uFEFF\s]/g, "");
  return shown.length >= 1 && /[\p{L}\p{N}]/u.test(shown) ? displayName(p) : p.username ?? displayName(p);
}

/** A card in the grid: the artwork, its name and price. Clicking it puts it on the try-on panel. */
function ShopCard({
  item,
  self,
  selected,
  owned,
  equipped,
  onSelect,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
  selected: boolean;
  owned: boolean;
  equipped: boolean;
  onSelect: () => void;
}) {
  const price = effectivePriceCents(item.priceCents, item.salePriceCents);
  const onSale = price < item.priceCents;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group flex flex-col overflow-hidden rounded-lg text-left outline-none transition-[box-shadow,background-color] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
        selected ? "bg-bg-secondary ring-2 ring-brand" : "bg-bg-secondary hover:bg-bg-secondary-alt"
      }`}
    >
      <span className={`flex items-center justify-center overflow-hidden bg-bg-tertiary ${item.category === "overlay" ? "aspect-[4/5]" : "aspect-square"}`}>
        <ShopThumb item={item} self={self} />
      </span>
      <span className="flex items-baseline justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 truncate text-[14px] font-medium text-header-primary">{item.name}</span>
        <span className="shrink-0 text-[13px] tabular-nums">
          {equipped ? (
            <span className="font-medium text-status-online">Wearing</span>
          ) : owned ? (
            <span className="text-text-muted">Owned</span>
          ) : onSale ? (
            <span className="font-medium text-status-dnd">{formatPrice(price)}</span>
          ) : (
            <span className="text-text-muted">{formatPrice(price)}</span>
          )}
        </span>
      </span>
    </button>
  );
}

/** The grid thumbnail: the decoration on your avatar, or the skin scaled down. */
function ShopThumb({ item, self }: { item: ShopItem; self: { name: string; avatarUrl?: string | null } }) {
  if (item.category === "ring") return <CosmeticAvatar ringId={item.id} self={self} size={84} />;
  return (
    // The whole card, shrunk to fit a portrait tile: skins draw around every
    // edge, so a crop hid most of the artwork.
    <span className="pointer-events-none block w-[220px] shrink-0 origin-center scale-[0.62]">
      <CosmeticProfile overlayId={item.id} self={self} compact />
    </span>
  );
}

/**
 * The try-on panel: the selected item on your own profile (with whatever
 * you already wear in the other slot), what it is, and the one thing to do.
 */
function TryOn({
  item,
  self,
  equippedRing,
  equippedOverlay,
  owned,
  equipped,
  busy,
  error,
  notice,
  onBuy,
  onGift,
  onEquip,
  onUnequip,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
  equippedRing: string | null;
  equippedOverlay: string | null;
  owned: boolean;
  equipped: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onBuy: () => void;
  onGift?: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  const price = effectivePriceCents(item.priceCents, item.salePriceCents);
  const onSale = price < item.priceCents;
  const ring = item.category === "ring" ? item.id : equippedRing;
  const overlay = item.category === "overlay" ? item.id : equippedOverlay;
  return (
    <div className="flex flex-col p-5">
      <div className="mx-auto w-full max-w-[280px]">
        <CosmeticProfile key={item.id} ringId={ring} overlayId={overlay} self={self} compact />
      </div>

      {/* How it looks next to a message, where people see it most. */}
      <div className="mt-4 flex items-center gap-2.5 rounded-md bg-bg-primary px-3 py-2.5">
        <CosmeticAvatar ringId={ring} self={self} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-header-primary">{self.name || "You"}</span>
          <span className="block truncate text-[13px] text-text-normal">Okay, this one feels like me.</span>
        </span>
      </div>

      <h3 className="mt-5 text-[18px] font-semibold text-header-primary">{item.name}</h3>
      <p className="mt-1 text-[14px] leading-5 text-text-muted">{item.description}</p>

      {!owned && (
        <p className="mt-4 text-[22px] font-semibold tabular-nums text-header-primary">
          {formatPrice(price)}
          {onSale && <span className="ml-2 text-[14px] font-normal text-text-muted line-through">{formatPrice(item.priceCents)}</span>}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {!owned ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="h-10 min-w-0 flex-1 rounded-md bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? <LoadingDots size={6} className="mx-auto" /> : "Buy"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={equipped ? onUnequip : onEquip}
            className={`h-10 min-w-0 flex-1 rounded-md px-4 text-[14px] font-medium text-white transition-colors disabled:opacity-50 ${
              equipped ? "bg-button-secondary hover:bg-button-secondary-hover" : "bg-brand hover:bg-brand-hover"
            }`}
          >
            {busy ? <LoadingDots size={6} className="mx-auto" /> : equipped ? "Take off" : "Wear it"}
          </button>
        )}
        {onGift && (
          <button
            type="button"
            onClick={onGift}
            className="h-10 shrink-0 rounded-md bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover"
          >
            Gift
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-status-dnd">{error}</p>}
      {notice && <p className="mt-3 text-[13px] text-status-online">{notice}</p>}
      <p className="mt-4 text-[12px] leading-[18px] text-text-muted">
        {owned ? "You own this. Wear it or take it off whenever you like." : "A one-off purchase, not a subscription. It shows on your avatar and profile everywhere."}
      </p>
    </div>
  );
}

/** The gift screen's preview of the item, on whoever it's for. */
function ShopPreview({
  item,
  self,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
}) {
  if (item.category === "ring") {
    return <div className="flex min-h-[160px] items-center justify-center rounded-md bg-bg-primary"><CosmeticAvatar ringId={item.id} self={self} /></div>;
  }
  return <CosmeticProfile overlayId={item.id} self={self} compact />;
}
