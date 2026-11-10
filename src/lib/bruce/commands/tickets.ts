/**
 * Tickets. /ticket-setup picks the staff role (required) and, optionally,
 * the category new tickets go in and a log channel. /ticket-panel posts a
 * message with an "Open a ticket" button. Each ticket is private: the
 * opener, the staff role, Administrators and the owner can see it.
 *
 * Bot channel permissions are set per role, so each ticket gets its own
 * small role ("ticket-0042") given to the person who opened it (and anyone
 * added). The channel is hidden from @everyone and shown to that role and the
 * support role. Closing deletes both.
 */

import { type Command, type Ctx, type Reply, o, ok, okPrivate, fail, embed, botCall, nameOf, mention, str, COLOR, clip, channelLink, friendly, findRoleRef } from "../kit";

interface Ticket {
  id: string;
  number: number;
  channel_id: string | null;
  opener_id: string;
  status: string;
  claimed_by: string | null;
  topic: string | null;
}

const pad = (n: number) => String(n).padStart(4, "0");

async function ticketHere(ctx: Ctx): Promise<Ticket | null> {
  const { data } = await ctx.service.from("bruce_tickets").select("*").eq("channel_id", ctx.channelId).eq("status", "open").maybeSingle();
  return data as Ticket | null;
}

async function ticketRole(ctx: Ctx, t: Ticket) {
  const { data } = await ctx.service.from("server_roles").select("id").eq("server_id", ctx.serverId).eq("name", `ticket-${pad(t.number)}`).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function canHandle(ctx: Ctx, t?: Ticket | null) {
  if (t && t.opener_id === ctx.user.id) return true;
  if (await ctx.can("manage_channels")) return true;
  if (!ctx.guild.ticket_support_role_id) return false;
  const { data } = await ctx.service.from("member_roles").select("role_id").eq("server_id", ctx.serverId).eq("user_id", ctx.user.id).eq("role_id", ctx.guild.ticket_support_role_id).maybeSingle();
  return !!data;
}

/** Bruce's own highest role, so he can always see the tickets he makes. */
async function botTopRole(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.service
    .from("member_roles")
    .select("role_id, server_roles(position)")
    .eq("server_id", ctx.serverId)
    .eq("user_id", ctx.botUserId);
  const rows = ((data ?? []) as unknown as { role_id: string; server_roles: { position: number } | { position: number }[] | null }[])
    .map((r) => ({ id: r.role_id, pos: (Array.isArray(r.server_roles) ? r.server_roles[0]?.position : r.server_roles?.position) ?? 0 }))
    .sort((x, y) => y.pos - x.pos);
  return rows[0]?.id ?? null;
}

/**
 * Open a ticket for ctx.user. Shared by /ticket and the panel button.
 *
 * Only the person who opened it, the staff role, Administrators and the
 * space's owner can see the channel. The reply is private to the opener.
 */
export async function openTicket(ctx: Ctx, topic: string | null): Promise<Reply> {
  if (!ctx.guild.ticket_support_role_id) {
    return fail("Tickets aren't set up here yet. An admin needs to run `/ticket-setup` and pick a staff role first.");
  }
  const { data: mine } = await ctx.service.from("bruce_tickets").select("channel_id").eq("server_id", ctx.serverId).eq("opener_id", ctx.user.id).eq("status", "open").limit(1);
  const existing = (mine ?? [])[0] as { channel_id: string | null } | undefined;
  if (existing) {
    return fail(`You already have an open ticket${existing.channel_id ? `: ${channelLink(existing.channel_id)}` : ""}. Close it before opening another.`);
  }

  const { data: everyone } = await ctx.service.from("server_roles").select("id").eq("server_id", ctx.serverId).eq("is_default", true).maybeSingle();
  const everyoneId = (everyone as { id?: string } | null)?.id;
  if (!everyoneId) return fail("I couldn't find this space's @everyone role.");

  const { data: num, error: numErr } = await ctx.service.rpc("bruce_next_ticket_number", { p_server_id: ctx.serverId });
  if (numErr) return fail(numErr.message);
  const number = Number(num);
  const name = `ticket-${pad(number)}`;

  const { data: chan, error: chanErr } = await ctx.service.rpc("bot_create_channel", {
    p_bot_id: ctx.botId, p_server_id: ctx.serverId, p_name: name, p_type: "text", p_category_id: ctx.guild.ticket_category_id,
  });
  if (chanErr) return fail(friendly(chanErr.message));
  const channelId = (chan as { id?: string } | null)?.id ?? (typeof chan === "string" ? chan : null);
  if (!channelId) return fail("I couldn't make the ticket channel.");

  // Undo everything if any step fails, so a half-made ticket is never left
  // visible to the whole space.
  let roleId: string | null = null;
  const abandon = async (why: string) => {
    if (roleId) await botCall(ctx, "bot_delete_role", { p_role_id: roleId });
    await botCall(ctx, "bot_delete_channel", { p_channel_id: channelId });
    return fail(why);
  };

  // Hidden first, then opened to the right people.
  const hide = await botCall(ctx, "bot_set_channel_permission", { p_channel_id: channelId, p_role_id: everyoneId, p_can_view: false, p_can_post: false });
  if (hide) return abandon(`I couldn't make the ticket private: ${hide}`);

  const { data: role, error: roleErr } = await ctx.service.rpc("bot_create_role", {
    p_bot_id: ctx.botId, p_server_id: ctx.serverId, p_name: name, p_color: "#4641d9", p_permissions: {}, p_self_assignable: false, p_position: null,
  });
  if (roleErr) return abandon(friendly(roleErr.message));
  roleId = (role as { id?: string } | null)?.id ?? null;
  if (!roleId) return abandon("I couldn't make the ticket's role.");

  const steps: [string, Record<string, unknown>][] = [
    ["bot_add_member_role", { p_server_id: ctx.serverId, p_user_id: ctx.user.id, p_role_id: roleId }],
    ["bot_set_channel_permission", { p_channel_id: channelId, p_role_id: roleId, p_can_view: true, p_can_post: true, p_can_attach: true, p_can_react: true }],
    ["bot_set_channel_permission", { p_channel_id: channelId, p_role_id: ctx.guild.ticket_support_role_id, p_can_view: true, p_can_post: true, p_can_attach: true, p_can_react: true }],
  ];
  const mine2 = await botTopRole(ctx);
  if (mine2 && mine2 !== ctx.guild.ticket_support_role_id) {
    steps.push(["bot_set_channel_permission", { p_channel_id: channelId, p_role_id: mine2, p_can_view: true, p_can_post: true, p_can_attach: true }]);
  }
  for (const [fn, args] of steps) {
    const err = await botCall(ctx, fn, args);
    if (err) return abandon(`I couldn't set up the ticket: ${err}`);
  }

  await ctx.service.from("bruce_tickets").insert({ server_id: ctx.serverId, channel_id: channelId, opener_id: ctx.user.id, number, topic });
  await ctx.send(channelId, {
    content: mention(ctx.user),
    ...embed({
      title: `🎫 Ticket #${pad(number)}`,
      description: `Hi ${mention(ctx.user)}, thanks for reaching out. Someone from the team will be with you soon.${topic ? `\n\n**About:** ${clip(topic, 500)}` : ""}`,
      footer: { text: "Staff: press Claim to take it. Press Close when you're done." },
    }),
    components: [{
      type: "action_row",
      components: [
        { type: "button", style: "secondary", label: "Claim", custom_id: "bruce:ticket:claim", emoji: "🙋" },
        { type: "button", style: "danger", label: "Close", custom_id: "bruce:ticket:close", emoji: "🔒" },
      ],
    }],
  });
  if (ctx.guild.ticket_log_channel_id) {
    await ctx.send(ctx.guild.ticket_log_channel_id, embed({ description: `🎫 ${mention(ctx.user)} opened ${channelLink(channelId)}${topic ? `: ${clip(topic, 200)}` : ""}` })).catch(() => undefined);
  }
  return okPrivate(`Your ticket is open: ${channelLink(channelId)}`);
}

export async function closeTicket(ctx: Ctx): Promise<Reply> {
  const t = await ticketHere(ctx);
  if (!t) return fail("This isn't an open ticket channel.");
  if (!(await canHandle(ctx, t))) return fail("Only the person who opened it or the support team can close this ticket.");
  const roleId = await ticketRole(ctx, t);
  await ctx.service.from("bruce_tickets").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", t.id);
  if (ctx.guild.ticket_log_channel_id) {
    const { count } = await ctx.service.from("messages").select("*", { count: "exact", head: true }).eq("channel_id", ctx.channelId);
    await ctx.send(ctx.guild.ticket_log_channel_id, embed({
      description: `🔒 **ticket-${pad(t.number)}** closed by ${mention(ctx.user)} · ${count ?? 0} messages`,
      color: COLOR.warn,
    })).catch(() => undefined);
  }
  if (roleId) await botCall(ctx, "bot_delete_role", { p_role_id: roleId });
  const err = await botCall(ctx, "bot_delete_channel", { p_channel_id: ctx.channelId });
  return err ? fail(`Marked closed, but I couldn't delete the channel: ${err}`) : ok("Ticket closed.");
}

export async function claimTicket(ctx: Ctx): Promise<Reply> {
  const t = await ticketHere(ctx);
  if (!t) return fail("This isn't an open ticket channel.");
  if (t.opener_id === ctx.user.id || !(await canHandle(ctx))) return fail("Only the support team can claim tickets.");
  if (t.claimed_by) return fail("Someone has already claimed this ticket.");
  await ctx.service.from("bruce_tickets").update({ claimed_by: ctx.user.id }).eq("id", t.id);
  return embed({ description: `🙋 ${mention(ctx.user)} is handling this ticket.`, color: COLOR.ok });
}

async function setMember(ctx: Ctx, add: boolean): Promise<Reply> {
  const t = await ticketHere(ctx);
  if (!t) return fail("This isn't an open ticket channel.");
  if (!(await canHandle(ctx, t))) return fail("Only the person who opened it or the support team can do that.");
  const p = await ctx.member(ctx.opt.user);
  if (!p) return fail("I can't find that member here.");
  const roleId = await ticketRole(ctx, t);
  if (!roleId) return fail("This ticket's role is missing.");
  const err = await botCall(ctx, add ? "bot_add_member_role" : "bot_remove_member_role", { p_server_id: ctx.serverId, p_user_id: p.id, p_role_id: roleId });
  return err ? fail(err) : ok(add ? `Added **${nameOf(p)}** to this ticket.` : `Removed **${nameOf(p)}** from this ticket.`);
}

export const ticketCommands: Command[] = [
  {
    name: "ticket",
    aliases: ["new", "open"],
    category: "Tickets",
    slash: true,
    description: "Open a private ticket with the support team",
    options: [o.str("topic", "What it's about", false)],
    run: (ctx) => openTicket(ctx, str(ctx.opt.topic) || null),
  },
  { name: "close", category: "Tickets", slash: true, description: "Close this ticket", run: closeTicket },
  { name: "claim", category: "Tickets", slash: true, description: "Take this ticket on", run: claimTicket },
  {
    name: "ticket-add",
    aliases: ["tadd"],
    category: "Tickets",
    slash: true,
    description: "Add someone to this ticket",
    options: [o.user("user", "Who")],
    run: (ctx) => setMember(ctx, true),
  },
  {
    name: "ticket-remove",
    aliases: ["tremove"],
    category: "Tickets",
    slash: true,
    description: "Remove someone from this ticket",
    options: [o.user("user", "Who")],
    run: (ctx) => setMember(ctx, false),
  },
  {
    name: "tickets",
    category: "Tickets",
    slash: true,
    description: "Open tickets in this space",
    run: async (ctx) => {
      if (!(await canHandle(ctx))) return fail("Only the support team can list tickets.");
      const { data } = await ctx.service.from("bruce_tickets").select("number, opener_id, claimed_by, topic").eq("server_id", ctx.serverId).eq("status", "open").order("number").limit(25);
      const list = (data ?? []) as { number: number; opener_id: string; claimed_by: string | null; topic: string | null }[];
      if (!list.length) return ok("No open tickets. 🎉");
      const lines = await Promise.all(list.map(async (t) => {
        const who = await ctx.member(t.opener_id);
        return `**#${pad(t.number)}** · ${nameOf(who)}${t.claimed_by ? " · claimed" : ""}${t.topic ? ` · ${clip(t.topic, 50)}` : ""}`;
      }));
      return embed({ title: `Open tickets (${list.length})`, description: lines.join("\n") });
    },
  },
  {
    name: "ticket-setup",
    aliases: ["tsetup"],
    category: "Tickets",
    slash: true,
    perm: "manage_server",
    description: "Set up tickets: the staff role (required), category and log channel",
    options: [o.role("staff_role", "Role that can see, claim and answer tickets"), o.channel("category", "Category new tickets go in", false), o.channel("log", "Channel for ticket logs", false)],
    run: async (ctx) => {
      const patch: Record<string, string | null> = {};
      const staff = await findRoleRef(ctx, ctx.opt.staff_role);
      if (!staff) return fail("No role with that name. Make a staff role first (Space Settings → Roles).");
      if ((staff as { is_default: boolean }).is_default) return fail("Pick a staff role, not @everyone: tickets are private.");
      patch.ticket_support_role_id = (staff as { id: string }).id;
      for (const [opt, col] of [["category", "ticket_category_id"], ["log", "ticket_log_channel_id"]] as const) {
        if (!ctx.opt[opt]) continue;
        const ref = str(ctx.opt[opt]).replace(/^<#|>$/g, "");
        let q = ctx.service.from("channels").select("id").eq("server_id", ctx.serverId);
        q = /^[0-9a-f-]{36}$/i.test(ref) ? q.eq("id", ref) : q.ilike("name", ref.replace(/^#/, ""));
        const { data } = await q.limit(1).maybeSingle();
        if (!data) return fail(`I can't find the ${opt} channel "${ref}".`);
        patch[col] = (data as { id: string }).id;
      }
      await ctx.service.from("bruce_guilds").upsert({ server_id: ctx.serverId, ...patch }, { onConflict: "server_id" });
      const g = { ...ctx.guild, ...patch } as typeof ctx.guild;
      return embed({
        title: "🎫 Tickets set up",
        description: "Run `/ticket-panel` in any channel to post an **Open a ticket** button. Anyone can also run `/ticket`.",
        color: COLOR.ok,
        fields: [
          { name: "Staff role", value: (staff as { name: string }).name, inline: true },
          { name: "Category", value: g.ticket_category_id ? channelLink(g.ticket_category_id) : "None", inline: true },
          { name: "Log channel", value: g.ticket_log_channel_id ? channelLink(g.ticket_log_channel_id) : "None", inline: true },
          { name: "Who can see a ticket", value: "The person who opened it, the staff role, Administrators and the owner.", inline: false },
        ],
      });
    },
  },
  {
    name: "ticket-panel",
    aliases: ["tpanel"],
    category: "Tickets",
    slash: true,
    perm: "manage_server",
    description: "Post an 'Open a ticket' button here",
    options: [o.str("message", "What the panel says", false)],
    run: (ctx) => {
      if (!ctx.guild.ticket_support_role_id) {
        return fail("Pick a staff role first: `/ticket-setup staff_role:<role>`. Tickets are private to them, Administrators and the opener.");
      }
      return {
        ...embed({ title: "🎫 Need help?", description: str(ctx.opt.message) || "Press the button below to open a private ticket with the team." }),
        components: [{ type: "action_row", components: [{ type: "button", style: "primary", label: "Open a ticket", custom_id: "bruce:ticket:open", emoji: "🎫" }] }],
      };
    },
  },
];
