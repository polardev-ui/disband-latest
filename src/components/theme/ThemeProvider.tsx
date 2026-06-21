"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  isThemeId,
  THEMES,
  type ThemeId,
  type ThemeDefinition,
} from "@/lib/theme/themes";

const STORAGE_KEY = "disband:theme";

interface ThemeContextValue {
  theme: ThemeId;
  themes: ThemeDefinition[];
  setTheme: (theme: ThemeId) => void;
  /** Cycle to the next registered theme — handy for a single toggle button. */
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Keep the native color-scheme in sync so form controls + the desktop
  // window chrome match the active theme.
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Hydrate from localStorage (set early by the inline script in layout.tsx,
  // this just keeps React state aligned with the DOM).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) {
      setThemeState(stored);
      applyTheme(stored);
    } else {
      applyTheme(DEFAULT_THEME);
    }
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    // TODO (integration): also persist to `profiles.theme` in Supabase here
    // for signed-in users so the preference follows them across devices.
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const index = THEMES.findIndex((t) => t.id === current);
      const next = THEMES[(index + 1) % THEMES.length].id;
      applyTheme(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themes: THEMES, setTheme, cycleTheme }),
    [theme, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
