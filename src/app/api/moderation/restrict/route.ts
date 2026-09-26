import { NextRequest, NextResponse } from "next/server";
import { getUserScopedSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

/**
 * Duration presets, in days. "forever" is a permanent restriction.
 *
 * The choice is stored by the database as an absolute expires_at rather than as
 * a day count, so a restriction does not silently slide forward if nobody looks
 * at the panel for a week.
 */
const DURATIONS: Record<string, number | null> = {
  "1": 1,
  "7": 7,
  "30": 30,
  forever: null,
};

const VALID_RESTRICTIONS = [
  "join_servers",
  "send_messages",
  "send_reactions",
  "send_friend_requests",
  "create_groups",
] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Scoped to the caller rather than the service role: list_all_restrictions
    // authorises on auth.uid(), which is NULL under the service role key.
    const scoped = getUserScopedSupabase(request);
    if (!scoped) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: restrictions, error } = await scoped.rpc("list_all_restrictions");
    if (error) {
      if (error.message.includes("Only staff members")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ restrictions: restrictions ?? [] });
  } catch (err) {
    console.error("moderation/restrict GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await request.json()) as {
      action: "apply" | "remove";
      userId: string;
      restriction: string;
      reason?: string;
      /** "1" | "7" | "30" | "forever" */
      duration?: string;
    };

    if (!body.userId || !body.restriction) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!VALID_RESTRICTIONS.includes(body.restriction as (typeof VALID_RESTRICTIONS)[number])) {
      return NextResponse.json({ error: "Invalid restriction type" }, { status: 400 });
    }

    // The staff check lives in the database. This client carries the caller's own
    // token so auth.uid() inside the RPC resolves to them — with the service
    // role key it is always NULL and the RPC would reject the owner too.
    const scoped = getUserScopedSupabase(request);
    if (!scoped) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    if (body.action === "remove") {
      const { error } = await scoped.rpc("remove_restriction", {
        p_user_id: body.userId,
        p_restriction: body.restriction,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const durationKey = body.duration ?? "forever";
    if (!(durationKey in DURATIONS)) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }
    const days = DURATIONS[durationKey];
    const expiresAt =
      days === null
        ? null
        : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // apply_restriction_temporary rather than apply_restriction: it upserts, so
    // a duration can be set on a restriction that already exists, and it is
    // refused outright if the expiry is somehow in the past.
    const { error } = await scoped.rpc("apply_restriction_temporary", {
      p_user_id: body.userId,
      p_restriction: body.restriction,
      p_reason: body.reason?.trim() || null,
      p_expires_at: expiresAt,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, expiresAt });
  } catch (err) {
    console.error("moderation/restrict POST error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
