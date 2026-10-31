"use client";

import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";

/*
 Is Disband reachable right now?

   "ok"         — everything is fine (or nothing has gone wrong yet).
   "offline"    — this device has no connection.
   "restarting" — the device is online but Supabase is not answering: a
                  project restart, an upgrade, or the database falling over.

 Detection is passive. The Supabase client's fetch is wrapped (`trackedFetch`)
 and only network errors and gateway statuses (502/503/504/544) count as
 trouble. One such failure schedules a single probe a couple of seconds later;
 only a failed probe changes the state, so one bad request, or an edge
 function that returns 503, never flashes the screen.

 While down, the probe repeats with backoff and jitter until a request goes
 through. Keep these intervals generous: every open client probes at once
 during an outage, and the database is what is struggling (see the 23 October
 note on the catch-up poll in AppContext).
*/

export type ConnectionState = "ok" | "offline" | "restarting";

const GATEWAY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 544]);
const SUSPECT_DELAY_MS = 2_000;
const OFFLINE_DEBOUNCE_MS = 1_500;
const PROBE_MIN_MS = 5_000;
const PROBE_MAX_MS = 20_000;
const PROBE_TIMEOUT_MS = 8_000;

let state: ConnectionState = "ok";
const listeners = new Set<(s: ConnectionState) => void>();
let probeTimer: number | undefined;
let probeDelay = PROBE_MIN_MS;
let probing = false;
let started = false;

function setState(next: ConnectionState) {
  if (next === state) return;
  state = next;
  probeDelay = PROBE_MIN_MS;
  if (next === "ok") {
    window.clearTimeout(probeTimer);
    probeTimer = undefined;
  }
  for (const fn of listeners) fn(next);
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function subscribeConnection(fn: (s: ConnectionState) => void): () => void {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function schedule(ms: number) {
  if (typeof window === "undefined") return;
  window.clearTimeout(probeTimer);
  probeTimer = window.setTimeout(() => void probe(), ms);
}

function scheduleNextWhileDown() {
  // Jitter spreads every client's retry out so they do not land together
  // the moment the database comes back.
  const jitter = probeDelay * (0.75 + Math.random() * 0.5);
  schedule(jitter);
  probeDelay = Math.min(PROBE_MAX_MS, Math.round(probeDelay * 1.5));
}

/** Can the device reach anything at all? Our own site stands in for "the internet". */
async function siteReachable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    // no-cors: an opaque response still proves the request got there. The
    // desktop app's own origin is local, so it asks the website instead.
    const origin = isTauri() ? PUBLIC_ENV.webAppUrl.replace(/\/$/, "") : window.location.origin;
    await fetch(`${origin}/favicon.ico?r=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

/** One tiny indexed read: it answers only when the API and the database both do. */
async function supabaseReachable(): Promise<"up" | "down" | "unreachable"> {
  const url = PUBLIC_ENV.supabaseUrl;
  const key = PUBLIC_ENV.supabaseAnonKey;
  if (!url || !key) return "up";
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.status >= 500 ? "down" : "up";
  } catch {
    return "unreachable";
  }
}

export async function probe(): Promise<void> {
  if (probing || typeof window === "undefined") return;
  probing = true;
  window.clearTimeout(probeTimer);
  probeTimer = undefined;
  try {
    const result = await supabaseReachable();
    if (result === "up") {
      setState("ok");
      return;
    }
    if (result === "down") {
      setState("restarting");
    } else {
      setState((await siteReachable()) ? "restarting" : "offline");
    }
    scheduleNextWhileDown();
  } finally {
    probing = false;
  }
}

function suspect() {
  // Already down: the running probe loop will notice recovery.
  if (state !== "ok" || probeTimer !== undefined) return;
  schedule(SUSPECT_DELAY_MS);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  let offlineTimer: number | undefined;
  window.addEventListener("offline", () => {
    // A Wi-Fi hand-off fires offline then online within a second; wait it out.
    window.clearTimeout(offlineTimer);
    offlineTimer = window.setTimeout(() => {
      if (navigator.onLine) return;
      setState("offline");
      scheduleNextWhileDown();
    }, OFFLINE_DEBOUNCE_MS);
  });
  window.addEventListener("online", () => {
    window.clearTimeout(offlineTimer);
    if (state !== "ok") void probe();
  });
}

/**
 * fetch for the Supabase client. Reports trouble and recovery, otherwise
 * behaves exactly like fetch.
 */
export const trackedFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    if (GATEWAY_STATUSES.has(res.status)) suspect();
    else if (state !== "ok" && res.status < 500) setState("ok");
    else if (state === "ok" && probeTimer !== undefined && !probing && res.status < 500) {
      // A later request went through: the earlier failure was a blip.
      window.clearTimeout(probeTimer);
      probeTimer = undefined;
    }
    return res;
  } catch (err) {
    // The caller cancelling its own request is not an outage.
    if (!(err instanceof DOMException && err.name === "AbortError")) suspect();
    throw err;
  }
};
