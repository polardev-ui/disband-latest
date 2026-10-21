import type { NextRequest } from "next/server";
import { deleteWebhookMessage, editWebhookMessage, getWebhookMessage } from "@/lib/webhook-handlers";

// A message the webhook posted, by its numeric id (Discord's /messages/{id}).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ serverKey: string; token: string; messageId: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return getWebhookMessage(request, await params);
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return editWebhookMessage(request, await params);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return deleteWebhookMessage(request, await params);
}
