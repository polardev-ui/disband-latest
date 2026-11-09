"use client";

/**
 * Discord-style URLs for the signed-in app (web only):
 *
 *   /channels/@me                 friends (home)
 *   /channels/@me/<id>            a DM thread or group chat
 *   /channels/@me/notes           personal notes
 *   /channels/@discover           Discover
 *   /channels/<space>/<channel>   a channel in a space
 *   /channels/<space>             a space (its last or default channel)
 *
 * Every one of these is the same page (middleware rewrites /channels/* to
 * /app), so nothing reloads: the address follows the app, refreshing keeps
 * your place, links open where they point, and Back/Forward move through
 * what you visited.
 *
 * Off in the desktop app — its static bundle has only /app on disk, so a
 * reload on a deep path would find nothing — and on any other page that
 * mounts the app (the dev preview), so their URLs are left alone.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/platform";
import type { ViewMode } from "@/lib/supabase/types";

type Place =
  | { kind: "home" }
  | { kind: "notes" }
  | { kind: "discover" }
  | { kind: "conversation"; id: string }
  | { kind: "space"; serverId: string; channelId: string | null };

const ID = /^[0-9a-zA-Z-]{1,64}$/;

export function parsePath(pathname: string): Place | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (parts[0] !== "channels") return null;
  const [, first, second] = parts;
  if (!first || first === "@me") {
    if (!second) return { kind: "home" };
    if (second === "notes") return { kind: "notes" };
    return ID.test(second) ? { kind: "conversation", id: second } : { kind: "home" };
  }
  if (first === "@discover") return { kind: "discover" };
  if (!ID.test(first)) return { kind: "home" };
  return { kind: "space", serverId: first, channelId: second && ID.test(second) ? second : null };
}

export function pathFor(state: {
  viewMode: ViewMode;
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmThreadId: string | null;
  activeGroupChatId: string | null;
}): string {
  switch (state.viewMode) {
    case "dm":
      return state.activeDmThreadId ? `/channels/@me/${state.activeDmThreadId}` : "/channels/@me";
    case "group":
      return state.activeGroupChatId ? `/channels/@me/${state.activeGroupChatId}` : "/channels/@me";
    case "notes":
      return "/channels/@me/notes";
    case "discover":
      return "/channels/@discover";
    case "space":
      if (!state.activeServerId) return "/channels/@me";
      return state.activeChannelId
        ? `/channels/${state.activeServerId}/${state.activeChannelId}`
        : `/channels/${state.activeServerId}`;
    default:
      return "/channels/@me";
  }
}

function enabledHere(): boolean {
  if (typeof window === "undefined" || isTauri()) return false;
  const p = window.location.pathname;
  return p === "/app" || p === "/app/" || p === "/channels" || p.startsWith("/channels/");
}

interface Navigator {
  viewMode: ViewMode;
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmThreadId: string | null;
  activeGroupChatId: string | null;
  isDmThread: (id: string) => boolean;
  isGroupChat: (id: string) => boolean;
  setViewHome: () => void;
  setViewNotes: () => Promise<void> | void;
  setViewDiscover: () => void;
  selectServer: (id: string) => Promise<void>;
  routeToNotification: (link: string | null, at?: string | null) => Promise<boolean>;
}

export function useUrlRoutes(nav: Navigator) {
  const navRef = useRef(nav);
  navRef.current = nav;
  // True while the app is being moved to match the address (first load, or
  // Back/Forward): the address must not be rewritten mid-way.
  const applying = useRef(false);
  const started = useRef(false);

  // Open the place the address names.
  const apply = async (place: Place | null) => {
    const n = navRef.current;
    applying.current = true;
    try {
      if (!place || place.kind === "home") {
        n.setViewHome();
      } else if (place.kind === "notes") {
        await n.setViewNotes();
      } else if (place.kind === "discover") {
        n.setViewDiscover();
      } else if (place.kind === "conversation") {
        const link = n.isGroupChat(place.id) ? `group:${place.id}` : `dm:${place.id}`;
        let ok = await n.routeToNotification(link);
        // Not loaded under that kind: try the other before giving up.
        if (!ok && !n.isDmThread(place.id)) ok = await n.routeToNotification(`group:${place.id}`);
        if (!ok) n.setViewHome();
      } else if (place.channelId) {
        const ok = await n.routeToNotification(`channel:${place.channelId}`);
        if (!ok) await n.selectServer(place.serverId).catch(() => n.setViewHome());
      } else {
        await n.selectServer(place.serverId).catch(() => n.setViewHome());
      }
    } catch {
      navRef.current.setViewHome();
    } finally {
      applying.current = false;
    }
  };

  // First load: honour a deep link, then start following the app.
  useEffect(() => {
    if (started.current || !enabledHere()) return;
    started.current = true;
    const place = parsePath(window.location.pathname);
    if (place && place.kind !== "home") {
      void apply(place).then(() => {
        // Whatever the app could open is now the address.
        window.history.replaceState(window.history.state, "", pathFor(navRef.current) + window.location.search);
      });
    } else {
      window.history.replaceState(window.history.state, "", pathFor(nav) + window.location.search);
    }
    // Runs once per mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back / Forward.
  useEffect(() => {
    if (!enabledHere()) return;
    const onPop = () => {
      if (!window.location.pathname.startsWith("/channels")) return;
      void apply(parsePath(window.location.pathname));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app moved: put it in the address (a new history entry).
  const target = pathFor(nav);
  useEffect(() => {
    if (!started.current || applying.current || !enabledHere()) return;
    if (window.location.pathname === target) return;
    window.history.pushState(window.history.state, "", target + window.location.search);
  }, [target]);
}
