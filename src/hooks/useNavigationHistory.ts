"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { ViewMode } from "@/lib/supabase/types";

/**
 * Back and forward through the places you've been, like a browser (and like
 * Discord's arrows beside the window buttons).
 *
 * Disband keeps where you are in app state, not in the URL, so there is no
 * browser history to lean on. This watches that state and keeps its own: a
 * space and channel, a DM, a group chat, Home, Notes, Discover. Going back
 * or forward re-opens the place through the same calls a click would use.
 */

interface Place {
  view: ViewMode;
  serverId: string | null;
  channelId: string | null;
  dmId: string | null;
  groupId: string | null;
}

/** How many places are remembered. */
const LIMIT = 60;

function keyOf(p: Place): string {
  switch (p.view) {
    case "space":
      return `space:${p.serverId ?? ""}:${p.channelId ?? ""}`;
    case "dm":
      return `dm:${p.dmId ?? ""}`;
    case "group":
      return `group:${p.groupId ?? ""}`;
    default:
      return p.view;
  }
}

export interface NavigationHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  back: () => void;
  forward: () => void;
}

export function useNavigationHistory(): NavigationHistory {
  const app = useApp();
  const { viewMode, activeServerId, activeChannelId, activeDmThreadId, activeGroupChatId } = app;

  const stack = useRef<Place[]>([]);
  const index = useRef(-1);
  /** Set while back/forward is re-opening a place, so the steps on the way
   *  there aren't recorded as new places. */
  const restoring = useRef(false);
  const appRef = useRef(app);
  appRef.current = app;
  const [, setRevision] = useState(0);
  const changed = () => setRevision((n) => n + 1);

  // Record where you are.
  useEffect(() => {
    if (restoring.current) return;
    const place: Place = {
      view: viewMode,
      serverId: activeServerId,
      channelId: activeChannelId,
      dmId: activeDmThreadId,
      groupId: activeGroupChatId,
    };
    // A DM or group chat that hasn't been chosen yet isn't a place.
    if ((place.view === "dm" && !place.dmId) || (place.view === "group" && !place.groupId)) return;

    const here = stack.current[index.current];
    if (here && keyOf(here) === keyOf(place)) return;

    // Opening a space happens in two steps: the space, then its channel a
    // moment later. That's one place, not two.
    if (here && here.view === "space" && place.view === "space"
        && here.serverId === place.serverId && (!here.channelId || !place.channelId)) {
      if (place.channelId) {
        stack.current[index.current] = place;
        changed();
      }
      return;
    }

    // Somewhere new: anything ahead of here is forgotten, as in a browser.
    stack.current = stack.current.slice(0, index.current + 1);
    stack.current.push(place);
    if (stack.current.length > LIMIT) stack.current.splice(0, stack.current.length - LIMIT);
    index.current = stack.current.length - 1;
    changed();
  }, [viewMode, activeServerId, activeChannelId, activeDmThreadId, activeGroupChatId]);

  const open = useCallback(async (place: Place) => {
    const a = appRef.current;
    restoring.current = true;
    try {
      switch (place.view) {
        case "home":
          a.setViewHome();
          break;
        case "discover":
          a.setViewDiscover();
          break;
        case "notes":
          await a.setViewNotes();
          break;
        case "dm":
          if (place.dmId) await a.selectDmThread(place.dmId);
          break;
        case "group":
          if (place.groupId) await a.selectGroupChat(place.groupId);
          break;
        case "space":
          if (!place.serverId) break;
          if (a.viewMode !== "space" || a.activeServerId !== place.serverId) {
            await a.selectServer(place.serverId);
          }
          if (place.channelId && appRef.current.activeChannelId !== place.channelId) {
            appRef.current.selectChannel(place.channelId);
          }
          break;
      }
    } catch {
      // A place that no longer exists (a space you left, a deleted
      // channel): stay where you ended up.
    } finally {
      // After React has applied the last of it.
      window.setTimeout(() => {
        restoring.current = false;
      }, 0);
    }
  }, []);

  const back = useCallback(() => {
    if (restoring.current || index.current <= 0) return;
    index.current -= 1;
    changed();
    void open(stack.current[index.current]);
  }, [open]);

  const forward = useCallback(() => {
    if (restoring.current || index.current >= stack.current.length - 1) return;
    index.current += 1;
    changed();
    void open(stack.current[index.current]);
  }, [open]);

  return {
    canGoBack: index.current > 0,
    canGoForward: index.current < stack.current.length - 1,
    back,
    forward,
  };
}
