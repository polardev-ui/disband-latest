import {
  type Command, type Ctx, o, ok, fail, embed, botCall, parseDuration, humanMinutes,
  nameOf, mention, str, dateLong, COLOR, clip, findRoleRef,
} from "../kit";

/** Post to the space's mod log, when one is set. */
async function modlog(ctx: Ctx, action: string, target: string, reason?: string) {
  if (!ctx.guild.mod_log_channel_id) return;
  await ctx.send(ctx.guild.mod_log_channel_id, embed({
    title: action,
    color: COLOR.warn,
    fields: [
      { name: "Member", value: target, inline: true },
      { name: "By", value: mention(ctx.user), inline: true },
      ...(reason ? [{ name: "Reason", value: clip(reason, 500), inline: false }] : []),
    ],
  })).catch(() => undefined);
}

async function everyoneRole(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.service.from("server_roles").select("id").eq("server_id", ctx.serverId).eq("is_default", true).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function findRole(ctx: Ctx, ref: string) {
  return findRoleRef(ctx, ref);
}

function target(ctx: Ctx) {
  return ctx.member(ctx.opt.user);
}

export const moderationCommands: Command[] = [
  {
    name: "kick",
    category: "Moderation",
    slash: true,
    perm: "kick",
    description: "Remove a member (they can rejoin with an invite)",
    options: [o.user("user", "Who"), o.str("reason", "Why", false)],
    run: async (ctx) => {
      const p = await target(ctx);
      if (!p) return fail("I can't find that member here.");
      if (p.id === ctx.user.id) return fail("You can't kick yourself.");
      const err = await botCall(ctx, "bot_kick_member", { p_server_id: ctx.serverId, p_user_id: p.id });
      if (err) return fail(err);
      await modlog(ctx, "👢 Kicked", mention(p), str(ctx.opt.reason));
      return ok(`Kicked **${nameOf(p)}**.${ctx.opt.reason ? ` Reason: ${str(ctx.opt.reason)}` : ""}`);
    },
  },
  {
    name: "ban",
    category: "Moderation",
    slash: true,
    perm: "ban",
    description: "Ban a member so they can't rejoin",
    options: [o.user("user", "Who"), o.str("reason", "Why", false)],
    run: async (ctx) => {
      const p = await target(ctx);
      if (!p) return fail("I can't find that member here.");
      if (p.id === ctx.user.id) return fail("You can't ban yourself.");
      const err = await botCall(ctx, "bot_ban_member", { p_server_id: ctx.serverId, p_user_id: p.id, p_reason: str(ctx.opt.reason) || null });
      if (err) return fail(err);
      await modlog(ctx, "🔨 Banned", mention(p), str(ctx.opt.reason));
      return ok(`Banned **${nameOf(p)}**.${ctx.opt.reason ? ` Reason: ${str(ctx.opt.reason)}` : ""}`);
    },
  },
  {
    name: "timeout",
    aliases: ["mute", "to"],
    category: "Moderation",
    slash: true,
    perm: "timeout_members",
    description: "Stop a member chatting for a while (10m, 2h, 1d…)",
    options: [o.user("user", "Who"), o.str("duration", "How long, like 10m or 2h"), o.str("reason", "Why", false)],
    run: async (ctx) => {
      const p = await target(ctx);
      if (!p) return fail("I can't find that member here.");
      const minutes = parseDuration(ctx.opt.duration);
      if (!minutes || minutes > 40320) return fail("Give a time up to 28 days, like `10m`, `2h` or `3d`.");
      const err = await botCall(ctx, "bot_timeout_member", { p_server_id: ctx.serverId, p_user_id: p.id, p_minutes: minutes, p_reason: str(ctx.opt.reason) || null });
      if (err) return fail(err);
      await modlog(ctx, "🔇 Timed out", `${mention(p)} for ${humanMinutes(minutes)}`, str(ctx.opt.reason));
      return ok(`Timed out **${nameOf(p)}** for ${humanMinutes(minutes)}.`);
    },
  },
  {
    name: "warn",
    category: "Moderation",
    slash: true,
    perm: "timeout_members",
    description: "Give a member a warning, kept on record",
    options: [o.user("user", "Who"), o.str("reason", "Why")],
    run: async (ctx) => {
      const p = await target(ctx);
      if (!p) return fail("I can't find that member here.");
      const reason = clip(str(ctx.opt.reason), 500);
      await ctx.service.from("bruce_warnings").insert({ server_id: ctx.serverId, user_id: p.id, moderator_id: ctx.user.id, reason });
      const { count } = await ctx.service.from("bruce_warnings").select("*", { count: "exact", head: true }).eq("server_id", ctx.serverId).eq("user_id", p.id);
      await modlog(ctx, "⚠️ Warned", mention(p), reason);
      return embed({ description: `⚠️ ${mention(p)} has been warned: **${reason}**\nThat's warning **#${count ?? 1}**.`, color: COLOR.warn });
    },
  },
  {
    name: "warnings",
    aliases: ["warns", "infractions"],
    category: "Moderation",
    slash: true,
    description: "A member's warnings",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await target(ctx) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      if (p.id !== ctx.user.id && !(await ctx.can("timeout_members"))) return fail("You can only see your own warnings.");
      const { data } = await ctx.service.from("bruce_warnings").select("id, reason, created_at").eq("server_id", ctx.serverId).eq("user_id", p.id).order("created_at", { ascending: false }).limit(15);
      const list = (data ?? []) as { id: string; reason: string; created_at: string }[];
      if (!list.length) return ok(`${nameOf(p)} has no warnings.`);
      return embed({
        title: `${nameOf(p)}'s warnings (${list.length})`,
        description: list.map((w, i) => `**${i + 1}.** ${clip(w.reason, 120)} · ${dateLong(w.created_at)} · \`${w.id.slice(0, 8)}\``).join("\n"),
        color: COLOR.warn,
      });
    },
  },
  {
    name: "delwarn",
    aliases: ["unwarn", "removewarn"],
    category: "Moderation",
    slash: true,
    perm: "timeout_members",
    description: "Remove one warning by its short ID",
    options: [o.str("id", "The 8-character ID from /warnings")],
    run: async (ctx) => {
      const id = str(ctx.opt.id).trim().toLowerCase();
      const { data } = await ctx.service.from("bruce_warnings").select("id").eq("server_id", ctx.serverId).like("id", `${id}%`).limit(2);
      const rows = (data ?? []) as { id: string }[];
      if (rows.length !== 1) return fail(rows.length ? "That matches more than one warning; use more of the ID." : "No warning with that ID.");
      await ctx.service.from("bruce_warnings").delete().eq("id", rows[0].id);
      return ok("Warning removed.");
    },
  },
  {
    name: "clearwarns",
    category: "Moderation",
    slash: true,
    perm: "manage_server",
    description: "Remove all of a member's warnings",
    options: [o.user("user", "Who")],
    run: async (ctx) => {
      const p = await target(ctx);
      if (!p) return fail("I can't find that member here.");
      await ctx.service.from("bruce_warnings").delete().eq("server_id", ctx.serverId).eq("user_id", p.id);
      return ok(`Cleared ${nameOf(p)}'s warnings.`);
    },
  },
  {
    name: "purge",
    aliases: ["clear", "prune"],
    category: "Moderation",
    slash: true,
    perm: "manage_messages",
    description: "Delete recent messages here (up to 100)",
    options: [o.int("amount", "How many (1–100)"), o.user("user", "Only theirs", false)],
    run: async (ctx) => {
      const amount = Math.min(100, Math.max(1, Number(ctx.opt.amount) || 0));
      if (!amount) return fail("Say how many, 1 to 100.");
      const only = ctx.opt.user ? await target(ctx) : null;
      if (ctx.opt.user && !only) return fail("I can't find that member here.");
      let q = ctx.service.from("messages").select("id").eq("channel_id", ctx.channelId).order("created_at", { ascending: false }).limit(only ? 200 : amount + 1);
      if (only) q = q.eq("author_id", only.id);
      const { data } = await q;
      const ids = ((data ?? []) as { id: string }[]).map((m) => m.id).slice(0, only ? amount : amount + 1);
      let done = 0;
      let lastErr: string | null = null;
      for (const id of ids) {
        const err = await botCall(ctx, "bot_delete_message", { p_channel_id: ctx.channelId, p_message_id: id });
        if (err) lastErr = err;
        else done += 1;
      }
      if (!done && lastErr) return fail(lastErr);
      await modlog(ctx, "🧹 Purged", `${done} messages in <#${ctx.channelId}>`);
      return ok(`Deleted ${done} message${done === 1 ? "" : "s"}.`);
    },
  },
  {
    name: "lock",
    category: "Moderation",
    slash: true,
    perm: "manage_channels",
    description: "Stop everyone posting in this channel",
    run: async (ctx) => {
      const everyone = await everyoneRole(ctx);
      if (!everyone) return fail("I couldn't find the @everyone role.");
      const err = await botCall(ctx, "bot_set_channel_permission", { p_channel_id: ctx.channelId, p_role_id: everyone, p_can_post: false });
      return err ? fail(err) : ok("🔒 Channel locked. Only roles allowed to post can talk here.");
    },
  },
  {
    name: "unlock",
    category: "Moderation",
    slash: true,
    perm: "manage_channels",
    description: "Let everyone post here again",
    run: async (ctx) => {
      const everyone = await everyoneRole(ctx);
      if (!everyone) return fail("I couldn't find the @everyone role.");
      const err = await botCall(ctx, "bot_set_channel_permission", { p_channel_id: ctx.channelId, p_role_id: everyone, p_can_post: true });
      return err ? fail(err) : ok("🔓 Channel unlocked.");
    },
  },
  {
    name: "hide",
    category: "Moderation",
    perm: "manage_channels",
    description: "Hide this channel from @everyone",
    run: async (ctx) => {
      const everyone = await everyoneRole(ctx);
      if (!everyone) return fail("I couldn't find the @everyone role.");
      const err = await botCall(ctx, "bot_set_channel_permission", { p_channel_id: ctx.channelId, p_role_id: everyone, p_can_view: false });
      return err ? fail(err) : ok("🙈 Channel hidden from @everyone.");
    },
  },
  {
    name: "unhide",
    aliases: ["show"],
    category: "Moderation",
    perm: "manage_channels",
    description: "Show this channel to @everyone again",
    run: async (ctx) => {
      const everyone = await everyoneRole(ctx);
      if (!everyone) return fail("I couldn't find the @everyone role.");
      const err = await botCall(ctx, "bot_set_channel_permission", { p_channel_id: ctx.channelId, p_role_id: everyone, p_can_view: true });
      return err ? fail(err) : ok("👀 Channel visible to @everyone again.");
    },
  },
  {
    name: "role",
    aliases: ["giverole", "addrole"],
    category: "Moderation",
    slash: true,
    perm: "manage_roles",
    description: "Give a member a role",
    options: [o.user("user", "Who"), o.role("role", "The role")],
    run: async (ctx) => {
      const p = await target(ctx);
      const r = await findRole(ctx, str(ctx.opt.role));
      if (!p) return fail("I can't find that member here.");
      if (!r) return fail("No role with that name.");
      const err = await botCall(ctx, "bot_add_member_role", { p_server_id: ctx.serverId, p_user_id: p.id, p_role_id: r.id });
      return err ? fail(err) : ok(`Gave **${nameOf(p)}** the **${r.name}** role.`);
    },
  },
  {
    name: "removerole",
    aliases: ["takerole", "unrole"],
    category: "Moderation",
    slash: true,
    perm: "manage_roles",
    description: "Take a role from a member",
    options: [o.user("user", "Who"), o.role("role", "The role")],
    run: async (ctx) => {
      const p = await target(ctx);
      const r = await findRole(ctx, str(ctx.opt.role));
      if (!p) return fail("I can't find that member here.");
      if (!r) return fail("No role with that name.");
      const err = await botCall(ctx, "bot_remove_member_role", { p_server_id: ctx.serverId, p_user_id: p.id, p_role_id: r.id });
      return err ? fail(err) : ok(`Took **${r.name}** from **${nameOf(p)}**.`);
    },
  },
  {
    name: "rename",
    aliases: ["renamechannel"],
    category: "Moderation",
    perm: "manage_channels",
    description: "Rename this channel",
    options: [o.str("name", "The new name")],
    run: async (ctx) => {
      const name = str(ctx.opt.name).toLowerCase().replace(/\s+/g, "-").slice(0, 90);
      const err = await botCall(ctx, "bot_rename_channel", { p_channel_id: ctx.channelId, p_name: name });
      return err ? fail(err) : ok(`Renamed this channel to **#${name}**.`);
    },
  },
  {
    name: "nuke",
    category: "Moderation",
    perm: "manage_messages",
    description: "Delete the last 100 messages here",
    run: async (ctx) => {
      const { data } = await ctx.service.from("messages").select("id").eq("channel_id", ctx.channelId).order("created_at", { ascending: false }).limit(100);
      let done = 0;
      for (const m of (data ?? []) as { id: string }[]) {
        if (!(await botCall(ctx, "bot_delete_message", { p_channel_id: ctx.channelId, p_message_id: m.id }))) done += 1;
      }
      return ok(`💥 Cleared ${done} messages.`);
    },
  },
];
