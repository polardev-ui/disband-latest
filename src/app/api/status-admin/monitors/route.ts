import { NextResponse, type NextRequest } from "next/server";
import { authorizeStatusAdmin, adminError, monitorPatch } from "@/lib/status-admin.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.service
    .from("status_monitors")
    .select("*")
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) return adminError("Could not load monitors.", 500);
  return NextResponse.json({ monitors: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStatusAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { patch, error } = monitorPatch(body, true);
  if (error) return adminError(error, 400);

  const { data, error: insertError } = await auth.service
    .from("status_monitors")
    .insert({
      enabled: true,
      public: true,
      group_name: "Disband",
      position: 100,
      method: "GET",
      expected_status: 200,
      timeout_ms: 10000,
      ...patch,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("[status-admin] monitor insert", insertError.message);
    return adminError("Could not create the monitor.", 500);
  }
  return NextResponse.json({ monitor: data }, { status: 201 });
}
