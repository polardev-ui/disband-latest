import { NextResponse, type NextRequest } from "next/server";
import { authorizeStatusAdmin, adminError, monitorPatch } from "@/lib/status-admin.server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return adminError("Monitor not found.", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { patch, error } = monitorPatch(body);
  if (error) return adminError(error, 400);

  const { data, error: updateError } = await auth.service
    .from("status_monitors")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !data) return adminError("Could not save the monitor.", 500);
  return NextResponse.json({ monitor: data });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return adminError("Monitor not found.", 404);

  const { error } = await auth.service.from("status_monitors").delete().eq("id", id);
  if (error) return adminError("Could not delete the monitor.", 500);
  return new NextResponse(null, { status: 204 });
}
