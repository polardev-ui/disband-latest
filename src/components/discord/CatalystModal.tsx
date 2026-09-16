"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useSubscription } from "@/hooks/useSubscription";
import { apiFetch } from "@/lib/api";
import { IconClose } from "@/components/icons";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import {
  CATALYST_LEVELS,
  CATALYST_PRICE_CENTS,
  catalystLevel,
  formatCents,
  monthlyRemaining,
  monthStartIso,
  nextCatalystLevel,
} from "@/lib/catalysts";
import type { Server } from "@/lib/supabase/types";

interface CatalystModalProps {
  server: Server | null;
  open: boolean;
  onClose: () => void;
}

function Check({ locked }: { locked?: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${locked ? "text-text-muted/50" : "text-[#57f287]"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {locked ? <path d="M12 5v14M5 12h14" /> : <polyline points="20 6 9 17 4 12" />}
    </svg>
  );
}

/**
 * Server Catalysts: view the count + level, spend a monthly Aero credit,
 * pull one back, or buy as many as wanted (one-time, never expire).
 */
export function CatalystModal({ server, open, onClose }: CatalystModalProps) {
  const {
    user,
    catalystCounts,
    myCatalysts,
    allocateCatalyst,
    withdrawCatalyst,
    refreshCatalysts,
    servers,
  } = useApp();
  const { plan } = useSubscription(user?.id);
  const isAero = plan === "aero";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [buySecret, setBuySecret] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  // Catalogue unit price (display). Falls back to the lib constant if the
  // endpoint is unreachable — checkout always charges the catalogue price.
  const [unitCents, setUnitCents] = useState(CATALYST_PRICE_CENTS);

  const count = server ? catalystCounts[server.id] ?? 0 : 0;
  const level = catalystLevel(count);
  const next = nextCatalystLevel(count);
  const progress = next ? Math.min(1, count / next.min) : 1;

  const monthStart = useMemo(() => monthStartIso(), []);
  const myHere = useMemo(
    () => (server ? myCatalysts.filter((c) => c.server_id === server.id).length : 0),
    [myCatalysts, server],
  );
  const monthlyUsed = useMemo(
    () => myCatalysts.filter((c) => c.created_at >= monthStart).length,
    [myCatalysts, monthStart],
  );
  const balance = monthlyRemaining(isAero, monthlyUsed);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBuySecret(null);
      setBuyError(null);
      setBusy(false);
      setBuying(false);
    } else {
      // apiFetch, not fetch: the browser client clears auth cookies, so only
      // the bearer token authenticates API routes (plain fetch 401s).
      apiFetch("/api/stripe/create-catalyst-checkout")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { unitAmount?: number } | null) => {
          if (d && typeof d.unitAmount === "number" && d.unitAmount > 0) {
            setUnitCents(d.unitAmount);
          }
        })
        .catch(() => undefined);
    }
  }, [open ]);

  const doAllocate = useCallback(async () => {
    if (!server || busy) return;
    setBusy(true);
    setError(null);
    const err = await allocateCatalyst(server.id);
    setBusy(false);
    if (err) setError(err);
  }, [server, busy, allocateCatalyst]);

  const doWithdraw = useCallback(async () => {
    if (!server || busy) return;
    setBusy(true);
    setError(null);
    const err = await withdrawCatalyst(server.id);
    setBusy(false);
    if (err) setError(err);
  }, [server, busy, withdrawCatalyst]);

  const startBuy = useCallback(async () => {
    if (!server || buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const res = await apiFetch("/api/stripe/create-catalyst-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: server.id, quantity: qty }),
      });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        setBuyError(data.error ?? "Couldn't start checkout.");
      } else {
        setBuySecret(data.clientSecret);
      }
    } catch {
      setBuyError("Couldn't start checkout.");
    } finally {
      setBuying(false);
    }
  }, [server, buying, qty]);

  // After a purchase, the webhook fulfills it within seconds — poll the
  // count until it lands so the modal shows the new level live.
  const handleBuySuccess = useCallback(() => {
    setBuySecret(null);
    setQty(1);
    if (!server || !user) return;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      await refreshCatalysts(servers.map((s) => s.id), user.id);
      if (tries < 15) window.setTimeout(poll, 2000);
    };
    void poll();
  }, [server, user, refreshCatalysts, servers]);

  if (!open || !server) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-[#1e1f22] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-lg font-bold">Server Catalysts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-text-muted hover:bg-white/10 hover:text-text-normal"
          >
            <IconClose size={18} />
          </button>
        </div>
        <p className="px-5 text-sm text-text-muted">
          Boost <span className="font-semibold text-text-normal">{server.name}</span> to unlock
          perks for everyone in it.
        </p>

        {/* Count + level */}
        <div className="mx-5 mt-4 rounded-xl border border-brand/30 bg-brand/[0.06] p-4 text-center">
          <p className="text-4xl font-black text-text-normal">{count}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {count === 1 ? "Catalyst" : "Catalysts"}
          </p>
          <p className="mt-1 inline-block rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-bold text-brand">
            {level.name}
          </p>
          {next && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {next.min - count} more to {next.name}
              </p>
            </div>
          )}
        </div>

        {/* Perks */}
        <div className="px-5 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Perks</p>
          <div className="space-y-2">
            {CATALYST_LEVELS.filter((l) => l.level > 0).map((l) => {
              const unlocked = count >= l.min;
              return (
                <div
                  key={l.level}
                  className={`rounded-lg border p-3 ${
                    unlocked ? "border-[#57f287]/25 bg-[#57f287]/[0.04]" : "border-divider bg-white/[0.02]"
                  }`}
                >
                  <p className="mb-1.5 text-[13px] font-bold">
                    {l.name}
                    <span className="ml-1.5 font-normal text-text-muted">
                      · {l.min} {l.min === 1 ? "catalyst" : "catalysts"}
                    </span>
                  </p>
                  {l.perks.map((p) => (
                    <div key={p} className="flex items-start gap-2">
                      <Check locked={!unlocked} />
                      <span className={`text-[13px] ${unlocked ? "" : "text-text-muted"}`}>{p}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly credit */}
        <div className="px-5 pt-4">
          <div className="rounded-xl border border-divider p-4">
            <p className="text-sm font-bold">
              Your Catalysts{" "}
              <span className="font-normal text-text-muted">
                · {myHere} in this server
              </span>
            </p>
            {isAero ? (
              <p className="mt-0.5 text-[13px] text-text-muted">
                {balance} of 4 monthly credits left
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] text-text-muted">
                Disband Aero members get 4 free Catalysts every month.
              </p>
            )}
            {error && <p className="mt-2 text-[13px] text-red-400">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy || !isAero || balance <= 0}
                onClick={() => void doAllocate()}
                title={!isAero ? "Aero members only" : balance <= 0 ? "No credits left this month" : "Spend a monthly credit"}
                className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Working…" : "Boost this server"}
              </button>
              {myHere > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doWithdraw()}
                  className="rounded-lg border border-divider px-3 py-2 text-sm text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal disabled:opacity-50"
                >
                  Withdraw
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Buy */}
        <div className="px-5 py-4">
          <div className="rounded-xl border border-divider p-4">
            <p className="text-sm font-bold">Buy Catalysts</p>
            <p className="mt-0.5 text-[13px] text-text-muted">
              One-time purchase, never expire · {formatCents(unitCents)} each
            </p>
            {buySecret ? (
              <div className="mt-3">
                <StripeEmbeddedCheckout
                  clientSecret={buySecret}
                  onSuccess={handleBuySuccess}
                  onCancel={() => setBuySecret(null)}
                />
              </div>
            ) : (
              <>
                {buyError && <p className="mt-2 text-[13px] text-red-400">{buyError}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-divider">
                    <button
                      type="button"
                      aria-label="Fewer"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="px-2.5 py-1.5 text-lg leading-none text-text-muted hover:text-text-normal"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{qty}</span>
                    <button
                      type="button"
                      aria-label="More"
                      onClick={() => setQty((q) => Math.min(99, q + 1))}
                      className="px-2.5 py-1.5 text-lg leading-none text-text-muted hover:text-text-normal"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={buying}
                    onClick={() => void startBuy()}
                    className="flex-1 rounded-lg bg-[#fee75c] py-2 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {buying ? "Starting…" : `Buy ${qty} · ${formatCents(unitCents * qty)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
