import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ channelId: string; roleId: string }> };
type Override = { can_view: boolean | null; can_post: boolean | null; can_react: boolean | null; can_attach: boolean | null };

const FIELDS = ["can_view", "can_post", "can_react", "can_attach"] as const;

async function set(request: NextRequest, { params }: Params, override: Override) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { channelId, roleId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const { error } = await service.rpc("bot_set_channel_permission", {
    p_bot_id: bot.botId,
    p_channel_id: channelId,
    p_role_id: roleId,
    p_can_view: override.can_view,
    p_can_post: override.can_post,
    p_can_react: override.can_react,
    p_can_attach: override.can_attach,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true });
}

/**
 * Set what a role can do in this channel: { can_view, can_post, can_react, can_attach },
 * each true (allow), false (deny) or null (inherit). Use the @everyone role to hide a
 * channel from everyone else. Needs Manage Channels and channels.manage or roles.manage.
 */
export async function PUT(request: NextRequest, ctx: Params) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
  }
  const override = {} as Override;
  for (const f of FIELDS) {
    const v = raw[f] ?? null;
    if (v !== null && typeof v !== "boolean") {
      return NextResponse.json({ error: `${f} must be true, false or null.` }, { status: 400 });
    }
    override[f] = v;
  }
  return set(request, ctx, override);
}

/** Remove the role's override, so it inherits again. */
export function DELETE(request: NextRequest, ctx: Params) {
  return set(request, ctx, { can_view: null, can_post: null, can_react: null, can_attach: null });
}
