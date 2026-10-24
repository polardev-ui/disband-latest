import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * The current user's favorite GIFs.
 *
 * GET — newest first, capped. POST { url, title? } — star one (idempotent:
 * re-starring, or starring another spelling of the same GIF, returns the
 * existing row). DELETE { id } — unstar by stable numeric id (or { url } for
 * older clients). Every query is anchored on the authenticated user id; the
 * RLS policy is the backstop, not the mechanism.
 *
 * gif_id is generated from the canonical URL by the database. Clients use it
 * as the cross-platform identity of a favourite: it is stable across web,
 * desktop and mobile, and survives query strings and `www.` differences.
 */
export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2000;
const MAX_LIST = 200;

interface FavoriteRow {
  gif_id: number;
  url: string;
  title: string | null;
  created_at: string;
}

function toFavorite(row: FavoriteRow) {
  return { id: Number(row.gif_id), url: row.url, title: row.title, created_at: row.created_at };
}

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
    .select("gif_id,url,title,created_at")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) return NextResponse.json({ error: "Could not load favourites." }, { status: 500 });
  return NextResponse.json({ favorites: ((data ?? []) as FavoriteRow[]).map(toFavorite) });
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
    .upsert({ user_id: ctx.user.id, url, title }, { onConflict: "user_id,gif_id", ignoreDuplicates: false })
    .select("gif_id,url,title,created_at")
    .single();
  if (error) return NextResponse.json({ error: "Could not save favourite." }, { status: 500 });
  return NextResponse.json({ favorite: toFavorite(data as FavoriteRow) });
}

export async function DELETE(req: Request) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`gifs:favorites:write:${ctx.user.id}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { url?: unknown; id?: unknown };
  const rawId = body.id;
  const id =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && rawId.trim()
        ? Number(rawId)
        : NaN;
  const hasId = Number.isSafeInteger(id) && id >= 0;
  const url = hasId ? null : cleanUrl(body.url);
  if (!hasId && !url) {
    return NextResponse.json({ error: "A favourite id or valid http(s) URL is required." }, { status: 400 });
  }

  let query = ctx.service
    .from("favorite_gifs")
    .delete()
    .eq("user_id", ctx.user.id);
  query = hasId ? query.eq("gif_id", id) : query.eq("url", url);
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Could not remove favourite." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
