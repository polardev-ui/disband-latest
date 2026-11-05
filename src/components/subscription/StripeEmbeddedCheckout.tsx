"use client";

import { getStripe, isStripeConfigured } from "@/lib/stripe-client";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import type { Appearance } from "@stripe/stripe-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StripeCheckoutElementsValue } from "@stripe/react-stripe-js/checkout";
import { useI18n } from "@/contexts/I18nContext";

interface StripeEmbeddedCheckoutProps {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/** How long the success state plays before the parent moves on. */
const SUCCESS_HOLD_MS = 1100;

/**
 * Resolve a theme token to a plain colour Stripe understands. The tokens are
 * often `var()` chains or `color-mix()`, which Stripe's iframe can't read, so
 * let the browser compute them on a probe element.
 */
function resolveColor(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = `var(${token}, ${fallback})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

function isDarkColor(rgb: string): boolean {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return true;
  const [r, g, b] = m.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Stripe's card fields live in its own iframes (card numbers must never pass
 * through our code), so they can't take our CSS. The Appearance API is the
 * way in: this rebuilds our input, tab and label styles from the live theme,
 * so the fields follow whichever Disband theme is active.
 */
function buildAppearance(): Appearance {
  const c = {
    brand: resolveColor("--brand", "#5865f2"),
    text: resolveColor("--text-normal", "#dbdee1"),
    muted: resolveColor("--text-muted", "#949ba4"),
    danger: resolveColor("--status-dnd", "#f23f43"),
    success: resolveColor("--status-online", "#23a55a"),
    input: resolveColor("--bg-tertiary", "#1e1f22"),
    surface: resolveColor("--bg-secondary", "#2b2d31"),
    hover: resolveColor("--interactive-hover", "#dbdee1"),
    divider: resolveColor("--divider", "#3f4147"),
  };

  return {
    theme: isDarkColor(c.surface) ? "night" : "stripe",
    labels: "above",
    variables: {
      colorPrimary: c.brand,
      colorBackground: c.input,
      colorText: c.text,
      colorTextSecondary: c.muted,
      colorTextPlaceholder: c.muted,
      colorDanger: c.danger,
      colorSuccess: c.success,
      colorIconTab: c.muted,
      colorIconTabSelected: c.text,
      fontFamily: '"Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSizeBase: "14px",
      fontWeightNormal: "400",
      fontWeightMedium: "500",
      fontWeightBold: "700",
      borderRadius: "8px",
      spacingUnit: "4px",
      gridRowSpacing: "14px",
      gridColumnSpacing: "12px",
      focusBoxShadow: "none",
      focusOutline: "none",
    },
    rules: {
      ".Label": {
        fontSize: "12px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        color: c.muted,
        marginBottom: "8px",
      },
      ".Input": {
        backgroundColor: c.input,
        border: "1px solid transparent",
        boxShadow: "none",
        padding: "11px 12px",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
      },
      ".Input:hover": {
        borderColor: c.divider,
      },
      ".Input:focus": {
        borderColor: c.brand,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${c.brand} 25%, transparent)`,
      },
      ".Input--invalid": {
        borderColor: c.danger,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${c.danger} 18%, transparent)`,
      },
      ".Error": {
        fontSize: "12px",
        marginTop: "6px",
      },
      ".Tab": {
        backgroundColor: c.input,
        border: "1px solid transparent",
        boxShadow: "none",
        padding: "10px 12px",
        transition: "border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease",
      },
      ".Tab:hover": {
        borderColor: c.divider,
        color: c.text,
      },
      ".Tab--selected, .Tab--selected:hover, .Tab--selected:focus": {
        backgroundColor: c.input,
        borderColor: c.brand,
        color: c.text,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${c.brand} 22%, transparent)`,
      },
      ".TabLabel": {
        fontWeight: "600",
      },
      ".Block": {
        backgroundColor: c.input,
        border: "none",
        boxShadow: "none",
      },
      ".CheckboxInput": {
        backgroundColor: c.input,
        borderColor: c.divider,
      },
      ".CheckboxInput--checked": {
        backgroundColor: c.brand,
        borderColor: c.brand,
      },
    },
  };
}

