"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { isTauri } from "@/lib/platform";
import { sanitizeActivity } from "@/lib/activity";

/** Read in Settings → Connections; on unless switched off. */
export const SHARE_ACTIVITY_KEY = "disband:share-activity";
export const SHARE_ACTIVITY_EVENT = "disband:share-activity";

export function sharesActivity(): boolean {
  try {
    return window.localStorage.getItem(SHARE_ACTIVITY_KEY) !== "0";
  } catch {
    return true;
  }
}

interface DetectedGame { name: string; started_at: number }
interface RpcActivity { client_id: string; pid: number | null; activity: Record<string, unknown> | null }

const names = new Map<string, Promise<string | null>>();

/** The game behind a Rich Presence application id (cached for the session). */
function appName(clientId: string): Promise<string | null> {
  if (!clientId) return Promise.resolve(null);
  let hit = names.get(clientId);
  if (!hit) {
    hit = apiFetch(`/api/rpc/app/${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { name?: string } | null) => j?.name ?? null)
      .catch(() => null);
    names.set(clientId, hit);
  }
  return hit;
}

/**
 * Desktop only: turns the Rust side's game detection and Rich Presence
 * socket into your published activity. A game's own Rich Presence beats a
 * bare "this process is running"; the activity is renewed every minute so it
 * lapses on its own if the app dies.
 */
export function useGameActivity() {
  const { user, setGameActivity } = useApp();

  useEffect(() => {
    if (!user || !isTauri()) return;
    let alive = true;
    let game: DetectedGame | null = null;
    const rpc = new Map<string, RpcActivity>();
    const unlisten: (() => void)[] = [];

    const publish = async () => {
      if (!alive) return;
      if (!sharesActivity()) {
        setGameActivity(null);
        return;
      }
      const live = [...rpc.values()].reverse().find((r) => r.activity);
      if (live?.activity) {
        const name = (await appName(live.client_id)) ?? game?.name ?? null;
        if (!alive) return;
        setGameActivity(sanitizeActivity(live.activity, { name, source: "rpc", applicationId: live.client_id }));
        return;
      }
      if (game) {
        setGameActivity(sanitizeActivity({ started_at: game.started_at * 1000 }, { name: game.name, source: "process" }));
        return;
      }
      setGameActivity(null);
    };

    void (async () => {
      const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
      if (!alive) return;
      unlisten.push(await listen<DetectedGame | null>("activity://game", (e) => { game = e.payload; void publish(); }));
      unlisten.push(await listen<RpcActivity>("activity://rpc", (e) => {
        if (e.payload.activity) rpc.set(e.payload.client_id, e.payload);
        else rpc.delete(e.payload.client_id);
        void publish();
      }));
      try {
        const now = await invoke<{ game: DetectedGame | null; rpc: RpcActivity[] }>("current_activity");
        game = now.game;
        for (const r of now.rpc) rpc.set(r.client_id, r);
      } catch {
        // An older desktop build without detection: nothing to show.
      }
      void publish();
    })();

    const renew = window.setInterval(() => void publish(), 60_000);
    const onToggle = () => void publish();
    window.addEventListener(SHARE_ACTIVITY_EVENT, onToggle);
    return () => {
      alive = false;
      window.clearInterval(renew);
      window.removeEventListener(SHARE_ACTIVITY_EVENT, onToggle);
      for (const off of unlisten) off();
    };
  }, [user, setGameActivity]);
}
