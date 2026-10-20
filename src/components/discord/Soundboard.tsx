"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  listAllUserServerSounds,
  fetchFavoriteSoundIds,
  setFavoriteSound,
} from "@/lib/server-sounds";
import type { ServerSound } from "@/lib/supabase/types";
import { IconMusic } from "@/components/icons";
import { playVoiceSoundboardSound } from "@/lib/voice-mixer";

interface SoundboardProps {
  compact?: boolean;
  /** "panel": the wide button in the Voice Connected card; opens up and to the right. */
  variant?: "round" | "panel";
}

export function Soundboard({ compact = false, variant = "round" }: SoundboardProps) {
  const { servers, activeServer, user } = useApp();
  const userId = user?.id ?? null;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [selectedServerId, setSelectedServerId] = useState<string | null>(activeServer?.id ?? null);
  const [tab, setTab] = useState<"server" | "favorites">("server");
  const [toggling, setToggling] = useState<string | null>(null);

  const serversWithSounds = useMemo(() => {
    const ids = new Set(sounds.map((sound) => sound.server_id));
    return servers.filter((server) => ids.has(server.id));
  }, [servers, sounds]);

  const effectiveServerId = useMemo(() => {
    if (selectedServerId && serversWithSounds.some((server) => server.id === selectedServerId)) {
      return selectedServerId;
    }
    if (activeServer?.id && serversWithSounds.some((server) => server.id === activeServer.id)) {
      return activeServer.id;
    }
    return serversWithSounds[0]?.id ?? null;
  }, [activeServer?.id, selectedServerId, serversWithSounds]);

  const serverSounds = useMemo(
    () => sounds.filter((sound) => sound.server_id === effectiveServerId),
    [effectiveServerId, sounds],
  );

  const favoriteSounds = useMemo(
    () => sounds.filter((sound) => favoriteIds.has(sound.id)),
    [sounds, favoriteIds],
  );

  const load = useCallback(async () => {
    if (!servers.length) {
      setSounds([]);
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const [loadedSounds, ids] = await Promise.all([
        listAllUserServerSounds(servers.map((server) => server.id)),
        userId ? fetchFavoriteSoundIds(userId) : Promise.resolve(new Set<string>()),
      ]);
      setSounds(loadedSounds);
      setFavoriteIds(ids);
    } finally {
      setLoading(false);
    }
  }, [servers, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    let timer: number | undefined;
    if (open) {
      setVisible(true);
    } else {
      timer = window.setTimeout(() => setVisible(false), 180);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [visible]);

  const toggleFavorite = useCallback(
    async (sound: ServerSound) => {
      if (!userId) return;
      const next = !favoriteIds.has(sound.id);
      setToggling(sound.id);
      const saved = await setFavoriteSound(userId, sound.id, next);
      if (saved) {
        setFavoriteIds((prev) => {
          const nextSet = new Set(prev);
          if (next) nextSet.add(sound.id);
          else nextSet.delete(sound.id);
          return nextSet;
        });
      }
      setToggling(null);
    },
    [favoriteIds, userId],
  );

  const activeServerName =
    servers.find((server) => server.id === effectiveServerId)?.name ?? "Server sounds";

  return (
    <div ref={rootRef} className={variant === "panel" ? "relative flex flex-1" : "relative inline-block"}>
      {variant === "panel" ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open soundboard"
          className={`flex h-8 flex-1 items-center justify-center rounded-[4px] transition-colors ${
            open ? "bg-interactive-selected text-interactive-active" : "bg-bg-secondary text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
          }`}
        >
          <IconMusic size={18} />
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all ${
          compact
            ? "bg-text-normal/10 text-text-normal hover:bg-text-normal/20 hover:scale-105"
            : "bg-bg-tertiary text-text-normal hover:bg-interactive-hover"
        }`}
        title="Open soundboard"
      >
        <IconMusic size={16} />
        {sounds.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {sounds.length > 99 ? "99+" : sounds.length}
          </span>
        )}
      </button>
      )}

      {visible && (
        <div
          role="dialog"
          aria-label="Soundboard"
          className={`absolute z-[150] w-[340px] max-w-[calc(100vw-2rem)] rounded-lg bg-bg-secondary p-3 shadow-[0_8px_16px_rgba(0,0,0,0.24)] transition duration-150 ease-out ${
            variant === "panel" ? "bottom-10 left-0 origin-bottom-left" : "bottom-12 right-0 origin-bottom-right"
          } ${
            open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2 pointer-events-none"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-normal">Soundboard</h3>
              <p className="text-xs text-text-muted">
                {tab === "server"
                  ? `${activeServerName} · ${serverSounds.length} sounds`
                  : `Favorited sounds (${favoriteSounds.length})`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-bg-tertiary hover:text-text-normal"
              aria-label="Close soundboard"
            >
              ×
            </button>
          </div>

          <div className="mb-3 flex gap-1 rounded-lg bg-bg-tertiary p-1">
            {(["server", "favorites"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  tab === value
                    ? "bg-brand text-white"
                    : "text-text-muted hover:bg-bg-secondary hover:text-text-normal"
                }`}
              >
                {value === "server" ? "Sounds" : "Favorites"}
              </button>
            ))}
          </div>

          {tab === "server" && serversWithSounds.length > 1 && (
            <select
              className="mb-3 w-full rounded-md bg-bg-tertiary px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              value={effectiveServerId ?? ""}
              onChange={(event) => setSelectedServerId(event.target.value || null)}
            >
              {serversWithSounds.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          )}

          {loading ? (
            <p className="py-8 text-center text-xs text-text-muted">Loading sounds…</p>
          ) : (
            <div className="scrollbar-thin max-h-72 overflow-y-auto">
              {tab === "server" ? (
                serverSounds.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {serverSounds.map((sound) => {
                      const favorite = favoriteIds.has(sound.id);
                      return (
                        <div key={sound.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => playVoiceSoundboardSound(sound.url)}
                            className="flex w-full flex-col items-start gap-1 rounded-xl border border-divider bg-bg-tertiary px-3 py-3 text-left transition-colors hover:border-brand hover:bg-bg-secondary"
                          >
                            <span className="text-xl leading-none">{sound.emoji}</span>
                            <span className="max-w-full truncate text-xs font-medium text-text-normal">
                              {sound.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleFavorite(sound)}
                            disabled={toggling === sound.id || !userId}
                            className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all ${
                              favorite
                                ? "bg-brand/20 text-brand"
                                : "bg-black/20 text-white/70 opacity-0 group-hover:opacity-100"
                            }`}
                            title={favorite ? "Remove favorite" : "Add favorite"}
                            aria-label={favorite ? "Remove favorite" : "Add favorite"}
                          >
                            {toggling === sound.id ? "…" : favorite ? "★" : "☆"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-xs text-text-muted">
                      No sounds for this server yet.
                    </p>
                    {!userId && (
                      <p className="mt-1 text-xs text-text-muted">
                        Log in to favorite sounds.
                      </p>
                    )}
                  </div>
                )
              ) : favoriteSounds.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {favoriteSounds.map((sound) => (
                    <button
                      key={sound.id}
                      type="button"
                      onClick={() => playVoiceSoundboardSound(sound.url)}
                      className="flex w-full flex-col items-start gap-1 rounded-xl border border-divider bg-bg-tertiary px-3 py-3 text-left transition-colors hover:border-brand hover:bg-bg-secondary"
                    >
                      <span className="text-xl leading-none">{sound.emoji}</span>
                      <span className="max-w-full truncate text-xs font-medium text-text-normal">
                        {sound.name}
                      </span>
                      <span className="max-w-full truncate text-[10px] text-text-muted">
                        {servers.find((s) => s.id === sound.server_id)?.name ?? "Server sound"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-xs text-text-muted">
                    No favorite sounds yet.
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Star sounds from the Sounds tab to reach them from every device.
                  </p>
                </div>
            )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