/** Our own loading state, in the app's skeleton style, while Stripe boots. */
function FieldsSkeleton() {
  return (
    <div aria-hidden className="space-y-3.5">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-sweep h-[58px] rounded-lg" />
        ))}
      </div>
      <div className="skeleton-sweep h-2.5 w-24 rounded-full" />
      <div className="skeleton-sweep h-[42px] rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-sweep h-[42px] rounded-lg" />
        <div className="skeleton-sweep h-[42px] rounded-lg" />
      </div>
    </div>
  );
}

/** Counts from the previous figure to the new one when a discount lands. */
function AnimatedAmount({ value }: { value: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    const from = Number(previous.current.replace(/[^\d.]/g, ""));
    const to = Number(value.replace(/[^\d.]/g, ""));
    previous.current = value;
    setFlash(true);
    const clearFlash = window.setTimeout(() => setFlash(false), 600);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!Number.isFinite(from) || !Number.isFinite(to) || reduce) {
      setShown(value);
      return () => window.clearTimeout(clearFlash);
    }
    // Keep the currency formatting: swap only the number inside the string.
    const decimals = (value.match(/\.(\d+)/)?.[1].length) ?? 0;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 450);
      const eased = 1 - Math.pow(1 - p, 3);
      const n = from + (to - from) * eased;
      setShown(value.replace(/[\d,]+(\.\d+)?/, n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })));
      if (p < 1) frame = requestAnimationFrame(tick);
      else setShown(value);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(clearFlash);
    };
  }, [value]);

  return <span className={`tabular-nums transition-colors ${flash ? "text-status-online" : ""}`}>{shown}</span>;
}

function PromotionCodeField({ checkout }: { checkout: StripeCheckoutElementsValue }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applied = checkout.discountAmounts?.find((d) => d.promotionCode) ?? null;

  const apply = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkout.applyPromotionCode(trimmed);
      if (result.type === "error") {
        setError(result.error.message);
      } else {
        setCode("");
        setOpen(false);
      }
    } catch {
      setError(t("Could not apply the code. Try again."));
    } finally {
      setBusy(false);
    }
  }, [checkout, code, t]);

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await checkout.removePromotionCode();
    } catch {
      setError(t("Could not remove the code. Try again."));
    } finally {
      setBusy(false);
    }
  }, [checkout, t]);

  if (applied) {
    return (
      <div className="checkout-pop flex items-center justify-between gap-3 rounded-lg border border-status-online/30 bg-status-online/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-online text-white">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path className="checkout-check-path" d="M3.5 8.5l3 3 6-7" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-status-online">
              {applied.displayName || applied.promotionCode}
            </p>
            <p className="text-[12px] text-text-muted">
              {applied.recurring?.type === "forever"
                ? t("−{amount} applied forever", { amount: applied.amount })
                : applied.recurring?.type === "repeating"
                  ? t("−{amount} applied for {months} months", {
                    amount: applied.amount,
                    months: applied.recurring.durationInMonths,
                  })
                  : t("−{amount} applied", { amount: applied.amount })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="shrink-0 text-[12px] text-text-muted underline hover:text-text-normal disabled:opacity-50"
        >
          {t("Remove")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={`checkout-collapse ${open ? "checkout-collapse-open" : ""}`}>
        <div className="min-h-0">
          <div className="flex gap-2 pb-0.5">
            <input
              autoFocus={open}
              tabIndex={open ? 0 : -1}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void apply();
                }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={t("Coupon code")}
              aria-label={t("Coupon code")}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-bg-tertiary px-3 py-2.5 text-[13px] uppercase tracking-[0.04em] text-text-normal outline-none transition-[border-color,box-shadow] placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_25%,transparent)]"
            />
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => void apply()}
              disabled={busy || !code.trim()}
              className="shrink-0 rounded-lg bg-bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover hover:text-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("Applying…") : t("Apply")}
            </button>
          </div>
        </div>
      </div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-normal"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          {t("Have a coupon code?")}
        </button>
      )}
      {error && <p className="checkout-pop mt-1.5 text-[12px] text-status-dnd">{error}</p>}
    </div>
  );
}

