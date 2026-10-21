import type { NextRequest } from "next/server";
import { deleteWebhook, executeWebhook, getWebhook, modifyWebhook } from "@/lib/webhook-handlers";

// Discord-compatible webhook: POST executes, GET/PATCH/DELETE manage it.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ serverKey: string; token: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  return executeWebhook(request, await params);
}
export async function GET(request: NextRequest, { params }: Ctx) {
  return getWebhook(request, await params);
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return modifyWebhook(request, await params);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return deleteWebhook(request, await params);
}
