"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { buildThemeStylesheet } from "@/lib/theme/custom-css";
import { isSkinId, type SkinId } from "@/lib/theme/skins";

/**
 * The Super skin: which preset is on, the member's own CSS, and their icons.
 *
 * Held above the app rather than inside the settings screen because a skin has
 * to be applied whether or not settings is open, and because it is server
 * state — the same account on a desktop and a browser must look the same, so
 * the row is the source of truth and localStorage is only a cache to stop the
 * skin flashing in on every load.
 */

export interface SkinState {
  preset: SkinId | null;
  customCss: string;
  icons: Record<string, string>;
  enabled: boolean;
  /** Whether the plan currently allows a skin to be applied. */
  entitled: boolean;
  plan: string;
  /** A skin is saved but the plan no longer allows it. */
  lapsed: boolean;
  loading: boolean;
}

interface SkinContextValue extends SkinState {
  /** Anything omitted is left as it is. Returns an error message, or null. */
  save: (patch: Partial<Pick<SkinState, "preset" | "customCss" | "icons" | "enabled">>)
    => Promise<string | null>;
  /** Show a preset without saving it, so a card can be tried before choosing. */
  preview: (preset: SkinId | null) => void;
  /** Stop previewing and go back to whatever is actually saved. */
  endPreview: () => void;
  /** What the sanitiser stripped from the last save. */
  removedNotes: string[];
}

const CACHE_KEY = "disband:skin";
const STYLE_ID = "disband-custom-css";

const EMPTY: SkinState = {
  preset: null,
  customCss: "",
  icons: {},
  enabled: true,
  entitled: false,
  plan: "free",
  lapsed: false,
  loading: true,
};

const SkinContext = createContext<SkinContextValue | null>(null);

/**
 * Skins are web and desktop only for now.
 *
 * There is no platform check to make: the desktop app runs this exact bundle,
 * and the mobile apps are native SwiftUI and Compose with no stylesheet for a
 * skin to apply to, so they never reach this code. A member's row still syncs
 * everywhere — the skin is simply not rendered on a phone rather than being
 * half-applied there.
 */

function applySkinAttribute(preset: SkinId | null) {
  const root = document.documentElement;
  if (preset) root.setAttribute("data-skin", preset);
  else root.removeAttribute("data-skin");
}

function applyCustomCss(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  // textContent, never innerHTML: the string is treated as text by definition,
  // which is a second line of defence behind the sanitiser.
  if (el.textContent !== css) el.textContent = css;
}

function readCache(): Partial<SkinState> | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<SkinState>) : null;
  } catch {
    return null;
  }
}

function writeCache(state: SkinState) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        preset: state.preset,
        customCss: state.customCss,
        icons: state.icons,
        enabled: state.enabled,
        entitled: state.entitled,
      }),
    );
  } catch {
    // Private browsing: the skin still works, it just flashes in on load.
  }
}

interface ThemeRow {
  plan?: string;
  entitled?: boolean;
  preset?: string | null;
  custom_css?: string;
  icons?: Record<string, string>;
  enabled?: boolean;
  has_theme?: boolean;
}

