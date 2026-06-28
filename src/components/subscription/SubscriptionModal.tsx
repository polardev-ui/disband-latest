"use client";

import { useCallback, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, type PlanTier } from "@/lib/subscription";
import { IconClose } from "@/components/icons";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-[#57f287]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlanCard({ plan, currentPlan, onSubscribe }: {
  plan: PlanTier;
  currentPlan: string;
  onSubscribe: (id: "basic" | "super") => void;
}) {
  if (plan.id === "free") return null;

  const isCurrentPlan = currentPlan === plan.id;
  const priceDollars = (plan.monthlyPrice / 100).toFixed(2);

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 ${
        plan.highlighted
          ? "border-yellow-400/40 bg-yellow-400/[0.04]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {plan.highlighted && (
        <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-yellow-400/20 pointer-events-none" />
      )}

      <div className="mb-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{plan.name}</h3>
          {isCurrentPlan && (
            <span className="rounded-full bg-[#57f287]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#57f287]">
              Current
            </span>
          )}
        </div>
        <div className="mt-3">
          <span className="text-3xl font-bold">${priceDollars}</span>
          <span className="ml-1 text-sm text-text-muted">/ month</span>
        </div>
      </div>

      <div className="mb-6 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <div key={f.label} className="flex items-start gap-2.5">
            <CheckIcon />
            <div className="min-w-0">
              <span className="text-sm">{f.label}</span>
              {f.detail && <span className="ml-1 text-xs text-text-muted">{f.detail}</span>}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={isCurrentPlan}
        onClick={() => onSubscribe(plan.id as "basic" | "super")}
        className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
          isCurrentPlan
            ? "bg-white/5 text-text-muted cursor-not-allowed"
            : plan.highlighted
              ? "bg-[#fee75c] text-black hover:bg-[#f0d843] active:scale-[0.98]"
              : "bg-white/10 text-white hover:bg-white/15 active:scale-[0.98]"
        }`}
      >
        {isCurrentPlan ? "Current plan" : "Subscribe"}
      </button>
    </div>
  );
}

function MobileNotice() {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-bold">Mobile Not Supported</p>
      <p className="text-sm text-text-muted">
        In-app purchases are not available on mobile. Please visit Disband from a desktop web browser to manage your subscription.
      </p>
    </div>
  );
}

function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function SubscriptionModal({ open, onClose, userId }: SubscriptionModalProps) {
  const { plan, loading, startCheckout, subscription, openPortal } = useSubscription(userId);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const mobile = isMobileBrowser();

  const handleSubscribe = useCallback(async (planId: "basic" | "super") => {
    setCheckoutError(null);
    const result = await startCheckout(planId);
    if (result && (result.startsWith("cs_") || result.startsWith("seti_"))) {
      setCheckoutClientSecret(result);
    } else if (result) {
      setCheckoutError(result);
    }
  }, [startCheckout]);

  const handleCheckoutSuccess = useCallback(() => {
    setCheckoutClientSecret(null);
    onClose();
  }, [onClose]);

  const handleCheckoutCancel = useCallback(() => {
    setCheckoutClientSecret(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="mx-4 flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl bg-[#1e1f22] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h2 className="text-lg font-bold">Subscription</h2>
            {!checkoutClientSecret && subscription?.status === "active" && (
              <p className="mt-0.5 text-sm text-text-muted">
                <span className="font-semibold text-text-normal capitalize">{plan}</span>
                {subscription.current_period_end && (
                  <> &middot; renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:bg-white/10 hover:text-text-normal">
            <IconClose size={18} />
          </button>
        </div>

        {mobile ? (
          <MobileNotice />
        ) : checkoutClientSecret ? (
          <StripeEmbeddedCheckout
            clientSecret={checkoutClientSecret}
            onSuccess={handleCheckoutSuccess}
            onCancel={handleCheckoutCancel}
          />
        ) : loading ? (
          <div className="flex items-center justify-center p-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          </div>
        ) : (
          <div className="px-6 pt-3 pb-6">
            {checkoutError && (
              <div className="mb-4 rounded-lg bg-red-500/10 px-3.5 py-2.5">
                <p className="text-sm text-red-400">{checkoutError}</p>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <PlanCard
                plan={PLANS.find((p) => p.id === "basic")!}
                currentPlan={plan}
                onSubscribe={handleSubscribe}
              />
              <PlanCard
                plan={PLANS.find((p) => p.id === "super")!}
                currentPlan={plan}
                onSubscribe={handleSubscribe}
              />
            </div>

            {subscription?.stripe_customer_id && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  className="text-sm text-text-muted hover:text-text-normal"
                >
                  Manage billing & subscription &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
