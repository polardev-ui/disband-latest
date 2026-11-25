"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useSubscription } from "@/hooks/useSubscription";
import { apiFetch } from "@/lib/api";
import { IconClose } from "@/components/icons";
import { BUSY_BUTTON, BusyLabel, LoadingDots } from "@/components/ui/LoadingDots";
import { safeImageUrl } from "@/lib/safe-url";
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
import { useI18n } from "@/contexts/I18nContext";

interface CatalystModalProps {
  server: Server | null;
  open: boolean;
  onClose: () => void;
  /** "page" fills the chat area (like the Aero page); "modal" is the old popup. */
  variant?: "modal" | "page";
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

export function CatalystModal({ server: serverProp, open, onClose, variant = "page" }: CatalystModalProps) {
  const { t } = useI18n();
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
        setBuyError(data.error ?? t("Couldn't start checkout."));
      } else {
        setBuySecret(data.clientSecret);
      }
    } catch {
      setBuyError(t("Couldn't start checkout."));
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

  if (variant === "modal") {
    return (
    <div className={`overlay-fade${exiting ? " overlay-fade-out" : ""} fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4`} onClick={onClose}>
      <div
        className={`modal-pop${exiting ? " modal-pop-out" : ""} flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border-subtle bg-bg-primary shadow-[var(--elevation-high)]`}
        role="dialog"
        aria-modal="true"
        aria-label={t("Server catalysts")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-[20px] font-semibold text-header-primary">{t("Space Catalysts")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="rounded-md p-1.5 text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={18} />
          </button>
        </div>
        <p className="px-5 text-sm text-text-muted">
          {t("Boost")}{" "}<span className="font-semibold text-text-normal">{server.name}</span> to unlock
          perks for everyone in it.
        </p>

        <div className="px-5 pt-4">
          <p className="text-2xl font-bold text-text-normal">
            {count} {count === 1 ? "Catalyst" : t("Catalysts")}
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
            {t("Perks at every level")}
          </p>
          <div className="space-y-2">
            {CATALYST_LEVELS.filter((l) => l.level > 0).map((l) => {
              const unlocked = count >= l.min;
              return (
                <div
                  key={l.level}
                  className={`rounded-lg border p-3 ${
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
            {t("Monthly credits")}
          </p>
          <p className="mt-0.5 text-[14px] text-text-muted">
            {grant > 0 ? (
              <>{t("Put a free monthly Catalyst on")}{" "}<span className="font-semibold text-text-normal">{server.name}</span> — {balance} of {grant} left</>
            ) : (
              <>{t("Paid plans include free Catalysts every month — Aero gets")}{" "}{MONTHLY_GRANT}, Lite gets {LITE_MONTHLY_GRANT}.</>
            )}
          </p>
          {error && <p className="mt-2 text-[14px] text-status-dnd">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || balance <= 0}
              onClick={() => void doAllocate()}
              title={grant === 0 ? t("A paid plan includes monthly credits") : balance <= 0 ? t("No credits left this month") : t("Spend a monthly credit")}
              className="flex-1 rounded-md bg-brand py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <LoadingDots size={6} className="mx-auto" /> : t("Boost this space")}
            </button>
            {myHere > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doWithdraw()}
                className="h-[38px] rounded-md bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
              >
                {t("Withdraw")}
              </button>
            )}
          </div>
        </div>

        {mine.length > 0 && (
          <div className="border-t border-bg-tertiary px-5 py-4">
            <p className="text-sm font-bold">{t("Your Catalysts")}</p>
            <p className="mt-0.5 text-[14px] text-text-muted">
              {t("Each lasts a month. Move one to another space once it has been on its current space for a week.")}
            </p>
            {moveError && <p className="mt-2 text-[14px] text-status-dnd">{moveError}</p>}
            <ul className="mt-3 space-y-1.5">
              {mine.map((c) => {
                const here = servers.find((s) => s.id === c.server_id);
                const movableAt = c.placed_at ? new Date(c.placed_at).getTime() + 7 * 24 * 3600_000 : null;
                const canMove = movableAt !== null && movableAt <= Date.now();
                const targets = servers.filter((s) => s.id !== c.server_id);
                return (
                  <li key={c.id} className="rounded-lg bg-bg-secondary px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-text-normal">{here?.name ?? t("A space you left")}</span>
                        <span className="block text-[12px] text-text-muted">
                          {c.expires_at ? t("Expires {value}", { value: shortDate(c.expires_at) }) : t("No expiry")}
                          {c.source === "purchase" ? " · Bought" : c.source === "grant" ? " · Plan credit" : ""}
                        </span>
                      </span>
                      {moving === c.id ? (
                        <button type="button" onClick={() => { setMoving(null); setMoveError(null); }} className="text-[13px] text-text-muted hover:text-text-normal">{t("Cancel")}</button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canMove || targets.length === 0 || busy}
                          title={!canMove && movableAt ? t("You can move this from {value}", { value: shortDate(new Date(movableAt).toISOString()) }) : undefined}
                          onClick={() => { setMoving(c.id!); setMoveTo(targets[0]?.id ?? ""); setMoveError(null); }}
                          className="h-7 rounded-md bg-button-secondary px-3 text-[13px] font-medium text-white hover:bg-button-secondary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {canMove || !movableAt ? t("Move") : t("Move from {value}", { value: shortDate(new Date(movableAt).toISOString()) })}
                        </button>
                      )}
                    </div>
                    {moving === c.id && (
                      <div className="mt-2 flex gap-2">
                        <select
                          value={moveTo}
                          onChange={(e) => setMoveTo(e.target.value)}
                          aria-label={t("Move to")}
                          className="min-w-0 flex-1 rounded-md bg-bg-tertiary px-2 text-[14px] text-text-normal"
                        >
                          {targets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={!moveTo || busy}
                          onClick={() => void doMove(c.id!)}
                          className="h-8 rounded-md bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? <LoadingDots size={6} className="mx-auto" /> : t("Move here")}
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
          <p className="text-sm font-bold">{t("Buy Catalysts")}</p>
          <p className="mt-0.5 text-[14px] text-text-muted">
            {t("Each lasts a month from purchase ·")}{" "}{formatCents(unitCents)} each
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
                <div className="flex items-center rounded-md bg-bg-tertiary">
                  <button
                    type="button"
                    aria-label={t("Fewer")}
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-2.5 py-1.5 text-lg leading-none text-text-muted hover:text-text-normal"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{qty}</span>
                  <button
                    type="button"
                    aria-label={t("More")}
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
                  className="h-[38px] flex-1 rounded-md bg-brand py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {buying ? <LoadingDots size={6} className="mx-auto" /> : t("Buy {qty} · {value}", { qty, value: formatCents(unitCents * qty) })}
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
  );
  }

  const icon = safeImageUrl(server.icon_url ?? null);
  const tiers = CATALYST_LEVELS.filter((l) => l.level > 0);

  return (
    <main
      role="region"
      aria-label={t("Space Catalysts")}
      className={`fixed inset-0 z-40 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary md:static md:z-auto${exiting ? " opacity-0" : ""}`}
    >
      {/* Same height and rule as the channel header it replaces. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-column-border px-4">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-tertiary text-[10px] font-semibold text-text-normal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {icon ? <img src={icon} alt="" className="h-full w-full object-cover" /> : server.name.slice(0, 2)}
        </span>
        <h1 className="min-w-0 truncate text-[16px] font-semibold text-header-primary">{t("Boost")} {server.name}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close")}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
        >
          <IconClose size={20} />
        </button>
      </header>

      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1040px] px-6 py-8">
          <p className="max-w-[620px] text-[15px] leading-6 text-text-muted">
            {t("Catalysts unlock perks for everyone in this space: better quality, more emoji, bigger uploads and more.")}{" "}
            {t("Each one lasts a month.")}
          </p>

          {/* Where the space stands, and the one thing you can do about it. */}
          <section className="mt-6 rounded-lg border border-border-subtle bg-bg-secondary p-5">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="text-[13px] text-text-muted">{level.name}</p>
                <p className="mt-0.5 text-[32px] font-bold leading-none tracking-[-0.02em] text-header-primary tabular-nums">
                  {count}
                  <span className="ml-2 text-[15px] font-medium tracking-normal text-text-muted">{count === 1 ? t("Catalyst") : t("Catalysts")}</span>
                </p>
              </div>
              <div className="flex gap-2">
                {myHere > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void doWithdraw()}
                    className="h-9 rounded-md bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover disabled:opacity-50"
                  >
                    {t("Withdraw")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || balance <= 0}
                  onClick={() => void doAllocate()}
                  title={grant === 0 ? t("A paid plan includes monthly credits") : balance <= 0 ? t("No credits left this month") : t("Spend a monthly credit")}
                  className={`h-9 rounded-md bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 ${busy ? BUSY_BUTTON : ""}`}
                >
                  <BusyLabel busy={busy}>{grant > 0 ? t("Boost with a monthly credit") : t("Boost this space")}</BusyLabel>
                </button>
              </div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-text-muted">
              <span>{next ? t("{n} more to {name}", { n: next.min - count, name: next.name }) : t("Every level unlocked")}</span>
              <span>
                {grant > 0
                  ? t("{left} of {total} monthly credits left", { left: balance, total: grant })
                  : t("Aero includes {a} Catalysts a month and Lite {l}.", { a: MONTHLY_GRANT, l: LITE_MONTHLY_GRANT })}
              </span>
            </div>
            {error && <p className="mt-3 text-[13px] text-status-dnd">{error}</p>}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <h2 className="text-[16px] font-semibold text-header-primary">{t("Perks at every level")}</h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-border-subtle">
              {tiers.map((l) => {
                const unlocked = count >= l.min;
                return (
                  <div key={l.level} className="border-b border-border-subtle px-5 py-4 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[15px] font-semibold text-header-primary">{l.name}</p>
                      <span className={`text-[13px] ${unlocked ? "font-medium text-status-online" : "text-text-muted"}`}>
                        {unlocked ? t("Unlocked") : `${l.min} ${l.min === 1 ? "catalyst" : "catalysts"}`}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {l.perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2.5">
                          <span className="mt-[3px]"><Check locked={!unlocked} /></span>
                          <span className={`text-[14px] leading-5 ${unlocked ? "text-text-normal" : "text-text-muted"}`}>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <p className="text-[15px] font-semibold text-header-primary">{t("Buy Catalysts")}</p>
              <p className="mt-0.5 text-[13px] text-text-muted">{t("Each lasts a month from purchase ·")} {formatCents(unitCents)} each</p>
              {buySecret ? (
                <div className="mt-3">
                  <StripeEmbeddedCheckout clientSecret={buySecret} onSuccess={handleBuySuccess} onCancel={() => setBuySecret(null)} />
                </div>
              ) : (
                <>
                  {buyError && <p className="mt-2 text-[13px] text-status-dnd">{buyError}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex h-9 items-center rounded-md bg-bg-tertiary">
                      <button type="button" aria-label={t("Fewer")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-full px-3 text-lg leading-none text-text-muted hover:text-text-normal">−</button>
                      <span className="w-7 text-center text-[14px] font-bold tabular-nums">{qty}</span>
                      <button type="button" aria-label={t("More")} onClick={() => setQty((q) => Math.min(99, q + 1))} className="h-full px-3 text-lg leading-none text-text-muted hover:text-text-normal">+</button>
                    </div>
                    <button
                      type="button"
                      disabled={buying}
                      onClick={() => void startBuy()}
                      className={`h-9 flex-1 rounded-md bg-brand text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60 ${buying ? BUSY_BUTTON : ""}`}
                    >
                      <BusyLabel busy={buying}>{t("Buy {qty} · {value}", { qty, value: formatCents(unitCents * qty) })}</BusyLabel>
                    </button>
                  </div>
                </>
              )}
            </div>

            {mine.length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
                <p className="text-[15px] font-semibold text-header-primary">{t("Your Catalysts")}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-text-muted">
                  {t("Each lasts a month. Move one to another space once it has been on its current space for a week.")}
                </p>
                {moveError && <p className="mt-2 text-[13px] text-status-dnd">{moveError}</p>}
                <ul className="mt-3 space-y-1.5">
                  {mine.map((c) => {
                    const here = servers.find((sv) => sv.id === c.server_id);
                    const movableAt = c.placed_at ? new Date(c.placed_at).getTime() + 7 * 24 * 3600_000 : null;
                    const canMove = movableAt !== null && movableAt <= Date.now();
                    const targets = servers.filter((sv) => sv.id !== c.server_id);
                    return (
                      <li key={c.id} className="rounded-md bg-bg-tertiary px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold text-text-normal">{here?.name ?? t("A space you left")}</span>
                            <span className="block text-[12px] text-text-muted">
                              {c.expires_at ? t("Expires {value}", { value: shortDate(c.expires_at) }) : t("No expiry")}
                              {c.source === "purchase" ? " · Bought" : c.source === "grant" ? " · Plan credit" : ""}
                            </span>
                          </span>
                          {moving === c.id ? (
                            <button type="button" onClick={() => { setMoving(null); setMoveError(null); }} className="text-[13px] text-text-muted hover:text-text-normal">{t("Cancel")}</button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canMove || targets.length === 0 || busy}
                              title={!canMove && movableAt ? t("You can move this from {value}", { value: shortDate(new Date(movableAt).toISOString()) }) : undefined}
                              onClick={() => { setMoving(c.id!); setMoveTo(targets[0]?.id ?? ""); setMoveError(null); }}
                              className="h-7 rounded-lg border border-border-subtle px-3 text-[12px] font-semibold text-text-normal hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {canMove || !movableAt ? t("Move") : t("Move from {value}", { value: shortDate(new Date(movableAt).toISOString()) })}
                            </button>
                          )}
                        </div>
                        {moving === c.id && (
                          <div className="mt-2 flex gap-2">
                            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label={t("Move to")} className="h-8 min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-secondary px-2 text-[13px] text-text-normal">
                              {targets.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                            </select>
                            <button
                              type="button"
                              disabled={!moveTo || busy}
                              onClick={() => void doMove(c.id!)}
                              className={`h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50 ${busy ? BUSY_BUTTON : ""}`}
                            >
                              <BusyLabel busy={busy}>{t("Move here")}</BusyLabel>
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
