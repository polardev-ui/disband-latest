import type { NextRequest } from "next/server";
import { executeGitHubWebhook } from "@/lib/webhook-handlers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ serverKey: string; token: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  return executeGitHubWebhook(request, await params);
}
