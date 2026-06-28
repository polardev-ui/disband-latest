"use client";

import { getStripe } from "@/lib/stripe-client";
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { useCallback, useState } from "react";

interface StripeEmbeddedCheckoutProps {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const checkoutState = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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
  }, [checkoutState, onSuccess]);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <PaymentElement
        options={{
          layout: {
            type: "accordion",
            spacedAccordionItems: true,
          },
        }}
      />
      {error && <p className="text-sm text-status-dnd">{error}</p>}
      <button
        type="submit"
        disabled={!checkoutState.checkout.canConfirm || loading}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Processing…" : `Pay ${checkoutState.checkout.total.total.amount ?? ""}`}
      </button>
    </form>
  );
}

export function StripeEmbeddedCheckout({ clientSecret, onSuccess, onCancel }: StripeEmbeddedCheckoutProps) {
  return (
    <div className="flex flex-col">
      <CheckoutElementsProvider
        stripe={getStripe()}
        options={{ clientSecret }}
      >
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
