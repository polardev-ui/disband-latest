import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * The current user's favorite GIFs.
 *
 * GET — newest first, capped. POST { url, title? } — star one (idempotent:
 * re-starring returns the existing row). DELETE { url } — unstar. Every
 * query is anchored on the authenticated user id; the RLS policy is the
 * backstop, not the mechanism.
 */
export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2000;
const MAX_LIST = 200;

async function requireUser(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return null;
  const service = getServiceSupabase();
  if (!service) return null;
  return { user, service };
}

export async function GET(req: Request) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`gifs:favorites:read:${ctx.user.id}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { data, error } = await ctx.service
    .from("favorite_gifs")
    .select("url,title,created_at")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) return NextResponse.json({ error: "Could not load favorites." }, { status: 500 });
  return NextResponse.json({ favorites: data ?? [] });
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim().slice(0, MAX_URL_LENGTH + 1);
  if (!url || url.length > MAX_URL_LENGTH) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export async function POST(req: Request) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`gifs:favorites:write:${ctx.user.id}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { url?: unknown; title?: unknown };
  const url = cleanUrl(body.url);
  if (!url) return NextResponse.json({ error: "A valid http(s) URL is required." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : null;

  const { data, error } = await ctx.service
    .from("favorite_gifs")
    .upsert({ user_id: ctx.user.id, url, title }, { onConflict: "user_id,url", ignoreDuplicates: false })
    .select("url,title,created_at")
    .single();
  if (error) return NextResponse.json({ error: "Could not save favorite." }, { status: 500 });
  return NextResponse.json({ favorite: data });
}

export async function DELETE(req: Request) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`gifs:favorites:write:${ctx.user.id}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = cleanUrl(body.url);
  if (!url) return NextResponse.json({ error: "A valid http(s) URL is required." }, { status: 400 });

  const { error } = await ctx.service
    .from("favorite_gifs")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("url", url);
  if (error) return NextResponse.json({ error: "Could not remove favorite." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
