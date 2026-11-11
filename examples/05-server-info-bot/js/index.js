// =====================================================================
// 05 — SERVER INFO BOT  (Disband bot template, JavaScript)
// =====================================================================
// Reports rich information about a space: member directory, role breakdown,
// channel table, bot list, and a summary card. Teaches aggregation, caching,
// pagination, sorting, and formatting for large spaces.
//
// TUTORIAL
// --------
// 1. Create the bot: Disband → Settings → Bots → New bot.
//    Scopes: messages.read, messages.write, members.read, channels.read
//    Copy the token (shown once).
//
// 2. Invite it to a space (Settings → Bots → Invite → copy link → owner approves).
//
// 3. Install: npm install @disband/bot
//
// 4. Paste the token below (or set DISBAND_BOT_TOKEN).
//
// 5. Run: node index.js
//
// 6. Try it:
//    !info
//    !members
//    !members 2
//    !member kai
//    !channels
//    !roles
//    !bots
//    !top
//
// WHY EACH PIECE EXISTS
// - Caching (60s): listMembers/listChannels on every command would burn the
//   rate limit. A short TTL keeps data fresh enough for an info bot.
// - Pagination: a 500-member space must not dump 500 lines into one message.
// - Role breakdown from members: the SDK has no list-roles endpoint, so we
//   aggregate role ids from member records. Owners can map ids to names in
//   space settings.
// - Defensive access: member/channel shapes vary; .get()/optional chaining
//   keeps the bot alive.
// - Chunking: any of these commands can exceed the message limit.
// =====================================================================

import process from "node:process";
import { Client } from "@disband/bot";

// ===================== BOT TOKEN (paste here) =====================
const BOT_TOKEN = process.env.DISBAND_BOT_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE";
// ================================================================

