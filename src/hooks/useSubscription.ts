"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient, refreshSessionOnce } from "@/lib/supabase/client";
import {
  ENTITLEMENTS,
  planFromSubscription,
  type SubscriptionPlan,
  type Subscription,
} from "@/lib/subscription";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { apiFetch } from "@/lib/api";
import { stripePortalDestination } from "@/lib/stripe-portal-url";

let idCounter = 0;

let redirectPolled = false;

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<Subscription | null> => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return null;
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

    if (error && (error.code === "PGRST303" || /JWT expired/i.test(error.message ?? ""))) {
      const refreshed = await refreshSessionOnce();
      if ("session" in refreshed && refreshed.session) {
        const retry = await fetchOnce();
        data = retry.data;
        error = retry.error;
      }
    }

    if (error && error.code !== "PGRST116") {
      console.error("Failed to load subscription:", error);
    }
    const row = (data as Subscription | null) ?? null;
    setSubscription(row);
    setLoading(false);
    return row;
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncFromStripe = useCallback(async (): Promise<SubscriptionPlan | null> => {
    try {
      const res = await apiFetch("/api/stripe/sync", { method: "POST" });
      const json = (await res.json()) as { synced?: boolean; plan?: SubscriptionPlan };
      if (!json.synced) return null;
      const row = await load();
      return planFromSubscription(row);
    } catch {
      return null;
    }
  }, [load]);

  const activate = useCallback(async (): Promise<SubscriptionPlan> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const synced = await syncFromStripe();
      if (synced && synced !== "free") return synced;

      const row = await load();
      const fromRow = planFromSubscription(row);
      if (fromRow !== "free") return fromRow;

      await new Promise((r) => setTimeout(r, Math.min(1000 * (attempt + 1), 4000)));
    }
    return "free";
  }, [syncFromStripe, load]);

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect_status") !== "succeeded") return;
    if (redirectPolled) return;
    redirectPolled = true;

    void activate();
  }, [userId, activate]);

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

  const plan: SubscriptionPlan = planFromSubscription(subscription);
  const entitlements = ENTITLEMENTS[plan];

  const startCheckout = useCallback(async (planId: SubscriptionPlan): Promise<string | null> => {
    const res = await apiFetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const json = (await res.json()) as { clientSecret?: string; error?: string };
    return json.clientSecret ?? json.error ?? null;
  }, []);

  const openPortal = useCallback(async () => {
    const res = await apiFetch("/api/stripe/portal");
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) {
      const destination = stripePortalDestination(json.url);
      if (!destination) return "Billing returned an invalid destination.";
      window.location.assign(destination);
    }
    return json.error ?? null;
  }, []);

  return {
    subscription,
    plan,
    entitlements,
    loading,
    startCheckout,
    openPortal,
    reload: load,
    syncFromStripe,
    activate,
  };
}
