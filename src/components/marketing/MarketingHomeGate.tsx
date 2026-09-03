"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isPasswordResetLink } from "@/lib/recover-session-from-url";
import { MarketingHomePage } from "@/components/marketing/MarketingHomePage";

export function MarketingHomeGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPasswordResetLink()) {
      // A recovery link that Supabase bounced to the site root — forward it to
      // the reset page (which exchanges the tokens) instead of dropping the
      // user on the homepage. The tokens travel in the URL's query/hash, so a
      // full navigation carries them across (Next.js's client-side Router would
      // strip the fragment).
      window.location.assign(`/reset-password${window.location.search}${window.location.hash}`);
      return;
    }
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    void getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/app");
        else setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1e1f22] text-[#949ba4]">
        Loading…
      </div>
    );
  }

  return <MarketingHomePage />;
}
