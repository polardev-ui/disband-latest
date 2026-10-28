"use client";

import { useEffect } from "react";
import { WhatsNewModal, WHATS_NEW_VERSION } from "@/components/modals/WhatsNewModal";

/** Preview of the What's New popup without signing in. */
export default function WhatsNewPreview() {
  useEffect(() => { try { localStorage.removeItem(`disband-whats-new:${WHATS_NEW_VERSION}`); } catch { /* ignore */ } }, []);
  return <main className="min-h-screen bg-bg-tertiary"><WhatsNewModal /></main>;
}
