// =====================================================================
// 01 — UTILITY BOT  (Disband bot template, JavaScript)
// =====================================================================
// A complete starter bot that teaches the patterns every real bot needs:
// command routing, cooldowns, permissions, logging, long-message chunking,
// graceful shutdown, and defensive access to API objects.
//
// TUTORIAL
// --------
// 1. Create the bot
//    Disband → Settings → Bots → New bot.
//    Name: "Utility Bot"
//    Scopes: messages.read, messages.write, members.read, channels.read
//    Copy the token now — Disband only shows it once.
//
// 2. Invite it
//    Settings → Bots → Invite → choose a space → copy the link.
//    The space owner opens the link and approves the listed scopes.
//
// 3. Install
//    npm install @disband/bot
//
// 4. Paste the token
//    Either replace PASTE_YOUR_BOT_TOKEN_HERE below, or export
//    DISBAND_BOT_TOKEN=... in your shell / .env loader.
//
// 5. Run
//    node index.js
//
// 6. Try it in the space
//    !help
//    !ping
//    !serverinfo
//    !members
//    !channels
//    !echo hello from my bot
//    !whoami
//    !uptime
//
// WHY EACH PIECE EXISTS
// - author?.is_bot guard: bots can see each other's messages; replying to a
//   bot can create an infinite loop.
// - command registry: keeps help text and dispatch in sync.
// - cooldowns: stops one person from spamming the API and burning rate limits.
// - chunking: Disband messages have a length limit; split long output.
// - graceful shutdown: closes the gateway poll cleanly on Ctrl+C.
// - defensive property access: API objects can gain/lose fields over time;
//   optional chaining keeps the bot alive instead of throwing.
// =====================================================================

import process from "node:process";
import { Client } from "@disband/bot";

// ===================== BOT TOKEN (paste here) =====================
// Paste your bot token between the quotes, OR leave the placeholder and set
// the DISBAND_BOT_TOKEN environment variable instead (recommended for prod).
const BOT_TOKEN = process.env.DISBAND_BOT_TOKEN || "PASTE_YOUR_BOT_TOKEN_HERE";
// ================================================================

// ---------------------------------------------------------------- config
// Centralised configuration. Keeping these in one object makes it easy to
// tweak behaviour without hunting through the code.
const CONFIG = {
  prefix: "!",              // command prefix
  cooldownMs: 1_500,        // per-user per-command cooldown
  maxMessageLength: 1_900,  // Disband messages cap around 2000 chars; stay safe
  logLevel: process.env.LOG_LEVEL || "info", // debug|info|warn|error
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const startedAt = Date.now();

// ---------------------------------------------------------------- logger
// Tiny levelled logger. Honouring LOG_LEVEL keeps production logs quiet.
function log(level, ...args) {
  if (LEVELS[level] < LEVELS[CONFIG.logLevel]) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (level === "error") console.error(line, ...args);
  else if (level === "warn") console.warn(line, ...args);
  else console.log(line, ...args);
}

// Fail fast if no token was provided — better than a confusing 401 later.
if (!BOT_TOKEN || BOT_TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
  log("error", "No bot token. Paste one into BOT_TOKEN or set DISBAND_BOT_TOKEN.");
  process.exit(1);
}

const client = new Client({ token: BOT_TOKEN });

// ---------------------------------------------------------------- helpers

// Human-readable uptime string ("2d 3h 4m 5s").
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

// Split a long string into chunks under `size`, preferring newlines then spaces.
// Disband rejects oversized messages, so always chunk before sending big output.
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

// Send a (possibly long) message, splitting it into safe chunks.
async function sendLong(channelId, text) {
  for (const chunk of chunkText(text, CONFIG.maxMessageLength)) {
    await client.sendMessage(channelId, chunk);
  }
}

// Best-effort display name from an author/member object.
function displayName(person) {
  return person?.display_name || person?.username || person?.name || "unknown";
}

// cooldowns: key = `${userId}:${commandName}` so each user has their own timer.
const cooldowns = new Map();

function checkCooldown(userId, commandName) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const until = cooldowns.get(key) ?? 0;
  if (now < until) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + CONFIG.cooldownMs);
  return 0;
}

// ---------------------------------------------------------------- commands
// A command registry keeps dispatch and !help in sync: defineCommand() stores
// both the handler and the metadata that !help prints.

const commands = new Map();

function defineCommand({ name, description, usage, run }) {
  commands.set(name, { name, description, usage, run });
}

defineCommand({
  name: "help",
  description: "List every command this bot knows.",
  usage: "!help",
  async run(message) {
    const lines = [...commands.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.usage.padEnd(34)} ${c.description}`);
    await sendLong(
      message.channelId,
      ["**Utility Bot commands**", "", "```", ...lines, "```"].join("\n"),
    );
  },
});

defineCommand({
  name: "ping",
  description: "Check that the bot is alive.",
  usage: "!ping",
  async run(message) {
    const sentAt = Date.now();
    const reply = await message.reply("Pong!");
    log("debug", `ping round-trip ${Date.now() - sentAt}ms (${reply.id})`);
  },
});

defineCommand({
  name: "uptime",
  description: "How long this bot process has been running.",
  usage: "!uptime",
  async run(message) {
    await message.reply(`I have been running for **${formatDuration(Date.now() - startedAt)}**.`);
  },
});

defineCommand({
  name: "whoami",
  description: "Show the sender and the bot identity.",
  usage: "!whoami",
  async run(message) {
    const me = client.user;
    await message.reply(
      [
        `You are **${displayName(message.author)}** (\`${message.author?.id ?? "unknown"}\`).`,
        `I am **${me?.name ?? "this bot"}** (\`${me?.id ?? "unknown"}\`).`,
        `Server: \`${message.serverId ?? "DM"}\`, channel: \`${message.channelId}\`.`,
      ].join("\n"),
    );
  },
});

