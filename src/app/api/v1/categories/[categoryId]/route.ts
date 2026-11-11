import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ categoryId: string }> };

function statusFor(error: { message?: string }): number {
  if (/not found/i.test(error.message ?? "")) return 404;
  return botJsonError(error);
}

/** Rename or reorder a category: { name?, position? }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { categoryId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) {
      return NextResponse.json({ error: "A JSON object of category fields is required" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_update_category", {
      p_bot_id: bot.botId,
      p_category_id: categoryId,
      p_patch: body,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ category: data });
  } catch (err) {
    console.error("v1/categories/[categoryId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Delete a category. Its channels become uncategorized. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { categoryId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { error } = await service.rpc("bot_delete_category", {
      p_bot_id: bot.botId,
      p_category_id: categoryId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("v1/categories/[categoryId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
