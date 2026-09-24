import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { ensureTetherUser } from "@/lib/tether-server";

export const dynamic = "force-dynamic";

/**
 * Resolve Tether's identity for the client (mention chips, autocomplete,
 * friend/message/block guards). Provisioning happens lazily on first ask;
 * here we may provision on demand so the chip works before the first ask.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available." }, { status: 500 });

  const tetherUserId = await ensureTetherUser(service);
  if (!tetherUserId) return NextResponse.json({ error: "Tether is not set up yet." }, { status: 500 });

  const { data: profile } = await service
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_bot")
    .eq("id", tetherUserId)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Tether is not set up yet." }, { status: 500 });

  return NextResponse.json({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    is_bot: true,
  });
}