"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isTauri } from "@/lib/platform";
import { isPasswordResetLink } from "@/lib/recover-session-from-url";

export function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (isTauri()) {
      router.replace("/app");
      return;
    }

    if (isPasswordResetLink()) {

      window.location.assign(`/reset-password${window.location.search}${window.location.hash}`);
      return;
    }

    if (!isSupabaseConfigured()) {
      router.replace("/home");
      return;
    }

    void getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        router.replace(data.session ? "/app" : "/home");
      })
      .catch(() => router.replace("/home"));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1e1f22] text-[#949ba4]">
      Loading…
    </div>
  );
}
