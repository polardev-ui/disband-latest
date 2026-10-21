import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, requirePlatformOwner } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Platform-owner control for the two staff-granted space badges.
 *
 * Owners can edit their own servers row, so the database guard in 0143 blocks
 * authenticated callers from changing partner/verified. This route is the one
 * path that writes them, through the service role, and records who did it.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await requirePlatformOwner(user.id))) {
    return NextResponse.json({ error: "Only the platform owner can change space badges." }, { status: 403 });
  }

  const limit = rateLimit(`space-badges:${user.id}:${getClientIp(request)}`, 20, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serverId = typeof body.serverId === "string" ? body.serverId : "";
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) {
    return NextResponse.json({ error: "Choose a space." }, { status: 400 });
  }

  const partner = typeof body.partner === "boolean" ? body.partner : undefined;
  const verified = typeof body.verified === "boolean" ? body.verified : undefined;
  if (partner === undefined && verified === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "The database is unavailable right now." }, { status: 503 });

  const patch: Record<string, boolean> = {};
  if (partner !== undefined) patch.partner = partner;
  if (verified !== undefined) patch.verified = verified;

  const { data, error } = await service
    .from("servers")
    .update(patch)
    .eq("id", serverId)
    .select("id, name, partner, verified")
    .maybeSingle();

  if (error) {
    console.error("[space-badges] update", error.message);
    return NextResponse.json({ error: "Could not update the space badge." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Space not found." }, { status: 404 });

  const audits: Record<string, unknown>[] = [];
  if (partner !== undefined) {
    audits.push({
      server_id: serverId,
      actor_id: user.id,
      action: "space.partner_set",
      target_type: "space",
      target_id: serverId,
      details: { name: data.name, enabled: partner },
    });
  }
  if (verified !== undefined) {
    audits.push({
      server_id: serverId,
      actor_id: user.id,
      action: "space.verified_set",
      target_type: "space",
      target_id: serverId,
      details: { name: data.name, enabled: verified },
    });
  }

  if (audits.length > 0) {
    const { error: auditError } = await service.from("audit_log").insert(audits);
    if (auditError) console.error("[space-badges] audit", auditError.message);
  }

  return NextResponse.json({ server: data });
}
