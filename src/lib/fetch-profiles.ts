import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

const CHUNK = 100;

export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, Profile>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, Profile>();
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase.from("profiles").select("*").in("id", chunk);
      if (error) {
        console.error("fetchProfilesByIds: chunk failed", error.message);
        return [] as Profile[];
      }
      return (data ?? []) as Profile[];
    }),
  );

  for (const rows of results) {
    for (const p of rows) map.set(p.id, p);
  }
  return map;
}
