"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
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
