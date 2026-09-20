import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { hashBotToken, isBotScope } from "@/lib/bot-auth";

const MAX_BOTS_PER_OWNER = 5;

const MAX_BOT_NAME = 25;
const ALLOWED_SCOPES = ["messages.read", "messages.write", "members.read", "channels.manage"];

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      scopes?: string[];
    };

    const name = body.name?.trim();
    if (!name || name.length < 1 || name.length > MAX_BOT_NAME) {
      return NextResponse.json(
        { error: `Bot name must be between 1 and ${MAX_BOT_NAME} characters.` },
        { status: 400 },
      );
    }

    const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes)] : [];
    if (scopes.length === 0 || !scopes.every(isBotScope)) {
      return NextResponse.json(
        { error: `At least one scope is required. Valid scopes: ${ALLOWED_SCOPES.join(", ")}.` },
        { status: 400 },
      );
    }

    const { count } = await service
      .from("bots")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_BOTS_PER_OWNER) {
      return NextResponse.json(
        { error: `You can create at most ${MAX_BOTS_PER_OWNER} bots.` },
        { status: 400 },
      );
    }

    const botEmail = `bot-${randomBytes(6).toString("hex")}@bots.disband.dev`;
    const botPassword = randomBytes(24).toString("base64url");
    const { data: botUser, error: createUserError } = await service.auth.admin.createUser({
      email: botEmail,
      password: botPassword,
      email_confirm: true,
    });
    if (createUserError || !botUser?.user) {
      return NextResponse.json({ error: "Could not create the bot account." }, { status: 500 });
    }

    const rollback = async () => {
      await service.auth.admin.deleteUser(botUser.user.id).catch(() => {});
    };

    const username = `db_${randomBytes(5).toString("hex")}`;
    const { data: updatedProfile, error: profileError } = await service
      .from("profiles")
      .update({
        display_name: name,
        username,
        is_bot: true,
      })
      .eq("id", botUser.user.id)
      .select("id")
      .maybeSingle();
    if (profileError || !updatedProfile) {
      await rollback();

      return NextResponse.json(
        { error: profileError?.message ?? "Could not set up the bot profile." },
        { status: 500 },
      );
    }

    const token = `db_bot_${randomBytes(32).toString("hex")}`;
    const { data: bot, error: botError } = await service
      .from("bots")
      .insert({
        owner_id: user.id,
        user_id: botUser.user.id,
        name,
        scopes,
        token_hash: hashBotToken(token),
        token_prefix: token.slice(0, 12),
      })
      .select("id, name, scopes, created_at")
      .single();
    if (botError || !bot) {
      await rollback();
      return NextResponse.json(
        { error: botError?.message ?? "Could not register the bot." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      bot: { id: bot.id, name: bot.name, scopes: bot.scopes, created_at: bot.created_at },
      token,
    });
  } catch (err) {
    console.error("bot/register error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
