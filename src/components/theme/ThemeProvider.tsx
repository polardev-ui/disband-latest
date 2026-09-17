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
  themeColorScheme,
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

  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);

  root.style.colorScheme = themeColorScheme(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    let stored: string|null = null;
    try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* The current theme works without storage. */ }
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
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Session-only preference. */ }

  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const index = THEMES.findIndex((t) => t.id === current);
      const next = THEMES[(index + 1) % THEMES.length].id;
      applyTheme(next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Session-only preference. */ }
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
