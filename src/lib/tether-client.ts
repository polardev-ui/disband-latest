"use client";

import { apiFetch } from "@/lib/api";

/**
 * Tether's web-side plumbing.
 *
 * The server route (`/api/tether/ask`) is authoritative for the Aero gate,
 * rate limits, and model cost. The web client only decides two things:
 *   - whether the ask fires at all (gate on the subscription plan), and
 *   - whether to show the "Tether is a Disband Aero feature" nudge.
 */

export type TetherSurface = "server" | "dm" | "group";

/** The nudge shown to non-Aero users near the composer. */
export const TETHER_AERO_NUDGE = "Tether is a Disband Aero feature.";

/** Matches "@tether" as a standalone word, case-insensitively. */
const TETHER_MENTION_RE = /@tether\b/i;

export function mentionsTether(content: string): boolean {
  return TETHER_MENTION_RE.test(content);
}

/** Tether's profile as the client needs it (from /api/tether/info). */
export interface TetherInfo {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_bot: boolean;
}

/**
 * Resolve Tether's identity for the client. Returns null when not yet
 * provisioned or unavailable — callers fall back to plain-text "@tether".
 */
export async function fetchTetherInfo(): Promise<TetherInfo | null> {
  try {
    const res = await fetch("/api/tether/info", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<TetherInfo>;
    if (!data.id || !data.username) return null;
    return {
      id: data.id,
      username: data.username,
      display_name: data.display_name ?? "Tether",
      avatar_url: data.avatar_url ?? null,
      is_bot: true,
    };
  } catch {
    return null;
  }
}

/**
 * Fire a Tether ask for an already-sent message. Fire-and-forget: the reply
 * arrives through the normal realtime message stream, and any failure must
 * never surface to the composer (the message itself is already live).
 */
export async function askTether(messageId: string, surface: TetherSurface): Promise<void> {
  try {
    await apiFetch("/api/tether/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, surface }),
    });
  } catch {
    // Swallow transport errors; the ask is best-effort.
  }
}