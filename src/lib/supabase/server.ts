import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!serviceClient) {
    serviceClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/**
 * A client that acts as the *caller* rather than as the service role.
 *
 * Several staff-gated RPCs (apply_restriction, remove_restriction,
 * list_all_restrictions) decide who is allowed by reading auth.uid(). Under the
 * service role key auth.uid() is always NULL, so calling them through
 * getServiceSupabase() makes auth.uid() NULL and those functions reject every
 * caller — including the owner. Use this when a route has already established
 * *which user* is calling and the database needs to see that same identity, so
 * the database keeps being the authority on "is this person staff".
 *
 * Returns null when there is no bearer token to scope the client to.
 */
export function getUserScopedSupabase(req: Request): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const auth = req.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 16384) return null;

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function getRouteUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return null;

  const auth = req.headers.get("authorization");
  if (auth) {
    const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token || token.length > 16384) return null;
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    return error || !user ? null : { id: user.id, email: user.email ?? undefined };
  }

  if (req.headers.get("sec-fetch-site") === "cross-site") return null;
  const { cookies } = await import("next/headers");
  const { createServerClient } = await import("@supabase/ssr");

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {

          }
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { id: user.id, email: user.email ?? undefined };
  } catch {

  }

  return null;
}