export function SkinProvider({
  userId,
  children,
}: {
  userId: string | null | undefined;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SkinState>(EMPTY);
  const [removedNotes, setRemovedNotes] = useState<string[]>([]);
  /** Set while a card is being hovered, so it does not fight the saved value. */
  const previewRef = useRef<SkinId | null | undefined>(undefined);
  /** The latest state, readable from callbacks that must not re-subscribe. */
  const stateRef = useRef(state);
  stateRef.current = state;

  // Paint the cached skin before the row arrives, so a member who has one does
  // not watch the plain theme for the length of a round trip on every load.
  useEffect(() => {
    if (!userId) return;
    const cached = readCache();
    if (!cached?.entitled) return;
    if (cached.enabled !== false && isSkinId(cached.preset)) {
      applySkinAttribute(cached.preset);
    }
    if (cached.enabled !== false && cached.customCss) {
      applyCustomCss(buildThemeStylesheet(cached.customCss, cached.icons ?? {}).css);
    }
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) {
      setState({ ...EMPTY, loading: false });
      applySkinAttribute(null);
      applyCustomCss("");
      return;
    }

    const { data, error } = await getSupabaseClient().rpc("get_theme");
    if (error) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    const row = (data ?? {}) as ThemeRow;
    const next: SkinState = {
      preset: isSkinId(row.preset) ? row.preset : null,
      customCss: row.custom_css ?? "",
      icons: row.icons ?? {},
      enabled: row.enabled !== false,
      entitled: row.entitled === true,
      plan: row.plan ?? "free",
      // "You have a skin and are no longer allowed it" is the state the notice
      // is about, and the server states it rather than the UI guessing.
      lapsed: row.has_theme === true && row.entitled !== true,
      loading: false,
    };
    setState(next);
    writeCache(next);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The single place the DOM is touched, so preview, save and load can never
  // disagree about what is currently applied.
  useEffect(() => {
    const active = state.entitled && state.enabled;
    const preset = previewRef.current !== undefined
      ? previewRef.current
      : (active ? state.preset : null);

    applySkinAttribute(preset);
    applyCustomCss(
      active && state.customCss
        ? buildThemeStylesheet(state.customCss, state.icons).css
        : "",
    );
  }, [state.entitled, state.enabled, state.preset, state.customCss, state.icons]);

  const preview = useCallback((preset: SkinId | null) => {
    previewRef.current = preset;
    applySkinAttribute(preset);
  }, []);

  /**
   * `undefined` in the ref means "not previewing", which is why a preview of
   * "no skin" cannot simply be null — the two are different states and the
   * effect above has to be able to tell them apart.
   *
   * Reads the current skin from a ref rather than from a state updater: an
   * updater must be pure, and React is free to run it twice.
   */
  const endPreview = useCallback(() => {
    previewRef.current = undefined;
    const saved = stateRef.current;
    applySkinAttribute(saved.entitled && saved.enabled ? saved.preset : null);
  }, []);

  const save = useCallback<SkinContextValue["save"]>(async (patch) => {
    previewRef.current = undefined;

    const merged = {
      preset: patch.preset !== undefined ? patch.preset : state.preset,
      customCss: patch.customCss !== undefined ? patch.customCss : state.customCss,
      icons: patch.icons !== undefined ? patch.icons : state.icons,
      enabled: patch.enabled !== undefined ? patch.enabled : state.enabled,
    };

    const { removed } = buildThemeStylesheet(merged.customCss, merged.icons);
    setRemovedNotes(removed);

    const { data, error } = await getSupabaseClient().rpc("save_theme", {
      p_preset: merged.preset,
      p_custom_css: merged.customCss,
      p_icons: merged.icons,
      p_enabled: merged.enabled,
    });

    if (error) {
      return error.message.includes("theme_requires_aero")
        ? "Themes are a Disband Aero feature."
        : error.message;
    }

    const row = (data ?? {}) as ThemeRow;
    const next: SkinState = {
      preset: isSkinId(row.preset) ? row.preset : null,
      customCss: row.custom_css ?? "",
      icons: row.icons ?? {},
      enabled: row.enabled !== false,
      entitled: row.entitled === true,
      plan: row.plan ?? "free",
      lapsed: row.has_theme === true && row.entitled !== true,
      loading: false,
    };
    setState(next);
    writeCache(next);
    return null;
  }, [state.preset, state.customCss, state.icons, state.enabled]);

  const value = useMemo<SkinContextValue>(
    () => ({ ...state, save, preview, endPreview, removedNotes }),
    [state, save, preview, endPreview, removedNotes],
  );

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error("useSkin must be used within a <SkinProvider>");
  return ctx;
}
