import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

/**
 * How many ids to put in one `in.(...)` filter.
 *
 * PostgREST takes these as a query string, and a UUID costs ~39 characters
 * once quoted and comma-separated. A server with a few hundred members
 * therefore built a URL past the ~8 KB that proxies in front of the API
 * accept, and the request came back 400 — which emptied the member list
 * entirely on exactly the servers big enough to need it. 100 keeps the worst
 * case near 4 KB with plenty of room under even aggressive proxy limits.
 */
const CHUNK = 100;

/**
 * Loads profiles by id, in batches small enough to survive the URL limit.
 *
 * Chunks are fetched in parallel and merged. A chunk that fails is skipped
 * rather than failing the whole set: a partial member list is far better than
 * none, which is what the single oversized request produced.
 */
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