const CONFIG = {
  prefix: "!",
  cacheTtlMs: 60_000,
  pageSize: 20,
  maxMessageLength: 1_900,
  logLevel: process.env.LOG_LEVEL || "info",
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
function log(level, ...args) {
  if (LEVELS[level] < LEVELS[CONFIG.logLevel]) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (level === "error") console.error(line, ...args);
  else if (level === "warn") console.warn(line, ...args);
  else console.log(line, ...args);
}

if (!BOT_TOKEN || BOT_TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
  log("error", "No bot token. Paste one into BOT_TOKEN or set DISBAND_BOT_TOKEN.");
  process.exit(1);
}

const client = new Client({ token: BOT_TOKEN });

// ---------------------------------------------------------------- cache
// Simple per-space cache with TTL. Keyed by `${serverId}:${kind}`.

const cache = new Map();

async function cached(serverId, kind, fetcher) {
  const key = `${serverId}:${kind}`;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CONFIG.cacheTtlMs) return entry.value;
  const value = await fetcher();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function invalidate(serverId) {
  for (const key of cache.keys()) {
    if (key.startsWith(serverId + ":")) cache.delete(key);
  }
}

// ---------------------------------------------------------------- helpers

function displayName(person) {
  return person?.display_name || person?.username || person?.name || "unknown";
}

function chunkText(text, size) {
  const chunks = [];
  let rest = String(text);
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
    if (cut < size * 0.5) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendLong(channelId, text) {
  for (const chunk of chunkText(text, CONFIG.maxMessageLength)) {
    await client.sendMessage(channelId, chunk);
  }
}

function padRight(str, width) {
  str = String(str);
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

// ---------------------------------------------------------------- data loaders

async function loadMembers(serverId) {
  return cached(serverId, "members", async () => {
    try {
      return await client.listMembers(serverId);
    } catch (err) {
      log("warn", "listMembers failed:", err.message);
      return [];
    }
  });
}

async function loadChannels(serverId) {
  return cached(serverId, "channels", async () => {
    try {
      return await client.listChannels(serverId);
    } catch (err) {
      log("warn", "listChannels failed:", err.message);
      return [];
    }
  });
}

// ---------------------------------------------------------------- commands

const commands = new Map();
function defineCommand({ name, description, usage, run }) {
  commands.set(name, { name, description, usage, run });
}

defineCommand({
  name: "info",
  description: "Summary card for this space.",
  usage: "!info",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const [members, channels] = await Promise.all([loadMembers(message.serverId), loadChannels(message.serverId)]);
    const bots = members.filter((m) => m.is_bot);
    const humans = members.length - bots.length;
    const textChannels = channels.filter((c) => !c.type || c.type === "text");
    const voiceChannels = channels.filter((c) => c.type === "voice");
    const categories = channels.filter((c) => c.type === "category");
    await message.reply(
      [
        "**Space overview**",
        `Members: **${members.length}** (${humans} humans, ${bots.length} bots)`,
        `Channels: **${channels.length}** (${textChannels.length} text, ${voiceChannels.length} voice, ${categories.length} categories)`,
        `Server ID: \`${message.serverId}\``,
        `Bot: ${client.user?.name || "this bot"} (\`${client.user?.id || "?"}\`)`,
      ].join("\n"),
    );
  },
});

defineCommand({
  name: "members",
  description: "Paginated member directory.",
  usage: "!members [page]",
  async run(message, args) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const page = Math.max(1, parseInt(args[0], 10) || 1);
    const members = await loadMembers(message.serverId);
    if (!members.length) {
      await message.reply("No members visible (check members.read scope).");
      return;
    }
    const sorted = [...members].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const totalPages = Math.ceil(sorted.length / CONFIG.pageSize);
    const pageSafe = Math.min(page, totalPages);
    const slice = sorted.slice((pageSafe - 1) * CONFIG.pageSize, pageSafe * CONFIG.pageSize);
    const lines = slice.map((m, i) => {
      const idx = (pageSafe - 1) * CONFIG.pageSize + i + 1;
      const badge = m.is_bot ? " 🤖" : "";
      return `${idx}. ${displayName(m)}${badge} — \`${m.id || m.user_id || "?"}\``;
    });
    await sendLong(
      message.channelId,
      `**Members (${sorted.length}) — page ${pageSafe}/${totalPages}**\n${lines.join("\n")}` +
        (pageSafe < totalPages ? `\n\nNext: \`!members ${pageSafe + 1}\`` : ""),
    );
  },
});

defineCommand({
  name: "member",
  description: "Look up a member by name or id.",
  usage: "!member <name|id>",
  async run(message, args) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const query = args.join(" ").trim().toLowerCase();
    if (!query) return message.reply("Usage: `!member <name|id>`");
    const members = await loadMembers(message.serverId);
    const hits = members.filter((m) => {
      const id = String(m.id || m.user_id || "");
      const name = displayName(m).toLowerCase();
      return id === query || name === query || name.includes(query);
    });
    if (!hits.length) {
      await message.reply(`No member matching **${query}**.`);
      return;
    }
    const lines = hits.slice(0, 10).map((m) => {
      const roles = Array.isArray(m.roles) ? m.roles.join(", ") : "(none)";
      return [
        `**${displayName(m)}**${m.is_bot ? " 🤖" : ""}`,
        `ID: \`${m.id || m.user_id || "?"}\``,
        `Roles: ${roles || "(none)"}`,
        `Joined: ${m.joined_at || "?"}`,
      ].join("\n");
    });
    await sendLong(message.channelId, lines.join("\n\n"));
  },
});

defineCommand({
  name: "channels",
  description: "Channel table grouped by type.",
  usage: "!channels",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const channels = await loadChannels(message.serverId);
    if (!channels.length) {
      await message.reply("No channels visible (check channels.read scope).");
      return;
    }
    const groups = {};
    for (const c of channels) {
      const kind = c.type || "text";
      (groups[kind] ||= []).push(c);
    }
    const sections = Object.keys(groups)
      .sort()
      .map((kind) => {
        const items = groups[kind]
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
          .map((c) => `  • ${c.name ?? c.id} (\`${c.id}\`)`)
          .join("\n");
        return `**${kind} (${groups[kind].length})**\n${items}`;
      });
    await sendLong(message.channelId, sections.join("\n\n"));
  },
});

