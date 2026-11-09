/**
 * Bruce: the command list, and turning his queued events into replies.
 *
 *   messageCreate     prefix commands ("!help"), plus XP and AFK notes
 *   interactionCreate slash commands, and his buttons (tickets)
 *
 * Every reply goes through the same bot RPCs third-party bots use.
 */

import type { Command, Ctx, Guild, Person, Reply, Result, Service } from "./kit";
import { embed, fail, missing, optionsFromWords, usage, COLOR } from "./kit";
import { infoCommands } from "./commands/info";
import { moderationCommands } from "./commands/moderation";
import { ticketCommands, openTicket, closeTicket, claimTicket } from "./commands/tickets";
import { communityCommands, onMessage } from "./commands/community";
import { funCommands } from "./commands/fun";

const CATEGORY_ICON: Record<string, string> = {
  Info: "ℹ️", Moderation: "🛡️", Tickets: "🎫", Config: "⚙️", Levels: "📈", Economy: "🪙",
  Fun: "🎉", Social: "🤗", Text: "🔤", Utility: "🧰", Tags: "🏷️",
};

const helpCommands: Command[] = [
  {
    name: "help",
    aliases: ["h", "commands", "cmds"],
    category: "Info",
    slash: true,
    description: "Bruce's commands, or help with one",
    options: [{ name: "command", description: "A command or category", type: "string", required: false }],
    run: (ctx) => {
      const want = String(ctx.opt.command ?? "").toLowerCase().replace(/^[/!]/, "");
      const p = ctx.guild.prefix;
      if (want) {
        const cmd = find(want);
        if (cmd) {
          return embed({
            title: `${p}${cmd.name}`,
            description: cmd.description,
            fields: [
              { name: "Use", value: `\`${usage(cmd, p)}\`${cmd.slash ? ` or \`/${cmd.name}\`` : ""}`, inline: false },
              ...(cmd.aliases?.length ? [{ name: "Also", value: cmd.aliases.map((a) => `\`${a}\``).join(", "), inline: false }] : []),
              ...(cmd.perm ? [{ name: "Needs", value: cmd.perm.replace(/_/g, " "), inline: false }] : []),
            ],
          });
        }
        const cat = Object.keys(CATEGORY_ICON).find((c) => c.toLowerCase() === want);
        if (cat) {
          const list = COMMANDS.filter((c) => c.category === cat);
          return embed({ title: `${CATEGORY_ICON[cat]} ${cat} (${list.length})`, description: list.map((c) => `\`${c.name}\` · ${c.description}`).join("\n").slice(0, 3900) });
        }
        return fail(`No command or category called "${want}".`);
      }
      const groups = Object.keys(CATEGORY_ICON).map((cat) => {
        const list = COMMANDS.filter((c) => c.category === cat);
        return { name: `${CATEGORY_ICON[cat]} ${cat} (${list.length})`, value: list.map((c) => `\`${c.name}\``).join(" ").slice(0, 1000), inline: false };
      });
      return embed({
        title: "🐶 Bruce's commands",
        description: `**${COMMANDS.length}** commands. Prefix here: \`${p}\` (slash commands work too).\n\`${p}help <command>\` for details, \`${p}help <category>\` for a list.`,
        fields: groups,
        thumbnail: { url: "https://www.disband.dev/bruce.webp" },
      });
    },
  },
];

export const COMMANDS: Command[] = [
  ...helpCommands,
  ...infoCommands,
  ...moderationCommands,
  ...ticketCommands,
  ...communityCommands,
  ...funCommands,
];

const BY_NAME = new Map<string, Command>();
for (const c of COMMANDS) {
  BY_NAME.set(c.name, c);
  for (const a of c.aliases ?? []) if (!BY_NAME.has(a)) BY_NAME.set(a, c);
}

export function find(name: string): Command | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/** The slash commands registered for the composer (the API allows 100). */
export function slashCommands() {
  return COMMANDS.filter((c) => c.slash)
    .slice(0, 100)
    .map((c) => ({ name: c.name, description: c.description.slice(0, 100), options: c.options ?? [] }));
}

// --- Running ------------------------------------------------------------------

export interface Identity {
  botId: string;
  userId: string;
}

const DEFAULT_GUILD = (serverId: string): Guild => ({
  server_id: serverId,
  prefix: "!",
  ticket_category_id: null,
  ticket_support_role_id: null,
  ticket_log_channel_id: null,
  mod_log_channel_id: null,
  levels_enabled: true,
  level_up_messages: true,
});

async function guildFor(service: Service, serverId: string): Promise<Guild> {
  const { data } = await service.from("bruce_guilds").select("*").eq("server_id", serverId).maybeSingle();
  return (data as Guild | null) ?? DEFAULT_GUILD(serverId);
}

function toReply(r: Result): Reply | null {
  if (!r) return null;
  return typeof r === "string" ? { content: r } : r;
}

function makeCtx(service: Service, me: Identity, serverId: string, channelId: string, user: Person, guild: Guild): Omit<Ctx, "opt" | "via" | "invoked"> {
  return {
    service,
    botId: me.botId,
    botUserId: me.userId,
    serverId,
    channelId,
    user,
    guild,
    can: async (perm) => {
      const { data } = await service.rpc("user_has_server_permission", { p_server_id: serverId, p_user_id: user.id, p_permission: perm });
      return data === true;
    },
    member: async (ref) => {
      const raw = String(ref ?? "").trim().replace(/^<@!?/, "").replace(/>$/, "").replace(/^@/, "");
      if (!raw) return null;
      const isId = /^[0-9a-f-]{36}$/i.test(raw);
      const { data } = await service
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq(isId ? "id" : "username", isId ? raw : raw.toLowerCase())
        .maybeSingle();
      if (!data) return null;
      const { data: m } = await service.from("server_members").select("user_id").eq("server_id", serverId).eq("user_id", (data as Person).id).maybeSingle();
      return m ? (data as Person) : null;
    },
    send: async (target, reply) => {
      const r = typeof reply === "string" ? { content: reply } : reply;
      await service.rpc("bot_send_message", {
        p_bot_id: me.botId, p_channel_id: target, p_content: r.content ?? "", p_reply_to_id: null,
        p_embeds: r.embeds ?? null, p_components: r.components ?? null,
      });
    },
  };
}

