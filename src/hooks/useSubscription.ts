"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStripe } from "@/lib/stripe-client";
import { ENTITLEMENTS, type SubscriptionPlan, type Subscription } from "@/lib/subscription";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

let idCounter = 0;

let redirectPolled = false;

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = getSupabaseClient();

    const fetchOnce = async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return { data, error };
    };

    let { data, error } = await fetchOnce();

    // The access token lapsed (e.g. the app sat closed past the token
    // lifetime). Refresh once and retry instead of spamming failed loads.
    if (error && (error.code === "PGRST303" || /JWT expired/i.test(error.message ?? ""))) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        const retry = await fetchOnce();
        data = retry.data;
        error = retry.error;
      }
    }

    if (error && error.code !== "PGRST116") {
      console.error("Failed to load subscription:", error);
    }
    setSubscription(data as Subscription | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll after a Stripe checkout redirect until the subscription appears
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect_status") !== "succeeded") return;
    if (redirectPolled) return;
    redirectPolled = true;

    const tryLoad = async (attempts = 0) => {
      await load();
      if (attempts < 15) {
        setTimeout(() => void tryLoad(attempts + 1), 1500 * (attempts + 1));
      }
    };
    void tryLoad();
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseClient();
    const channelName = `subscription-changes:${userId}:${++idCounter}`;

    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "subscriptions",
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<Subscription>) => {
        if (payload.eventType === "DELETE") {
          setSubscription(null);
        } else {
          setSubscription(payload.new as Subscription);
        }
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const plan: SubscriptionPlan = subscription?.status === "active" ? (subscription.plan as SubscriptionPlan) : "free";
  const entitlements = ENTITLEMENTS[plan];

  const startCheckout = useCallback(async (planId: "basic" | "super"): Promise<string | null> => {
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const json = (await res.json()) as { clientSecret?: string; error?: string };
    return json.clientSecret ?? json.error ?? null;
  }, []);

  const openPortal = useCallback(async () => {
    const res = await fetch("/api/stripe/portal");
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) {
      window.location.href = json.url;
    }
    return json.error ?? null;
  }, []);

  return { subscription, plan, entitlements, loading, startCheckout, openPortal, reload: load };
}
