import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CREATOR_THRESHOLD } from "@/lib/creator.server";

/**
 * The Content Creator badge follows the biggest connected account: awarded
 * at 2,500+ followers with the counts in its metadata (the badge hover
 * reads them), removed when no connection qualifies.
 */
export async function syncCreatorBadge(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("creator_connections").select("platform, handle, followers").eq("user_id", userId);
  const rows = (data ?? []) as { platform: string; handle: string | null; followers: number }[];
  const qualifying = rows.filter((r) => r.followers >= CREATOR_THRESHOLD).sort((a, b) => b.followers - a.followers);
  if (qualifying.length === 0) {
    await supabase.from("user_badges").delete().eq("user_id", userId).eq("badge_key", "creator");
    return false;
  }
  const top = qualifying[0];
  await supabase.from("user_badges").upsert({
    user_id: userId,
    badge_key: "creator",
    visible: true,
    metadata: { followers: top.followers, platform: top.platform, handle: top.handle, platforms: qualifying },
  }, { onConflict: "user_id,badge_key" });
  return true;
}