async function runCommand(cmd: Command, ctx: Ctx): Promise<Reply> {
  if (cmd.perm && !(await ctx.can(cmd.perm))) {
    return fail(`You need the **${cmd.perm.replace(/_/g, " ")}** permission for that.`);
  }
  const need = missing(cmd, ctx.opt);
  if (need) {
    return embed({ description: `Missing **${need}**. Use: \`${usage(cmd, ctx.via === "slash" ? "/" : ctx.guild.prefix)}\``, color: COLOR.warn });
  }
  try {
    return toReply(await cmd.run(ctx)) ?? { content: "Done." };
  } catch (e) {
    console.error("[bruce] command failed", cmd.name, e);
    return fail("Something went wrong running that. Try again in a moment.");
  }
}

type MessageEvent = {
  id: string;
  channel_id: string;
  server_id: string | null;
  content: string | null;
  author: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; is_bot: boolean };
  webhook_id: string | null;
};

export async function handleMessage(service: Service, me: Identity, ev: MessageEvent) {
  if (!ev.server_id || ev.author.is_bot || ev.webhook_id || ev.author.id === me.userId) return;
  const content = (ev.content ?? "").trim();
  const guild = await guildFor(service, ev.server_id);
  const base = makeCtx(service, me, ev.server_id, ev.channel_id, ev.author, guild);
  const reply = async (r: Reply) => {
    await service.rpc("bot_send_message", {
      p_bot_id: me.botId, p_channel_id: ev.channel_id, p_content: r.content ?? "", p_reply_to_id: ev.id,
      p_embeds: r.embeds ?? null, p_components: r.components ?? null,
    });
  };

  const mentionsMe = new RegExp(`^@bruce\\b`, "i").test(content);
  const prefixed = content.startsWith(guild.prefix);
  if (prefixed || mentionsMe) {
    const body = mentionsMe ? content.replace(/^@bruce\s*/i, "") : content.slice(guild.prefix.length);
    const [word, ...rest] = body.split(/\s+/);
    const cmd = word ? find(word) : find("help");
    if (cmd) {
      const ctx: Ctx = { ...base, opt: optionsFromWords(cmd.options, rest.join(" ")), via: "prefix", invoked: word ?? "help" };
      await reply(await runCommand(cmd, ctx));
      return;
    }
    if (mentionsMe) {
      await reply(embed({ description: `🐶 Woof! My prefix here is \`${guild.prefix}\`. Try \`${guild.prefix}help\`.` }));
      return;
    }
  }

  // Not a command: XP, level-ups and AFK.
  const ctx: Ctx = { ...base, opt: {}, via: "prefix", invoked: "" };
  const note = await onMessage(ctx, content).catch(() => null);
  if (note) await reply({ content: note });
}

type InteractionEvent = {
  id: string;
  type: "command" | "component";
  server_id: string;
  channel_id: string;
  user: Person;
  command: { name: string; options: Record<string, string | number | boolean> } | null;
  component: { custom_id: string; message_id: string } | null;
};

export async function handleInteraction(service: Service, me: Identity, ev: InteractionEvent) {
  const guild = await guildFor(service, ev.server_id);
  const base = makeCtx(service, me, ev.server_id, ev.channel_id, ev.user, guild);
  const respond = async (r: Reply) => {
    await service.rpc("bot_interaction_respond", {
      p_bot_id: me.botId, p_interaction_id: ev.id, p_content: r.content ?? "",
      p_embeds: r.embeds ?? null, p_components: r.components ?? null, p_update: !!r.update,
    });
  };
  const ctx: Ctx = { ...base, opt: { ...(ev.command?.options ?? {}) }, via: "slash", invoked: ev.command?.name ?? "" };

  if (ev.type === "component" && ev.component) {
    const id = ev.component.custom_id;
    if (id === "bruce:ticket:open") return respond(await openTicket(ctx, null));
    if (id === "bruce:ticket:close") return respond(await closeTicket(ctx));
    if (id === "bruce:ticket:claim") return respond(await claimTicket(ctx));
    return;
  }
  const cmd = ev.command ? find(ev.command.name) : undefined;
  if (!cmd) return respond(fail("I don't know that command any more. Try /help."));
  return respond(await runCommand(cmd, ctx));
}

/** Post reminders that are due. */
export async function deliverReminders(service: Service, me: Identity) {
  const { data } = await service
    .from("bruce_reminders")
    .select("id, channel_id, user_id, content")
    .eq("done", false)
    .lte("due_at", new Date().toISOString())
    .limit(50);
  for (const r of (data ?? []) as { id: string; channel_id: string; user_id: string; content: string }[]) {
    await service.from("bruce_reminders").update({ done: true }).eq("id", r.id);
    const { data: who } = await service.from("profiles").select("username").eq("id", r.user_id).maybeSingle();
    const name = (who as { username?: string } | null)?.username;
    await service.rpc("bot_send_message", {
      p_bot_id: me.botId, p_channel_id: r.channel_id,
      p_content: `⏰ ${name ? `@${name}` : "Reminder"}: ${r.content}`, p_reply_to_id: null, p_embeds: null, p_components: null,
    });
  }
}
