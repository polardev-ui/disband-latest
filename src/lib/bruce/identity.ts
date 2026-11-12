/**
 * Bruce's account: an auth user (bruce@disband.dev), a bot profile, a bots
 * row he owns himself, a public install link for his "Authorize App" button,
 * and his slash commands. Everything is idempotent; the first run creates
 * what's missing and later runs only fix drift.
 */

import { randomBytes } from "node:crypto";
import { hashBotToken, BOT_SCOPES } from "@/lib/bot-auth";
import { issueServerSignupTicket } from "@/lib/server-signup-ticket";
import type { Service } from "./kit";
import { slashCommands, type Identity } from "./index";

export const BRUCE_EMAIL = "bruce@disband.dev";
const AVATAR = `${(process.env.APP_ORIGIN ?? "https://www.disband.dev").replace(/\/+$/, "")}/bruce.webp`;

let cached: Identity | null = null;
let commandsSynced = false;

async function findAuthUser(service: Service): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === BRUCE_EMAIL);
    if (hit) return hit.id;
    if (!data || data.users.length < 1000) return null;
  }
  return null;
}

async function syncProfile(service: Service, id: string) {
  const suffix = id.replace(/-/g, "").slice(0, 6);
  for (const username of ["bruce", "brucebot", `bruce_${suffix}`]) {
    const { error } = await service.from("profiles").upsert(
      { id, username, display_name: "Bruce", is_bot: true, verified_bot: true, avatar_url: AVATAR, status: "online", bio: "Disband's own all-rounder. Moderation, tickets, levels, coins and 150+ commands. Press Authorize App to add me!" },
      { onConflict: "id" },
    );
    if (!error) return true;
  }
  return false;
}

export async function ensureBruce(service: Service): Promise<Identity | null> {
  if (cached) {
    if (!commandsSynced) await syncCommands(service, cached).catch(() => undefined);
    return cached;
  }

  let userId = await findAuthUser(service);
  if (!userId) {
    await issueServerSignupTicket(service, BRUCE_EMAIL).catch(() => undefined);
    const { data, error } = await service.auth.admin.createUser({
      email: BRUCE_EMAIL,
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
      app_metadata: { created_by: "server" },
    });
    userId = error ? await findAuthUser(service) : data.user?.id ?? null;
  }
  if (!userId) return null;
  if (!(await syncProfile(service, userId))) return null;

  let { data: bot } = await service.from("bots").select("id, public_install_code, scopes").eq("user_id", userId).is("revoked_at", null).order("created_at").limit(1).maybeSingle();
  if (!bot) {
    const token = `bruce.${randomBytes(32).toString("base64url")}`;
    const { data: made, error } = await service
      .from("bots")
      .insert({ owner_id: userId, user_id: userId, name: "Bruce", avatar_url: AVATAR, scopes: BOT_SCOPES, token_hash: hashBotToken(token), token_prefix: token.slice(0, 12) })
      .select("id, public_install_code, scopes")
      .single();
    if (error || !made) {
      console.error("[bruce] could not create bot row", error?.message);
      return null;
    }
    bot = made;
  } else if ((bot.scopes as string[] | null)?.length !== BOT_SCOPES.length) {
    await service.from("bots").update({ scopes: BOT_SCOPES, avatar_url: AVATAR }).eq("id", bot.id);
  }

  const me: Identity = { botId: bot.id as string, userId };

  // The link behind "Authorize App" on his profile.
  const { data: code, error: codeErr } = await service.rpc("bot_install_link", { p_bot_id: me.botId, p_actor_id: userId, p_scopes: BOT_SCOPES });
  if (!codeErr && typeof code === "string" && code !== bot.public_install_code) {
    await service.from("bots").update({ public_install_code: code }).eq("id", me.botId);
  }

  await syncCommands(service, me).catch((e) => console.error("[bruce] command sync failed", e));
  await service.rpc("refresh_bruce_status");
  cached = me;
  return me;
}

async function syncCommands(service: Service, me: Identity) {
  const wanted = slashCommands();
  const names = wanted.map((c) => c.name);
  await service.from("bot_commands").delete().eq("bot_id", me.botId).not("name", "in", `(${names.map((n) => `"${n}"`).join(",")})`);
  const { error } = await service.from("bot_commands").upsert(wanted.map((c) => ({ bot_id: me.botId, ...c })), { onConflict: "bot_id,name" });
  if (error) throw new Error(error.message);
  commandsSynced = true;
}
