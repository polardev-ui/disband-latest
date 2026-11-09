import {
  type Command, type Ctx, o, ok, fail, embed, info, fmt, nameOf, mention, str, rand, pick,
  memberRow, addCoins, levelFromXp, bar, COLOR, ago, clip,
} from "../kit";

const COIN = "🪙";
const HOUR = 3600_000;

function cooldownLeft(last: string | null, ms: number): number {
  if (!last) return 0;
  return Math.max(0, Date.parse(last) + ms - Date.now());
}

function waitText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

async function stamp(ctx: Ctx, userId: string, patch: Record<string, unknown>) {
  await ctx.service.from("bruce_members").upsert({ server_id: ctx.serverId, user_id: userId, ...patch }, { onConflict: "server_id,user_id" });
}

/** A timed earning command: work, beg, fish, crime… */
function earner(name: string, emoji: string, minutes: number, min: number, max: number, lines: string[], risk = 0, aliases?: string[]): Command {
  const col = `last_${name}`;
  return {
    name,
    aliases,
    category: "Economy",
    description: `${emoji} Earn some coins (every ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`})`,
    run: async (ctx) => {
      // Work's cooldown is stored; the smaller earners keep theirs per worker.
      const key = `${ctx.serverId}:${ctx.user.id}:${name}`;
      const last = cooldowns.get(key) ?? (name === "work" ? (await memberRow(ctx, ctx.user.id)).last_work : null);
      const left = cooldownLeft(last ?? null, minutes * 60_000);
      if (left) return fail(`You can ${name} again in ${waitText(left)}.`);
      cooldowns.set(key, new Date().toISOString());
      if (name === "work") await stamp(ctx, ctx.user.id, { [col]: new Date().toISOString() });
      if (risk && Math.random() < risk) {
        const loss = rand(min, max);
        try { await addCoins(ctx, ctx.user.id, -loss); } catch { /* broke already */ }
        return embed({ description: `${emoji} You got caught and paid a **${fmt(loss)}** ${COIN} fine.`, color: COLOR.bad });
      }
      const amount = rand(min, max);
      const row = await addCoins(ctx, ctx.user.id, amount);
      return embed({ description: `${emoji} ${pick(lines).replace("$n", `**${fmt(amount)}** ${COIN}`)}\nWallet: **${fmt(row.coins)}** ${COIN}`, color: COLOR.gold });
    },
  };
}

const cooldowns = new Map<string, string>();

export const communityCommands: Command[] = [
  // --- Config -------------------------------------------------------------------
  {
    name: "prefix",
    category: "Config",
    slash: true,
    description: "See or change Bruce's prefix here",
    options: [o.str("new", "The new prefix (up to 5 characters)", false)],
    run: async (ctx) => {
      const next = str(ctx.opt.new).trim();
      if (!next) return info("Prefix", `My prefix here is \`${ctx.guild.prefix}\`. Slash commands always work too.`);
      if (!(await ctx.can("manage_server"))) return fail("You need Manage Space to change the prefix.");
      if (next.length > 5 || /\s/.test(next)) return fail("Use 1 to 5 characters, no spaces.");
      await ctx.service.from("bruce_guilds").upsert({ server_id: ctx.serverId, prefix: next }, { onConflict: "server_id" });
      return ok(`Prefix changed to \`${next}\`. Try \`${next}help\`.`);
    },
  },
  {
    name: "modlog",
    category: "Config",
    slash: true,
    perm: "manage_server",
    description: "Pick the channel moderation actions are logged to",
    options: [o.channel("channel", "The channel (leave empty to turn off)", false)],
    run: async (ctx) => {
      const ref = str(ctx.opt.channel);
      let id: string | null = null;
      if (ref) {
        let q = ctx.service.from("channels").select("id, name").eq("server_id", ctx.serverId);
        q = /^[0-9a-f-]{36}$/i.test(ref) ? q.eq("id", ref) : q.ilike("name", ref);
        const { data } = await q.limit(1).maybeSingle();
        if (!data) return fail("I can't find that channel.");
        id = (data as { id: string }).id;
      }
      await ctx.service.from("bruce_guilds").upsert({ server_id: ctx.serverId, mod_log_channel_id: id }, { onConflict: "server_id" });
      return ok(id ? `Moderation actions will be logged to **#${ref.replace(/^#/, "")}**.` : "Mod log turned off.");
    },
  },
  {
    name: "levels",
    aliases: ["leveling"],
    category: "Config",
    slash: true,
    perm: "manage_server",
    description: "Turn levels (and level-up messages) on or off",
    options: [o.bool("enabled", "Levels on?"), o.bool("announce", "Post level-up messages?", false)],
    run: async (ctx) => {
      const patch: Record<string, boolean> = { levels_enabled: !!ctx.opt.enabled };
      if (ctx.opt.announce !== undefined) patch.level_up_messages = !!ctx.opt.announce;
      await ctx.service.from("bruce_guilds").upsert({ server_id: ctx.serverId, ...patch }, { onConflict: "server_id" });
      return ok(`Levels are **${patch.levels_enabled ? "on" : "off"}**${patch.level_up_messages === undefined ? "" : `, level-up messages **${patch.level_up_messages ? "on" : "off"}**`}.`);
    },
  },
  {
    name: "settings",
    aliases: ["config"],
    category: "Config",
    slash: true,
    description: "Bruce's settings in this space",
    run: async (ctx) => {
      const g = ctx.guild;
      const ch = async (id: string | null) => {
        if (!id) return "Not set";
        const { data } = await ctx.service.from("channels").select("name").eq("id", id).maybeSingle();
        return data ? `#${(data as { name: string }).name}` : "Missing";
      };
      let role = "Not set";
      if (g.ticket_support_role_id) {
        const { data } = await ctx.service.from("server_roles").select("name").eq("id", g.ticket_support_role_id).maybeSingle();
        role = data ? (data as { name: string }).name : "Missing";
      }
      return embed({
        title: "⚙️ Bruce settings",
        fields: [
          { name: "Prefix", value: `\`${g.prefix}\``, inline: true },
          { name: "Levels", value: g.levels_enabled ? (g.level_up_messages ? "On, announced" : "On, quiet") : "Off", inline: true },
          { name: "Mod log", value: await ch(g.mod_log_channel_id), inline: true },
          { name: "Ticket category", value: await ch(g.ticket_category_id), inline: true },
          { name: "Ticket support role", value: role, inline: true },
          { name: "Ticket log", value: await ch(g.ticket_log_channel_id), inline: true },
        ],
      });
    },
  },

  // --- Levels ------------------------------------------------------------------------
  {
    name: "rank",
    aliases: ["level", "xp"],
    category: "Levels",
    slash: true,
    description: "Your level and XP",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      const row = await memberRow(ctx, p.id);
      const { level, into, need } = levelFromXp(Number(row.xp));
      const { count } = await ctx.service.from("bruce_members").select("*", { count: "exact", head: true }).eq("server_id", ctx.serverId).gt("xp", row.xp);
      return embed({
        title: `${nameOf(p)} · Level ${level}`,
        thumbnail: p.avatar_url ? { url: p.avatar_url } : undefined,
        description: `\`${bar(into / need)}\` ${fmt(into)} / ${fmt(need)} XP`,
        fields: [
          { name: "Rank", value: `#${fmt((count ?? 0) + 1)}`, inline: true },
          { name: "Total XP", value: fmt(Number(row.xp)), inline: true },
          { name: "Messages", value: fmt(Number(row.messages)), inline: true },
        ],
      });
    },
  },
  {
    name: "leaderboard",
    aliases: ["lb", "top"],
    category: "Levels",
    slash: true,
    description: "Top members by XP",
    run: async (ctx) => {
      const { data } = await ctx.service.from("bruce_members").select("user_id, xp").eq("server_id", ctx.serverId).gt("xp", 0).order("xp", { ascending: false }).limit(10);
      const rows = (data ?? []) as { user_id: string; xp: number }[];
      if (!rows.length) return ok("Nobody has any XP yet. Start chatting!");
      const medals = ["🥇", "🥈", "🥉"];
      const lines = await Promise.all(rows.map(async (r, i) => `${medals[i] ?? `**${i + 1}.**`} ${nameOf(await ctx.member(r.user_id))} · Level ${levelFromXp(Number(r.xp)).level} · ${fmt(Number(r.xp))} XP`));
      return embed({ title: "🏆 Leaderboard", description: lines.join("\n") });
    },
  },
  {
    name: "givexp",
    category: "Levels",
    perm: "manage_server",
    description: "Give (or take, with a minus) XP",
    options: [o.user("user", "Who"), o.int("amount", "How much")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      if (!p) return fail("I can't find that member here.");
      const row = await memberRow(ctx, p.id);
      const xp = Math.max(0, Number(row.xp) + Number(ctx.opt.amount ?? 0));
      await stamp(ctx, p.id, { xp, level: levelFromXp(xp).level });
      return ok(`${nameOf(p)} now has ${fmt(xp)} XP (level ${levelFromXp(xp).level}).`);
    },
  },
  {
    name: "resetxp",
    category: "Levels",
    perm: "manage_server",
    description: "Reset a member's XP",
    options: [o.user("user", "Who")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      if (!p) return fail("I can't find that member here.");
      await stamp(ctx, p.id, { xp: 0, level: 0 });
      return ok(`Reset ${nameOf(p)}'s XP.`);
    },
  },

  // --- Economy -----------------------------------------------------------------------
  {
    name: "balance",
    aliases: ["bal", "wallet", "coins"],
    category: "Economy",
    slash: true,
    description: "Your coins",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      const row = await memberRow(ctx, p.id);
      return embed({
        title: `${nameOf(p)}'s coins`,
        color: COLOR.gold,
        fields: [
          { name: "Wallet", value: `${fmt(Number(row.coins))} ${COIN}`, inline: true },
          { name: "Bank", value: `${fmt(Number(row.bank))} ${COIN}`, inline: true },
          { name: "Total", value: `${fmt(Number(row.coins) + Number(row.bank))} ${COIN}`, inline: true },
        ],
      });
    },
  },
  {
    name: "daily",
    category: "Economy",
    slash: true,
    description: "Collect your daily coins",
    run: async (ctx) => {
      const row = await memberRow(ctx, ctx.user.id);
      const left = cooldownLeft(row.last_daily, 20 * HOUR);
      if (left) return fail(`Your daily is ready in ${waitText(left)}.`);
      const amount = rand(250, 450);
      await stamp(ctx, ctx.user.id, { last_daily: new Date().toISOString() });
      const r = await addCoins(ctx, ctx.user.id, amount);
      return embed({ description: `📅 You collected **${fmt(amount)}** ${COIN}! Wallet: **${fmt(r.coins)}** ${COIN}`, color: COLOR.gold });
    },
  },
  earner("work", "💼", 60, 80, 220, ["You worked a shift and earned $n.", "You fixed a bug for a client: $n.", "You walked six dogs and earned $n.", "You streamed for an hour and got $n in tips."]),
  earner("beg", "🥺", 10, 5, 60, ["A kind stranger gave you $n.", "Someone felt sorry for you: $n.", "You found $n down the back of the sofa."]),
  earner("fish", "🎣", 20, 20, 140, ["You caught a trout and sold it for $n.", "A big catch! $n.", "You reeled in an old boot full of $n."]),
  earner("hunt", "🏹", 30, 30, 170, ["You tracked down a deer and sold it for $n.", "A good day out: $n."]),
  earner("mine", "⛏️", 30, 30, 190, ["You struck iron worth $n.", "Diamonds! Well, small ones: $n."]),
  earner("crime", "🦹", 45, 100, 400, ["You pulled off a heist and got away with $n.", "You sold fake watches for $n."], 0.4),
  earner("search", "🔎", 15, 10, 110, ["You searched the park and found $n.", "Under the bed you found $n."]),
  {
    name: "deposit",
    aliases: ["dep"],
    category: "Economy",
    slash: true,
    description: "Move coins into your bank",
    options: [o.str("amount", "How many, or 'all'")],
    run: async (ctx) => {
      const row = await memberRow(ctx, ctx.user.id);
      const n = str(ctx.opt.amount) === "all" ? Number(row.coins) : parseInt(str(ctx.opt.amount), 10);
      if (!n || n < 1) return fail("Say how many coins, or `all`.");
      try {
        const r = await addCoins(ctx, ctx.user.id, -n, n);
        return ok(`Deposited ${fmt(n)} ${COIN}. Bank: ${fmt(r.bank)} ${COIN}`);
      } catch (e) { return fail((e as Error).message); }
    },
  },
  {
    name: "withdraw",
    aliases: ["with"],
    category: "Economy",
    slash: true,
    description: "Take coins out of your bank",
    options: [o.str("amount", "How many, or 'all'")],
    run: async (ctx) => {
      const row = await memberRow(ctx, ctx.user.id);
      const n = str(ctx.opt.amount) === "all" ? Number(row.bank) : parseInt(str(ctx.opt.amount), 10);
      if (!n || n < 1) return fail("Say how many coins, or `all`.");
      try {
        const r = await addCoins(ctx, ctx.user.id, n, -n);
        return ok(`Withdrew ${fmt(n)} ${COIN}. Wallet: ${fmt(r.coins)} ${COIN}`);
      } catch (e) { return fail((e as Error).message); }
    },
  },
  {
    name: "pay",
    aliases: ["give", "transfer"],
    category: "Economy",
    slash: true,
    description: "Give someone coins from your wallet",
    options: [o.user("user", "Who"), o.int("amount", "How many")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      const n = Number(ctx.opt.amount);
      if (!p) return fail("I can't find that member here.");
      if (p.id === ctx.user.id) return fail("You can't pay yourself.");
      if (!n || n < 1) return fail("Say how many coins.");
      try {
        await addCoins(ctx, ctx.user.id, -n);
      } catch (e) { return fail((e as Error).message); }
      await addCoins(ctx, p.id, n);
      return ok(`You gave ${mention(p)} **${fmt(n)}** ${COIN}.`);
    },
  },
  {
    name: "coinflip-bet",
    aliases: ["cfbet", "bet"],
    category: "Economy",
    slash: true,
    description: "Bet coins on heads or tails",
    options: [o.int("amount", "How many"), o.str("side", "heads or tails", true, ["heads", "tails"])],
    run: async (ctx) => {
      const n = Number(ctx.opt.amount);
      const side = str(ctx.opt.side).toLowerCase().startsWith("t") ? "tails" : "heads";
      if (!n || n < 1) return fail("Say how many coins.");
      const landed = Math.random() < 0.5 ? "heads" : "tails";
      try {
        const r = await addCoins(ctx, ctx.user.id, landed === side ? n : -n);
        return embed({ description: `🪙 It's **${landed}**! You ${landed === side ? `won **${fmt(n)}**` : `lost **${fmt(n)}**`} ${COIN}. Wallet: ${fmt(r.coins)} ${COIN}`, color: landed === side ? COLOR.ok : COLOR.bad });
      } catch (e) { return fail((e as Error).message); }
    },
  },
  {
    name: "slots",
    category: "Economy",
    slash: true,
    description: "Spin the slot machine",
    options: [o.int("amount", "Your bet")],
    run: async (ctx) => {
      const n = Number(ctx.opt.amount);
      if (!n || n < 1) return fail("Say how many coins to bet.");
      const reels = ["🍒", "🍋", "🍇", "🔔", "⭐", "💎"];
      const spin = [pick(reels), pick(reels), pick(reels)];
      const win = spin[0] === spin[1] && spin[1] === spin[2] ? (spin[0] === "💎" ? 10 : 5) : spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2] ? 1.5 : 0;
      const delta = win ? Math.floor(n * win) - n : -n;
      try {
        const r = await addCoins(ctx, ctx.user.id, delta);
        return embed({ title: "🎰 Slots", description: `**[ ${spin.join(" | ")} ]**\n${win ? `You won **${fmt(Math.floor(n * win))}** ${COIN}!` : `No luck. You lost **${fmt(n)}** ${COIN}.`}\nWallet: ${fmt(r.coins)} ${COIN}`, color: win ? COLOR.ok : COLOR.bad });
      } catch (e) { return fail((e as Error).message); }
    },
  },
  {
    name: "rob",
    aliases: ["steal"],
    category: "Economy",
    description: "Try to take coins from someone's wallet",
    options: [o.user("user", "Who")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      if (!p || p.id === ctx.user.id) return fail("Pick someone else.");
      const key = `${ctx.serverId}:${ctx.user.id}:rob`;
      const left = cooldownLeft(cooldowns.get(key) ?? null, 2 * HOUR);
      if (left) return fail(`Lie low for ${waitText(left)} first.`);
      cooldowns.set(key, new Date().toISOString());
      const victim = await memberRow(ctx, p.id);
      if (Number(victim.coins) < 50) return fail(`${nameOf(p)} has hardly anything in their wallet.`);
      if (Math.random() < 0.45) {
        const take = Math.floor(Number(victim.coins) * (rand(10, 35) / 100));
        await addCoins(ctx, p.id, -take);
        await addCoins(ctx, ctx.user.id, take);
        return embed({ description: `🦹 You took **${fmt(take)}** ${COIN} from ${mention(p)}!`, color: COLOR.ok });
      }
      const fine = rand(50, 200);
      try { await addCoins(ctx, ctx.user.id, -fine); } catch { /* nothing to fine */ }
      return embed({ description: `🚓 Caught! You paid ${mention(p)}'s lawyer **${fmt(fine)}** ${COIN}.`, color: COLOR.bad });
    },
  },
  {
    name: "rich",
    aliases: ["baltop", "richest"],
    category: "Economy",
    slash: true,
    description: "The richest members here",
    run: async (ctx) => {
      const { data } = await ctx.service.from("bruce_members").select("user_id, coins, bank").eq("server_id", ctx.serverId).order("coins", { ascending: false }).limit(25);
      const rows = ((data ?? []) as { user_id: string; coins: number; bank: number }[])
        .map((r) => ({ ...r, total: Number(r.coins) + Number(r.bank) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      if (!rows.length) return ok("Nobody has any coins yet. Try `daily`!");
      const lines = await Promise.all(rows.map(async (r, i) => `**${i + 1}.** ${nameOf(await ctx.member(r.user_id))} · ${fmt(r.total)} ${COIN}`));
      return embed({ title: "💰 Richest members", description: lines.join("\n"), color: COLOR.gold });
    },
  },
  {
    name: "rep",
    aliases: ["reputation", "thanks"],
    category: "Economy",
    slash: true,
    description: "Give someone a reputation point (once a day)",
    options: [o.user("user", "Who")],
    run: async (ctx) => {
      const p = await ctx.member(ctx.opt.user);
      if (!p || p.id === ctx.user.id) return fail("Pick someone else.");
      const me = await memberRow(ctx, ctx.user.id);
      const left = cooldownLeft(me.last_rep_at, 20 * HOUR);
      if (left) return fail(`You can give rep again in ${waitText(left)}.`);
      const them = await memberRow(ctx, p.id);
      await stamp(ctx, ctx.user.id, { last_rep_at: new Date().toISOString() });
      await stamp(ctx, p.id, { rep: Number(them.rep) + 1 });
      return ok(`${mention(p)} now has **${Number(them.rep) + 1}** rep. ⭐`);
    },
  },
  {
    name: "profile",
    aliases: ["card"],
    category: "Economy",
    slash: true,
    description: "Level, coins and rep in one card",
    options: [o.user("user", "Who (you, if empty)", false)],
    run: async (ctx) => {
      const p = ctx.opt.user ? await ctx.member(ctx.opt.user) : ctx.user;
      if (!p) return fail("I can't find that member here.");
      const row = await memberRow(ctx, p.id);
      const lv = levelFromXp(Number(row.xp));
      return embed({
        title: nameOf(p),
        thumbnail: p.avatar_url ? { url: p.avatar_url } : undefined,
        fields: [
          { name: "Level", value: `${lv.level} (${fmt(lv.into)}/${fmt(lv.need)})`, inline: true },
          { name: "Coins", value: `${fmt(Number(row.coins) + Number(row.bank))} ${COIN}`, inline: true },
          { name: "Rep", value: `⭐ ${row.rep}`, inline: true },
          { name: "Messages", value: fmt(Number(row.messages)), inline: true },
        ],
      });
    },
  },

  // --- AFK ----------------------------------------------------------------------------
  {
    name: "afk",
    category: "Utility",
    slash: true,
    description: "Say you're away; Bruce tells people who mention you",
    options: [o.str("reason", "Why", false)],
    run: async (ctx) => {
      const reason = clip(str(ctx.opt.reason) || "AFK", 200);
      await stamp(ctx, ctx.user.id, { afk_reason: reason, afk_since: new Date().toISOString() });
      return embed({ description: `💤 ${mention(ctx.user)} is now AFK: ${reason}` });
    },
  },
];

/** After each message: XP, level-ups and AFK. Returns a reply to post, if any. */
export async function onMessage(ctx: Ctx, content: string): Promise<string | null> {
  const notes: string[] = [];
  const row = await memberRow(ctx, ctx.user.id);
  const patch: Record<string, unknown> = { messages: Number(row.messages) + 1 };

  if (row.afk_reason) {
    patch.afk_reason = null;
    patch.afk_since = null;
    notes.push(`👋 Welcome back ${mention(ctx.user)}, I removed your AFK.`);
  }

  if (ctx.guild.levels_enabled && (!row.last_xp_at || Date.now() - Date.parse(row.last_xp_at) > 60_000)) {
    const before = levelFromXp(Number(row.xp)).level;
    const xp = Number(row.xp) + rand(15, 25);
    const after = levelFromXp(xp).level;
    patch.xp = xp;
    patch.level = after;
    patch.last_xp_at = new Date().toISOString();
    if (after > before && ctx.guild.level_up_messages) {
      notes.push(`🎉 ${mention(ctx.user)} reached **level ${after}**!`);
    }
  }
  await stamp(ctx, ctx.user.id, patch);

  // Mentions of people who are away.
  const names = [...new Set([...content.matchAll(/@([a-z0-9_.]{2,32})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 5);
  if (names.length) {
    const { data } = await ctx.service.from("profiles").select("id, username, display_name").in("username", names);
    for (const p of (data ?? []) as { id: string; username: string; display_name: string | null }[]) {
      if (p.id === ctx.user.id) continue;
      const r = await memberRow(ctx, p.id);
      if (r.afk_reason) notes.push(`💤 ${p.display_name || p.username} is AFK: ${r.afk_reason} (${ago(r.afk_since)})`);
    }
  }
  return notes.length ? notes.join("\n") : null;
}
