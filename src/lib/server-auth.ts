import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

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

export function verifyOwnerPassword(input: string | undefined | null): boolean {
  const expected = process.env.OWNER_PASSWORD;
  if (!expected || !input) return false;
  if (input.length !== expected.length) return false;
  let match = 0;
  for (let i = 0; i < expected.length; i++) {
    match |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return match === 0;
}
