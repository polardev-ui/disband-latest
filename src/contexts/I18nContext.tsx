"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_STORAGE_KEY,
  getStoredLanguage,
  isLanguageCode,
  translate,
  type LanguageCode,
} from "@/lib/i18n";

type Translate = (source: string, variables?: Record<string, string | number>) => string;

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start in English on both the server and the hydration pass, then adopt the
  // stored preference in an effect so markup and the server stay identical.
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    setLanguageState(getStoredLanguage());
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: LanguageCode) => {
    if (!isLanguageCode(next)) return;
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice still applies for this session.
    }
  }, []);

  const t = useCallback<Translate>(
    (source, variables) => translate(language, source, variables),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within an <I18nProvider>");
  return value;
}
