import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  getUserFromRequest,
  requirePlatformManager,
  requirePlatformOwner,
  requireSupportStaff,
} from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const ip = getClientIp(request) || "unknown";
    const ipLimit = rateLimit(`platform-ban:ip:${ip}`, 10, 60_000);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const userLimit = rateLimit(`platform-ban:user:${user.id}`, 10, 60_000);
    if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSeconds);

    // Banning or unbanning anyone from the whole platform is a manager power.
    // Staff and moderators can see the list (GET) but not change it: on
    // 2026-11-04 a staff-level account was used to platform-ban users.
    const isManager = await requirePlatformManager(user.id);
    if (!isManager) {
      return NextResponse.json({ error: "Only Disband managers can change platform bans." }, { status: 403 });
    }
    let body: { action?: string; userId?: string; username?: string; password?: string; reason?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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

    // Nobody can platform-ban the owner, and only the owner can ban a manager.
    if (await requirePlatformOwner(targetUserId)) {
      return NextResponse.json({ error: "The platform owner cannot be banned." }, { status: 403 });
    }
    if ((await requirePlatformManager(targetUserId)) && !(await requirePlatformOwner(user.id))) {
      return NextResponse.json({ error: "Only the owner can ban a manager." }, { status: 403 });
    }

    if (body.action === "unban") {
      const { error } = await service.from("platform_bans").delete().eq("user_id", targetUserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, action: "unban" });
    }

    const { error } = await service.from("platform_bans").upsert({
      user_id: targetUserId,
      banned_by: user.id,
      reason: body.reason?.trim() || "Banned by platform owner",
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

    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    const service = getServiceSupabase();
    if (!service) {
      return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });
    }

    const { data, error } = await service
      .from("platform_bans")
      .select("user_id, reason, created_at, banned_by, profile:profiles!platform_bans_user_id_fkey(username, display_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bans = (data ?? []);

    return NextResponse.json({ bans });
  } catch (err) {
    console.error("platform-ban GET error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}
