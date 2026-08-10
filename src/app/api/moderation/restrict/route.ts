import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

// GET: list all restrictions (staff/owner only)
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: restrictions, error } = await service.rpc("list_all_restrictions");
    if (error) {
      if (error.message.includes("Only staff members")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ restrictions: restrictions ?? [] });
  } catch (err) {
    console.error("moderation/restrict GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: apply or remove a restriction
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await request.json()) as {
      action: "apply" | "remove";
      userId: string;
      restriction: string;
      reason?: string;
    };

    if (!body.userId || !body.restriction) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validRestrictions = ["join_servers", "send_messages", "send_friend_requests", "create_groups"];
    if (!validRestrictions.includes(body.restriction)) {
      return NextResponse.json({ error: "Invalid restriction type" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    if (body.action === "remove") {
      const { error } = await service.rpc("remove_restriction", {
        p_user_id: body.userId,
        p_restriction: body.restriction,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // apply
    const { error } = await service.rpc("apply_restriction", {
      p_user_id: body.userId,
      p_restriction: body.restriction,
      p_reason: body.reason?.trim() || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("moderation/restrict POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
