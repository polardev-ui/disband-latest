import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function getUserFromToken(token: string) {
  if (!token || token.length > 16384) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  return getUserFromToken(token);
}

export async function requirePlatformOwner(userId: string): Promise<boolean> {
  const service = getServiceSupabase();
  if (!service) return false;
  const { data } = await service
    .from("profiles")
    .select("show_owner_badge")
    .eq("id", userId)
    .maybeSingle();
  return data?.show_owner_badge === true;
}

export async function requireSupportStaff(userId: string): Promise<boolean> {
  const service = getServiceSupabase();
  if (!service) return false;
  // The old per-account flag still works, but a staff, moderator or manager
  // badge is enough on its own, so managers can add staff from Management.
  const [{ data }, { data: badged }] = await Promise.all([
    service.from("profiles").select("is_support_staff").eq("id", userId).maybeSingle(),
    service.rpc("is_platform_staff", { p_user: userId }),
  ]);
  return data?.is_support_staff === true || badged === true;
}

export function verifyOwnerPassword(input: string | undefined | null): boolean {
  const expected = process.env.OWNER_PASSWORD;
  if (!expected || !input) return false;

  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
