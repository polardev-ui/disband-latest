"use client";

import { useCallback, useEffect, useState } from "react";

export interface GifFavorite {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  timestamp: number;
}

const STORAGE_KEY = "disband:gif-favorites";
const MAX_FAVORITES = 100;

function load(): GifFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GifFavorite[];
  } catch {
    return [];
  }
}

function save(favorites: GifFavorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    /* storage full */
  }
}

export function useGifFavorites() {
  const [favorites, setFavorites] = useState<GifFavorite[]>([]);

  useEffect(() => {
    setFavorites(load());
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (gif: { id: string; title?: string; url?: string | null; previewUrl?: string | null }) => {
      setFavorites((prev) => {
        const existing = prev.findIndex((f) => f.id === gif.id);
        if (existing >= 0) {
          const next = prev.filter((_, i) => i !== existing);
          save(next);
          return next;
        }
        const next: GifFavorite[] = [
          {
            id: gif.id,
            title: gif.title ?? "",
            url: gif.url ?? "",
            previewUrl: gif.previewUrl ?? "",
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, MAX_FAVORITES);
        save(next);
        return next;
      });
    },
    [],
  );

  return { favorites, isFavorite, toggleFavorite };
}
