"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Kick off an email change from settings. The server mails a confirmation
 * link to the CURRENT email; once clicked it mails the NEW email; once that
 * is clicked the change is applied.
 */
export async function requestEmailChange(newEmail: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "Not signed in.";
  try {
    const res = await fetch("/api/account/email/change", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ newEmail }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return json.error ?? "Could not start the email change.";
    }
    return null;
  } catch {
    return "Could not reach the server. Try again in a moment.";
  }
}
