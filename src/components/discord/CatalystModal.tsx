"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useSubscription } from "@/hooks/useSubscription";
import { apiFetch } from "@/lib/api";
import { IconClose } from "@/components/icons";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import {
  CATALYST_LEVELS,
  CATALYST_PRICE_CENTS,
  LITE_MONTHLY_GRANT,
  MONTHLY_GRANT,
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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Check({ locked }: { locked?: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${locked ? "text-text-muted/50" : "text-status-online"}`}
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

export function CatalystModal({ server: serverProp, open, onClose }: CatalystModalProps) {
  const { mounted, exiting } = usePresence(open);
  const lastServerRef = useRef<Server | null>(null);
  if (serverProp) lastServerRef.current = serverProp;
  const server = serverProp ?? lastServerRef.current;
  const {
    user,
    catalystCounts,
    myCatalysts,
    allocateCatalyst,
    withdrawCatalyst,
    transferCatalyst,
    refreshCatalysts,
    servers,
  } = useApp();
  const { plan } = useSubscription(user?.id);
  const grant = plan === "aero" ? MONTHLY_GRANT : plan === "lite" ? LITE_MONTHLY_GRANT : 0;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [buySecret, setBuySecret] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const buyingRef = useRef(false);

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
  // Only plan credits count against the monthly allowance, as on the server.
  const monthlyUsed = useMemo(
    () => myCatalysts.filter((c) => (c.source ?? "grant") === "grant" && c.created_at >= monthStart).length,
    [myCatalysts, monthStart],
  );
  const mine = useMemo(
    () => myCatalysts
      .filter((c) => c.id && c.source !== "official")
      .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? "")),
    [myCatalysts],
  );
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const doMove = useCallback(async (catalystId: string) => {
    if (!moveTo || busy) return;
    setBusy(true);
    setMoveError(null);
    const err = await transferCatalyst(catalystId, moveTo);
    setBusy(false);
    if (err) setMoveError(err);
    else { setMoving(null); setMoveTo(""); }
  }, [moveTo, busy, transferCatalyst]);
  const balance = monthlyRemaining(plan, monthlyUsed);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBuySecret(null);
      setBuyError(null);
      setBusy(false);
      setBuying(false);
    } else {

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
    // A fast double-click can race the `buying` render and create two sessions.
    if (!server || buyingRef.current) return;
    buyingRef.current = true;
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
      buyingRef.current = false;
      setBuying(false);
    }
  }, [server, qty]);

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

  useOverlayDismiss(onClose, open);

  if (!mounted || !server) return null;

  return (
    <div className={`overlay-fade${exiting ? " overlay-fade-out" : ""} fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4`} onClick={onClose}>
      <div
        className={`modal-pop${exiting ? " modal-pop-out" : ""} flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
        role="dialog"
        aria-modal="true"
        aria-label="Server catalysts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-[20px] font-semibold text-header-primary">Space Catalysts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[3px] p-1.5 text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={18} />
          </button>
        </div>
        <p className="px-5 text-sm text-text-muted">
          Boost <span className="font-semibold text-text-normal">{server.name}</span> to unlock
          perks for everyone in it.
        </p>

        <div className="px-5 pt-4">
          <p className="text-2xl font-bold text-text-normal">
            {count} {count === 1 ? "Catalyst" : "Catalysts"}
          </p>
          <p className="mt-1 inline-block rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-bold text-brand">
            {level.name}
          </p>
          {next && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
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

        <div className="px-5 pt-4">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-muted">
            Perks at every level
          </p>
          <div className="space-y-2">
            {CATALYST_LEVELS.filter((l) => l.level > 0).map((l) => {
              const unlocked = count >= l.min;
              return (
                <div
                  key={l.level}
                  className={`rounded-[4px] border p-3 ${
                    unlocked ? "border-transparent bg-bg-secondary" : "border-transparent bg-bg-secondary"
                  }`}
                >
                  <p className="mb-1.5 text-[14px] font-bold">
                    {l.name}
                    <span className="ml-1.5 font-normal text-text-muted">
                      · {l.min} {l.min === 1 ? "catalyst" : "catalysts"}
                    </span>
                  </p>
                  {l.perks.map((p) => (
                    <div key={p} className="flex items-start gap-2">
                      <Check locked={!unlocked} />
                      <span className={`text-[14px] ${unlocked ? "" : "text-text-muted"}`}>{p}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 border-t border-bg-tertiary px-5 py-4">
          <p className="text-sm font-bold">
            Monthly credits
          </p>
          <p className="mt-0.5 text-[14px] text-text-muted">
            {grant > 0 ? (
              <>Put a free monthly Catalyst on <span className="font-semibold text-text-normal">{server.name}</span> — {balance} of {grant} left</>
            ) : (
              <>Paid plans include free Catalysts every month — Aero gets {MONTHLY_GRANT}, Lite gets {LITE_MONTHLY_GRANT}.</>
            )}
          </p>
          {error && <p className="mt-2 text-[14px] text-status-dnd">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || balance <= 0}
              onClick={() => void doAllocate()}
              title={grant === 0 ? "A paid plan includes monthly credits" : balance <= 0 ? "No credits left this month" : "Spend a monthly credit"}
              className="flex-1 rounded-[3px] bg-brand py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Working…" : "Boost this space"}
            </button>
            {myHere > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doWithdraw()}
                className="h-[38px] rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>

        {mine.length > 0 && (
          <div className="border-t border-bg-tertiary px-5 py-4">
            <p className="text-sm font-bold">Your Catalysts</p>
            <p className="mt-0.5 text-[14px] text-text-muted">
              Each lasts a month. Move one to another space once it has been on its current space for a week.
            </p>
            {moveError && <p className="mt-2 text-[14px] text-status-dnd">{moveError}</p>}
            <ul className="mt-3 space-y-1.5">
              {mine.map((c) => {
                const here = servers.find((s) => s.id === c.server_id);
                const movableAt = c.placed_at ? new Date(c.placed_at).getTime() + 7 * 24 * 3600_000 : null;
                const canMove = movableAt !== null && movableAt <= Date.now();
                const targets = servers.filter((s) => s.id !== c.server_id);
                return (
                  <li key={c.id} className="rounded-[4px] bg-bg-secondary px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-text-normal">{here?.name ?? "A space you left"}</span>
                        <span className="block text-[12px] text-text-muted">
                          {c.expires_at ? `Expires ${shortDate(c.expires_at)}` : "No expiry"}
                          {c.source === "purchase" ? " · Bought" : c.source === "grant" ? " · Plan credit" : ""}
                        </span>
                      </span>
                      {moving === c.id ? (
                        <button type="button" onClick={() => { setMoving(null); setMoveError(null); }} className="text-[13px] text-text-muted hover:text-text-normal">Cancel</button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canMove || targets.length === 0 || busy}
                          title={!canMove && movableAt ? `You can move this from ${shortDate(new Date(movableAt).toISOString())}` : undefined}
                          onClick={() => { setMoving(c.id!); setMoveTo(targets[0]?.id ?? ""); setMoveError(null); }}
                          className="h-7 rounded-[3px] bg-button-secondary px-3 text-[13px] font-medium text-white hover:bg-button-secondary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {canMove || !movableAt ? "Move" : `Move from ${shortDate(new Date(movableAt).toISOString())}`}
                        </button>
                      )}
                    </div>
                    {moving === c.id && (
                      <div className="mt-2 flex gap-2">
                        <select
                          value={moveTo}
                          onChange={(e) => setMoveTo(e.target.value)}
                          aria-label="Move to"
                          className="min-w-0 flex-1 rounded-[3px] bg-bg-tertiary px-2 text-[14px] text-text-normal"
                        >
                          {targets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={!moveTo || busy}
                          onClick={() => void doMove(c.id!)}
                          className="h-8 rounded-[3px] bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? "Moving…" : "Move here"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="bg-bg-secondary px-5 py-4">
          <p className="text-sm font-bold">Buy Catalysts</p>
          <p className="mt-0.5 text-[14px] text-text-muted">
            Each lasts a month from purchase · {formatCents(unitCents)} each
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
              {buyError && <p className="mt-2 text-[14px] text-status-dnd">{buyError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center rounded-[3px] bg-bg-tertiary">
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
                  className="h-[38px] flex-1 rounded-[3px] bg-brand py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {buying ? "Starting…" : `Buy ${qty} · ${formatCents(unitCents * qty)}`}
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
  );
}
