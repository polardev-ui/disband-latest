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

interface DetectedGame { name: string; started_at: number; app_id?: string | null; icon?: string | null }
interface RpcActivity { client_id: string; pid: number | null; activity: Record<string, unknown> | null }

interface AppInfo { name: string; icon_url: string | null; assets?: Record<string, string> }
const apps = new Map<string, Promise<AppInfo | null>>();

/** The game behind a Rich Presence application id: name, logo, image set (cached for the session). */
function appInfo(clientId: string): Promise<AppInfo | null> {
  if (!clientId) return Promise.resolve(null);
  let hit = apps.get(clientId);
  if (!hit) {
    hit = apiFetch(`/api/rpc/app/${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AppInfo | null) => (j?.name ? j : null))
      .catch(() => null);
    apps.set(clientId, hit);
  }
  return hit;
}

/**
 * A Rich Presence image as a URL. Games send an asset name ("map_dust2"),
 * an external "mp:" image Discord proxies, or a plain https URL.
 */
function imageUrl(key: unknown, app: AppInfo | null): string | null {
  if (typeof key !== "string" || !key) return null;
  if (key.startsWith("https://")) return key;
  if (key.startsWith("mp:")) return `https://media.discordapp.net/${key.slice(3)}`;
  return app?.assets?.[key] ?? null;
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
        const app = await appInfo(live.client_id);
        if (!alive) return;
        const a = live.activity;
        const assets = (a.assets ?? {}) as Record<string, unknown>;
        // Like Discord: the game's art large, and its logo as the small badge
        // when the game didn't pick a small image of its own. No art: the logo.
        const large = imageUrl(assets.large_image, app);
        const small = imageUrl(assets.small_image, app);
        setGameActivity(sanitizeActivity(
          { ...a, assets: { ...assets, large_image: large ?? app?.icon_url ?? game?.icon ?? null, small_image: small ?? (large ? app?.icon_url ?? null : null) } },
          { name: app?.name ?? game?.name ?? null, source: "rpc", applicationId: live.client_id },
        ));
        return;
      }
      if (game) {
        setGameActivity(sanitizeActivity(
          { started_at: game.started_at * 1000, large_image: game.icon ?? null },
          { name: game.name, source: "process", applicationId: game.app_id ?? null },
        ));
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
