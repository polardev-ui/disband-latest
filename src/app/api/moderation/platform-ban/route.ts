import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  getUserFromRequest,
  requirePlatformOwner,
  verifyOwnerPassword,
} from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Throttle owner-password attempts to prevent brute force (per user + per IP).
    const ip = getClientIp(request) || "unknown";
    const ipLimit = rateLimit(`platform-ban:ip:${ip}`, 10, 60_000);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const userLimit = rateLimit(`platform-ban:user:${user.id}`, 10, 60_000);
    if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSeconds);

    const isOwner = await requirePlatformOwner(user.id);
    if (!isOwner) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    let body: { action?: string; userId?: string; username?: string; password?: string; reason?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (!verifyOwnerPassword(body.password)) {
      return NextResponse.json({ error: "Invalid owner password." }, { status: 403 });
    }

    const service = getServiceSupabase();
    if (!service) {
      return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });
    }

    let targetUserId = body.userId?.trim() ?? "";
    if (!targetUserId && body.username?.trim()) {
      const { data: profile } = await service
        .from("profiles")
        .select("id")
        .eq("username", body.username.trim().toLowerCase())
        .maybeSingle();
      if (!profile) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      targetUserId = profile.id;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "Provide a user ID or username." }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You cannot ban yourself." }, { status: 400 });
    }

    if (body.action === "unban") {
      const { error } = await service.from("platform_bans").delete().eq("user_id", targetUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: "unban" });
    }

    // Best-effort email lookup for record-keeping; never block the ban on it.
    let targetEmail: string | null = null;
    try {
      const { data: authUser } = await service.auth.admin.getUserById(targetUserId);
      targetEmail = authUser?.user?.email?.toLowerCase() ?? null;
    } catch {
      targetEmail = null;
    }

    const { error } = await service.from("platform_bans").upsert({
      user_id: targetUserId,
      banned_by: user.id,
      reason: body.reason?.trim() || "Banned by platform owner",
      email: targetEmail,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "ban", userId: targetUserId });
  } catch (err) {
    console.error("platform-ban POST error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const isOwner = await requirePlatformOwner(user.id);
    if (!isOwner) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    const service = getServiceSupabase();
    if (!service) {
      return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });
    }

    const { data, error } = await service
      .from("platform_bans")
      .select("user_id, reason, email, created_at, banned_by, profile:profiles!platform_bans_user_id_fkey(username, display_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bans: data ?? [] });
  } catch (err) {
    console.error("platform-ban GET error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}
