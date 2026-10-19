import { NextResponse, type NextRequest } from "next/server";
import { authorizeStatusAdmin, adminError, STATUSES } from "@/lib/status-admin.server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return adminError("Incident not found.", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
  if (!text) return adminError("Write an update before posting it.", 400);

  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUSES.has(status)) return adminError("Choose a status for this update.", 400);

  const { data: incident } = await auth.service
    .from("status_incidents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!incident) return adminError("Incident not found.", 404);

  const { data: update, error: insertError } = await auth.service
    .from("status_incident_updates")
    .insert({ incident_id: id, status, body: text, created_by: auth.userId })
    .select("*")
    .single();
  if (insertError || !update) return adminError("Could not post the update.", 500);

  const resolved = status === "resolved" || status === "completed";
  await auth.service
    .from("status_incidents")
    .update({ status, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);

  return NextResponse.json({ update }, { status: 201 });
}
