import { NextResponse, type NextRequest } from "next/server";
import { authorizeStatusAdmin, adminError, incidentPatch } from "@/lib/status-admin.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.service
    .from("status_incidents")
    .select("*, updates:status_incident_updates(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return adminError("Could not load incidents.", 500);

  const incidents = (data ?? []).map((row) => {
    const incident = row as Record<string, unknown> & { updates?: { created_at?: string }[] };
    return {
      ...incident,
      updates: [...(incident.updates ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    };
  });
  return NextResponse.json({ incidents });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { patch, error } = incidentPatch(body, true);
  if (error) return adminError(error, 400);

  const kind = typeof patch.kind === "string" ? patch.kind : "incident";
  const defaultStatus = kind === "announcement" ? "published" : kind === "maintenance" ? "scheduled" : "investigating";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";

  const { data: created, error: insertError } = await auth.service
    .from("status_incidents")
    .insert({
      kind,
      impact: kind === "incident" ? "minor" : "none",
      status: defaultStatus,
      ...patch,
      created_by: auth.userId,
    })
    .select("*")
    .single();

  if (insertError || !created) {
    console.error("[status-admin] incident insert", insertError?.message);
    return adminError("Could not post the incident.", 500);
  }

  if (text) {
    await auth.service.from("status_incident_updates").insert({
      incident_id: created.id,
      status: created.status,
      body: text,
      created_by: auth.userId,
    });
  }

  return NextResponse.json({ incident: created }, { status: 201 });
}
