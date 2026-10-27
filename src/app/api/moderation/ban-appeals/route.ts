import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "pending";

    let query = service
      .from("ban_appeals")
      .select("id, user_id, ban_id, reason, status, decision, reviewer_id, created_at, reviewed_at, profile:profiles!ban_appeals_user_id_fkey(username, display_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ appeals: data ?? [] });
  } catch (err) {
    console.error("ban-appeals GET error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    // Only banned users may appeal.
    const { data: ban } = await service
      .from("platform_bans")
      .select("user_id, reason")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ban) {
      return NextResponse.json({ error: "You are not currently banned." }, { status: 400 });
    }

    // One pending appeal per ban (cooldown).
    const { data: existing } = await service
      .from("ban_appeals")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You already have a pending appeal." }, { status: 409 });
    }

    let body: { reason?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const reason = body.reason?.trim() ?? "";
    if (reason.length < 10) {
      return NextResponse.json({ error: "Appeal must be at least 10 characters." }, { status: 400 });
    }

    const { data, error } = await service
      .from("ban_appeals")
      .insert({ user_id: user.id, ban_id: user.id, reason, status: "pending" })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("ban-appeals POST error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}
