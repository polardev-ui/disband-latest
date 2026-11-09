import { type Command, o, embed, fail, fmt, nameOf, mention, dateLong, ago, COLOR, str } from "../kit";

const STARTED = Date.now();

async function server(ctx: Parameters<Command["run"]>[0]) {
  const { data } = await ctx.service
    .from("servers")
    .select("id, name, description, owner_id, icon_url, created_at")
    .eq("id", ctx.serverId)
    .maybeSingle();
  return data as { id: string; name: string; description: string | null; owner_id: string; icon_url: string | null; created_at: string } | null;
}

async function count(ctx: Parameters<Command["run"]>[0], table: string, filter: Record<string, string>) {
  let q = ctx.service.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count: n } = await q;
  return n ?? 0;
}

export const infoCommands: Command[] = [
  {
    name: "ping",
    category: "Info",
    slash: true,
    description: "Check that Bruce is awake",
    run: () => embed({ description: `🏓 Pong! I'm awake and protecting this space.`, color: COLOR.ok }),
  },
  {
    name: "uptime",
    category: "Info",
    description: "How long this Bruce worker has been running",
    run: () => {
      const s = Math.floor((Date.now() - STARTED) / 1000);
      return embed({ description: `⏱️ Up for ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s.` });
    },
  },
  {
    name: "botinfo",
    aliases: ["about", "bruce"],
    category: "Info",
    slash: true,
    description: "About Bruce",
    run: async (ctx) => {
      const servers = await count(ctx, "bot_grants", { bot_id: ctx.botId });
      return embed({
        title: "🐶 Bruce",
        description: "Disband's own all-rounder: moderation, tickets, levels, coins, tags, reminders and a lot of fun. Free for every space.",
        thumbnail: { url: "https://www.disband.dev/bruce.webp" },
        fields: [
          { name: "Protecting", value: `${fmt(servers)} servers`, inline: true },
          { name: "Prefix here", value: `\`${ctx.guild.prefix}\``, inline: true },
          { name: "Help", value: `\`${ctx.guild.prefix}help\` or \`/help\``, inline: true },
        ],
      });
    },
  },
  {
    name: "invite",
    category: "Info",
    slash: true,
    description: "Add Bruce to another space",
    run: async (ctx) => {
      const { data } = await ctx.service.from("bots").select("public_install_code").eq("id", ctx.botId).maybeSingle();
      const code = (data as { public_install_code?: string } | null)?.public_install_code;
      if (!code) return fail("My install link isn't ready yet. Try again in a minute.");
      const url = `${process.env.APP_ORIGIN ?? "https://www.disband.dev"}/bot-invite/${code}`;
      return {
        ...embed({ title: "Add Bruce to your space", description: "Open my profile and press **Authorize App**, or use the button below." }),
        components: [{ type: "action_row", components: [{ type: "button", style: "link", label: "Authorize App", url }] }],
      };
    },
  },
  {
    name: "serverinfo",
    aliases: ["si", "spaceinfo", "guildinfo"],
    category: "Info",
    slash: true,
    description: "About this space",
    run: async (ctx) => {
      const s = await server(ctx);
      if (!s) return fail("I couldn't read this space.");
      const [members, channels, roles] = await Promise.all([
        count(ctx, "server_members", { server_id: ctx.serverId }),
        count(ctx, "channels", { server_id: ctx.serverId }),
        count(ctx, "server_roles", { server_id: ctx.serverId }),
      ]);
      const owner = await ctx.member(s.owner_id);
      return embed({
        title: s.name,
        description: s.description ?? undefined,
        thumbnail: s.icon_url ? { url: s.icon_url } : undefined,
        fields: [
          { name: "Owner", value: mention(owner), inline: true },
          { name: "Members", value: fmt(members), inline: true },
          { name: "Channels", value: fmt(channels), inline: true },
          { name: "Roles", value: fmt(roles), inline: true },
          { name: "Created", value: dateLong(s.created_at), inline: true },
          { name: "Space ID", value: `\`${s.id}\``, inline: false },
        ],
      });
    },
  },
  {
    name: "membercount",
    aliases: ["members", "mc"],
    category: "Info",
    slash: true,
    description: "How many members this space has",
    run: async (ctx) => embed({ description: `👥 **${fmt(await count(ctx, "server_members", { server_id: ctx.serverId }))}** members` }),
  },
  {
    name: "userinfo",
    aliases: ["ui", "whois"],
    category: "Info",
    slash: true,
    description: "About a member",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      const [{ data: prof }, { data: mem }] = await Promise.all([
        ctx.service.from("profiles").select("created_at, is_bot, pronouns, status_note").eq("id", p.id).maybeSingle(),
        ctx.service.from("server_members").select("joined_at").eq("server_id", ctx.serverId).eq("user_id", p.id).maybeSingle(),
      ]);
      const pr = prof as { created_at?: string; is_bot?: boolean; pronouns?: string | null; status_note?: string | null } | null;
      return embed({
        title: nameOf(p) + (pr?.is_bot ? " 🤖" : ""),
        description: p.username ? `@${p.username}${pr?.pronouns ? ` · ${pr.pronouns}` : ""}` : undefined,
        thumbnail: p.avatar_url ? { url: p.avatar_url } : undefined,
        fields: [
          { name: "Joined Disband", value: `${dateLong(pr?.created_at)} (${ago(pr?.created_at)})`, inline: false },
          { name: "Joined this space", value: `${dateLong((mem as { joined_at?: string } | null)?.joined_at)}`, inline: false },
          ...(pr?.status_note ? [{ name: "Status", value: pr.status_note, inline: false }] : []),
          { name: "User ID", value: `\`${p.id}\``, inline: false },
        ],
      });
    },
  },
  {
    name: "avatar",
    aliases: ["av", "pfp"],
    category: "Info",
    slash: true,
    description: "Someone's profile picture, full size",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      if (!p.avatar_url) return fail(`${nameOf(p)} hasn't set a profile picture.`);
      return embed({ title: `${nameOf(p)}'s profile picture`, description: p.avatar_url, thumbnail: { url: p.avatar_url } });
    },
  },
  {
    name: "roles",
    category: "Info",
    slash: true,
    description: "Every role in this space",
    run: async (ctx) => {
      const { data } = await ctx.service.from("server_roles").select("name, position, is_default").eq("server_id", ctx.serverId).order("position", { ascending: false });
      const list = ((data ?? []) as { name: string; is_default: boolean }[]).filter((r) => !r.is_default).map((r) => r.name);
      return embed({ title: `Roles (${list.length})`, description: list.length ? list.join(", ").slice(0, 3900) : "No roles yet." });
    },
  },
  {
    name: "roleinfo",
    category: "Info",
    slash: true,
    description: "About a role",
    options: [o.str("role", "The role's name")],
    run: async (ctx) => {
      const { data } = await ctx.service.from("server_roles").select("id, name, color, position, display_id, permissions").eq("server_id", ctx.serverId).ilike("name", str(ctx.opt.role)).maybeSingle();
      const r = data as { id: string; name: string; color: string; position: number; display_id: number; permissions: Record<string, boolean> } | null;
      if (!r) return fail("No role with that name.");
      const holders = await count(ctx, "member_roles", { role_id: r.id });
      const perms = Object.entries(r.permissions ?? {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, " "));
      return embed({
        title: r.name,
        color: parseInt(r.color.replace("#", ""), 16) || COLOR.brand,
        fields: [
          { name: "Members", value: fmt(holders), inline: true },
          { name: "Position", value: String(r.position), inline: true },
          { name: "Colour", value: r.color, inline: true },
          { name: "Permissions", value: perms.length ? perms.join(", ") : "None", inline: false },
          { name: "Role ID", value: `\`${r.display_id}\``, inline: false },
        ],
      });
    },
  },
  {
    name: "channelinfo",
    aliases: ["ci"],
    category: "Info",
    description: "About this channel",
    run: async (ctx) => {
      const { data } = await ctx.service.from("channels").select("id, name, type, topic, created_at, slow_mode_seconds").eq("id", ctx.channelId).maybeSingle();
      const c = data as { id: string; name: string; type: string; topic: string | null; created_at: string; slow_mode_seconds: number | null } | null;
      if (!c) return fail("I couldn't read this channel.");
      const msgs = await count(ctx, "messages", { channel_id: c.id });
      return embed({
        title: `#${c.name}`,
        description: c.topic ?? undefined,
        fields: [
          { name: "Type", value: c.type, inline: true },
          { name: "Messages", value: fmt(msgs), inline: true },
          { name: "Slow mode", value: c.slow_mode_seconds ? `${c.slow_mode_seconds}s` : "Off", inline: true },
          { name: "Created", value: dateLong(c.created_at), inline: true },
          { name: "Channel ID", value: `\`${c.id}\``, inline: false },
        ],
      });
    },
  },
  {
    name: "owner",
    category: "Info",
    description: "Who owns this space",
    run: async (ctx) => {
      const s = await server(ctx);
      const owner = s ? await ctx.member(s.owner_id) : null;
      return embed({ description: `👑 This space belongs to **${nameOf(owner)}**.` });
    },
  },
  {
    name: "joined",
    aliases: ["joinposition"],
    category: "Info",
    description: "When you (or someone) joined, and in what place",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      const { data } = await ctx.service.from("server_members").select("joined_at").eq("server_id", ctx.serverId).eq("user_id", p.id).maybeSingle();
      const at = (data as { joined_at?: string } | null)?.joined_at;
      if (!at) return fail("They're not in this space.");
      const { count: before } = await ctx.service.from("server_members").select("*", { count: "exact", head: true }).eq("server_id", ctx.serverId).lt("joined_at", at);
      return embed({ description: `📅 **${nameOf(p)}** joined on ${dateLong(at)}, member **#${fmt((before ?? 0) + 1)}**.` });
    },
  },
  {
    name: "firstmessage",
    category: "Info",
    description: "The first message in this channel",
    run: async (ctx) => {
      const { data } = await ctx.service.from("messages").select("content, author_id, created_at").eq("channel_id", ctx.channelId).order("created_at").limit(1).maybeSingle();
      const m = data as { content: string | null; author_id: string; created_at: string } | null;
      if (!m) return fail("This channel has no messages yet.");
      const who = await ctx.member(m.author_id);
      return embed({ title: "First message", description: (m.content ?? "*(attachment)*").slice(0, 1500), footer: { text: `${nameOf(who)} · ${dateLong(m.created_at)}` } });
    },
  },
  {
    name: "stats",
    category: "Info",
    description: "Message counts for this channel and this space today",
    run: async (ctx) => {
      const since = new Date(Date.now() - 86400_000).toISOString();
      const { count: here } = await ctx.service.from("messages").select("*", { count: "exact", head: true }).eq("channel_id", ctx.channelId).gte("created_at", since);
      return embed({ title: "Last 24 hours", description: `💬 **${fmt(here ?? 0)}** messages in this channel.` });
    },
  },
];
