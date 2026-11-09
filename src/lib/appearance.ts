"use client";

/**
 * Custom accent colour and chat wallpaper — Disband Lite and Aero perks
 * (migration 0241). Stored per account so they follow it across devices,
 * and cached in localStorage so the app paints in the right colour before
 * the network answers.
 *
 * Applying is separate from storing: `applyAppearance` only paints them for
 * an entitled plan, so a lapsed subscription quietly falls back to the
 * theme's own accent without losing the choice.
 */

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStore, friendlyError, isMissingFeatureError, useStore } from "@/lib/feature-store";
import type { SubscriptionPlan } from "@/lib/subscription";

export const ACCENT_PRESETS = [
  "#4641d9", "#5865f2", "#2f80ed", "#0ea5e9", "#14b8a6", "#22c55e",
  "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7",
] as const;

export interface Wallpaper {
  id: string;
  label: string;
  /** Painted over the conversation surface; kept low-contrast for legibility. */
  css: string;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "aurora",
    label: "Aurora",
    css: "radial-gradient(70% 55% at 15% 0%, rgb(99 102 241 / 0.22), transparent 70%), radial-gradient(60% 50% at 95% 100%, rgb(236 72 153 / 0.16), transparent 70%)",
  },
  {
    id: "lagoon",
    label: "Lagoon",
    css: "radial-gradient(80% 60% at 100% 0%, rgb(20 184 166 / 0.2), transparent 70%), radial-gradient(60% 60% at 0% 100%, rgb(14 165 233 / 0.16), transparent 70%)",
  },
  {
    id: "ember",
    label: "Ember",
    css: "radial-gradient(70% 60% at 0% 0%, rgb(249 115 22 / 0.18), transparent 70%), radial-gradient(60% 60% at 100% 100%, rgb(239 68 68 / 0.14), transparent 70%)",
  },
  {
    id: "meadow",
    label: "Meadow",
    css: "radial-gradient(80% 60% at 50% 110%, rgb(34 197 94 / 0.18), transparent 70%), radial-gradient(50% 40% at 90% 0%, rgb(132 204 22 / 0.12), transparent 70%)",
  },
  {
    id: "grid",
    label: "Grid",
    css: "linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px) 0 0 / 28px 28px",
  },
  {
    id: "dots",
    label: "Dots",
    css: "radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1.2px) 0 0 / 18px 18px",
  },
  {
    id: "dusk",
    label: "Dusk",
    css: "linear-gradient(180deg, rgb(70 65 217 / 0.16), transparent 45%), linear-gradient(0deg, rgb(168 85 247 / 0.14), transparent 50%)",
  },
];

export function wallpaperById(id: string | null | undefined): Wallpaper | null {
  return WALLPAPERS.find((w) => w.id === id) ?? null;
}

export function isValidAccent(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function appearanceEntitled(plan: SubscriptionPlan | string | null | undefined): boolean {
  return plan === "lite" || plan === "aero";
}

interface AppearanceState {
  userId: string | null;
  accent: string | null;
  wallpaper: string | null;
  loaded: boolean;
  unavailable: boolean;
}

const EMPTY: AppearanceState = { userId: null, accent: null, wallpaper: null, loaded: false, unavailable: false };
const store = createStore<AppearanceState>(EMPTY);
const CACHE_KEY = "disband:appearance";

function readCache(userId: string): Pick<AppearanceState, "accent" | "wallpaper"> | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; accent?: string | null; wallpaper?: string | null };
    if (parsed.userId !== userId) return null;
    return {
      accent: isValidAccent(parsed.accent) ? parsed.accent : null,
      wallpaper: wallpaperById(parsed.wallpaper) ? parsed.wallpaper ?? null : null,
    };
  } catch {
    return null;
  }
}

function writeCache(state: AppearanceState) {
  try {
    if (!state.userId) return;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: state.userId, accent: state.accent, wallpaper: state.wallpaper }));
  } catch {
    // Storage blocked: the stored row still applies once it loads.
  }
}

