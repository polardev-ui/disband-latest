import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff user lookup: a user ID, or part of a username or display name. */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!(await requireSupportStaff(user.id))) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/^@/, "");
    if (!q) return NextResponse.json({ users: [] });

    let query = service
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at")
      .limit(25);
    if (UUID.test(q)) {
      query = query.eq("id", q);
    } else {
      // Strip PostgREST filter syntax so the term can't add conditions.
      const term = q.replace(/[%_,()*\\]/g, "").slice(0, 64);
      if (!term) return NextResponse.json({ users: [] });
      query = query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`).order("username");
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    console.error("users search error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}