defineCommand({
  name: "roles",
  description: "Role breakdown derived from member records.",
  usage: "!roles",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const members = await loadMembers(message.serverId);
    const counts = new Map();
    let unassigned = 0;
    for (const m of members) {
      const roles = Array.isArray(m.roles) ? m.roles : [];
      if (!roles.length) {
        unassigned++;
        continue;
      }
      for (const r of roles) counts.set(r, (counts.get(r) || 0) + 1);
    }
    const lines = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `• \`${r}\` — ${n} member${n === 1 ? "" : "s"}`);
    if (unassigned) lines.push(`• *(no roles)* — ${unassigned} member${unassigned === 1 ? "" : "s"}`);
    await message.reply(
      `**Role breakdown** (${counts.size} distinct roles)\n` +
        (lines.join("\n") || "No data.") +
        "\n\n_Note: role names are not exposed by the bot API; IDs are shown. " +
        "Map them in space settings._",
    );
  },
});

defineCommand({
  name: "bots",
  description: "List bot accounts in this space.",
  usage: "!bots",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const members = await loadMembers(message.serverId);
    const bots = members.filter((m) => m.is_bot);
    if (!bots.length) {
      await message.reply("No bots in this space.");
      return;
    }
    const lines = bots
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .map((m) => `• ${displayName(m)} — \`${m.id || m.user_id || "?"}\``);
    await message.reply(`**Bots (${bots.length})**\n${lines.join("\n")}`);
  },
});

defineCommand({
  name: "top",
  description: "Largest channels by... (placeholder: top members by role count).",
  usage: "!top",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const members = await loadMembers(message.serverId);
    // "Top" = members with the most roles assigned.
    const ranked = members
      .map((m) => ({ m, n: Array.isArray(m.roles) ? m.roles.length : 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
    if (!ranked.length) {
      await message.reply("No role data available.");
      return;
    }
    const lines = ranked.map((x, i) => `${i + 1}. ${displayName(x.m)} — ${x.n} role${x.n === 1 ? "" : "s"}`);
    await message.reply(`**Top members by role count**\n${lines.join("\n")}`);
  },
});

defineCommand({
  name: "refresh",
  description: "Invalidate the cache and reload data.",
  usage: "!refresh",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    invalidate(message.serverId);
    await message.reply("Cache cleared. Next command will fetch fresh data.");
  },
});

// ---------------------------------------------------------------- events

client.on("ready", (me) => {
  log("info", `Connected as ${me.name} (${me.id})`);
  log("info", `Granted scopes: ${me.scopes.length ? me.scopes.join(", ") : "(none)"}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author?.is_bot) return;
    const content = message.content ?? "";
    if (!content.startsWith(CONFIG.prefix)) return;
    const withoutPrefix = content.slice(CONFIG.prefix.length).trim();
    if (!withoutPrefix) return;
    const [rawName, ...args] = withoutPrefix.split(/\s+/);
    const name = rawName.toLowerCase();
    if (!commands.has(name)) return;

    log("info", `${message.author?.username || "someone"} ran !${name} in ${message.channelId}`);
    await commands.get(name).run(message, args);
  } catch (err) {
    log("error", "messageCreate handler failed:", err);
    try {
      await message.reply("Something went wrong. Check the bot logs.");
    } catch (replyErr) {
      log("error", "could not send error reply:", replyErr.message);
    }
  }
});

client.on("error", (err) => log("error", "gateway error:", err.message ?? err));

// ---------------------------------------------------------------- lifecycle

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `received ${signal}; closing gateway…`);
  client.close();
  setTimeout(() => process.exit(0), 250);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.connect();
log("info", "Server info bot is running. Press Ctrl+C to stop.");
