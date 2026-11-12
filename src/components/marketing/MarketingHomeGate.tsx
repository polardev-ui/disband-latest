"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isPasswordResetLink } from "@/lib/recover-session-from-url";
import { MarketingHomeRedesign as MarketingHomePage } from "@/components/marketing/MarketingHomeRedesign";

/*
 The homepage renders straight away, on the server, for everyone. It used to
 render nothing but "Loading…" until the browser had asked Supabase for a
 session, so every visitor (and every search engine) waited on a blank page.

 Signed-in people still go to /app. An inline script in app/home/page.tsx
 marks the page hidden (html[data-signed-in]) when a saved session exists, so
 they don't see it flash first; this clears the mark if the session turns
 out to be gone, or after a few seconds whatever happens.
*/

const REVEAL_AFTER_MS = 3000;

export function MarketingHomeGate() {
  const router = useRouter();

  useEffect(() => {
    if (isPasswordResetLink()) {
      window.location.assign(`/reset-password${window.location.search}${window.location.hash}`);
      return;
    }
    const root = document.documentElement;
    const reveal = () => {
      delete root.dataset.signedIn;
    };
    if (!isSupabaseConfigured()) {
      reveal();
      return;
    }
    // Arriving by a client-side link skips the inline script, so check the
    // session either way; only a hidden page needs the fallback.
    const fallback = root.dataset.signedIn === "1" ? window.setTimeout(reveal, REVEAL_AFTER_MS) : undefined;
    void getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/app");
        else reveal();
      })
      .catch(reveal);
    return () => window.clearTimeout(fallback);
  }, [router]);

  return <MarketingHomePage />;
}
