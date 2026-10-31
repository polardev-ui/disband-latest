"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Unplug, WifiOff } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { usePresence } from "@/hooks/usePresence";
import {
  getConnectionState,
  probe,
  subscribeConnection,
  type ConnectionState,
} from "@/lib/connection-status";

/*
 Full-screen notice for when Disband can't be reached: either this device is
 offline, or the backend is restarting. It replaces the old red "You are
 offline" bar.

 It moves like the settings layers: the app steps back while this zooms in,
 and when the connection returns it zooms away and the app steps forward
 again, then reloads what may have changed in the meantime.
*/

const COPY: Record<Exclude<ConnectionState, "ok">, { title: string; body: string }> = {
  restarting: {
    title: "Disband is restarting…",
    body: "We're running a backend and database restart, and this may take up to 10 minutes. We're sorry for the inconvenience.",
  },
  offline: {
    title: "You're offline",
    body: "We can't reach Disband from this device. Check your Wi-Fi or network connection, and we'll take you back as soon as you're online.",
  },
};

export function ConnectionScreen() {
  const { ready, hydrated, session, refreshAll } = useApp();
  const [status, setStatus] = useState<ConnectionState>(getConnectionState);
  const [checking, setChecking] = useState(false);
  const down = status !== "ok";
  const { mounted, exiting } = usePresence(down, 150);
  // Keep the last message on screen while the layer animates away.
  const [shown, setShown] = useState<Exclude<ConnectionState, "ok">>("restarting");

  useEffect(() => subscribeConnection(setStatus), []);
  useEffect(() => {
    if (status !== "ok") setShown(status);
  }, [status]);

  useEffect(() => {
    if (!down) return;
    document.body.classList.add("connection-down");
    return () => document.body.classList.remove("connection-down");
  }, [down]);

  // Back online: pick up whatever happened while we were away.
  const latest = useRef({ ready, hydrated, session, refreshAll });
  latest.current = { ready, hydrated, session, refreshAll };
  const wasDown = useRef(false);
  useEffect(() => {
    if (down) {
      wasDown.current = true;
      return;
    }
    if (!wasDown.current) return;
    wasDown.current = false;
    const app = latest.current;
    // Lost before the app finished loading: start it again from the top.
    if (!app.ready || (app.session && !app.hydrated)) {
      window.location.reload();
      return;
    }
    if (!app.session) return;
    // Spread every client's reload out a little so they don't all hit the
    // database the moment it comes back.
    const timer = window.setTimeout(() => void latest.current.refreshAll(), Math.random() * 3_000);
    return () => window.clearTimeout(timer);
  }, [down]);

  if (!mounted || typeof document === "undefined") return null;

  const copy = COPY[shown];
  const Icon = shown === "offline" ? WifiOff : Unplug;

  const retry = async () => {
    setChecking(true);
    try {
      await probe();
    } finally {
      setChecking(false);
    }
  };

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="connection-screen-title"
      aria-describedby="connection-screen-body"
      className={`settings-layer${exiting ? " settings-layer-out" : ""} fixed inset-0 z-[300] flex items-center justify-center bg-bg-primary px-6`}
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <Icon aria-hidden className="h-16 w-16 text-text-muted" strokeWidth={1.5} />
        <h1 id="connection-screen-title" className="mt-6 text-2xl font-semibold text-text-normal">
          {copy.title}
        </h1>
        <p id="connection-screen-body" className="mt-3 text-[15px] leading-relaxed text-text-muted">
          {copy.body}
        </p>
        <p className="mt-8 flex items-center gap-2 text-[13px] text-text-muted" aria-live="polite">
          <span aria-hidden className="connection-pulse h-2 w-2 rounded-full bg-text-muted" />
          {checking ? "Checking…" : "Reconnecting automatically"}
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={checking}
          className="mt-4 rounded-[4px] border border-divider px-4 py-2 text-[14px] font-medium text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-60"
        >
          Try again
        </button>
      </div>
    </div>,
    document.body,
  );
}
