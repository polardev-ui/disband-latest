"use client";

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
}

export function ShopModal({ open, onClose, self, onChanged, initialCategory = "ring" }: ShopModalProps) {
  const [tab, setTab] = useState<ShopCategory>("ring");
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
    setTab(initialCategory);
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

  useOverlayDismiss(onClose, open && !clientSecret);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 bg-overlay-scrim-strong overlay-fade${exiting ? " overlay-fade-out" : ""}`} onClick={clientSecret ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disband Shop"
        className={`classic-modal${exiting ? " classic-modal-out" : ""} relative flex max-h-[85vh] w-full max-w-[860px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
      >
        <header className="flex items-center gap-3 px-4 pb-2 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <CartIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-semibold leading-6 text-header-primary">Shop</h2>
            <p className="truncate text-[14px] leading-[18px] text-header-secondary">
              Buy once, wear it everywhere. No subscription.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-interactive-normal transition-colors hover:text-interactive-active"
          >
            <IconClose size={24} />
          </button>
        </header>

        {clientSecret && buying ? (
          <div className="overflow-y-auto px-5 py-4">
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
          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden px-5 pb-5 pt-2 md:grid-cols-[260px_1fr]">
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
                <button type="button" onClick={() => { setGiftItem(null); setGiftTo(null); setError(null); }} className="h-[38px] rounded-[3px] px-4 text-[14px] font-medium text-text-normal hover:underline">Back</button>
                <button
                  type="button"
                  disabled={!giftTo || busyId === giftItem.id}
                  onClick={() => giftTo && void startPurchase(giftItem, giftTo)}
                  className="h-[38px] min-w-[160px] rounded-[3px] bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === giftItem.id
                    ? "Opening…"
                    : giftTo
                      ? `Gift to ${friendName(giftTo)} · ${formatPrice(effectivePriceCents(giftItem.priceCents, giftItem.salePriceCents))}`
                      : "Pick a friend"}
                </button>
              </div>
            </section>
          </div>
        ) : (
          <>
            <nav className="flex gap-5 border-b border-divider px-4">
              {SHOP_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={tab === c.id}
                  onClick={() => setTab(c.id)}
                  className={`-mb-px border-b-2 py-3 text-[16px] font-medium leading-5 transition-colors ${
                    tab === c.id
                      ? "border-brand text-interactive-active"
                      : "border-transparent text-interactive-normal hover:border-interactive-normal/50 hover:text-text-normal"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center justify-between px-5 pt-3">
              <p className="text-[13px] text-text-muted">
                {SHOP_CATEGORIES.find((c) => c.id === tab)?.blurb}
              </p>
              {inventory.equipped[tab] && (
                <button
                  type="button"
                  onClick={() => void equip(null, tab)}
                  className="text-[13px] text-text-muted underline hover:text-text-normal"
                >
                  Unequip
                </button>
              )}
            </div>

            {error && <p className="px-5 pt-2 text-[13px] text-status-dnd">{error}</p>}
            {notice && <p className="px-5 pt-2 text-[13px] text-status-online">{notice}</p>}

            <div className="grid grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ShopCard
                  key={item.id}
                  item={item}
                  self={self}
                  owned={owned.has(item.id)}
                  equipped={inventory.equipped[item.category] === item.id}
                  busy={busyId === item.id}
                  onBuy={() => void startPurchase(item)}
                  onGift={isShopItemAvailable(item) ? () => { setGiftItem(item); setGiftTo(null); setFriendQuery(""); setError(null); } : undefined}
                  onEquip={() => void equip(item, item.category)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A name that actually shows: display names made of invisible or decorative characters fall back to the username. */
function friendName(p: Profile): string {
  const shown = displayName(p).replace(/[\u200B-\u200F\u2060\uFEFF\s]/g, "");
  return shown.length >= 1 && /[\p{L}\p{N}]/u.test(shown) ? displayName(p) : p.username ?? displayName(p);
}

function ShopCard({
  item,
  self,
  owned,
  equipped,
  busy,
  onBuy,
  onGift,
  onEquip,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
  owned: boolean;
  equipped: boolean;
  busy: boolean;
  onBuy: () => void;
  onGift?: () => void;
  onEquip: () => void;
}) {
  return (
    <article className="shop-card flex flex-col rounded-lg bg-bg-secondary p-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--elevation-high)]">
      <ShopPreview item={item} self={self} />

      <div className="mt-3 flex items-baseline gap-2">
        <h3 className="text-[16px] font-semibold text-header-primary">{item.name}</h3>
        {(() => {
          const sale = effectivePriceCents(item.priceCents, item.salePriceCents);
          return sale < item.priceCents ? (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="rounded bg-status-dnd/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-status-dnd">
                Sale
              </span>
              <span className="text-[13px] text-text-muted line-through">
                {formatPrice(item.priceCents)}
              </span>
              <span className="text-sm font-bold text-status-dnd">{formatPrice(sale)}</span>
            </span>
          ) : (
            <span className="ml-auto text-sm font-bold text-text-normal">
              {formatPrice(item.priceCents)}
            </span>
          );
        })()}
      </div>
      <p className="mt-1 flex-1 text-[14px] leading-[18px] text-text-muted">{item.description}</p>

      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
        {!owned ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="h-[38px] w-full rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Opening…" : `Buy ${formatPrice(effectivePriceCents(item.priceCents, item.salePriceCents))}`}
          </button>
        ) : equipped ? (
          <div className="flex h-[38px] w-full items-center justify-center rounded-[3px] border border-status-online/60 text-[14px] font-medium text-status-online">
            Equipped
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onEquip}
            className="h-[38px] w-full rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
          >
            {busy ? "…" : "Equip"}
          </button>
        )}
        </div>
        {onGift && (
          <button
            type="button"
            onClick={onGift}
            aria-label={`Gift ${item.name}`}
            title="Gift to a friend"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[3px] bg-button-secondary text-white transition-colors hover:bg-button-secondary-hover"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-5-2a1 1 0 1 1 0 2h-2a1 1 0 0 1 2-2ZM9 5a1 1 0 0 1 1 1v1H9a1 1 0 0 1 0-2Zm2 15H6v-8h5v8Zm0-10H5V9h6v1Zm7 10h-5v-8h5v8Zm1-10h-6V9h6v1Z" /></svg>
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * The same artwork and renderers used by equipped avatars and profiles.
 */
function ShopPreview({
  item,
  self,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
}) {

  if (item.category === "name") {
    return (
      <div className="flex h-20 items-center justify-center rounded-md bg-bg-primary px-3">
        <span className={`fx-name ${item.className} text-lg font-semibold text-text-normal`}>
          {item.id === "name-wave"
            ? Array.from(self.name).map((ch, i) => (
                <span key={`${ch}-${i}`} style={{ ["--fx-i" as string]: i }}>
                  {ch === " " ? " " : ch}
                </span>
              ))
            : self.name}
        </span>
      </div>
    );
  }

  if (item.category === "ring") {
    return <div className="shop-decoration-preview"><CosmeticAvatar ringId={item.id} self={self} /></div>;
  }
  return <div className="shop-profile-preview"><CosmeticProfile overlayId={item.id} self={self} compact /></div>;
}
