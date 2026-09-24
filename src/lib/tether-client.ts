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