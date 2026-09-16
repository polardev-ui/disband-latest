import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

/** Server-only Supabase client with service role (API routes, scripts). */
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
 * Resolve the calling user for an API route.
 *
 * Browsers on the same origin send Supabase's auth cookies, which is what these
 * routes were written against. The Tauri desktop app calls the hosted origin
 * cross-origin, where those cookies are not sent, so it authenticates with an
 * `Authorization: Bearer <access_token>` header instead (see `apiFetch`).
 * Explicit bearer credentials take precedence; cookies remain a same-origin fallback.
 */
export async function getRouteUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return null;
  // Explicit bearer identity wins over potentially stale cookies. It also
  // avoids a redundant auth round trip for every desktop and web API call.
  const auth = req.headers.get("authorization");
  if (auth) {
    const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token || token.length > 16384) return null;
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    return error || !user ? null : { id: user.id, email: user.email ?? undefined };
  }
  // Cross-site requests must never gain ambient cookie authority.
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
            // Read-only cookie store (route handlers): ignore.
          }
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { id: user.id, email: user.email ?? undefined };
  } catch {
    // Invalid cookie sessions remain unauthenticated.
  }

  return null;
}
