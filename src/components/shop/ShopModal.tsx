"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { IconClose } from "@/components/icons";
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

  if (!open) return null;

  const startPurchase = async (item: ShopItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await apiFetch("/api/stripe/create-shop-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      setBuying(item);
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
      <div className="absolute inset-0 bg-overlay-scrim overlay-fade" onClick={clientSecret ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disband Shop"
        className="modal-pop relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-bg-primary shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-text-normal">Disband Shop</h2>
            <p className="truncate text-[13px] text-text-muted">
              Buy once, wear it everywhere. No subscription.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-normal"
          >
            <IconClose size={18} />
          </button>
        </header>

        {clientSecret && buying ? (
          <div className="overflow-y-auto px-5 py-4">
            <p className="text-sm font-semibold text-text-normal">
              {buying.name} · {formatPrice(effectivePriceCents(buying.priceCents, buying.salePriceCents))}
            </p>
            <p className="mt-0.5 text-[13px] text-text-muted">{buying.description}</p>
            <div className="mt-3">
              <StripeEmbeddedCheckout
                clientSecret={clientSecret}
                onSuccess={() => void finishPurchase()}
                onCancel={() => {
                  setClientSecret(null);
                  setBuying(null);
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <nav className="flex gap-2 border-b border-divider px-5 py-3">
              {SHOP_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={tab === c.id}
                  onClick={() => setTab(c.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    tab === c.id
                      ? "bg-brand text-white"
                      : "bg-bg-secondary text-text-muted hover:text-text-normal"
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

            <div className="grid grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {items.map((item) => (
                <ShopCard
                  key={item.id}
                  item={item}
                  self={self}
                  owned={owned.has(item.id)}
                  equipped={inventory.equipped[item.category] === item.id}
                  busy={busyId === item.id}
                  onBuy={() => void startPurchase(item)}
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

function ShopCard({
  item,
  self,
  owned,
  equipped,
  busy,
  onBuy,
  onEquip,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
  owned: boolean;
  equipped: boolean;
  busy: boolean;
  onBuy: () => void;
  onEquip: () => void;
}) {
  return (
    <article className="flex flex-col rounded-lg border border-divider bg-bg-secondary p-3">
      <ShopPreview item={item} self={self} />

      <div className="mt-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-text-normal">{item.name}</h3>
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
      <p className="mt-0.5 flex-1 text-[12px] leading-4 text-text-muted">{item.description}</p>

      <div className="mt-3">
        {!owned ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Opening…" : `Buy ${formatPrice(effectivePriceCents(item.priceCents, item.salePriceCents))}`}
          </button>
        ) : equipped ? (
          <div className="w-full rounded-md bg-bg-accent px-3 py-2 text-center text-sm font-medium text-text-muted">
            Equipped
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onEquip}
            className="w-full rounded-md bg-bg-accent px-3 py-2 text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-50"
          >
            {busy ? "…" : "Equip"}
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
