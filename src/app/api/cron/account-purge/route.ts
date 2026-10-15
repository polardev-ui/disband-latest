import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const expected = [process.env.ANON_PURGE_CRON_SECRET, process.env.RAFFLE_CRON_SECRET]
    .map((s) => s?.trim()).filter((s): s is string => Boolean(s));
  if (expected.length === 0) return false;
  const h = createHash("sha256").update(provided).digest();
  return expected.some((s) => timingSafeEqual(h, createHash("sha256").update(s).digest()));
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!secretMatches(provided)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const now = new Date().toISOString();
  const { data } = await service
    .from("profiles")
    .select("id")
    .not("deletion_purge_at", "is", null)
    .lte("deletion_purge_at", now);

  const rows = (data as { id: string }[] | null) ?? [];
  let purged = 0;
  for (const r of rows) {
    const { error } = await service.auth.admin.deleteUser(r.id);
    if (!error || /not found/i.test(error.message)) purged += 1;
  }
  return NextResponse.json({ ok: true, scanned: rows.length, purged });
}
