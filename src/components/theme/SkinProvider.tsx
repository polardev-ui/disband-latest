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

export interface SkinState {
  preset: SkinId | null;
  customCss: string;
  icons: Record<string, string>;
  enabled: boolean;

  entitled: boolean;
  plan: string;

  lapsed: boolean;
  loading: boolean;
}

interface SkinContextValue extends SkinState {

  save: (patch: Partial<Pick<SkinState, "preset" | "customCss" | "icons" | "enabled">>)
    => Promise<string | null>;

  preview: (preset: SkinId | null) => void;

  endPreview: () => void;

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

  const previewRef = useRef<SkinId | null | undefined>(undefined);

  const stateRef = useRef(state);
  stateRef.current = state;

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

      lapsed: row.has_theme === true && row.entitled !== true,
      loading: false,
    };
    setState(next);
    writeCache(next);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
