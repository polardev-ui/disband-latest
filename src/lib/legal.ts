"use client";

import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";

/**
 * The Terms/Privacy revision a user has agreed to, stored as `tos_version` in
 * their auth metadata. Sign-up records it; bump it when the documents change
 * and TosConsentPopup asks everyone again.
 */
export const TOS_VERSION = "2026-11-06";

export type LegalPath = "/terms" | "/privacy" | "/eula";

/** A legal page on the website. The desktop app's own origin is local, so it links to the site. */
export function legalUrl(path: LegalPath): string {
  const origin = isTauri() ? PUBLIC_ENV.webAppUrl.replace(/\/$/, "") : window.location.origin;
  return `${origin}${path}`;
}

/** Open a legal page in a new tab, or the system browser on desktop. */
export async function openLegalPage(path: LegalPath) {
  const url = legalUrl(path);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:opener|open_url", { url });
      return;
    } catch {
      // Fall through to browser open.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