defineCommand({
  name: "serverinfo",
  description: "Member and channel counts for this space.",
  usage: "!serverinfo",
  async run(message) {
    if (!message.serverId) {
      await message.reply("Run this in a space channel, not a DM.");
      return;
    }
    // Fetch both in parallel; if one scope is missing, fall back to empty
    // instead of failing the whole command.
    const [members, channels] = await Promise.all([
      client.listMembers(message.serverId).catch((err) => {
        log("warn", "listMembers failed:", err.message);
        return [];
      }),
      client.listChannels(message.serverId).catch((err) => {
        log("warn", "listChannels failed:", err.message);
        return [];
      }),
    ]);
    const textChannels = channels.filter((c) => !c.type || c.type === "text");
    await message.reply(
      [
        "**Server overview**",
        `Members: **${members.length}**`,
        `Channels: **${channels.length}** (${textChannels.length} text)`,
        `Server ID: \`${message.serverId}\``,
      ].join("\n"),
    );
  },
});

defineCommand({
  name: "members",
  description: "List up to 25 members.",
  usage: "!members",
  async run(message) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const members = await client.listMembers(message.serverId);
    if (!members.length) return message.reply("No members visible (check members.read scope).");
    const lines = members
      .slice(0, 25)
      .map((m, i) => `${i + 1}. ${displayName(m)}${m.is_bot ? " [bot]" : ""}`);
    const extra = members.length > 25 ? `\n…and ${members.length - 25} more.` : "";
    await sendLong(message.channelId, `**Members (${members.length})**\n${lines.join("\n")}${extra}`);
  },
});

defineCommand({
  name: "channels",
  description: "List channels, optionally filtered by type.",
  usage: "!channels [text|voice]",
  async run(message, args) {
    if (!message.serverId) return message.reply("Run this in a space channel.");
    const filter = args[0]?.toLowerCase();
    const channels = await client.listChannels(message.serverId);
    const shown = filter ? channels.filter((c) => (c.type ?? "text") === filter) : channels;
    if (!shown.length) return message.reply(`No ${filter ?? ""} channels found.`);
    const lines = shown.map(
      (c) => `• **${c.name ?? c.id}** — \`${c.id}\`${c.type && c.type !== "text" ? ` (${c.type})` : ""}`,
    );
    await sendLong(message.channelId, `**Channels (${shown.length})**\n${lines.join("\n")}`);
  },
});

defineCommand({
  name: "echo",
  description: "Repeat text back. Useful for testing formatting.",
  usage: "!echo <text>",
  async run(message, args) {
    const text = args.join(" ").trim();
    if (!text) return message.reply(`Usage: \`${commands.get("echo").usage}\``);
    await message.reply(text.slice(0, CONFIG.maxMessageLength));
  },
});

// ---------------------------------------------------------------- events

client.on("ready", (me) => {
  log("info", `Connected as ${me.name} (${me.id})`);
  log("info", `Granted scopes: ${me.scopes.length ? me.scopes.join(", ") : "(none)"}`);
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore bots (including ourselves) — otherwise two bots can ping-pong forever.
    if (message.author?.is_bot) return;
    const content = message.content ?? "";
    if (!content.startsWith(CONFIG.prefix)) return;

    const withoutPrefix = content.slice(CONFIG.prefix.length).trim();
    if (!withoutPrefix) return;
    const [rawName, ...args] = withoutPrefix.split(/\s+/);
    const name = rawName.toLowerCase();
    const command = commands.get(name);
    if (!command) return; // unknown command: stay silent (no spam)

    const remaining = checkCooldown(message.author?.id ?? "unknown", name);
    if (remaining > 0) {
      log("debug", `cooldown hit for ${message.author?.id} on ${name}`);
      return;
    }

    log("info", `${displayName(message.author)} ran !${name} in ${message.channelId}`);
    await command.run(message, args);
  } catch (err) {
    // Never let one bad command kill the gateway loop.
    log("error", "messageCreate handler failed:", err);
    try {
      await message.reply("Something went wrong running that command. Check the bot logs.");
    } catch (replyErr) {
      log("error", "could not send error reply:", replyErr.message);
    }
  }
});

client.on("messageUpdate", (message) => {
  log("debug", `message ${message.id} edited in ${message.channelId}`);
});

client.on("messageDelete", (message) => {
  log("debug", `message ${message.id} deleted from ${message.channelId}`);
});

client.on("error", (err) => {
  log("error", "gateway error:", err.message ?? err);
});

// ---------------------------------------------------------------- lifecycle
// Close the gateway cleanly on Ctrl+C / kill so the process exits promptly.

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
log("info", "Bot is running. Press Ctrl+C to stop.");
