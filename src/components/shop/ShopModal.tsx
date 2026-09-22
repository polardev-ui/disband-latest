"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { IconClose } from "@/components/icons";
import { ProfileOverlay } from "@/components/shop/ProfileOverlay";
import {
  SHOP_CATEGORIES,
  formatPrice,
  itemsIn,
  type ShopCategory,
  type ShopItem,
} from "@/lib/shop";

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
}

export function ShopModal({ open, onClose, self, onChanged }: ShopModalProps) {
  const [tab, setTab] = useState<ShopCategory>("name");
  const [inventory, setInventory] = useState<Inventory>(EMPTY);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/shop/equip");
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
  }, [open, refresh]);

  useOverlayDismiss(onClose, open && !clientSecret);

  const items = useMemo(() => itemsIn(tab), [tab]);
  const owned = useMemo(() => new Set(inventory.owned), [inventory.owned]);

  if (!open) return null;

  const startPurchase = async (item: ShopItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-shop-checkout", {
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
      const res = await fetch("/api/shop/equip", {
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
      const res = await fetch("/api/shop/equip");
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
              {buying.name} · {formatPrice(buying.priceCents)}
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
        <span className="ml-auto text-sm font-bold text-text-normal">
          {formatPrice(item.priceCents)}
        </span>
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
            {busy ? "Opening…" : `Buy ${formatPrice(item.priceCents)}`}
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
 * A live preview of the item, running the real CSS rather than a screenshot —
 * so what is on the card is exactly what gets worn. Rings and overlays are
 * previewed under hover too, since that is where they change.
 */
function ShopPreview({
  item,
  self,
}: {
  item: ShopItem;
  self: { name: string; avatarUrl?: string | null };
}) {
  const initial = self.name.charAt(0).toUpperCase();

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
    return (
      <div className="flex h-20 items-center justify-center rounded-md bg-bg-primary">
        <span className={`fx-ring ${item.className}`}>
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-bg-accent text-sm font-bold text-text-normal">
            {self.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={self.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="fx-overlay-host relative h-20 overflow-hidden rounded-md bg-bg-primary">
      <ProfileOverlay itemId={item.id} />
      <div className="relative z-10 flex h-full items-center gap-2 px-3">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-bg-accent text-xs font-bold text-text-normal">
          {self.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={self.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <span className="text-sm font-semibold text-text-normal">{self.name}</span>
      </div>
    </div>
  );
}
