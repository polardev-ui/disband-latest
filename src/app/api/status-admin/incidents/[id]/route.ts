import { NextResponse, type NextRequest } from "next/server";
import { authorizeStatusAdmin, adminError, incidentPatch } from "@/lib/status-admin.server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return adminError("Incident not found.", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { patch, error } = incidentPatch(body);
  if (error) return adminError(error, 400);

  const { data, error: updateError } = await auth.service
    .from("status_incidents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !data) return adminError("Could not save the incident.", 500);
  return NextResponse.json({ incident: data });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return adminError("Incident not found.", 404);

  const { error } = await auth.service.from("status_incidents").delete().eq("id", id);
  if (error) return adminError("Could not delete the incident.", 500);
  return new NextResponse(null, { status: 204 });
}