export async function loadAppearance(userId: string): Promise<void> {
  if (store.get().userId !== userId) {
    const cached = typeof window !== "undefined" ? readCache(userId) : null;
    store.set({ ...EMPTY, userId, accent: cached?.accent ?? null, wallpaper: cached?.wallpaper ?? null });
  }
  try {
    const { data, error } = await getSupabaseClient()
      .from("user_appearance")
      .select("accent_color, chat_wallpaper")
      .eq("user_id", userId)
      .maybeSingle();
    if (store.get().userId !== userId) return;
    if (error) {
      store.set((s) => ({ ...s, loaded: true, unavailable: isMissingFeatureError(error) }));
      return;
    }
    const row = data as { accent_color: string | null; chat_wallpaper: string | null } | null;
    const next: AppearanceState = {
      userId,
      accent: isValidAccent(row?.accent_color) ? row!.accent_color : null,
      wallpaper: wallpaperById(row?.chat_wallpaper) ? row!.chat_wallpaper : null,
      loaded: true,
      unavailable: false,
    };
    store.set(next);
    writeCache(next);
  } catch {
    if (store.get().userId === userId) store.set((s) => ({ ...s, loaded: true }));
  }
}

async function save(userId: string, patch: { accent_color?: string | null; chat_wallpaper?: string | null }): Promise<string | null> {
  const state = store.get();
  if (state.userId !== userId) return "Sign in again to change this.";
  if (state.unavailable) return "Appearance settings aren't available right now.";
  const before = state;
  const optimistic: AppearanceState = {
    ...state,
    accent: patch.accent_color !== undefined ? patch.accent_color : state.accent,
    wallpaper: patch.chat_wallpaper !== undefined ? patch.chat_wallpaper : state.wallpaper,
  };
  store.set(optimistic);
  const { error } = await getSupabaseClient()
    .from("user_appearance")
    .upsert(
      { user_id: userId, accent_color: optimistic.accent, chat_wallpaper: optimistic.wallpaper },
      { onConflict: "user_id" },
    );
  if (error) {
    if (store.get().userId === userId) store.set(before);
    return friendlyError(error, "Couldn't save that. Try again.");
  }
  writeCache(optimistic);
  return null;
}

export function setAccentColor(userId: string, color: string | null): Promise<string | null> {
  if (color !== null && !isValidAccent(color)) return Promise.resolve("Pick a colour like #4641d9.");
  return save(userId, { accent_color: color ? color.toLowerCase() : null });
}

export function setChatWallpaper(userId: string, id: string | null): Promise<string | null> {
  if (id !== null && !wallpaperById(id)) return Promise.resolve("That wallpaper isn't available.");
  return save(userId, { chat_wallpaper: id });
}

export function useAppearance(userId: string | null | undefined): AppearanceState {
  const state = useStore(store);
  useEffect(() => {
    if (!userId) return;
    if (store.get().userId !== userId || !store.get().loaded) void loadAppearance(userId);
  }, [userId]);
  return userId && state.userId === userId ? state : EMPTY;
}

// ---------------------------------------------------------------------------
// Painting

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on the colour. */
export function foregroundFor(hex: string): string {
  const l = luminance(hex);
  const onWhite = (1.05) / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? "#ffffff" : "#111014";
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const ACCENT_PROPS = ["--brand", "--brand-hover", "--brand-foreground"] as const;

/**
 * Paints (or clears) the accent on <html> and the wallpaper hook on <html>.
 * Inline properties on the root win over every theme's own --brand.
 */
export function applyAppearance(opts: { entitled: boolean; accent: string | null; wallpaper: string | null }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (opts.entitled && isValidAccent(opts.accent)) {
    root.style.setProperty("--brand", opts.accent);
    root.style.setProperty("--brand-hover", shade(opts.accent, 0.14));
    root.style.setProperty("--brand-foreground", foregroundFor(opts.accent));
  } else {
    for (const prop of ACCENT_PROPS) root.style.removeProperty(prop);
  }
  const wallpaper = opts.entitled ? wallpaperById(opts.wallpaper) : null;
  if (wallpaper) {
    root.setAttribute("data-chat-wallpaper", wallpaper.id);
    root.style.setProperty("--chat-wallpaper", wallpaper.css);
  } else {
    root.removeAttribute("data-chat-wallpaper");
    root.style.removeProperty("--chat-wallpaper");
  }
}
