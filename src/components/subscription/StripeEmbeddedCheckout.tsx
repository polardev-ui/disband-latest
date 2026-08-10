"use client";

import { getStripe } from "@/lib/stripe-client";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { useCallback, useState } from "react";
import type { StripeCheckoutElementsValue } from "@stripe/react-stripe-js/checkout";

interface StripeEmbeddedCheckoutProps {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Coupon redemption.
 *
 * Stripe only surfaces promotion codes in its own hosted page; with the Elements
 * checkout we have to drive `applyPromotionCode` ourselves, so this renders the
 * redeem box and reports back what Stripe said about the code.
 */
function PromotionCodeField({ checkout }: { checkout: StripeCheckoutElementsValue }) {
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
    const result = await checkout.applyPromotionCode(trimmed);
    if (result.type === "error") {
      setError(result.error.message);
    } else {
      setCode("");
      setOpen(false);
    }
    setBusy(false);
  }, [checkout, code]);

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    await checkout.removePromotionCode();
    setBusy(false);
  }, [checkout]);

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#57f287]/30 bg-[#57f287]/10 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#57f287]">
            {applied.displayName || applied.promotionCode}
          </p>
          <p className="text-[12px] text-text-muted">
            &minus;{applied.amount} applied
            {applied.recurring?.type === "forever" && " forever"}
            {applied.recurring?.type === "repeating" &&
              ` for ${applied.recurring.durationInMonths} months`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="shrink-0 text-[12px] text-text-muted underline hover:text-text-normal disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-text-muted underline hover:text-text-normal"
      >
        Have a coupon code?
      </button>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply();
            }
          }}
          placeholder="Coupon code"
          aria-label="Coupon code"
          className="min-w-0 flex-1 rounded-md border border-divider bg-bg-tertiary px-3 py-2 text-[13px] uppercase tracking-wide text-text-normal outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted focus:border-brand/60"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-md bg-white/10 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-status-dnd">{error}</p>}
    </div>
  );
}

/** Line-by-line totals, so a discount is visibly reflected before paying. */
function OrderSummary({ checkout }: { checkout: StripeCheckoutElementsValue }) {
  const { subtotal, discount, total } = checkout.total;
  const hasDiscount = discount.minorUnitsAmount > 0;

  return (
    <div className="space-y-1.5 rounded-lg bg-black/20 px-3.5 py-3 text-[13px]">
      <div className="flex justify-between text-text-muted">
        <span>Subtotal</span>
        <span>{subtotal.amount}</span>
      </div>
      {hasDiscount && (
        <div className="flex justify-between text-[#57f287]">
          <span>Discount</span>
          <span>&minus;{discount.amount}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-divider pt-1.5 font-semibold text-text-normal">
        <span>Total due today</span>
        <span>{total.amount}</span>
      </div>
    </div>
  );
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const checkoutState = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (checkoutState.type !== "success") return;
      if (!checkoutState.checkout.canConfirm) return;
      setLoading(true);
      setError(null);
      const result = await checkoutState.checkout.confirm();
      if (result.type === "error") {
        setError(result.error.message);
        setLoading(false);
      } else {
        onSuccess();
      }
    },
    [checkoutState, onSuccess],
  );

  if (checkoutState.type === "loading") {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-status-dnd">{checkoutState.error.message}</p>
      </div>
    );
  }

  const { checkout } = checkoutState;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <PaymentElement
        options={{ layout: { type: "accordion", spacedAccordionItems: true } }}
      />

      <PromotionCodeField checkout={checkout} />
      <OrderSummary checkout={checkout} />

      {error && <p className="text-sm text-status-dnd">{error}</p>}

      <button
        type="submit"
        disabled={!checkout.canConfirm || loading}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Processing…" : `Pay ${checkout.total.total.amount}`}
      </button>
    </form>
  );
}

export function StripeEmbeddedCheckout({
  clientSecret,
  onSuccess,
  onCancel,
}: StripeEmbeddedCheckoutProps) {
  return (
    <div className="flex flex-col">
      <CheckoutElementsProvider stripe={getStripe()} options={{ clientSecret }}>
        <CheckoutForm onSuccess={onSuccess} />
      </CheckoutElementsProvider>
      <div className="border-t border-divider px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-text-muted hover:text-text-normal"
        >
          Back to plans
        </button>
      </div>
    </div>
  );
}
