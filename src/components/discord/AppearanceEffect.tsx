"use client";

import { useEffect } from "react";
import { appearanceEntitled, applyAppearance, useAppearance } from "@/lib/appearance";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Paints the signed-in account's accent colour and chat wallpaper while the
 * app is mounted, and clears them when it unmounts (sign-out, account
 * switch), so the next account never inherits them.
 */
export function AppearanceEffect({ userId, plan }: { userId: string | null | undefined; plan: SubscriptionPlan }) {
  const appearance = useAppearance(userId);
  const entitled = appearanceEntitled(plan);

  useEffect(() => {
    applyAppearance({ entitled, accent: appearance.accent, wallpaper: appearance.wallpaper });
  }, [entitled, appearance.accent, appearance.wallpaper]);

  useEffect(() => () => applyAppearance({ entitled: false, accent: null, wallpaper: null }), []);

  return null;
}