function OrderSummary({ checkout }: { checkout: StripeCheckoutElementsValue }) {
  const { t } = useI18n();
  const { subtotal, discount, total } = checkout.total;
  const hasDiscount = discount.minorUnitsAmount > 0;

  return (
    <div className="rounded-lg bg-bg-tertiary px-4 py-3 text-[13px]">
      <div className="flex justify-between text-text-muted">
        <span>{t("Subtotal")}</span>
        <span className="tabular-nums">{subtotal.amount}</span>
      </div>
      <div className={`checkout-collapse ${hasDiscount ? "checkout-collapse-open" : ""}`}>
        <div className="min-h-0">
          <div className="flex justify-between pt-1.5 text-status-online">
            <span>{t("Discount")}</span>
            <span className="tabular-nums">&minus;{discount.amount}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-divider pt-2 text-text-normal">
        <span className="font-semibold">{t("Total due today")}</span>
        <span className="text-[16px] font-bold">
          <AnimatedAmount value={total.amount} />
        </span>
      </div>
    </div>
  );
}

type PayState = "idle" | "processing" | "success";

function PayButton({ state, disabled, label }: { state: PayState; disabled: boolean; label: string }) {
  const { t } = useI18n();
  return (
    <button
      type="submit"
      disabled={disabled}
      data-state={state}
      className="checkout-pay relative h-11 w-full overflow-hidden rounded-lg text-[14px] font-semibold text-white disabled:cursor-not-allowed"
    >
      <span className="checkout-pay-label absolute inset-0 flex items-center justify-center gap-2">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-80" fill="currentColor" aria-hidden>
          <path d="M4.5 7V5a3.5 3.5 0 017 0v2h.5A1.5 1.5 0 0113.5 8.5v5A1.5 1.5 0 0112 15H4a1.5 1.5 0 01-1.5-1.5v-5A1.5 1.5 0 014 7h.5zm1.5 0h4V5a2 2 0 10-4 0v2z" />
        </svg>
        {label}
      </span>
      <span className="checkout-pay-busy absolute inset-0 flex items-center justify-center gap-2.5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        {t("Processing…")}
      </span>
      <span className="checkout-pay-done absolute inset-0 flex items-center justify-center gap-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path className="checkout-check-path" d="M3.5 8.5l3 3 6-7" />
        </svg>
        {t("Payment complete")}
      </span>
    </button>
  );
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const checkoutState = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState>("idle");
  const [fieldsReady, setFieldsReady] = useState(false);
  const [shaking, setShaking] = useState(false);
  // A ref, not just state: a fast double-click can deliver both clicks
  // before React applies the disabled state and re-renders the button.
  const submitting = useRef(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting.current) return;
      if (checkoutState.type !== "success") return;
      if (!checkoutState.checkout.canConfirm) return;
      submitting.current = true;
      setPayState("processing");
      setError(null);
      const result = await checkoutState.checkout.confirm();
      if (result.type === "error") {
        submitting.current = false;
        setError(result.error.message);
        setPayState("idle");
        setShaking(true);
      } else {
        setPayState("success");
        window.setTimeout(onSuccess, SUCCESS_HOLD_MS);
      }
    },
    [checkoutState, onSuccess],
  );

  if (checkoutState.type === "error") {
    return (
      <div className="checkout-pop flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-status-dnd/15 text-status-dnd">
          <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 4.5v4M8 11.2v.1" />
          </svg>
        </span>
        <p className="text-[14px] text-text-normal">{checkoutState.error.message}</p>
      </div>
    );
  }

  const checkout = checkoutState.type === "success" ? checkoutState.checkout : null;
  const ready = checkout !== null && fieldsReady;

  return (
    // The shake is a class that removes itself, never a remount: remounting
    // would rebuild Stripe's iframe and wipe the card details just typed.
    <form
      onSubmit={handleSubmit}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setShaking(false); }}
      className={`relative space-y-4 p-6 ${shaking ? "checkout-shake" : ""}`}
    >
      {/* Stripe's iframe mounts hidden under our skeleton, then crossfades in
          once it reports ready, so there's no flash of an unstyled form. */}
      <div className="relative">
        {!ready && (
          <div className="absolute inset-0 z-[1]">
            <FieldsSkeleton />
          </div>
        )}
        <div className={`transition-[opacity,transform] duration-500 ease-out ${ready ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}>
          {checkout ? (
            <PaymentElement
              onReady={() => setFieldsReady(true)}
              options={{ layout: { type: "tabs" } }}
            />
          ) : (
            <div className="h-[230px]" />
          )}
        </div>
      </div>

      {checkout && ready && (
        <>
          <div className="checkout-rise" style={{ animationDelay: "60ms" }}>
            <PromotionCodeField checkout={checkout} />
          </div>
          <div className="checkout-rise" style={{ animationDelay: "120ms" }}>
            <OrderSummary checkout={checkout} />
          </div>
        </>
      )}

      {error && (
        <div role="alert" className="checkout-pop flex items-start gap-2.5 rounded-lg border border-status-dnd/30 bg-status-dnd/10 px-3 py-2.5">
          <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-status-dnd" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 5v3.4M8 10.8v.1" />
          </svg>
          <p className="text-[13px] leading-5 text-text-normal">{error}</p>
        </div>
      )}

      <div className={ready ? "checkout-rise" : "opacity-0"} style={{ animationDelay: "180ms" }}>
        <PayButton
          state={payState}
          disabled={!checkout?.canConfirm || payState !== "idle"}
          label={checkout ? t("Pay {amount}", { amount: checkout.total.total.amount }) : t("Pay")}
        />
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M8 1l5.5 2v4.2c0 3.4-2.3 6.4-5.5 7.3-3.2-.9-5.5-3.9-5.5-7.3V3L8 1z" />
          </svg>
          {t("Payments are processed securely by Stripe. Disband never sees your card number.")}
        </p>
      </div>

      {payState === "success" && <div aria-hidden className="checkout-success-ring pointer-events-none absolute inset-x-6 bottom-[52px] h-11 rounded-lg" />}
    </form>
  );
}

export function StripeEmbeddedCheckout({
  clientSecret,
  onSuccess,
  onCancel,
}: StripeEmbeddedCheckoutProps) {
  const { t } = useI18n();
  // Built once per checkout from the live theme. Theme switches while the
  // sheet is open are rare enough not to chase.
  const elementsOptions = useMemo(
    () => ({
      appearance: buildAppearance(),
      loader: "never" as const,
      fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" }],
    }),
    [],
  );

  if (!isStripeConfigured()) {
    return (
      <div className="flex flex-col">
        <div className="px-6 py-8 text-center">
          <p className="text-[15px] font-semibold text-text-normal">
            {t("Checkout is unavailable")}
          </p>
          <p className="mt-2 text-[14px] leading-5 text-text-muted">
            {t("This build of Disband was deployed without a Stripe publishable key, so payments can’t load. Nothing was charged.")}
          </p>
        </div>
        <div className="border-t border-divider px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-[14px] text-text-muted hover:text-text-normal"
          >
            {t("Back to plans")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <CheckoutElementsProvider stripe={getStripe()} options={{ clientSecret, elementsOptions }}>
        <CheckoutForm onSuccess={onSuccess} />
      </CheckoutElementsProvider>
      <div className="border-t border-divider px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="group inline-flex items-center gap-1.5 text-[14px] text-text-muted hover:text-text-normal"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
          {t("Back to plans")}
        </button>
      </div>
    </div>
  );
}
